import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { fal } from "@fal-ai/client";
import { r2, bucket, ensureFolder } from "@/lib/r2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAndReserveCredits, REMBG_CREDITS_PER_CALL } from "@/lib/credits";
import { createHash } from "crypto";
import { validateStorageSpace } from "@/lib/storage";
import { getSurreal } from "@/lib/surrealdb";

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
  const r2KeyRawForCache = String(body?.r2_key || "").replace(/^\/+/, "");
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
          // Use same-origin proxy URLs to avoid CORS issues in canvas
          const fgUrl = `/api/storage/file?key=${encodeURIComponent(fgKey)}`;
          // Mask is optional
          let maskUrl: string | null = null;
          try {
            const maskObj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: maskKey }));
            if (maskObj && maskObj.Body) {
              maskUrl = `/api/storage/file?key=${encodeURIComponent(maskKey)}`;
            }
          } catch {}
          // Return cached response in the same shape as FAL
          return NextResponse.json({ 
            image: { url: fgUrl }, 
            mask_image: maskUrl ? { url: maskUrl } : null, 
            requestId: "cache" 
          });
        }
      } catch {}
    } catch {}
  }

  async function toFalUrl(): Promise<string | null> {
    const direct = String(body?.image_url || "").trim();
    if (direct) return direct;
    // R2 key path
    const r2KeyRaw = String(body?.r2_key || "").replace(/^\/+/, "");
    const dataUrlRaw = String(body?.data_url || "").trim();
    async function upload(bytes: Uint8Array, mimeType: string): Promise<string | null> {
      try {
      const storage = (fal as unknown as { storage?: { upload?: (b: Uint8Array, o: { mimeType: string }) => Promise<{ url?: string } | string>; put?: (b: Uint8Array, o: { mimeType: string }) => Promise<{ url?: string } | string> } }).storage;
      const u = await storage?.upload?.(bytes, { mimeType });
      const url = typeof u === 'string' ? u : (u && typeof u === 'object' ? (u as { url?: string }).url || null : null);
        if (url) return url as string;
      } catch {}
      try {
      const storage = (fal as unknown as { storage?: { upload?: (b: Uint8Array, o: { mimeType: string }) => Promise<{ url?: string } | string>; put?: (b: Uint8Array, o: { mimeType: string }) => Promise<{ url?: string } | string> } }).storage;
      const p = await storage?.put?.(bytes, { mimeType });
      const url = typeof p === 'string' ? p : (p && typeof p === 'object' ? (p as { url?: string }).url || null : null);
        if (url) return url as string;
      } catch {}
      return null;
    }
    if (r2KeyRaw) {
      try {
        const key = r2KeyRaw.startsWith('admin/') ? r2KeyRaw : (r2KeyRaw.startsWith('users/') ? r2KeyRaw : `users/${sanitizeUserId(userEmail)}/${r2KeyRaw}`);
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const chunks: Uint8Array[] = [];
        const bodyStream = obj.Body as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | undefined;
        if (bodyStream && typeof bodyStream[Symbol.asyncIterator] === 'function') {
          for await (const chunk of (obj.Body as unknown as AsyncIterable<unknown>)) {
            chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk as ArrayBufferLike));
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

  const input: {
    image_url: string;
    model?: RembgRequest['model'];
    operating_resolution?: RembgRequest['operating_resolution'];
    output_format?: RembgRequest['output_format'];
    refine_foreground?: boolean;
    output_mask?: boolean;
  } = {
    image_url: falUrl,
    model: body?.model || "General Use (Heavy)",
    operating_resolution: body?.operating_resolution || "2048x2048",
    output_format: body?.output_format || "webp",
    refine_foreground: body?.refine_foreground !== false,
    output_mask: body?.output_mask === true,
  };

  try {
    try {
      await requireAndReserveCredits(userEmail, REMBG_CREDITS_PER_CALL, "rembg", normalizedSourceKey || null);
    } catch {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    const result = await fal.subscribe("fal-ai/birefnet/v2", {
      input,
      logs: true,
      onQueueUpdate: (update: { status?: string; logs?: Array<{ message?: string } | undefined> }) => {
        try {
          if (update?.status === "IN_PROGRESS") {
            (update.logs || [])
              .map((l) => l?.message)
              .filter(Boolean)
              .forEach((m) => console.log(`[REMBG] ${String(m)}`));
          }
        } catch {}
      },
    });
    const data = (result as { data?: { image?: { url?: string }; mask_image?: { url?: string } } | null; requestId?: string | null } | null)?.data || {};
    const out = {
      image: data?.image || null,
      mask_image: data?.mask_image || null,
      requestId: (result as { requestId?: string | null } | null)?.requestId || null,
    } as { image: { url?: string } | null; mask_image: { url?: string } | null; requestId: string | null };

    // Persist masked image (and mask when present) for future reuse under designer_masks
    try {
      if (normalizedSourceKey && out?.image?.url) {
        const digest = createHash("sha1").update(normalizedSourceKey).digest("hex");
        const fgKey = `${maskPrefix}${digest}.png`;
        const maskKey = `${maskPrefix}${digest}.mask.png`;
        
        // Fetch the images first to know their size
        let fgArrayBuffer: ArrayBuffer | null = null;
        let fgContentType: string = "image/png";
        let maskArrayBuffer: ArrayBuffer | null = null;
        let maskContentType: string = "image/png";
        
        try {
          const resp = await fetch(String(out.image.url));
          if (resp.ok) {
            fgArrayBuffer = await resp.arrayBuffer();
            fgContentType = resp.headers.get("content-type") || "image/png";
          }
        } catch {}
        
        if (out?.mask_image?.url) {
          try {
            const resp = await fetch(String(out.mask_image.url));
            if (resp.ok) {
              maskArrayBuffer = await resp.arrayBuffer();
              maskContentType = resp.headers.get("content-type") || "image/png";
            }
          } catch {}
        }
        
        // Calculate total incoming size
        const incomingSize = (fgArrayBuffer?.byteLength || 0) + (maskArrayBuffer?.byteLength || 0);
        
        // Resolve user plan for storage validation
        let effectivePlan: string | null = user.plan ?? null;
        try {
          const db = await getSurreal();
          const res = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email: userEmail });
          const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { plan?: string | null } | undefined) : undefined;
          if (row && "plan" in row) effectivePlan = row.plan || effectivePlan || null;
        } catch {}
        
        // Validate storage space before saving
        const validation = await validateStorageSpace(userEmail, incomingSize, effectivePlan);
        if (!validation.ok) {
          return NextResponse.json({ error: validation.error || "Storage limit exceeded" }, { status: 413 });
        }
        
        // Storage check passed, now save the files
        try {
          await ensureFolder(maskPrefix);
        } catch {}
        
        // Save foreground
        if (fgArrayBuffer) {
          try {
            await r2.send(new PutObjectCommand({ Bucket: bucket, Key: fgKey, Body: new Uint8Array(fgArrayBuffer), ContentType: fgContentType }));
          } catch {}
        }
        
        // Save mask if provided
        if (maskArrayBuffer) {
          try {
            await r2.send(new PutObjectCommand({ Bucket: bucket, Key: maskKey, Body: new Uint8Array(maskArrayBuffer), ContentType: maskContentType }));
          } catch {}
        }
        
        // Replace outgoing URLs with our same-origin proxy URLs to avoid CORS in canvas
        try {
          const fgSigned = `/api/storage/file?key=${encodeURIComponent(fgKey)}`;
          out.image = { url: fgSigned };
        } catch {}
        try {
          const maskSigned = `/api/storage/file?key=${encodeURIComponent(`${maskPrefix}${digest}.mask.png`)}`;
          out.mask_image = { url: maskSigned };
        } catch {}
      }
    } catch {}

    return NextResponse.json(out);
  } catch (e: unknown) {
    const err = e as { body?: { message?: unknown } | null; message?: unknown; status?: unknown };
    const msg = (err?.body?.message as string | undefined) || (err?.message as string | undefined) || "Rembg failed";
    const st = typeof err?.status === 'number' ? (err.status as number) : 502;
    return NextResponse.json({ error: msg, detail: err?.body || null }, { status: st });
  }
}


