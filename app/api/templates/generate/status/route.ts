/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { fal } from "@fal-ai/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, bucket } from "@/lib/r2";
import { adjustCredits } from "@/lib/credits";
import { createViewUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

fal.config({ credentials: process.env.FAL_KEY || "" });

// GET /api/templates/generate/status?jobId=xxx
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
      "SELECT * FROM image_job WHERE fal_request_id = $jobId AND email = $email LIMIT 1;",
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
        url: job.image_url,
        key: job.output_key,
        credits: job.credits,
      });
    }
    if (job.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: job.error_message || 'Image generation failed',
      });
    }

    // Poll fal.ai for status using the model name + request ID
    const falModel = job.fal_model || 'fal-ai/gemini-25-flash-image/edit';
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
        message: 'Checking job status...'
      });
    }

    console.log(`[IMAGE JOB ${jobId}] Status: ${falStatus?.status}`);

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
        message: updatedStatus === 'processing' ? 'Generating image...' : 'In queue...',
      });
    }

    // Handle completion
    if (falStatus?.status === 'COMPLETED') {
      console.log(`[IMAGE JOB ${jobId}] Status shows COMPLETED, fetching result...`);
      
      // When status is COMPLETED, we need to fetch the actual result data
      let resultData: any;
      try {
        resultData = await fal.queue.result(falModel, { 
          requestId: jobId 
        } as any);
        console.log(`[IMAGE JOB ${jobId}] Result data:`, JSON.stringify(resultData, null, 2));
      } catch (resultErr) {
        console.error(`[IMAGE JOB ${jobId}] Failed to fetch result:`, resultErr);
        // Mark as failed in DB
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to fetch image result from fal.ai'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to fetch image result' });
      }
      
      // Extract image URL - check various possible paths
      const imageUrl: string | null = 
        resultData?.data?.images?.[0]?.url || 
        resultData?.data?.image?.url || 
        resultData?.images?.[0]?.url || 
        resultData?.image?.url || 
        null;
      
      console.log(`[IMAGE JOB ${jobId}] Extracted image URL:`, imageUrl);
      
      if (!imageUrl) {
        console.error(`[IMAGE JOB ${jobId}] No image URL in result:`, JSON.stringify(resultData));
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'No image in generation result'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'No image in result' });
      }

      // Download the image from fal.ai
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error(`[IMAGE JOB ${jobId}] Failed to download image from ${imageUrl}`);
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to download generated image'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to download image' });
      }

      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      // Upload to R2 - store in library folder
      const userId = sanitizeUserId(user.email);
      const timestamp = Date.now();
      const outputKey = `users/${userId}/library/gen-${timestamp}.jpg`;

      try {
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: outputKey,
          Body: imageBuffer,
          ContentType: 'image/jpeg',
        }));
        console.log(`[IMAGE JOB ${jobId}] Saved to R2: ${outputKey}`);
      } catch (uploadErr) {
        console.error(`[IMAGE JOB ${jobId}] Failed to upload to R2:`, uploadErr);
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to save generated image'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to save image' });
      }

      // Generate view URL
      const { url: viewUrl } = await createViewUrl(outputKey);

      // Charge credits (they were estimated at job creation)
      const creditsToCharge = job.credits || 20; // Default to 20 if not set
      try {
        await adjustCredits(user.email, -creditsToCharge, "image_generation", outputKey);
        console.log(`[IMAGE JOB ${jobId}] Charged ${creditsToCharge} credits`);
      } catch (creditErr) {
        console.error(`[IMAGE JOB ${jobId}] Failed to charge credits:`, creditErr);
        // Continue anyway - image was generated
      }

      // Check if this is user's first completed template generation
      let isFirstTemplate = false;
      try {
        const completedJobsRes = await db.query(
          "SELECT count() as count FROM image_job WHERE email = $email AND status = 'completed' GROUP ALL;",
          { email: user.email }
        );
        const completedCount = Array.isArray(completedJobsRes) && Array.isArray(completedJobsRes[0]) && completedJobsRes[0][0]
          ? (completedJobsRes[0][0] as any).count || 0
          : 0;
        
        // If count is 0, this will be the first after we update the job status
        isFirstTemplate = completedCount === 0;
        
        if (isFirstTemplate) {
          console.log(`[ACTIVATION] First template generated by: ${user.email}`);
        }
      } catch (countErr) {
        console.error(`[IMAGE JOB ${jobId}] Failed to check generation count:`, countErr);
      }

      // Update job as completed
      try {
        await db.query(
          "UPDATE $id SET status = 'completed', output_key = $key, image_url = $url, updated_at = time::now(), completed_at = time::now();",
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
        isFirstTemplate,
      });
    }

    // Handle failure
    if (falStatus?.status === 'FAILED' || falStatus?.status === 'CANCELLED') {
      const error = falStatus?.error || 'Image generation failed';
      try {
        await db.query(
          "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
          { id: job.id, error: String(error) }
        );
      } catch {}
      return NextResponse.json({ status: 'failed', error });
    }

    // Unknown status
    return NextResponse.json({
      status: job.status || 'pending',
      message: 'Unknown job status',
    });

  } catch (err) {
    console.error('/api/templates/generate/status error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

