/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { fal } from "@fal-ai/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, bucket } from "@/lib/r2";
import { adjustCredits } from "@/lib/credits";
import { createViewUrl } from "@/lib/r2";
import { generateBlurHash } from "@/lib/blurhash-server";
import type { LibraryImage } from "@/lib/library-image";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

// Helper functions for draw-to-edit stitching
async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  const base64Data = dataUrl.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}

async function stitchImages(
  originalImageDataUrl: string,
  editedRegionDataUrl: string,
  boundingBox: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
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
  
  return result;
}

fal.config({ credentials: process.env.FAL_KEY || "" });

// GET /api/tools/status?jobId=xxx
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });

    const db = await getSurreal();
    
    // Fetch job from database
    const jobRes = await db.query(
      "SELECT * FROM tool_job WHERE fal_request_id = $jobId AND email = $email LIMIT 1;",
      { jobId, email: user.email }
    );
    const job = Array.isArray(jobRes) && Array.isArray(jobRes[0]) && jobRes[0][0] 
      ? jobRes[0][0] as any
      : null;

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // If job is already completed or failed, return cached result
    if (job.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        url: job.output_url,
        key: job.output_key,
        credits: job.credits,
        tool_type: job.tool_type,
      });
    }
    if (job.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: job.error_message || 'Tool operation failed',
        tool_type: job.tool_type,
      });
    }

    // Poll fal.ai for status using the model name + request ID
    const falModel = job.fal_model;
    let falStatus: any;
    try {
      falStatus = await fal.queue.status(falModel, { 
        requestId: jobId,
        logs: false 
      } as any);
    } catch (err) {
      console.error(`Failed to check status for job ${jobId}:`, err);
      return NextResponse.json({ 
        status: job.status || 'pending',
        message: 'Checking job status...',
        tool_type: job.tool_type,
      });
    }

    console.log(`[TOOL JOB ${jobId}] Status: ${falStatus?.status}`);

    // If still in queue or processing, return status
    if (falStatus?.status === 'IN_QUEUE' || falStatus?.status === 'IN_PROGRESS') {
      const updatedStatus = falStatus.status === 'IN_PROGRESS' ? 'processing' : 'pending';
      
      // Update DB status if changed
      if (job.status !== updatedStatus) {
        try {
          await db.query(
            "UPDATE $id SET status = $status, updated_at = time::now();",
            { id: job.id, status: updatedStatus }
          );
        } catch {}
      }
      
      return NextResponse.json({
        status: updatedStatus,
        message: updatedStatus === 'processing' ? 'Processing...' : 'In queue...',
        tool_type: job.tool_type,
      });
    }

    // Handle completion
    if (falStatus?.status === 'COMPLETED') {
      console.log(`[TOOL JOB ${jobId}] Status shows COMPLETED, fetching result...`);
      
      // When status is COMPLETED, we need to fetch the actual result data
      let resultData: any;
      try {
        resultData = await fal.queue.result(falModel, { 
          requestId: jobId 
        } as any);
        console.log(`[TOOL JOB ${jobId}] Result data:`, JSON.stringify(resultData, null, 2));
      } catch (resultErr) {
        console.error(`[TOOL JOB ${jobId}] Failed to fetch result:`, resultErr);
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to fetch result from fal.ai'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to fetch result' });
      }
      
      // Extract output URL based on tool type
      let outputUrl: string | null = null;
      
      if (job.tool_type === 'upscale') {
        outputUrl = resultData?.data?.image?.url || resultData?.image?.url || null;
      } else {
        // draw_to_edit and studio return images array
        outputUrl = resultData?.data?.images?.[0]?.url || resultData?.data?.image?.url || resultData?.images?.[0]?.url || resultData?.image?.url || null;
      }
      
      console.log(`[TOOL JOB ${jobId}] Extracted output URL:`, outputUrl);
      
      if (!outputUrl) {
        console.error(`[TOOL JOB ${jobId}] No output URL in result:`, JSON.stringify(resultData));
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'No output in result'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'No output in result' });
      }

      // Download the result from fal.ai
      const outputResponse = await fetch(outputUrl);
      if (!outputResponse.ok) {
        console.error(`[TOOL JOB ${jobId}] Failed to download output from ${outputUrl}`);
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to download output'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to download output' });
      }

      const outputBlob = await outputResponse.blob();
      let outputBuffer = Buffer.from(await outputBlob.arrayBuffer());

      // Handle draw-to-edit stitching
      if (job.tool_type === 'draw_to_edit' && job.params) {
        const params = job.params as any;
        const { boundingBox, originalImageDataUrl } = params;
        
        if (boundingBox && originalImageDataUrl) {
          console.log(`[TOOL JOB ${jobId}] Performing draw-to-edit stitching...`);
          try {
            // Convert the edited buffer to data URL for stitching
            const editedDataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;
            
            // Stitch the edited region back onto the original image
            const stitchedBuffer = await stitchImages(originalImageDataUrl, editedDataUrl, boundingBox);
            outputBuffer = Buffer.from(stitchedBuffer);
            console.log(`[TOOL JOB ${jobId}] Stitching complete`);
          } catch (stitchErr) {
            console.error(`[TOOL JOB ${jobId}] Stitching failed:`, stitchErr);
            // Continue with un-stitched result
          }
        }
      }

      // Determine content type and extension
      const contentType = job.tool_type === 'draw_to_edit' ? 'image/png' : (outputResponse.headers.get('content-type') || 'image/jpeg');
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

      // Upload to R2 - store in library folder
      const userId = sanitizeUserId(user.email);
      const timestamp = Date.now();
      const toolName = job.tool_type.replace('_', '-');
      const outputKey = `users/${userId}/library/${toolName}-${timestamp}.${ext}`;

      try {
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: outputKey,
          Body: outputBuffer,
          ContentType: contentType,
        }));
        console.log(`[TOOL JOB ${jobId}] Saved to R2: ${outputKey}`);
      } catch (uploadErr) {
        console.error(`[TOOL JOB ${jobId}] Failed to upload to R2:`, uploadErr);
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to save output'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to save output' });
      }

      // Generate view URL
      const { url: viewUrl } = await createViewUrl(outputKey);

      // Charge credits (they were estimated at job creation)
      const creditsToCharge = job.credits || 1;
      try {
        await adjustCredits(user.email, -creditsToCharge, job.tool_type, outputKey);
        console.log(`[TOOL JOB ${jobId}] Charged ${creditsToCharge} credits for ${job.tool_type}`);
      } catch (creditErr) {
        console.error(`[TOOL JOB ${jobId}] Failed to charge credits:`, creditErr);
        // Continue anyway - output was generated
      }

      // Generate and store blurhash for images (upscale, draw_to_edit, studio)
      try {
        const blurhash = await generateBlurHash(outputBuffer, 4, 3);
        const metadata = await sharp(outputBuffer).metadata();
        
        const libraryImageData: Omit<LibraryImage, 'id'> = {
          key: outputKey,
          email: user.email,
          blurhash,
          width: metadata.width || 0,
          height: metadata.height || 0,
          size: outputBuffer.length,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };
        
        // Check if record exists, update or create
        const existing = await db.query(
          "SELECT id FROM library_image WHERE key = $key AND email = $email LIMIT 1;",
          { key: outputKey, email: user.email }
        );
        
        const existingId = Array.isArray(existing) && Array.isArray(existing[0]) && existing[0][0]
          ? (existing[0][0] as { id?: string }).id
          : null;

        if (existingId) {
          await db.query(
            "UPDATE $id SET blurhash = $blurhash, width = $width, height = $height, size = $size, lastModified = $lastModified;",
            { 
              id: existingId,
              blurhash: libraryImageData.blurhash,
              width: libraryImageData.width,
              height: libraryImageData.height,
              size: libraryImageData.size,
              lastModified: libraryImageData.lastModified
            }
          );
        } else {
          await db.create('library_image', libraryImageData);
        }
        
        console.log(`[TOOL JOB ${jobId}] Stored library image metadata for ${outputKey}`);
      } catch (error) {
        console.error(`[TOOL JOB ${jobId}] Failed to store image metadata (non-fatal):`, error);
      }

      // Update job as completed
      try {
        await db.query(
          "UPDATE $id SET status = 'completed', output_key = $key, output_url = $url, updated_at = time::now(), completed_at = time::now();",
          { 
            id: job.id, 
            key: outputKey,
            url: viewUrl
          }
        );
      } catch {}

      return NextResponse.json({
        status: 'completed',
        url: viewUrl,
        key: outputKey,
        credits: creditsToCharge,
        tool_type: job.tool_type,
      });
    }

    // Handle failure
    if (falStatus?.status === 'FAILED' || falStatus?.status === 'CANCELLED') {
      const error = falStatus?.error || 'Operation failed';
      try {
        await db.query(
          "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
          { id: job.id, error: String(error) }
        );
      } catch {}
      return NextResponse.json({ status: 'failed', error, tool_type: job.tool_type });
    }

    // Unknown status
    return NextResponse.json({
      status: job.status || 'pending',
      message: 'Unknown job status',
      tool_type: job.tool_type,
    });

  } catch (err) {
    console.error('/api/tools/status error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

