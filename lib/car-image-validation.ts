/**
 * Car Image Validation
 * 
 * Lightweight validation to ensure uploaded images are actually cars and properly oriented.
 * Uses a hybrid approach:
 * 1. Fast heuristics (EXIF, dimensions, aspect ratio) - <10ms
 * 2. Optional Cloudflare Workers AI object detection - ~50-150ms (if configured)
 * 3. Optional FAL vision model fallback - ~200-500ms (most accurate but slower)
 */

export type ValidationResult = {
  isValid: boolean;
  reason?: string;
  warnings?: string[];
  needsRotation?: boolean;
  confidence?: number;
  detectedObject?: string;
  correctedBuffer?: Buffer; // If auto-rotation was applied
};

type ValidationOptions = {
  // Minimum image dimensions
  minWidth?: number;
  minHeight?: number;
  // Auto-correct rotation based on EXIF? (unreliable - use with caution)
  autoRotate?: boolean;
  // Use Cloudflare AI for object detection?
  useCloudflareAI?: boolean;
  // Use FAL vision model as fallback? (slower but more accurate)
  useFALVision?: boolean;
  // Fail fast mode - return on first check failure
  failFast?: boolean;
};

/**
 * Fast heuristic checks (dimensions + aspect ratio analysis)
 * ~5-10ms overhead
 * Note: EXIF rotation is unreliable and disabled by default
 */
async function fastValidation(
  buffer: Buffer,
  options: ValidationOptions
): Promise<ValidationResult> {
  const warnings: string[] = [];
  
  try {
    const { default: sharp } = await import('sharp');
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    
    // Check 1: Minimum dimensions
    const minW = options.minWidth || 300;
    const minH = options.minHeight || 300;
    if (width < minW || height < minH) {
      return {
        isValid: false,
        reason: `Image too small (${width}x${height}px, minimum ${minW}x${minH}px required)`,
      };
    }
    
    // Check 2: EXIF orientation (unreliable - disabled by default)
    // Many images lack EXIF data or have incorrect orientation tags
    const hasRotation = !!(metadata.orientation && metadata.orientation > 4);
    let correctedBuffer: Buffer | undefined;
    
    if (options.autoRotate && hasRotation) {
      console.log('[Car Validation] EXIF rotation detected, auto-correcting...');
      correctedBuffer = await sharp(buffer).rotate().toBuffer();
    }
    
    // Check 3: Aspect ratio heuristic
    const aspectRatio = width / height;
    
    // Only flag extremely portrait-oriented images (likely rotated 90° or not a car)
    // Examples: 0.3 = rotated landscape photo, 0.2 = vertical banner
    if (aspectRatio < 0.5) {
      warnings.push(
        `Extremely portrait-oriented image (aspect ratio: ${aspectRatio.toFixed(2)}). ` +
        `This might be a rotated photo or not a typical car image. ` +
        `Most car photos are landscape or close to square.`
      );
    }
    
    // Check 4: File format sanity
    const format = metadata.format;
    if (format && !['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
      warnings.push(`Unusual image format: ${format}`);
    }
    
    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      needsRotation: hasRotation && !options.autoRotate ? true : undefined,
      correctedBuffer,
    };
  } catch (error) {
    console.error('[Car Validation] Fast validation failed:', error);
    return {
      isValid: true, // Fail open on errors
      warnings: ['Fast validation check failed, proceeding anyway'],
    };
  }
}

/**
 * Cloudflare Workers AI object detection
 * ~50-150ms overhead (requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN)
 */
