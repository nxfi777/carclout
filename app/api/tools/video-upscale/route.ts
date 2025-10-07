import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAndReserveCredits } from "@/lib/credits";
import { createGetUrl, uploadToR2 } from "@/lib/r2";

// Credit cost calculation for video upscale
// Based on fal.ai pricing: $0.015 per megapixel of output
// Reference: 4s 720p→1440p (60fps) = 240 frames × 3.6864 MP = 884.736 MP = $13.27 ≈ 10,850 credits
// Formula: total_frames × output_width × output_height / 1,000,000 × 12.26 credits/MP
// Simplified: duration × fps × (input_width × 2) × (input_height × 2) / 1,000,000 × 12.26
function calculateUpscaleCredits(durationSeconds: number, fps: number, width: number, height: number): number {
  const CREDITS_PER_MEGAPIXEL = 10; // ~$0.0122 per MP at 817.65 credits/$
  const outputWidth = width * 2; // 2x upscale
  const outputHeight = height * 2;
  const totalFrames = durationSeconds * fps;
  const megapixelsPerFrame = (outputWidth * outputHeight) / 1_000_000;
  const totalMegapixels = totalFrames * megapixelsPerFrame;
  const credits = Math.ceil(totalMegapixels * CREDITS_PER_MEGAPIXEL);
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

    // Estimate video properties from file size for credit calculation
    const metadataRes = await fetch(inputUrl, { method: "HEAD" });
    const contentLength = parseInt(metadataRes.headers.get("content-length") || "0");
    
    // Rough estimates (default to 720p 30fps if unknown)
    const estimatedDuration = Math.max(1, Math.min(60, contentLength / (1024 * 1024 * 5)));
    const fps = 30; // Conservative estimate
    const width = 1280; // Default 720p
    const height = 720;
    
    const creditsNeeded = calculateUpscaleCredits(estimatedDuration, fps, width, height);
    
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
        upscale_factor: 2, // 2x upscale
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

