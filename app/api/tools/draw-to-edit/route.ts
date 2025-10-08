import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { adjustCredits } from "@/lib/credits";
import { getSurreal } from "@/lib/surrealdb";
import { r2 } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { sanitizeUserId } from "@/lib/user";
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY || "" });

const bucket = process.env.R2_BUCKET || "";

type DrawToEditRequest = {
  prompt: string;
  imageDataUrl: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  originalImageDataUrl: string;
  carMaskUrl?: string | null;
};

async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  const base64Data = dataUrl.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}

async function uploadToFal(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const blob = new Blob([uint8Array], { type: mimeType });
    const file = new File([blob], `image.${mimeType.split('/')[1]}`, { type: mimeType });
    const url = await fal.storage.upload(file);
    return url;
  } catch (error) {
    console.error('FAL upload error:', error);
    throw new Error('Failed to upload image to FAL');
  }
}

async function detectCarOverlap(
  boundingBox: { x: number; y: number; width: number; height: number },
  carMaskUrl: string | null
): Promise<boolean> {
  if (!carMaskUrl) return false;

  try {
    // Fetch the car mask image
    const response = await fetch(carMaskUrl);
    if (!response.ok) return false;

    const arrayBuffer = await response.arrayBuffer();
    const _buffer = Buffer.from(arrayBuffer);

    // For simplicity, we'll just check if the car mask exists and the bounding box
    // is not in the corners (a heuristic that the edit might overlap with the car)
    // In a production system, you'd want to actually check pixel overlap
    const canvasWidth = 1920; // approximate
    const canvasHeight = 1080; // approximate
    
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;
    
    // If the edit is in the center 60% of the image, consider it overlapping
    const isInCenter = 
      centerX > canvasWidth * 0.2 && centerX < canvasWidth * 0.8 &&
      centerY > canvasHeight * 0.2 && centerY < canvasHeight * 0.8;
    
    return isInCenter;
  } catch {
    return false;
  }
}

