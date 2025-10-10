import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY || "" });

const _bucket = process.env.R2_BUCKET || "";

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

async function _stitchImages(
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

    // Submit to async queue
    let queueResult: { requestId?: string; request_id?: string } | undefined;
    try {
      queueResult = await fal.queue.submit("fal-ai/gemini-25-flash-image/edit", {
        input: {
          prompt,
          image_urls: [imageFalUrl],
        },
      });
    } catch (err) {
      console.error("Draw-to-edit queue error:", err);
      return NextResponse.json({ error: "Draw-to-edit failed to start" }, { status: 502 });
    }

    const requestId = queueResult?.requestId || queueResult?.request_id;
    if (!requestId) {
      return NextResponse.json({ error: 'Failed to queue draw-to-edit operation' }, { status: 502 });
    }

    console.log(`[DRAW-TO-EDIT JOB] Queued job ${requestId} for user ${user.email}`);

    // Store job metadata in database
    try {
      await db.query(`
        CREATE tool_job CONTENT {
          email: $email,
          fal_request_id: $fal_request_id,
          fal_model: $fal_model,
          tool_type: $tool_type,
          status: $status,
          credits: $credits,
          params: $params,
          created_at: time::now(),
          updated_at: time::now()
        };
      `, {
        email: user.email,
        fal_request_id: requestId,
        fal_model: 'fal-ai/gemini-25-flash-image/edit',
        tool_type: 'draw_to_edit',
        status: 'pending',
        credits: totalCost,
        params: {
          prompt,
          boundingBox,
          originalImageDataUrl,
          carMaskUrl: carMaskUrl || null,
          hasCarOverlap,
        }
      });
    } catch (dbErr) {
      console.error('Failed to store draw-to-edit job in database:', dbErr);
      // Job is queued on fal.ai, so we continue despite DB error
    }

    // Return job ID immediately - client will poll for status
    return NextResponse.json({ 
      jobId: requestId,
      status: 'pending',
      credits: totalCost,
      message: 'Draw-to-edit operation started. Check status at /api/tools/status'
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

