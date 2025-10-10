import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getSessionUser } from "@/lib/user";
import { createViewUrl } from "@/lib/r2";
import { getSurreal } from "@/lib/surrealdb";

fal.config({ credentials: process.env.FAL_KEY || "" });

type UpscaleRequest = {
  r2_key?: string;
  image_url?: string;
  upscale_factor?: number; // 1..4, default 2
  original_width?: number;
  original_height?: number;
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as UpscaleRequest;
    const { r2_key, image_url } = body;

    if (!image_url && !r2_key) return NextResponse.json({ error: "image_url or r2_key required" }, { status: 400 });

    // Prevent re-upscaling of already upscaled images (based on filename marker)
    if (typeof r2_key === "string" && /-upscaled-\d+x\./i.test(r2_key)) {
      return NextResponse.json({ error: "ALREADY_UPSCALED", message: "This image was already upscaled." }, { status: 400 });
    }

    // Resolve a publicly accessible URL for the image
    let sourceUrl: string | null = null;
    if (typeof image_url === "string" && /^https?:\/\//i.test(image_url)) {
      sourceUrl = image_url;
    } else if (typeof r2_key === "string" && r2_key) {
      const { url } = await createViewUrl(r2_key, 60 * 60 * 24);
      sourceUrl = url;
    }
    if (!sourceUrl) return NextResponse.json({ error: "Could not resolve image URL" }, { status: 400 });

    // Compute max allowed upscale factor based on provider limits (4K max: 3840x2160)
    const MAX_W = 3840;
    const MAX_H = 2160;

    let factorToUse = Math.max(1, Math.min(4, Number(body.upscale_factor ?? 2)));
    const input = {
      image_url: sourceUrl,
      upscale_factor: factorToUse,
    } as { image_url: string; upscale_factor: number };

    // Enforce provider max dimensions when original dimensions are known and auto-clamp to the highest allowed factor
    const ow = Math.max(0, Number(body.original_width || 0));
    const oh = Math.max(0, Number(body.original_height || 0));
    let _creditsCost = 0; // display-only
    if (ow && oh) {
      const maxByWidth = MAX_W / ow;
      const maxByHeight = MAX_H / oh;
      const allowedMax = Math.max(1, Math.min(4, maxByWidth, maxByHeight));
      if (allowedMax <= 1 + 1e-6) {
        return NextResponse.json({ error: "UPSCALE_AT_MAX", message: "Image is already at the maximum allowed resolution." }, { status: 400 });
      }
      // Always use the maximum allowed upscale for this image as per spec
      factorToUse = Math.max(1, Math.min(4, Math.round(allowedMax * 100) / 100));
      input.upscale_factor = factorToUse;
      // Display-only estimate; billing is flat 1 credit after success
      _creditsCost = 1;
    }

    // Submit to async queue
    let queueResult: { requestId?: string; request_id?: string } | undefined;
    try {
      queueResult = await fal.queue.submit("fal-ai/clarity-upscaler", { input });
    } catch (err) {
      console.error("Upscale queue error:", err);
      return NextResponse.json({ error: "Upscale failed to start" }, { status: 502 });
    }

    const requestId = queueResult?.requestId || queueResult?.request_id;
    if (!requestId) {
      return NextResponse.json({ error: 'Failed to queue upscale operation' }, { status: 502 });
    }

    console.log(`[UPSCALE JOB] Queued job ${requestId} for user ${user.email}`);

    // Store job metadata in database
    const db = await getSurreal();
    const finalCost = 1; // flat 1 credit per call
    
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
        fal_model: 'fal-ai/clarity-upscaler',
        tool_type: 'upscale',
        status: 'pending',
        credits: finalCost,
        params: {
          r2_key,
          upscale_factor: input.upscale_factor,
          original_width: body.original_width,
          original_height: body.original_height,
        }
      });
    } catch (dbErr) {
      console.error('Failed to store upscale job in database:', dbErr);
      // Job is queued on fal.ai, so we continue despite DB error
    }

    // Return job ID immediately - client will poll for status
    return NextResponse.json({ 
      jobId: requestId,
      status: 'pending',
      credits: finalCost,
      message: 'Upscale operation started. Check status at /api/tools/status'
    });
  } catch (err) {
    try { console.error("/api/tools/upscale error", err); } catch {}
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


