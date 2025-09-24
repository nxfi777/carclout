import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { chargeCreditsOnce } from "@/lib/credits";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
      const { url } = await createViewUrl(r2_key, 60 * 10);
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

    let result: unknown;
    try {
      result = await fal.subscribe("fal-ai/clarity-upscaler", {
        input,
        logs: true,
        onQueueUpdate: (update: unknown) => {
          try {
            if (update && typeof update === "object" && (update as Record<string, unknown>).status === "IN_PROGRESS") {
              const logs = (update as Record<string, unknown>).logs;
              if (Array.isArray(logs)) {
                logs
                  .map((l: unknown) => {
                    if (l && typeof l === "object" && (l as Record<string, unknown>).message) return String((l as Record<string, unknown>).message);
                    return null;
                  })
                  .filter((m: string | null): m is string => !!m)
                  .forEach((m) => console.log(`[UPSCALE] ${m}`));
              }
            }
          } catch {}
        },
      });
    } catch {
      return NextResponse.json({ error: "Upscale failed" }, { status: 502 });
    }

    // Extract output image URL
    let outUrl: string | null = null;
    if (result && typeof result === "object" && (result as Record<string, unknown>).data) {
      const dataObj = (result as Record<string, unknown>).data as Record<string, unknown>;
      if (dataObj) {
        const imageObj = (dataObj.image && typeof dataObj.image === "object") ? (dataObj.image as Record<string, unknown>) : null;
        if (imageObj && typeof imageObj.url === "string") outUrl = imageObj.url;
        if (!outUrl && typeof dataObj.url === "string") outUrl = dataObj.url as string;
      }
    }
    if (!outUrl) return NextResponse.json({ error: "Upscaler did not return an image" }, { status: 502 });

    // Persist to user workspace under /library
    const userRoot = `users/${sanitizeUserId(user.email)}`;
    const prefix = `${userRoot}/library/`;
    await ensureFolder(prefix);

    const fileRes = await fetch(outUrl);
    if (!fileRes.ok) return NextResponse.json({ error: "Failed to fetch upscaled image" }, { status: 502 });
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const ct = fileRes.headers.get("content-type") || "image/png";
    const ext = ct.includes("png") ? "png" : (ct.includes("webp") ? "webp" : "jpg");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const base = (r2_key ? (r2_key.split("/").pop() || "image") : "image").replace(/\.[^.]+$/, "");
    const factor = input.upscale_factor;
    const fileName = `${ts}-${base}-upscaled-${factor}x.${ext}`;
    const outKey = `${prefix}${fileName}`;
    // Try to infer image dimensions from headers if present (fallback to flat minimum if unknown)
    let width = 0, height = 0;
    try {
      const w = Number(fileRes.headers.get("x-image-width") || 0);
      const h = Number(fileRes.headers.get("x-image-height") || 0);
      if (w && h) { width = w; height = h; }
    } catch {}
    // Enforce final 4K dimension limit defensively (in case provider ever overshoots)
    if (width && height) {
      if (width > MAX_W + 1 || height > MAX_H + 1) {
        return NextResponse.json({ error: "UPSCALE_DIM_OVERFLOW", message: "Upscaled image exceeds the 4K limit." }, { status: 400 });
      }
    }

    // Determine final charge and charge idempotently after success
    const finalCost = 1; // flat 1 credit per call
    try {
      await chargeCreditsOnce(user.email, finalCost, "upscale", outKey);
    } catch {
      // If charging fails, roll back the stored artifact
      try { await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: outKey })); } catch {}
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: outKey, Body: buf, ContentType: ct }));

    const { url } = await createViewUrl(outKey);
    return NextResponse.json({ key: outKey, url, credits_charged: finalCost });
  } catch (err) {
    try { console.error("/api/tools/upscale error", err); } catch {}
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


