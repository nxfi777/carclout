/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { chargeCreditsOnce } from "@/lib/credits";
import { generateVideoBlurHash } from "@/lib/video-blurhash-server";
import type { LibraryVideo } from "@/lib/library-image";

export const runtime = "nodejs";
export const maxDuration = 30;

fal.config({ credentials: process.env.FAL_KEY || "" });

// SurrealDB datetime updates use time::now() in the query itself

// GET /api/templates/video/status?jobId=xxx
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
      "SELECT * FROM video_job WHERE fal_request_id = $jobId AND email = $email LIMIT 1;",
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
        url: job.video_url,
        key: job.output_key,
        credits: job.credits,
      });
    }
    if (job.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: job.error_message || 'Video generation failed',
      });
    }

    // Poll fal.ai for status using the model name + request ID
    const falModel = job.fal_model || 'fal-ai/bytedance/seedance/v1/pro/image-to-video';
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

    console.log(`[VIDEO JOB ${jobId}] Status: ${falStatus?.status}`);

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
        message: updatedStatus === 'processing' ? 'Generating video...' : 'In queue...',
      });
    }

    // Handle completion
    if (falStatus?.status === 'COMPLETED') {
      console.log(`[VIDEO JOB ${jobId}] Status shows COMPLETED, fetching result...`);
      
      // When status is COMPLETED, we need to fetch the actual result data
      let resultData: any;
      try {
        resultData = await fal.queue.result(falModel, { 
          requestId: jobId 
        } as any);
        console.log(`[VIDEO JOB ${jobId}] Result data:`, JSON.stringify(resultData, null, 2));
      } catch (resultErr) {
        console.error(`[VIDEO JOB ${jobId}] Failed to fetch result:`, resultErr);
        // Mark as failed in DB
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'Failed to fetch video result from fal.ai'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Failed to fetch video result' });
      }
      
      // Extract video URL - it's nested under data.video.url
      const videoUrl: string | null = resultData?.data?.video?.url || resultData?.video?.url || resultData?.url || null;
      
      console.log(`[VIDEO JOB ${jobId}] Extracted video URL:`, videoUrl);
      
      if (!videoUrl) {
        console.error(`[VIDEO JOB ${jobId}] No video URL found in result. Full result:`, JSON.stringify(resultData, null, 2));
        // Mark as failed in DB
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { 
              id: job.id, 
              error: 'No video URL in response'
            }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error: 'Video generation failed: no video URL' });
      }

      console.log(`[VIDEO JOB ${jobId}] Completed, downloading from ${videoUrl}`);

      // Download video from fal.ai
      const fileRes = await fetch(videoUrl);
      if (!fileRes.ok) {
        const error = `Failed to download video: ${fileRes.status}`;
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = time::now();",
            { id: job.id, error }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error });
      }

      const videoBytes = new Uint8Array(await fileRes.arrayBuffer());
      
      // Generate output key
      const userRoot = `users/${sanitizeUserId(user.email)}`;
      const createdIso = new Date().toISOString();
      const safeSlug = String(job.template_id || 'template').split(':').pop()?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'template';
      const fileBase = `${createdIso.replace(/[:.]/g, '-')}-${safeSlug}`;
      const singleOutKey = `${userRoot}/library/${fileBase}.mp4`;

      // Upload to R2
      try {
        await ensureFolder(`${userRoot}/library/`);
        await r2.send(new PutObjectCommand({ 
          Bucket: bucket, 
          Key: singleOutKey, 
          Body: videoBytes, 
          ContentType: 'video/mp4' 
        }));
      } catch (uploadErr) {
        console.error('Failed to upload video to R2:', uploadErr);
        const error = 'Failed to save video';
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = $error, updated_at = $updated;",
            { id: job.id, error, updated: new Date().toISOString() }
          );
        } catch {}
        return NextResponse.json({ status: 'failed', error });
      }

      // Charge credits
      try {
        await chargeCreditsOnce(user.email, job.credits || 0, 'video', singleOutKey);
      } catch {
        // Insufficient credits - delete the video
        try { await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: singleOutKey })); } catch {}
        try {
          await db.query(
            "UPDATE $id SET status = 'failed', error_message = 'INSUFFICIENT_CREDITS', updated_at = time::now();",
            { id: job.id }
          );
        } catch {}
        return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 402 });
      }

      // Generate blurhash (non-fatal)
      try {
        const videoBuffer = Buffer.from(videoBytes);
        const { blurhash, width, height, duration } = await generateVideoBlurHash(videoBuffer);
        
        const libraryVideoData: Omit<LibraryVideo, 'id'> = {
          key: singleOutKey,
          email: user.email,
          blurhash,
          width,
          height,
          duration,
          size: videoBytes.length,
          created: createdIso,
          lastModified: createdIso,
        };
        
        const existing = await db.query(
          "SELECT id FROM library_video WHERE key = $key AND email = $email LIMIT 1;",
          { key: singleOutKey, email: user.email }
        );
        
        const existingId = Array.isArray(existing) && Array.isArray(existing[0]) && existing[0][0]
          ? (existing[0][0] as { id?: string }).id
          : null;

        if (existingId) {
          await db.query(
            "UPDATE $id SET blurhash = $blurhash, width = $width, height = $height, duration = $duration, size = $size, lastModified = $lastModified;",
            { 
              id: existingId,
              blurhash: libraryVideoData.blurhash,
              width: libraryVideoData.width,
              height: libraryVideoData.height,
              duration: libraryVideoData.duration,
              size: libraryVideoData.size,
              lastModified: libraryVideoData.lastModified
            }
          );
        } else {
          await db.create('library_video', libraryVideoData);
        }
        
        console.log(`Stored library video metadata for ${singleOutKey}`);
      } catch (error) {
        console.error('Failed to store video metadata (non-fatal):', error);
      }

      // Generate view URL
      const { url: viewUrl } = await createViewUrl(singleOutKey);

      // Update job as completed
      try {
        await db.query(
          "UPDATE $id SET status = 'completed', output_key = $key, video_url = $url, updated_at = time::now(), completed_at = time::now();",
          { 
            id: job.id, 
            key: singleOutKey,
            url: viewUrl
          }
        );
      } catch {}

      return NextResponse.json({
        status: 'completed',
        url: viewUrl,
        key: singleOutKey,
        credits: job.credits,
      });
    }

    // Handle failure
    if (falStatus?.status === 'FAILED' || falStatus?.status === 'CANCELLED') {
      const error = falStatus?.error || 'Video generation failed';
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
    console.error('/api/templates/video/status error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

