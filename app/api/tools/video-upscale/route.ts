import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAndReserveCredits } from "@/lib/credits";
import { createGetUrl, uploadToR2 } from "@/lib/r2";
import { generateVideoBlurHash } from "@/lib/video-blurhash-server";
import { getSurreal } from "@/lib/surrealdb";
import type { LibraryVideo } from "@/lib/library-image";

export const maxDuration = 600; // 10 minutes for video upscaling

// Credit cost calculation for video upscale
// Using same profit margin as sora video gen (not pro): 1000 credits per 4s 720p video (costs $0.40)
// Profit margin: 1000 credits / $0.40 = 2500 credits per dollar of cost
// fal.ai pricing: $0.015 per megapixel
// Calculate based on INPUT megapixels (not output)
function calculateUpscaleCredits(durationSeconds: number, fps: number, width: number, height: number, _upscaleFactor: number): number {
  const CREDITS_PER_DOLLAR = 2500; // Same margin as sora (not pro)
  const COST_PER_MEGAPIXEL = 0.015; // fal.ai pricing
  
  // Calculate total INPUT megapixels
  const totalFrames = durationSeconds * fps;
  const megapixelsPerFrame = (width * height) / 1_000_000;
  const totalMegapixels = totalFrames * megapixelsPerFrame;
  
  // Calculate cost and convert to credits
  const cost = totalMegapixels * COST_PER_MEGAPIXEL;
  const credits = Math.ceil(cost * CREDITS_PER_DOLLAR);
  
  return Math.max(100, credits); // Minimum 100 credits
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Comment out plan check - all users now have video upscale access
    /*
    // Check if user has Ultra plan
    const db = await getSurreal();
    const userResult = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
    const userPlan = Array.isArray(userResult) && Array.isArray(userResult[0])
      ? (userResult[0][0] as { plan?: string })?.plan
      : null;

    if (userPlan !== "ultra") {
      return NextResponse.json({ error: "Video upscaling is only available on the Ultra plan" }, { status: 403 });
    }
    */

    const { r2_key } = await req.json();
    if (!r2_key || typeof r2_key !== "string") {
      return NextResponse.json({ error: "Missing r2_key" }, { status: 400 });
    }

    // Check if video was already upscaled
    const fileName = r2_key.split("/").pop() || "";
    if (fileName.includes("upscaled") || fileName.includes("4k") || fileName.includes("2x")) {
      return NextResponse.json({ error: "This video has already been upscaled" }, { status: 400 });
    }

    // Get signed URL for the input video
    const { url: inputUrl } = await createGetUrl(r2_key);
    if (!inputUrl) {
      return NextResponse.json({ error: "Failed to get video URL" }, { status: 500 });
    }

    // Call fal.ai SeedVR upscale API
    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    console.log("[video-upscale] Starting upscale for:", r2_key);

    // Get video dimensions from database or estimate from file size
    const db = await getSurreal();
    const videoMetadata = await db.query(
      "SELECT width, height, duration FROM library_video WHERE key = $key AND email = $email LIMIT 1;",
      { key: r2_key, email }
    );
    
    const videoData = Array.isArray(videoMetadata) && Array.isArray(videoMetadata[0]) && videoMetadata[0][0]
      ? (videoMetadata[0][0] as { width?: number; height?: number; duration?: number })
      : null;

    const width = videoData?.width || 1280; // Default 720p
    const height = videoData?.height || 720;
    const videoDuration = videoData?.duration;
    
    // Calculate maximum upscale factor based on fal.ai limits
    // Max larger dimension: 1920, max smaller dimension: 1080
    const MAX_LARGER_DIM = 1920;
    const MAX_SMALLER_DIM = 1080;
    
    const largerDim = Math.max(width, height);
    const smallerDim = Math.min(width, height);
    
    const maxFactorByLargerDim = MAX_LARGER_DIM / largerDim;
    const maxFactorBySmallerDim = MAX_SMALLER_DIM / smallerDim;
    const maxUpscaleFactor = Math.min(maxFactorByLargerDim, maxFactorBySmallerDim);
    
    // Use the highest factor that doesn't exceed limits, rounded to 2 decimals
    // Minimum 1.0, maximum 2.0 (or lower if needed)
    const upscaleFactor = Math.max(1.0, Math.min(2.0, Math.floor(maxUpscaleFactor * 100) / 100));
    
    console.log(`[video-upscale] Input: ${width}x${height}, Max factor: ${maxUpscaleFactor.toFixed(2)}, Using: ${upscaleFactor.toFixed(2)}`);
    
    if (upscaleFactor <= 1.0) {
      return NextResponse.json({ 
        error: "Video is already at or near maximum resolution for upscaling" 
      }, { status: 400 });
    }

    // Estimate video properties from file size for credit calculation if duration unknown
    const metadataRes = await fetch(inputUrl, { method: "HEAD" });
    const contentLength = parseInt(metadataRes.headers.get("content-length") || "0");
    const estimatedDuration = videoDuration || Math.max(1, Math.min(60, contentLength / (1024 * 1024 * 5)));
    const fps = 30; // Conservative estimate
    
    const creditsNeeded = calculateUpscaleCredits(estimatedDuration, fps, width, height, upscaleFactor);
    
    console.log(`[video-upscale] Estimated credits: ${creditsNeeded} for ~${estimatedDuration.toFixed(1)}s ${width}x${height}`);

    // Reserve credits before processing
    try {
      await requireAndReserveCredits(email, creditsNeeded, "video_upscale", r2_key);
    } catch (e) {
      const err = e as { message?: string };
      if (err.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
      }
      throw e;
    }

    const falRes = await fetch("https://fal.run/fal-ai/seedvr/upscale/video", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_url: inputUrl,
        upscale_factor: upscaleFactor,
      }),
    });

    const falData = await falRes.json();

    if (!falRes.ok || !falData?.video?.url) {
      console.error("[video-upscale] fal.ai error:", falData);
      return NextResponse.json({ error: falData?.error || "Upscale failed" }, { status: 500 });
    }

    const upscaledVideoUrl = falData.video.url;

    // Download the upscaled video
    const videoRes = await fetch(upscaledVideoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: "Failed to download upscaled video" }, { status: 500 });
    }

    const videoBlob = await videoRes.blob();
    const videoBuffer = Buffer.from(await videoBlob.arrayBuffer());

    // Generate output key
    const originalName = r2_key.split("/").pop() || "video.mp4";
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const outputKey = r2_key.includes("/")
      ? `${r2_key.substring(0, r2_key.lastIndexOf("/"))}/upscaled-${baseName}-${timestamp}.mp4`
      : `library/upscaled-${baseName}-${timestamp}.mp4`;

    // Upload to R2
    await uploadToR2(outputKey, videoBuffer, "video/mp4");

    console.log("[video-upscale] Success:", outputKey);

    // Generate and store blurhash for upscaled video (non-fatal)
    try {
      const { blurhash, width, height, duration } = await generateVideoBlurHash(videoBuffer);
      
      const db = await getSurreal();
      const libraryVideoData: Omit<LibraryVideo, 'id'> = {
        key: outputKey,
        email: email,
        blurhash,
        width,
        height,
        duration,
        size: videoBuffer.length,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };
      
      // Check if record exists, update or create
      const existing = await db.query(
        "SELECT id FROM library_video WHERE key = $key AND email = $email LIMIT 1;",
        { key: outputKey, email: email }
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
      
      console.log(`Stored library video metadata for upscaled video ${outputKey}`);
    } catch (error) {
      console.error('Failed to store upscaled video metadata (non-fatal):', error);
    }

    const { url: outputUrl } = await createGetUrl(outputKey);
    return NextResponse.json({
      key: outputKey,
      url: outputUrl,
      credits_used: creditsNeeded,
    });
  } catch (e) {
    const err = e as { message?: string };
    console.error("[video-upscale] Error:", err);
    return NextResponse.json({ error: err.message || "Video upscale failed" }, { status: 500 });
  }
}

