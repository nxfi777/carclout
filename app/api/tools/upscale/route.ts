import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { requireAndReserveCredits, actualUpscaleCredits } from "@/lib/credits";
import { PutObjectCommand } from "@aws-sdk/client-s3";

fal.config({ credentials: process.env.FAL_KEY || "" });

type UpscaleRequest = {
  r2_key?: string;
  image_url?: string;
  prompt?: string;
  negative_prompt?: string;
  upscale_factor?: number; // 1..4
  creativity?: number; // 0..1
  resemblance?: number; // 0..1
  guidance_scale?: number; // 0..20
  num_inference_steps?: number; // 4..50
  enable_safety_checker?: boolean;
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

    const input = {
      image_url: sourceUrl,
      prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : "masterpiece, best quality, highres",
      negative_prompt: typeof body.negative_prompt === "string" && body.negative_prompt.trim() ? body.negative_prompt : "(worst quality, low quality, normal quality:2)",
      upscale_factor: Math.max(1, Math.min(4, Number(body.upscale_factor ?? 2))),
      creativity: Math.max(0, Math.min(1, Number(body.creativity ?? 0))),
      resemblance: Math.max(0, Math.min(1, Number(body.resemblance ?? 0.6))),
      guidance_scale: Math.max(0, Math.min(20, Number(body.guidance_scale ?? 4))),
      num_inference_steps: Math.max(4, Math.min(50, parseInt(String(body.num_inference_steps ?? 18)))),
      enable_safety_checker: body.enable_safety_checker !== false,
    } as const;

    // Enforce 6MP max final area when dimensions are known
    const MAX_FINAL_MP = 6; // 6 megapixels limit
    const ow = Math.max(0, Number(body.original_width || 0));
    const oh = Math.max(0, Number(body.original_height || 0));
    let creditsCost = 0;
    let reserved = false;
    if (ow && oh) {
      const predictedMp = ((ow * oh) / 1_000_000) * Math.pow(input.upscale_factor, 2);
      if (predictedMp > MAX_FINAL_MP + 1e-6) {
        return NextResponse.json({ error: "UPSCALE_LIMIT_6MP", message: "Upscale would exceed the 6MP limit." }, { status: 400 });
      }
      creditsCost = Math.max(1, Math.ceil(((ow * oh) / 1_000_000) * Math.pow(input.upscale_factor, 2) * 6));
      try {
        await requireAndReserveCredits(user.email, creditsCost, "upscale", null);
        reserved = true;
      } catch {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
      }
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
    if (!reserved) {
      // If final dimensions are available, enforce 6MP limit here as well
      if (width && height) {
        const finalMp = (width * height) / 1_000_000;
        if (finalMp > MAX_FINAL_MP + 1e-6) {
          return NextResponse.json({ error: "UPSCALE_LIMIT_6MP", message: "Upscale exceeds the 6MP limit." }, { status: 400 });
        }
      }
      creditsCost = (width && height) ? actualUpscaleCredits(width, height) : 6; // minimum charge 6 credits if unknown
      try {
        await requireAndReserveCredits(user.email, creditsCost, "upscale", outKey);
        reserved = true;
      } catch {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
      }
    }
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: outKey, Body: buf, ContentType: ct }));

    const { url } = await createViewUrl(outKey);
    return NextResponse.json({ key: outKey, url, credits_charged: creditsCost });
  } catch (err) {
    try { console.error("/api/tools/upscale error", err); } catch {}
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