async function stitchImages(
  originalImageDataUrl: string,
  editedRegionDataUrl: string,
  boundingBox: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const sharp = (await import('sharp')).default;
  
  const originalBuffer = await dataUrlToBuffer(originalImageDataUrl);
  const editedBuffer = await dataUrlToBuffer(editedRegionDataUrl);
  
  // Get metadata to ensure dimensions match
  const editedMetadata = await sharp(editedBuffer).metadata();
  
  console.log('[stitch] Dimensions check:', {
    boundingBox,
    editedDimensions: { width: editedMetadata.width, height: editedMetadata.height }
  });
  
  // Resize edited image to match bounding box dimensions if needed
  let processedEditedBuffer = editedBuffer;
  if (editedMetadata.width !== boundingBox.width || editedMetadata.height !== boundingBox.height) {
    console.log('[stitch] Resizing edited image to match bounding box');
    processedEditedBuffer = await sharp(editedBuffer)
      .resize(boundingBox.width, boundingBox.height, {
        fit: 'fill'
      })
      .png()
      .toBuffer();
  }
  
  // Composite the edited region onto the original
  const result = await sharp(originalBuffer)
    .composite([{
      input: processedEditedBuffer,
      top: Math.round(boundingBox.y),
      left: Math.round(boundingBox.x),
    }])
    .png()
    .toBuffer();
  
  const base64 = result.toString('base64');
  return `data:image/png;base64,${base64}`;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as DrawToEditRequest;
    const { prompt, imageDataUrl, boundingBox, originalImageDataUrl, carMaskUrl } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (!imageDataUrl || !boundingBox || !originalImageDataUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check credits
    const db = await getSurreal();
    const r = await db.query("SELECT credits_balance FROM user WHERE email = $email LIMIT 1;", { 
      email: user.email 
    });
    const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { credits_balance?: number } | undefined) : undefined;
    const currentCredits = typeof row?.credits_balance === 'number' ? row.credits_balance : 0;

    // Detect if edit overlaps with car cutout
    const hasCarOverlap = await detectCarOverlap(boundingBox, carMaskUrl || null);
    
    // Credit cost: 90 base + 10 if car overlap (needs re-cutting)
    const baseCost = 90;
    const overlapCost = hasCarOverlap ? 10 : 0;
    const totalCost = baseCost + overlapCost;

    if (currentCredits < totalCost) {
      return NextResponse.json(
        { 
          error: `Insufficient credits. Need ${totalCost} credits (${baseCost} for edit${hasCarOverlap ? ' + 10 for car re-cut' : ''})`,
          requiredCredits: totalCost,
          currentCredits,
        },
        { status: 402 }
      );
    }

    // Upload image to FAL
    const imageBuffer = await dataUrlToBuffer(imageDataUrl);
    const imageFalUrl = await uploadToFal(imageBuffer, 'image/png');

    console.log('[draw-to-edit] Calling Gemini with:', { 
      prompt, 
      imageFalUrl: imageFalUrl.substring(0, 50)
    });

    // Call Gemini 2.5 via FAL - using single image
    const result = await fal.subscribe("fal-ai/gemini-25-flash-image/edit", {
      input: {
        prompt,
        image_urls: [imageFalUrl], // Single image without mask
      },
      logs: true,
    });

    console.log('[draw-to-edit] Gemini result:', JSON.stringify(result, null, 2));

    // Gemini returns images array, not a single image
    const editedImageUrl = result.data?.images?.[0]?.url;
    if (!editedImageUrl) {
      console.error('[draw-to-edit] No image in result:', JSON.stringify(result));
      throw new Error('No image returned from Gemini');
    }

    // Fetch the edited image
    const editedResponse = await fetch(editedImageUrl);
    if (!editedResponse.ok) {
      throw new Error('Failed to fetch edited image');
    }
    
    const editedArrayBuffer = await editedResponse.arrayBuffer();
    const editedBuffer = Buffer.from(editedArrayBuffer);
    
    // Convert to data URL for stitching
    const editedDataUrl = `data:image/png;base64,${editedBuffer.toString('base64')}`;

    // Stitch the edited region back onto the original image
    const stitchedDataUrl = await stitchImages(originalImageDataUrl, editedDataUrl, boundingBox);

    // Save the stitched result to R2 library folder
    const timestamp = Date.now();
    const userId = sanitizeUserId(user.email);
    const key = `users/${userId}/library/draw-to-edit-${timestamp}.png`;
    
    const stitchedBuffer = await dataUrlToBuffer(stitchedDataUrl);
    
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: stitchedBuffer,
      ContentType: 'image/png',
    }));

    // Generate signed URL
    const resultUrl = `/api/storage/file?key=${encodeURIComponent(key)}`;

    // Deduct credits
    await adjustCredits(user.email, -totalCost, "draw_to_edit", null);

    // If car overlap, trigger re-cutting (optional - could be done client-side)
    let newCarMaskUrl: string | null = null;
    if (hasCarOverlap && carMaskUrl) {
      try {
        // Call rembg to re-cut the car from the new image
        const rembgResponse = await fetch(`${req.headers.get('origin') || 'http://localhost:3000'}/api/tools/rembg`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            r2_key: key,
            model: 'General Use (Heavy)',
            operating_resolution: '2048x2048',
            output_format: 'png',
            refine_foreground: true,
            output_mask: false,
          }),
        });

        if (rembgResponse.ok) {
          const rembgResult = await rembgResponse.json();
          newCarMaskUrl = rembgResult?.image?.url || null;
        }
      } catch (error) {
        console.error('Failed to re-cut car:', error);
        // Don't fail the whole request if re-cutting fails
      }
    }

    return NextResponse.json({
      resultUrl,
      newCarMaskUrl,
      creditsUsed: totalCost,
      hasCarOverlap,
    });

  } catch (error) {
    console.error('Draw-to-edit error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process edit',
        detail: error
      },
      { status: 500 }
    );
  }
}

