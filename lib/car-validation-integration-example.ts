/**
 * Integration Example: Car Image Validation
 * 
 * Shows how to integrate car validation into your template generation flow.
 * Choose the validation level based on your needs:
 * 
 * FAST MODE (recommended): ~5-10ms overhead
 * - EXIF rotation check + auto-correction
 * - Dimension and aspect ratio heuristics
 * - No external API calls
 * 
 * BALANCED MODE: ~50-150ms overhead
 * - All fast checks
 * - + Cloudflare AI object detection (requires setup)
 * - Good accuracy, low cost
 * 
 * ACCURATE MODE: ~200-500ms overhead
 * - All balanced checks
 * - + FAL vision model fallback
 * - Highest accuracy, uses existing FAL credits
 */

import { validateCarImage } from './car-image-validation';

// ========================================
// OPTION A: FAST MODE (Recommended Start)
// ========================================
// Add this to your preprocessImage function or before it

async function preprocessWithValidation(buffer: Buffer, context: string): Promise<Buffer> {
  // Basic dimension and aspect ratio checks
  const validation = await validateCarImage(buffer, context, {
    minWidth: 400,
    minHeight: 400,
    // autoRotate: false by default (EXIF is unreliable)
    failFast: true,
  });
  
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Image validation failed');
  }
  
  // Log warnings (non-blocking - aspect ratio < 0.5, unusual formats, etc.)
  if (validation.warnings && validation.warnings.length > 0) {
    console.warn(`[Validation Warnings] ${context}:`, validation.warnings);
    // Example: "Extremely portrait-oriented image (aspect ratio: 0.35)"
    // Image still processes, but you're alerted to potential issues
  }
  
  // Continue with your existing preprocessing...
  // return preprocessImage(buffer, context);
  return buffer;
}

// ========================================
// OPTION B: BALANCED MODE (Cloudflare AI)
// ========================================
// Requires: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN in .env

async function preprocessWithCloudflareDetection(
  buffer: Buffer,
  context: string
): Promise<Buffer> {
  const validation = await validateCarImage(buffer, context, {
    minWidth: 400,
    minHeight: 400,
    useCloudflareAI: true, // Enable object detection (actual car detection)
    failFast: false, // Run all checks even if fast checks warn
  });
  
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Not a valid car image');
  }
  
  // Log detection results
  if (validation.detectedObject && validation.confidence) {
    console.log(
      `[Car Detected] ${context}: ${validation.detectedObject} ` +
      `(${(validation.confidence * 100).toFixed(0)}% confidence)`
    );
  }
  
  // Log warnings
  if (validation.warnings && validation.warnings.length > 0) {
    console.warn(`[Validation Warnings] ${context}:`, validation.warnings);
  }
  
  return buffer;
}

// ========================================
// OPTION C: ACCURATE MODE (FAL Vision)
// ========================================
// Uses existing FAL infrastructure, no additional setup needed

async function preprocessWithFALVision(
  buffer: Buffer,
  context: string,
  uploadToFalFn: (bytes: Uint8Array, mime: string) => Promise<string | null>
): Promise<Buffer> {
  const validation = await validateCarImage(
    buffer,
    context,
    {
      minWidth: 400,
      minHeight: 400,
      useFALVision: true, // Enable FAL vision model (most accurate)
      failFast: false,
    },
    uploadToFalFn // Pass your existing uploadToFal function
  );
  
  if (!validation.isValid) {
    throw new Error(validation.reason || 'Not a valid car image');
  }
  
  if (validation.warnings && validation.warnings.length > 0) {
    console.warn(`[Validation Warnings] ${context}:`, validation.warnings);
  }
  
  return buffer;
}

// ========================================
// INTEGRATION INTO EXISTING ROUTE
// ========================================
// In your app/api/templates/generate/route.ts:

/*
// Add import at the top:
import { validateCarImage } from '@/lib/car-image-validation';

// Modify your existing preprocessImage function:
async function preprocessImage(buffer: Buffer, context = 'unknown'): Promise<Buffer> {
  console.log(`[Image Preprocessing] Starting preprocessing for ${context}...`);
  
  try {
    // NEW: Add validation step
    const validation = await validateCarImage(buffer, context, {
      minWidth: 400,
      minHeight: 400,
      autoRotate: true,
      useCloudflareAI: !!process.env.CLOUDFLARE_ACCOUNT_ID, // Enable if configured
    });
    
    if (!validation.isValid) {
      throw new Error(validation.reason || 'Image validation failed');
    }
    
    // Log warnings
    if (validation.warnings?.length) {
      console.warn(`[Validation] ${context} warnings:`, validation.warnings);
    }
    
    // Log successful detection
    if (validation.detectedObject) {
      console.log(
        `[Validation] ${context} - Detected: ${validation.detectedObject} ` +
        `(${((validation.confidence || 0) * 100).toFixed(0)}% confidence)`
      );
    }
    
    // Use corrected buffer if rotation was applied
    const workingBuffer = validation.correctedBuffer || buffer;
    
    // Continue with existing preprocessing (stats, brightness, etc.)
    const sharp = (await import('sharp')).default;
    const imageStats = await sharp(workingBuffer).stats();
    // ... rest of your existing preprocessing code ...
    
  } catch (error) {
    console.error(`[Image Preprocessing] ${context} - FAILED:`, error);
    throw error; // Re-throw to fail the request with helpful error
  }
}
*/

// ========================================
// ERROR HANDLING IN FRONTEND
// ========================================
// Update your frontend error handling to show validation errors:

/*
// In components/ui/content-tabs-core.tsx or similar:

async function generate() {
  try {
    const res = await fetch('/api/templates/generate', {
      method: 'POST',
      body: JSON.stringify({ ... }),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      // Show specific validation errors to user
      if (data.error?.includes('Not a valid car image')) {
        toast.error('Please upload an image of a car');
      } else if (data.error?.includes('Image too small')) {
        toast.error('Image resolution too low. Please use a higher quality photo.');
      } else {
        toast.error(data.error || 'Generation failed');
      }
      return;
    }
    
    // Handle success...
  } catch (error) {
    toast.error('Failed to generate');
  }
}
*/

// ========================================
// SETUP INSTRUCTIONS
// ========================================

/**
 * FAST MODE (No setup required):
 * - Works out of the box with Sharp
 * - ~5-10ms overhead
 * - Use this as a starting point
 * 
 * CLOUDFLARE MODE (Recommended):
 * 1. Sign up for Cloudflare account (free tier available)
 * 2. Get your Account ID from dashboard
 * 3. Create API token with "Workers AI" permissions
 * 4. Add to .env:
 *    CLOUDFLARE_ACCOUNT_ID=your_account_id
 *    CLOUDFLARE_AI_TOKEN=your_api_token
 * 
 * 5. Test validation:
 *    - Upload a car photo → should pass
 *    - Upload a random photo → should fail with "No car detected"
 *    - Upload a rotated car → should warn about rotation
 * 
 * FAL VISION MODE:
 * - No additional setup (uses existing FAL credentials)
 * - Slower but more accurate
 * - Uses ~10-20 FAL credits per validation
 * - Best for final validation on critical workflows
 */

export {
  preprocessWithValidation,
  preprocessWithCloudflareDetection,
  preprocessWithFALVision,
};

