/* eslint-disable @typescript-eslint/no-explicit-any */
function formatFalDetail(detail: unknown): string {
  try {
    if (Array.isArray(detail)) {
      // Check if any error relates to images
      const hasImageError = (detail as unknown[]).some((d) => {
        const obj = (d && typeof d === 'object') ? (d as Record<string, unknown>) : undefined;
        const locVal = (obj?.loc as unknown);
        const loc = Array.isArray(locVal) ? (locVal as unknown[]).join('.') : '';
        return loc.includes('image');
      });
      
      if (hasImageError) {
        return 'Something went wrong. Try a different image.';
      }
      
      // For any other validation error, return a generic message
      return 'Something went wrong. Please try again.';
    }
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
  } catch {}
  return '';
}
function sanitizeModelNames(message: string | undefined): string | undefined {
  if (!message) return message;
  let m = message;
  m = m.replace(/\bgemini\b/gi, 'the image generator');
  m = m.replace(/\bopenai\b/gi, 'the image generator');
  m = m.replace(/\bstability\b/gi, 'the image generator');
  m = m.replace(/\bstable\s*diffusion\b/gi, 'the image generator');
  m = m.replace(/\bflux\b/gi, 'the image generator');
  m = m.replace(/\bbytedance\b/gi, 'the image generator');
  m = m.replace(/\bfal\b/gi, 'the service');
  return m;
}
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { RecordId } from "surrealdb";
import { GENERATION_CREDITS_PER_IMAGE, chargeCreditsOnce } from "@/lib/credits";
import { validateStorageSpace } from "@/lib/storage";

fal.config({ credentials: process.env.FAL_KEY || "" });

type GenerateRequest = {
  templateId?: string;
  templateSlug?: string;
  // Paths relative to user root (e.g., "vehicles/lp-750/img.jpg")
  userImageKeys?: string[];
  // Optional override to pass raw data URLs as last images (fallback if not uploaded)
  userImageDataUrls?: string[];
  // Variable overrides from UI: { key: value }
  variables?: Record<string, string | number | boolean>;
  // Optional vehicle data for token substitution
  vehicle?: { make?: string; model?: string; colorFinish?: string; accents?: string } | null;
  // Isolate car: remove background and use black backdrop
  isolateCar?: boolean;
};

// removed unused toIdString