async function cloudflareAIValidation(
  buffer: Buffer
): Promise<Partial<ValidationResult>> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  
  if (!accountId || !token) {
    console.log('[Car Validation] Cloudflare AI not configured, skipping');
    return {};
  }
  
  try {
    // Use DETR ResNet-50 object detection model
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/facebook/detr-resnet-50`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: buffer.toString('base64'),
        }),
      }
    );
    
    if (!response.ok) {
      console.error('[Car Validation] Cloudflare AI request failed:', response.status);
      return {};
    }
    
    type DetectionResult = {
      result?: Array<{
        label?: string;
        score?: number;
        box?: { xmin: number; ymin: number; xmax: number; ymax: number };
      }>;
    };
    
    const result = await response.json() as DetectionResult;
    const detections = result?.result || [];
    
    // Car-related labels from COCO dataset
    const carLabels = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'vehicle'];
    
    // Find highest confidence car detection
    const carDetections = detections
      .filter((d) =>
        carLabels.some((label) => d.label?.toLowerCase().includes(label))
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    
    if (carDetections.length === 0) {
      return {
        isValid: false,
        reason: 'No car or vehicle detected in image',
        confidence: 0,
      };
    }
    
    const bestDetection = carDetections[0];
    const warnings: string[] = [];
    
    // Check bounding box to detect rotation
    const bbox = bestDetection.box;
    if (bbox) {
      const bboxWidth = bbox.xmax - bbox.xmin;
      const bboxHeight = bbox.ymax - bbox.ymin;
      const bboxAspectRatio = bboxWidth / bboxHeight;
      
      // Cars typically wider than tall when upright
      if (bboxAspectRatio < 0.6) {
        warnings.push(
          `Car bounding box is portrait-oriented (${bboxAspectRatio.toFixed(2)}). ` +
          `Image may be rotated.`
        );
      }
    }
    
    return {
      isValid: true,
      confidence: bestDetection.score,
      detectedObject: bestDetection.label,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error('[Car Validation] Cloudflare AI validation failed:', error);
    return {}; // Fail open
  }
}

/**
 * FAL Vision model validation (fallback for highest accuracy)
 * ~200-500ms overhead (uses existing FAL infrastructure)
 */
async function falVisionValidation(
  buffer: Buffer,
  uploadToFalFn: (bytes: Uint8Array, mime: string) => Promise<string | null>
): Promise<Partial<ValidationResult>> {
  try {
    // Import FAL client dynamically
    const { fal } = await import('@fal-ai/client');
    
    // Upload image for analysis
    const imageUrl = await uploadToFalFn(buffer, 'image/jpeg');
    if (!imageUrl) {
      console.error('[Car Validation] Failed to upload image to FAL');
      return {};
    }
    
    // Use LLaVA vision model for car detection and orientation check
    const result = await fal.subscribe('fal-ai/llavav15-13b', {
      input: {
        image_url: imageUrl,
        prompt:
          'Analyze this image and answer these questions:\n' +
          '1. Is this a car, truck, or vehicle?\n' +
          '2. Is the vehicle upright and properly oriented, or rotated/tilted?\n' +
          'Answer in format: [YES/NO] - [UPRIGHT/ROTATED] - [brief reason]',
        max_tokens: 100,
      },
    });
    
    type VisionResult = {
      output?: string;
    };
    const answer = ((result as VisionResult)?.output || '').toLowerCase();
    
    // Parse response
    const isNotCar =
      answer.includes('no') ||
      answer.includes('not a car') ||
      answer.includes('not a vehicle');
    
    if (isNotCar) {
      return {
        isValid: false,
        reason: 'AI vision model did not detect a car in the image',
      };
    }
    
    const warnings: string[] = [];
    if (answer.includes('rotated') || answer.includes('tilted')) {
      warnings.push('AI detected the car may be rotated or tilted');
    }
    
    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      confidence: 0.9, // LLaVA is generally reliable
    };
  } catch (error) {
    console.error('[Car Validation] FAL vision validation failed:', error);
    return {}; // Fail open
  }
}

/**
 * Main validation function - combines all checks based on options
 */
export async function validateCarImage(
  buffer: Buffer,
  context = 'unknown',
  options: ValidationOptions = {},
  uploadToFalFn?: (bytes: Uint8Array, mime: string) => Promise<string | null>
): Promise<ValidationResult> {
  console.log(`[Car Validation] Starting validation for ${context}...`);
  
  const startTime = Date.now();
  
  // Step 1: Fast heuristic checks (always run)
  const fastResult = await fastValidation(buffer, options);
  
  // If fast checks failed and we're in fail-fast mode, return immediately
  if (!fastResult.isValid && options.failFast) {
    console.log(
      `[Car Validation] ${context} - Fast check failed (${Date.now() - startTime}ms):`,
      fastResult.reason
    );
    return fastResult;
  }
  
  // Use corrected buffer if rotation was applied
  const workingBuffer = fastResult.correctedBuffer || buffer;
  const allWarnings = [...(fastResult.warnings || [])];
  
  // Step 2: Cloudflare AI detection (if enabled)
  if (options.useCloudflareAI) {
    const cfResult = await cloudflareAIValidation(workingBuffer);
    
    if (cfResult.isValid === false) {
      console.log(
        `[Car Validation] ${context} - Cloudflare AI rejected (${Date.now() - startTime}ms):`,
        cfResult.reason
      );
      return {
        ...fastResult,
        ...cfResult,
        warnings: [...allWarnings, ...(cfResult.warnings || [])],
      };
    }
    
    if (cfResult.warnings) {
      allWarnings.push(...cfResult.warnings);
    }
    
    // If we got a good detection, return success with confidence
    if (cfResult.confidence && cfResult.confidence > 0.5) {
      console.log(
        `[Car Validation] ${context} - ✓ Passed (${Date.now() - startTime}ms) - ` +
        `Detected: ${cfResult.detectedObject} (${(cfResult.confidence * 100).toFixed(0)}% confidence)`
      );
      return {
        isValid: true,
        confidence: cfResult.confidence,
        detectedObject: cfResult.detectedObject,
        warnings: allWarnings.length > 0 ? allWarnings : undefined,
        correctedBuffer: fastResult.correctedBuffer,
      };
    }
  }
  
  // Step 3: FAL vision model (if enabled and we have the upload function)
  if (options.useFALVision && uploadToFalFn) {
    const falResult = await falVisionValidation(workingBuffer, uploadToFalFn);
    
    if (falResult.isValid === false) {
      console.log(
        `[Car Validation] ${context} - FAL Vision rejected (${Date.now() - startTime}ms):`,
        falResult.reason
      );
      return {
        ...fastResult,
        ...falResult,
        warnings: [...allWarnings, ...(falResult.warnings || [])],
      };
    }
    
    if (falResult.warnings) {
      allWarnings.push(...falResult.warnings);
    }
    
    if (falResult.confidence) {
      console.log(
        `[Car Validation] ${context} - ✓ Passed (${Date.now() - startTime}ms) - ` +
        `FAL Vision confidence: ${(falResult.confidence * 100).toFixed(0)}%`
      );
      return {
        isValid: true,
        confidence: falResult.confidence,
        warnings: allWarnings.length > 0 ? allWarnings : undefined,
        correctedBuffer: fastResult.correctedBuffer,
      };
    }
  }
  
  // If we made it here with no AI checks, return fast validation result
  const finalResult = {
    ...fastResult,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
  
  console.log(
    `[Car Validation] ${context} - ${finalResult.isValid ? '✓' : '✗'} ` +
    `(${Date.now() - startTime}ms)${allWarnings.length > 0 ? ` - ${allWarnings.length} warning(s)` : ''}`
  );
  
  return finalResult;
}

