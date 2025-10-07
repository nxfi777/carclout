import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAndReserveCredits } from "@/lib/credits";
import { createGetUrl, uploadToR2 } from "@/lib/r2";

// Credit cost calculation for video interpolation
// Based on fal.ai pricing: $0.0013 per compute second
// Reference: 4s 720p video = 7.43s compute = $0.00966 ≈ 8 credits
// Formula: duration_seconds × resolution_factor × 2 credits/sec
// Resolution factor: (width × height) / (1280 × 720)
function calculateInterpolationCredits(durationSeconds: number, width: number, height: number): number {
  const BASE_CREDITS_PER_SECOND = 2; // Credits per second at 720p
  const REFERENCE_RESOLUTION = 1280 * 720; // 720p as reference
  const resolutionFactor = (width * height) / REFERENCE_RESOLUTION;
  const credits = Math.ceil(durationSeconds * resolutionFactor * BASE_CREDITS_PER_SECOND * 817.65 / 817.65); // Keep as credits
  return Math.max(10, credits); // Minimum 10 credits
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Comment out plan check - all users now have video interpolation access
    /*
    // Check if user has Ultra plan
    const db = await getSurreal();
    const userResult = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
    const userPlan = Array.isArray(userResult) && Array.isArray(userResult[0])
      ? (userResult[0][0] as { plan?: string })?.plan
      : null;

    if (userPlan !== "ultra") {
      return NextResponse.json({ error: "Video frame interpolation is only available on the Ultra plan" }, { status: 403 });
    }
    */

    const { r2_key } = await req.json();
    if (!r2_key || typeof r2_key !== "string") {
      return NextResponse.json({ error: "Missing r2_key" }, { status: 400 });
    }

    // Check if video was already interpolated
    const fileName = r2_key.split("/").pop() || "";
    if (fileName.includes("60fps") || fileName.includes("interpolated")) {
      return NextResponse.json({ error: "This video has already been interpolated" }, { status: 400 });
    }

    // Require video to be upscaled first
    if (!fileName.includes("upscaled") && !fileName.includes("2x")) {
      return NextResponse.json({ 
        error: "Please upscale the video first for best quality results",
        code: "UPSCALE_REQUIRED"
      }, { status: 400 });
    }

    // Get signed URL for the input video
    const { url: inputUrl } = await createGetUrl(r2_key);
    if (!inputUrl) {
      return NextResponse.json({ error: "Failed to get video URL" }, { status: 500 });
    }

    // Call fal.ai RIFE interpolation API
    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    console.log("[video-interpolate] Starting interpolation for:", r2_key);

    // First, get video metadata to calculate credits
    const metadataRes = await fetch(inputUrl, { method: "HEAD" });
    const contentLength = parseInt(metadataRes.headers.get("content-length") || "0");
    
    // Estimate duration and resolution from file size (rough approximation)
    // Default to 720p for credit calculation if we can't determine
    const estimatedDuration = Math.max(1, Math.min(60, contentLength / (1024 * 1024 * 5))); // Rough estimate
    const width = 1280; // Default 720p
    const height = 720;
    
    const creditsNeeded = calculateInterpolationCredits(estimatedDuration, width, height);
    
    console.log(`[video-interpolate] Estimated credits: ${creditsNeeded} for ~${estimatedDuration.toFixed(1)}s`);

    // Reserve credits before processing
    try {
      await requireAndReserveCredits(email, creditsNeeded, "video_interpolate", r2_key);
    } catch (e) {
      const err = e as { message?: string };
      if (err.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
      }
      throw e;
    }

    const falRes = await fetch("https://fal.run/fal-ai/rife/video", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_url: inputUrl,
        num_frames: 3, // Generate 3 frames between each original frame for smooth 60fps
        use_scene_detection: true, // Prevent smearing at scene changes
        use_calculated_fps: true, // Auto-calculate output FPS
      }),
    });

    const falData = await falRes.json();

    if (!falRes.ok || !falData?.video?.url) {
      console.error("[video-interpolate] fal.ai error:", falData);
      return NextResponse.json({ error: falData?.error || "Interpolation failed" }, { status: 500 });
    }

    const interpolatedVideoUrl = falData.video.url;

    // Download the interpolated video
    const videoRes = await fetch(interpolatedVideoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: "Failed to download interpolated video" }, { status: 500 });
    }

    const videoBlob = await videoRes.blob();
    const videoBuffer = Buffer.from(await videoBlob.arrayBuffer());

    // Generate output key
    const originalName = r2_key.split("/").pop() || "video.mp4";
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const outputKey = r2_key.includes("/")
      ? `${r2_key.substring(0, r2_key.lastIndexOf("/"))}/60fps-${baseName}-${timestamp}.mp4`
      : `library/60fps-${baseName}-${timestamp}.mp4`;

    // Upload to R2
    await uploadToR2(outputKey, videoBuffer, "video/mp4");

    console.log("[video-interpolate] Success:", outputKey);

    const { url: outputUrl } = await createGetUrl(outputKey);
    return NextResponse.json({
      key: outputKey,
      url: outputUrl,
      credits_used: creditsNeeded,
    });
  } catch (e) {
    const err = e as { message?: string };
    console.error("[video-interpolate] Error:", err);
    return NextResponse.json({ error: err.message || "Video interpolation failed" }, { status: 500 });
  }
}