function substituteTokens(prompt: string, tokens: Record<string, string>): string {
  let out = prompt;
  for (const [k, v] of Object.entries(tokens)) {
    const token = `[${k}]`;
    out = out.split(token).join(v);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as GenerateRequest;
    const db = await getSurreal();

  // Resolve template
  let template: any | null = null;
  // Prefer slug first for robustness, then try id
  if (body.templateSlug) {
    const res = await db.query("SELECT * FROM template WHERE slug = $slug LIMIT 1;", { slug: body.templateSlug });
    template = Array.isArray(res) && Array.isArray(res[0]) ? res[0][0] : null;
  }
  if (!template && body.templateId) {
    // Attempt to coerce id string into a RecordId instance
    let rid: unknown = body.templateId as unknown;
    try {
      const idStr = String(body.templateId);
      const parts = idStr.split(":");
      const tb = parts[0];
      const raw = parts.slice(1).join(":").replace(/^⟨|⟩$/g, "");
      rid = new RecordId(tb as string, raw);
    } catch {}
    // Try selecting by direct record reference
    try {
      const res1 = await db.query("SELECT * FROM $rid LIMIT 1;", { rid });
      template = Array.isArray(res1) && Array.isArray(res1[0]) ? res1[0][0] : null;
    } catch {}
    // Fallback: match by id field
    if (!template) {
      const res2 = await db.query("SELECT * FROM template WHERE id = $rid LIMIT 1;", { rid });
      template = Array.isArray(res2) && Array.isArray(res2[0]) ? res2[0][0] : null;
    }
  }
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const modelSlug: string = String(template?.falModelSlug || "fal-ai/gemini-25-flash-image/edit");
    const prompt: string = String(template?.prompt || "");

  // Compose tokens
  // Attempt to resolve vehicle from body or infer from selected image key path
    let v = body?.vehicle || {};
  try {
    if ((!v || (!v.make && !v.model)) && Array.isArray(body?.userImageKeys) && body!.userImageKeys.length > 0) {
      const first = String(body!.userImageKeys[0] || "");
      const m = first.match(/(?:^|\/)vehicles\/([^/]+)\//);
      const slugPart = m?.[1] || null;
      if (slugPart) {
        const prof = await db.query("SELECT vehicles FROM user WHERE email = $email LIMIT 1;", { email: user.email });
        const row = Array.isArray(prof) && Array.isArray(prof[0]) ? (prof[0][0] as any) : null;
        const vehicles: Array<{ make: string; model: string; type?: string; colorFinish?: string; accents?: string }> = Array.isArray(row?.vehicles) ? row.vehicles : [];
        function baseSlug(make: string, model: string){ return `${String(make||'').trim()} ${String(model||'').trim()}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
        // Compute unique slug like CarPhotosUploader
        const slugs: string[] = [];
        for (let i=0;i<vehicles.length;i++){
          const car = vehicles[i]!;
          const base = baseSlug(car.make, car.model);
          let priorSame = 0;
          for (let j=0;j<i;j++){
            const u = vehicles[j]!;
            if (u.make===car.make && u.model===car.model && (u.type||'car')===(car.type||'car')) priorSame += 1;
          }
          const suffix = priorSame > 0 ? `-${priorSame}` : '';
          slugs.push(`${base}${suffix}`);
        }
        const idx = slugs.findIndex((s)=> s === slugPart);
        if (idx >= 0) {
          const sel = vehicles[idx]!;
          v = { make: sel.make, model: sel.model, colorFinish: sel.colorFinish, accents: sel.accents } as any;
        }
      }
    }
  } catch {}
    const variablesFromUi = body?.variables || {};
    const cf = (v as any)?.colorFinish ? String((v as any).colorFinish) : "";
    const acc = (v as any)?.accents ? String((v as any).accents) : "";
    const cfCombo = acc ? `${cf} with ${acc}` : cf;
    const tokens: Record<string, string> = {
      BRAND: (v as any)?.make ? String((v as any).make) : "",
      MAKE: (v as any)?.make ? String((v as any).make) : "", // alias for compatibility
      MODEL: (v as any)?.model ? String((v as any).model) : "",
      COLOR_FINISH: cf,
      ACCENTS: acc,
      COLOR_FINISH_ACCENTS: cfCombo,
      BRAND_CAPS: (v as any)?.make ? String((v as any).make).toUpperCase() : "",
      DOMINANT_COLOR_TONE: typeof variablesFromUi["DOMINANT_COLOR_TONE"] === "string" ? String(variablesFromUi["DOMINANT_COLOR_TONE"]) : "",
    };
    
    // Apply defaults for missing color variables from template definition
    const templateVars = Array.isArray(template?.variables) ? (template.variables as Array<{ key?: string; type?: string; defaultValue?: string | number | boolean }>) : [];
    for (const vDef of templateVars) {
      const key = String(vDef?.key || '').trim();
      if (!key) continue;
      // Skip if already provided
      if (key in variablesFromUi && variablesFromUi[key] !== undefined && variablesFromUi[key] !== null && variablesFromUi[key] !== '') continue;
      // Apply defaultValue if present
      if (vDef?.defaultValue !== undefined && vDef?.defaultValue !== null && vDef?.defaultValue !== '') {
        variablesFromUi[key] = vDef.defaultValue;
      } else if (vDef?.type === 'color') {
        // For color fields without explicit default, use white
        variablesFromUi[key] = '#ffffff';
      }
    }
    
    // Also inject any arbitrary variables: [KEY]
    for (const [key, val] of Object.entries(variablesFromUi)) {
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        tokens[key] = String(val);
      }
    }
    // Derive dependent tokens if not explicitly provided
    try {
      const brandFromAny = tokens.BRAND || (typeof variablesFromUi["BRAND"] === "string" ? String(variablesFromUi["BRAND"]) : "");
      if (!tokens.BRAND_CAPS && brandFromAny) tokens.BRAND_CAPS = brandFromAny.toUpperCase();
      // Ensure MAKE mirrors BRAND when not provided separately
      if (!tokens.MAKE && brandFromAny) tokens.MAKE = brandFromAny;
      // Compose COLOR_FINISH_ACCENTS if missing using provided COLOR_FINISH/ACCENTS
      if (!tokens.COLOR_FINISH_ACCENTS) {
        const cfAny = tokens.COLOR_FINISH || (typeof variablesFromUi["COLOR_FINISH"] === "string" ? String(variablesFromUi["COLOR_FINISH"]) : "");
        const accAny = tokens.ACCENTS || (typeof variablesFromUi["ACCENTS"] === "string" ? String(variablesFromUi["ACCENTS"]) : "");
        tokens.COLOR_FINISH_ACCENTS = accAny ? `${cfAny} with ${accAny}` : cfAny;
      }
    } catch {}
    const finalPrompt = substituteTokens(prompt, tokens);

  // Build image URLs: upload to FAL media so they are publicly retrievable by FAL (works in dev + prod)
    const adminImageUrls: string[] = [];
    const userImageUrls: string[] = [];
    async function streamToUint8Array(stream: unknown): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      const s = stream as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | undefined;
      if (s && typeof s[Symbol.asyncIterator] === 'function') {
        for await (const chunk of s as unknown as AsyncIterable<unknown>) {
          chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk as ArrayBufferLike));
        }
      }
      return Buffer.concat(chunks);
    }
    
    /**
     * Preprocess USER images to improve generation accuracy (SUBTLE enhancements only):
     * - Brightness adjustments for dark images
     * - Intelligent saturation boost based on current saturation
     * - Subtle contrast and vibrancy enhancement
     */
    async function preprocessImage(buffer: Buffer, context = 'unknown'): Promise<Buffer> {
      console.log(`[Image Preprocessing] Starting preprocessing for ${context}...`);
      try {
        const sharp = (await import('sharp')).default;
        
        // Get image statistics to determine if preprocessing is needed
        const imageStats = await sharp(buffer).stats();
        
        // Calculate average brightness across all channels (0-255 scale)
        const avgBrightness = imageStats.channels.reduce((sum: number, ch: { mean: number }) => sum + ch.mean, 0) / imageStats.channels.length;
        
        // Detect current saturation level by comparing color channels
        // Low saturation = channels are similar (grayscale-ish), high saturation = channels differ
        const channelMeans = imageStats.channels.map((ch: { mean: number }) => ch.mean);
        const meanOfMeans = channelMeans.reduce((sum: number, val: number) => sum + val, 0) / channelMeans.length;
        const variance = channelMeans.reduce((sum: number, val: number) => sum + Math.pow(val - meanOfMeans, 2), 0) / channelMeans.length;
        const currentSaturation = Math.sqrt(variance); // Higher = more saturated
        
        console.log(`[Image Preprocessing] ${context} - Brightness: ${avgBrightness.toFixed(2)}/255, Saturation variance: ${currentSaturation.toFixed(2)}`);
        
        // If image is dark (brightness < 100), apply enhancement
        if (avgBrightness < 100) {
          const brightnessFactor = Math.min(1.3, 105 / avgBrightness); // Cap at 1.3x
          
          // Only boost saturation if image is desaturated (variance < 15)
          const saturationFactor = currentSaturation < 15 ? 1.1 : 1.0;
          
          console.log(`[Image Preprocessing] ${context} - Dark image detected, applying ${brightnessFactor.toFixed(2)}x brightness, ${saturationFactor.toFixed(2)}x saturation`);
          
          const result = await sharp(buffer)
            .modulate({
              brightness: brightnessFactor,        // Adaptive brightness increase
              saturation: saturationFactor,        // Intelligent saturation boost
            })
            .linear(1.08, -(128 * 0.08))          // Subtle contrast increase
            .sharpen({ sigma: 0.3 })               // Minimal sharpening
            .toBuffer();
          
          console.log(`[Image Preprocessing] ${context} - Enhancement complete ✓`);
          return result;
        }
        
        // For well-lit images, apply very light normalization with vibrancy
        console.log(`[Image Preprocessing] ${context} - Well-lit image, applying light normalization + vibrancy`);
        
        // Check if needs saturation boost
        const saturationFactor = currentSaturation < 15 ? 1.05 : 1.0;
        
        const result = await sharp(buffer)
          .modulate({
            saturation: saturationFactor,        // Subtle vibrancy only if desaturated
          })
          .normalize({ lower: 2, upper: 98 })    // Very gentle histogram normalization
          .toBuffer();
        
        console.log(`[Image Preprocessing] ${context} - Normalization complete ✓`);
        return result;
      } catch (error) {
        // If preprocessing fails, return original buffer
        console.error(`[Image Preprocessing] ${context} - FAILED, using original:`, error);
        return buffer;
      }
    }
    
    async function uploadToFal(bytes: Uint8Array, mimeType: string): Promise<string | null> {
      try {
        const uploaded = await (fal as any)?.storage?.upload?.(bytes, { mimeType });
        const url = uploaded?.url || (typeof uploaded === 'string' ? uploaded : null);
        if (url) return url as string;
      } catch {}
      try {
        const putRes = await (fal as any)?.storage?.put?.(bytes, { mimeType });
        const url = putRes?.url || (typeof putRes === 'string' ? putRes : null);
        if (url) return url as string;
      } catch {}
      return null;
    }
    const adminKeys: string[] = Array.isArray(template?.adminImageKeys) ? template.adminImageKeys.filter((x: unknown) => typeof x === "string") : [];
    for (const k of adminKeys) {
      try {
        const key = k.startsWith("admin/") ? k : `admin/${k.replace(/^\/+/, "")}`;
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await streamToUint8Array(obj.Body as unknown);
        // Admin images are NOT preprocessed - they are curated template images
        const mime = (obj.ContentType as string) || 'image/jpeg';
        const url = await uploadToFal(bytes, mime);
        if (url) adminImageUrls.push(url);
      } catch {}
    }
    const userKeys = Array.isArray(body?.userImageKeys) ? body!.userImageKeys.filter((x) => typeof x === "string") : [];
    const userRoot = `users/${sanitizeUserId(user.email)}`;
    for (const k of userKeys) {
      try {
        const normalized = k.replace(/^\/+/, "");
        const key = `${userRoot}/${normalized}`;
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await streamToUint8Array(obj.Body as unknown);
        // Preprocess image before uploading to FAL
        const preprocessedBytes = await preprocessImage(Buffer.from(bytes), `User: ${normalized}`);
        const mime = (obj.ContentType as string) || 'image/jpeg';
        const url = await uploadToFal(preprocessedBytes, mime);
        if (url) userImageUrls.push(url);
      } catch {}
    }
    // If provided, also accept data URLs (last) when files haven't been uploaded — upload them to FAL
    const dataUrls = Array.isArray(body?.userImageDataUrls) ? body!.userImageDataUrls.filter((x) => typeof x === "string" && x.startsWith("data:")) : [];
    for (let i = 0; i < dataUrls.length; i++) {
      try {
        const du = dataUrls[i];
        const m = du.match(/^data:([^;]+);base64,(.*)$/);
        if (!m) continue;
        const mime = m[1] || 'image/jpeg';
        const b64 = m[2] || '';
        const bytes = Buffer.from(b64, 'base64');
        // Preprocess image before uploading to FAL
        const preprocessedBytes = await preprocessImage(bytes, `DataURL #${i + 1}`);
        const url = await uploadToFal(preprocessedBytes, mime);
        if (url) userImageUrls.push(url);
      } catch {}
    }

    // Apply isolateCar: remove background and composite on black backdrop (ONLY for user images)
    let processedUserImageUrls = userImageUrls;
    console.log('[isolateCar] Check:', { 
      isolateCar: body?.isolateCar, 
      type: typeof body?.isolateCar,
      userImageUrlsLength: userImageUrls.length,
      willProcess: body?.isolateCar === true && userImageUrls.length > 0
    });
    
    if (body?.isolateCar === true && userImageUrls.length > 0) {
      console.log('[isolateCar] Starting isolation process...');
      const processedUrls: string[] = [];
      const shouldCropToAspect = template?.fixedAspectRatio && typeof template?.aspectRatio === 'number';
      console.log('[isolateCar] shouldCropToAspect:', shouldCropToAspect, { fixedAspectRatio: template?.fixedAspectRatio, aspectRatio: template?.aspectRatio });
      
      for (const imageUrl of userImageUrls) {
        try {
          // Call rembg to isolate the car - request mask if we need to crop to aspect ratio
          const rembgRes = await fal.subscribe("fal-ai/birefnet/v2", {
            input: {
              image_url: imageUrl,
              model: "General Use (Heavy)",
              operating_resolution: "2048x2048",
              output_format: "webp",
              refine_foreground: true,
              output_mask: shouldCropToAspect, // Request mask only if we need bounding box for cropping
            },
            logs: true,
          });
          
          const isolatedImageUrl = (rembgRes as { data?: { image?: { url?: string }; mask_image?: { url?: string } } })?.data?.image?.url;
          const maskImageUrl = shouldCropToAspect ? (rembgRes as { data?: { mask_image?: { url?: string } } })?.data?.mask_image?.url : null;
          
          if (!isolatedImageUrl) {
            console.warn('[isolateCar] Rembg failed, using original image');
            processedUrls.push(imageUrl);
            continue;
          }

          // Fetch the isolated image and original image (and mask if needed)
          const fetchPromises = [
            fetch(isolatedImageUrl),
            fetch(imageUrl)
          ];
          if (maskImageUrl) {
            fetchPromises.push(fetch(maskImageUrl));
          }
          
          const responses = await Promise.all(fetchPromises);
          const [isolatedRes, originalRes, maskRes] = responses;
          
          if (!isolatedRes.ok || !originalRes.ok || (maskRes && !maskRes.ok)) {
            console.warn('[isolateCar] Failed to fetch images, using original');
            processedUrls.push(imageUrl);
            continue;
          }

          const bufferPromises = [
            isolatedRes.arrayBuffer(),
            originalRes.arrayBuffer()
          ];
          if (maskRes) {
            bufferPromises.push(maskRes.arrayBuffer());
          }
          
          const buffers = await Promise.all(bufferPromises);
          const [isolatedBuffer, originalBuffer, maskBuffer] = buffers;

          // Use sharp to get dimensions and composite on black background
          const sharp = (await import('sharp')).default;
          const originalMeta = await sharp(Buffer.from(originalBuffer)).metadata();
          const isolatedMeta = await sharp(Buffer.from(isolatedBuffer)).metadata();
          
          // Use the isolated image dimensions (BiRefNet may resize)
          const width = isolatedMeta.width || originalMeta.width || 1024;
          const height = isolatedMeta.height || originalMeta.height || 1024;
          
          console.log('[isolateCar] Image dimensions:', {
            original: { width: originalMeta.width, height: originalMeta.height },
            isolated: { width: isolatedMeta.width, height: isolatedMeta.height },
            using: { width, height }
          });

          let finalWidth = width;
          let finalHeight = height;
          let cropX = 0;
          let cropY = 0;

          // If we have a mask and need to crop to aspect ratio, calculate bounding box
          if (maskBuffer && shouldCropToAspect && template?.aspectRatio) {
            try {
              const maskSharp = sharp(Buffer.from(maskBuffer));
              const { data, info } = await maskSharp.raw().toBuffer({ resolveWithObject: true });
              
              console.log('[isolateCar] Mask dimensions:', { width: info.width, height: info.height, channels: info.channels });
              
              // Find bounding box of non-zero pixels in mask
              let minX = info.width;
              let minY = info.height;
              let maxX = 0;
              let maxY = 0;
              
              for (let y = 0; y < info.height; y++) {
                for (let x = 0; x < info.width; x++) {
                  const idx = (y * info.width + x) * info.channels;
                  const pixelValue = data[idx];
                  if (pixelValue > 10) { // threshold to ignore near-black pixels
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                  }
                }
              }
              
              if (maxX > minX && maxY > minY) {
                const bboxWidth = maxX - minX;
                const bboxHeight = maxY - minY;
                const bboxCenterX = minX + bboxWidth / 2;
                const bboxCenterY = minY + bboxHeight / 2;
                
                const targetAspect = template.aspectRatio;
                
                // Calculate crop dimensions that fit the aspect ratio
                // We want to crop from the center of the bounding box
                let cropWidth: number;
                let cropHeight: number;
                
                if (width / height > targetAspect) {
                  // Image is wider than target aspect ratio - constrain by height
                  cropHeight = height;
                  cropWidth = Math.round(cropHeight * targetAspect);
                  // Ensure width doesn't exceed image width
                  if (cropWidth > width) {
                    cropWidth = width;
                    cropHeight = Math.round(cropWidth / targetAspect);
                  }
                } else {
                  // Image is taller than target aspect ratio - constrain by width
                  cropWidth = width;
                  cropHeight = Math.round(cropWidth / targetAspect);
                  // Ensure height doesn't exceed image height
                  if (cropHeight > height) {
                    cropHeight = height;
                    cropWidth = Math.round(cropHeight * targetAspect);
                  }
                }
                
                // Center the crop on the bounding box center
                cropX = Math.round(bboxCenterX - cropWidth / 2);
                cropY = Math.round(bboxCenterY - cropHeight / 2);
                
                // Clamp to image bounds
                cropX = Math.max(0, Math.min(width - cropWidth, cropX));
                cropY = Math.max(0, Math.min(height - cropHeight, cropY));
                
                finalWidth = cropWidth;
                finalHeight = cropHeight;
                
                console.log('[isolateCar] Calculated crop from bounding box:', {
                  originalImage: { width, height },
                  bbox: { minX, minY, maxX, maxY, centerX: bboxCenterX, centerY: bboxCenterY },
                  crop: { x: cropX, y: cropY, width: finalWidth, height: finalHeight },
                  targetAspect,
                  isValid: cropX >= 0 && cropY >= 0 && (cropX + finalWidth) <= width && (cropY + finalHeight) <= height
                });
              }
            } catch (err) {
              console.warn('[isolateCar] Failed to calculate bounding box, using full image:', err);
            }
          }

          // First, crop the isolated image if needed
          let processedIsolatedBuffer: Buffer;
          if (finalWidth !== width || finalHeight !== height) {
            processedIsolatedBuffer = Buffer.from(
              await sharp(Buffer.from(isolatedBuffer))
                .extract({ left: cropX, top: cropY, width: finalWidth, height: finalHeight })
                .toBuffer()
            );
          } else {
            processedIsolatedBuffer = Buffer.from(isolatedBuffer);
          }

          // Create black background matching final dimensions and composite the isolated car
          const composited = await sharp({
            create: {
              width: finalWidth,
              height: finalHeight,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            }
          })
          .composite([{
            input: processedIsolatedBuffer,
            top: 0,
            left: 0
          }])
          .webp({ quality: 95 })
          .toBuffer();

          // Upload composited image to FAL
          const compositedUrl = await uploadToFal(new Uint8Array(composited), 'image/webp');
          if (compositedUrl) {
            processedUrls.push(compositedUrl);
            console.log('[isolateCar] Successfully processed image');
          } else {
            console.warn('[isolateCar] Failed to upload composited image, using original');
            processedUrls.push(imageUrl);
          }
        } catch (err) {
          console.error('[isolateCar] Error processing image:', err);
          processedUrls.push(imageUrl);
        }
      }
      processedUserImageUrls = processedUrls;
    }

    // Combine admin images (untouched) with processed user images
    const imageUrls = [...adminImageUrls, ...processedUserImageUrls];
    
    // FAL expects 1-4 URLs for Gemini and up to 6 for Seedream; keep last N so user images are retained.
    let urlsForFal = imageUrls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
    if (urlsForFal.length === 0) return NextResponse.json({ error: "No valid image URLs provided" }, { status: 400 });
    const isSeedream = /bytedance\/seedream\/v4\/edit$/i.test(modelSlug);
    const maxUrls = isSeedream ? 6 : 4;
    if (urlsForFal.length > maxUrls) urlsForFal = urlsForFal.slice(-maxUrls);

  // Call FAL
    if (!finalPrompt.trim()) {
      return NextResponse.json({ error: "Prompt is required for generation" }, { status: 400 });
    }

    let result: any;
    try {
      // Do not charge upfront. We'll charge once the generation successfully completes and is persisted.
      function clampImageSize(w?: number, h?: number): { width: number; height: number } | null {
        try {
          const min = 1024, max = 4096;
          const W = Math.max(1, Math.round(Number(w || 0)));
          const H = Math.max(1, Math.round(Number(h || 0)));
          if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return null;
          const sMin = Math.max(min / W, min / H);
          const sMax = Math.min(max / W, max / H);
          let s = sMin;
          if (sMin > sMax) s = sMax; // best-effort fit within bounds
          if (!Number.isFinite(s) || s <= 0) s = 1;
          let outW = Math.round(W * s);
          let outH = Math.round(H * s);
          outW = Math.max(min, Math.min(max, outW));
          outH = Math.max(min, Math.min(max, outH));
          return { width: outW, height: outH };
        } catch { return null; }
      }
      const desiredSize = ((): { width: number; height: number } | null => {
        try {
          const raw = (template as any)?.imageSize;
          if (raw && typeof raw === 'object') {
            const cs = clampImageSize((raw as any).width, (raw as any).height);
            if (cs) return cs;
          }
        } catch {}
        return null;
      })();
      const falInput = { 
        prompt: finalPrompt, 
        image_urls: urlsForFal, 
        num_images: 1,
        output_format: 'jpeg', // Gemini supports jpeg/png, default to jpeg for bandwidth savings
        ...(isSeedream && desiredSize ? { image_size: desiredSize } : {}) 
      } as const;
      try { console.log("[FAL INPUT]", JSON.stringify({ model: modelSlug, input: falInput }, null, 2)); } catch {}
      result = await fal.subscribe(modelSlug, {
        input: falInput as any,
        logs: true,
        onQueueUpdate: (update: any) => {
          try {
            if (update?.status === 'IN_PROGRESS') {
              (update.logs || []).map((l: any) => l?.message).filter(Boolean).forEach((m: string) => console.log(`[FAL LOG] ${m}`));
            }
          } catch {}
        },
      });
    } catch (e: unknown) {
      try {
        const errObj = e as { message?: unknown; status?: unknown; body?: unknown };
        const safe = typeof errObj?.body === 'object' ? { message: String(errObj?.message || ''), status: errObj?.status, body: errObj?.body } : (errObj?.message || errObj);
        console.error("FAL subscribe error", safe);
      } catch {}
      const err = e as { status?: unknown; message?: unknown; body?: unknown };
      const status = typeof err?.status === "number" ? err.status : 502;
      const bodyAny = (typeof err?.body === 'object' && err?.body) ? (err.body as Record<string, unknown>) : undefined;
      const messageRaw = (bodyAny?.message as string | undefined) || (typeof err?.message === 'string' ? err.message : undefined) || "";
      const prettyRaw = formatFalDetail((bodyAny as { detail?: unknown } | undefined)?.detail) || undefined;
      
      // Build a user-friendly error message
      let userMsg = prettyRaw || messageRaw || "";
      
      // Sanitize any model names
      userMsg = sanitizeModelNames(userMsg) || "";
      
      // If we still don't have a good message, provide a helpful default
      if (!userMsg || userMsg.trim().length === 0) {
        if (status === 422) {
          userMsg = "The generation request couldn't be processed. Please check your inputs and try again.";
        } else if (status === 429) {
          userMsg = "Too many requests. Please wait a moment and try again.";
        } else if (status >= 500) {
          userMsg = "The image generation service is temporarily unavailable. Please try again in a moment.";
        } else {
          userMsg = "Generation failed. Please try again.";
        }
      }
      
      return NextResponse.json({ error: userMsg }, { status });
    }
    const data = (result?.data || {}) as any;
    const candidateUrl: string | null = data?.images?.[0]?.url || data?.image?.url || data?.url || null;
    if (!candidateUrl) return NextResponse.json({ error: "Fal did not return an image url" }, { status: 502 });

  // Fetch and persist to R2 under unified library folder
    const createdIso = new Date().toISOString();
    const userKeyPrefix = `${userRoot}/library/`;
    await ensureFolder(userKeyPrefix);

    const fileRes = await fetch(candidateUrl);
    if (!fileRes.ok) return NextResponse.json({ error: "Failed to fetch generated image" }, { status: 502 });
    const arrayBuffer = await fileRes.arrayBuffer();
    const ext = (() => {
      const ct = fileRes.headers.get("content-type") || "";
      if (ct.includes("png")) return "png";
      if (ct.includes("webp")) return "webp";
      return "jpg";
    })();
    const safeSlug = (String(template?.slug || template?.name || "template").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "template";
    const fileName = `${createdIso.replace(/[:.]/g, "-")}-${safeSlug}.${ext}`;
    const outKey = `${userKeyPrefix}${fileName}`;
    
    // Resolve user plan for storage validation
    let effectivePlan: string | null = user.plan ?? null;
    try {
      const dbForPlan = await getSurreal();
      const resPlan = await dbForPlan.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email: user.email });
      const rowPlan = Array.isArray(resPlan) && Array.isArray(resPlan[0]) ? (resPlan[0][0] as { plan?: string | null } | undefined) : undefined;
      if (rowPlan && "plan" in rowPlan) effectivePlan = rowPlan.plan || effectivePlan || null;
    } catch {}
    
    // Validate storage space before saving
    const validation = await validateStorageSpace(user.email, arrayBuffer.byteLength, effectivePlan);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error || "Storage limit exceeded" }, { status: 413 });
    }
    
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: outKey, Body: new Uint8Array(arrayBuffer), ContentType: fileRes.headers.get("content-type") || "image/jpeg" }));

    // Charge credits idempotently now that we have a successful generation and stored artifact
    try {
      await chargeCreditsOnce(user.email, GENERATION_CREDITS_PER_IMAGE, "generation", outKey);
    } catch {
      // Roll back stored artifact if user cannot be charged
      try { await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: outKey })); } catch {}
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }

  // Response includes storage key and signed view url
    const { url: viewUrl } = await createViewUrl(outKey);
    
    // Track template generation (fire-and-forget)
    try {
      // Check if this is user's first template generation
      const genRes = await db.query(
        "SELECT id FROM library_image WHERE user_email = $email AND source = 'generation' LIMIT 1;",
        { email: user.email }
      );
      const hasGeneratedBefore = Array.isArray(genRes) && Array.isArray(genRes[0]) && genRes[0].length > 0;
      
      if (!hasGeneratedBefore) {
        // First-ever template - activation event!
        console.log('[ACTIVATION] First template generated by:', user.email);
      }
    } catch (err) {
      console.error('Failed to check first template:', err);
    }
    
    return NextResponse.json({ key: outKey, url: viewUrl });
  } catch (err) {
    try { console.error("/api/templates/generate error", err); } catch {}
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


