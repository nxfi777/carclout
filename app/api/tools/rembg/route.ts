import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { fal } from "@fal-ai/client";
import { r2, bucket, ensureFolder, createViewUrl } from "@/lib/r2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAndReserveCredits, REMBG_CREDITS_PER_CALL } from "@/lib/credits";
import { createHash } from "crypto";

fal.config({ credentials: process.env.FAL_KEY || "" });

type RembgRequest = {
  image_url?: string;
  r2_key?: string; // users/<id>/... or admin/...
  data_url?: string; // data:...
  model?: "General Use (Light)" | "General Use (Light 2K)" | "General Use (Heavy)" | "Matting" | "Portrait";
  operating_resolution?: "1024x1024" | "2048x2048";
  output_format?: "png" | "webp";
  refine_foreground?: boolean;
  output_mask?: boolean;
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || typeof user.email !== 'string' || !user.email.trim()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: RembgRequest;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Attempt cache hit: when r2_key is provided, reuse a previously saved masked image
  const r2KeyRawForCache = String((body as any)?.r2_key || "").replace(/^\/+/, "");
  const isAdminR2Key = r2KeyRawForCache.startsWith("admin/");
  const normalizedSourceKey = r2KeyRawForCache
    ? (isAdminR2Key
        ? r2KeyRawForCache
        : (r2KeyRawForCache.startsWith("users/") ? r2KeyRawForCache : `users/${sanitizeUserId(user.email)}/${r2KeyRawForCache}`))
    : null;
  const userEmail = String(user.email);
  const userRoot = `users/${sanitizeUserId(userEmail)}`;
  const maskPrefix = `${userRoot}/designer_masks/`;
  if (normalizedSourceKey) {
    try {
      await ensureFolder(maskPrefix);
      const digest = createHash("sha1").update(normalizedSourceKey).digest("hex");
      const fgKey = `${maskPrefix}${digest}.png`;
      const maskKey = `${maskPrefix}${digest}.mask.png`;
      // Try foreground first
      try {
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: fgKey }));
        if (obj && obj.Body) {
          // Compute signed view URLs
          const { url: fgUrl } = await createViewUrl(fgKey, 60 * 10);
          // Mask is optional
          let maskUrl: string | null = null;
          try {
            const maskObj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: maskKey }));
            if (maskObj && maskObj.Body) {
              const { url } = await createViewUrl(maskKey, 60 * 10);
              maskUrl = url;
            }
          } catch {}
          // Return cached response in the same shape as FAL
          return NextResponse.json({ image: { url: fgUrl }, mask_image: maskUrl ? { url: maskUrl } : null, requestId: "cache" });
        }
      } catch {}
    } catch {}
  }

  async function toFalUrl(): Promise<string | null> {
    const direct = String((body as any)?.image_url || "").trim();
    if (direct) return direct;
    // R2 key path
    const r2KeyRaw = String((body as any)?.r2_key || "").replace(/^\/+/, "");
    const dataUrlRaw = String((body as any)?.data_url || "").trim();
    async function upload(bytes: Uint8Array, mimeType: string): Promise<string | null> {
      try {
        const u = await (fal as any)?.storage?.upload?.(bytes, { mimeType });
        const url = u?.url || (typeof u === 'string' ? u : null);
        if (url) return url as string;
      } catch {}
      try {
        const p = await (fal as any)?.storage?.put?.(bytes, { mimeType });
        const url = p?.url || (typeof p === 'string' ? p : null);
        if (url) return url as string;
      } catch {}
      return null;
    }
    if (r2KeyRaw) {
      try {
        const key = r2KeyRaw.startsWith('admin/') ? r2KeyRaw : (r2KeyRaw.startsWith('users/') ? r2KeyRaw : `users/${sanitizeUserId(userEmail)}/${r2KeyRaw}`);
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const chunks: Uint8Array[] = [];
        if (obj.Body && typeof (obj.Body as any)[Symbol.asyncIterator] === 'function') {
          for await (const chunk of (obj.Body as any)) {
            chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
          }
        }
        const bytes = Buffer.concat(chunks);
        const mime = (obj.ContentType as string) || 'image/png';
        return await upload(bytes, mime);
      } catch {}
    }
    if (dataUrlRaw.startsWith('data:')) {
      try {
        const m = dataUrlRaw.match(/^data:([^;]+);base64,(.*)$/);
        if (m) {
          const mime = m[1] || 'image/png';
          const b64 = m[2] || '';
          const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
          return await upload(bytes, mime);
        }
      } catch {}
    }
    return null;
  }

  const falUrl = await toFalUrl();
  if (!falUrl) return NextResponse.json({ error: "Missing image_url" }, { status: 400 });

  const input: any = {
    image_url: falUrl,
    model: body?.model || "General Use (Heavy)",
    operating_resolution: body?.operating_resolution || "2048x2048",
    output_format: body?.output_format || "png",
    refine_foreground: body?.refine_foreground !== false,
    output_mask: body?.output_mask === true,
  };

  try {
    try {
      await requireAndReserveCredits(userEmail, REMBG_CREDITS_PER_CALL, "rembg", normalizedSourceKey || null);
    } catch (e) {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    const result = await fal.subscribe("fal-ai/birefnet/v2", {
      input,
      logs: true,
      onQueueUpdate: (update: any) => {
        try {
          if (update?.status === "IN_PROGRESS") {
            (update.logs || []).map((l: any) => l?.message).filter(Boolean).forEach((m: string) => console.log(`[REMBG] ${m}`));
          }
        } catch {}
      },
    });
    const data = (result?.data || {}) as any;
    const out = {
      image: data?.image || null,
      mask_image: data?.mask_image || null,
      requestId: result?.requestId || null,
    } as { image: { url?: string } | null; mask_image: { url?: string } | null; requestId: string | null };

    // Persist masked image (and mask when present) for future reuse under designer_masks
    try {
      if (normalizedSourceKey && out?.image?.url) {
        const digest = createHash("sha1").update(normalizedSourceKey).digest("hex");
        const fgKey = `${maskPrefix}${digest}.png`;
        const maskKey = `${maskPrefix}${digest}.mask.png`;
        try {
          await ensureFolder(maskPrefix);
        } catch {}
        // Save foreground
        try {
          const resp = await fetch(String(out.image.url));
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            const ct = resp.headers.get("content-type") || "image/png";
            await r2.send(new PutObjectCommand({ Bucket: bucket, Key: fgKey, Body: new Uint8Array(ab), ContentType: ct }));
          }
        } catch {}
        // Save mask if provided
        try {
          const mUrl = out?.mask_image?.url ? String(out.mask_image.url) : null;
          if (mUrl) {
            const resp = await fetch(mUrl);
            if (resp.ok) {
              const ab = await resp.arrayBuffer();
              const ct = resp.headers.get("content-type") || "image/png";
              await r2.send(new PutObjectCommand({ Bucket: bucket, Key: maskKey, Body: new Uint8Array(ab), ContentType: ct }));
            }
          }
        } catch {}
        // Replace outgoing URLs with our signed view URLs for consistency
        try {
          const { url: fgSigned } = await createViewUrl(fgKey, 60 * 10);
          (out as any).image = { url: fgSigned };
        } catch {}
        try {
          const { url: maskSigned } = await createViewUrl(`${maskPrefix}${digest}.mask.png`, 60 * 10);
          (out as any).mask_image = { url: maskSigned };
        } catch {}
      }
    } catch {}

    return NextResponse.json(out);
  } catch (e: any) {
    const msg = e?.body?.message || e?.message || "Rembg failed";
    return NextResponse.json({ error: msg, detail: e?.body || null }, { status: typeof e?.status === 'number' ? e.status : 502 });
  }
}


