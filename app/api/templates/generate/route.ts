/* eslint-disable @typescript-eslint/no-explicit-any */
function formatFalDetail(detail: unknown): string {
  try {
    if (Array.isArray(detail)) {
      return (detail as unknown[])
        .map((d) => {
          const obj = (d && typeof d === 'object') ? (d as Record<string, unknown>) : undefined;
          const locVal = (obj?.loc as unknown);
          const loc = Array.isArray(locVal) ? (locVal as unknown[]).join('.') : '';
          const msg = (obj?.msg as string | undefined) || (obj?.message as string | undefined) || String(d);
          return loc ? `${msg} (${loc})` : String(msg);
        })
        .join('; ');
    }
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
  } catch {}
  return '';
}
function sanitizeModelNames(message: string | undefined): string | undefined {
  if (!message) return message;
  let m = message;
  m = m.replace(/\bgemini\b/gi, 'the image generator');
  m = m.replace(/\bopenai\b/gi, 'the image generator');
  m = m.replace(/\bstability\b/gi, 'the image generator');
  m = m.replace(/\bstable\s*diffusion\b/gi, 'the image generator');
  m = m.replace(/\bflux\b/gi, 'the image generator');
  m = m.replace(/\bbytedance\b/gi, 'the image generator');
  m = m.replace(/\bfal\b/gi, 'the service');
  return m;
}
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { RecordId } from "surrealdb";
import { requireAndReserveCredits, GENERATION_CREDITS_PER_IMAGE } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY || "" });

type GenerateRequest = {
  templateId?: string;
  templateSlug?: string;
  // Paths relative to user root (e.g., "vehicles/lp-750/img.jpg")
  userImageKeys?: string[];
  // Optional override to pass raw data URLs as last images (fallback if not uploaded)
  userImageDataUrls?: string[];
  // Variable overrides from UI: { key: value }
  variables?: Record<string, string | number | boolean>;
  // Optional vehicle data for token substitution
  vehicle?: { make?: string; model?: string; colorFinish?: string; accents?: string } | null;
};

// removed unused toIdString

function substituteTokens(prompt: string, tokens: Record<string, string>): string {
  let out = prompt;
  for (const [k, v] of Object.entries(tokens)) {
    const token = `[${k}]`;
    out = out.split(token).join(v);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as GenerateRequest;
    const db = await getSurreal();

  // Resolve template
  let template: any | null = null;
  // Prefer slug first for robustness, then try id
  if (body.templateSlug) {
    const res = await db.query("SELECT * FROM template WHERE slug = $slug LIMIT 1;", { slug: body.templateSlug });
    template = Array.isArray(res) && Array.isArray(res[0]) ? res[0][0] : null;
  }
  if (!template && body.templateId) {
    // Attempt to coerce id string into a RecordId instance
    let rid: unknown = body.templateId as unknown;
    try {
      const idStr = String(body.templateId);
      const parts = idStr.split(":");
      const tb = parts[0];
      const raw = parts.slice(1).join(":").replace(/^⟨|⟩$/g, "");
      rid = new RecordId(tb as string, raw);
    } catch {}
    // Try selecting by direct record reference
    try {
      const res1 = await db.query("SELECT * FROM $rid LIMIT 1;", { rid });
      template = Array.isArray(res1) && Array.isArray(res1[0]) ? res1[0][0] : null;
    } catch {}
    // Fallback: match by id field
    if (!template) {
      const res2 = await db.query("SELECT * FROM template WHERE id = $rid LIMIT 1;", { rid });
      template = Array.isArray(res2) && Array.isArray(res2[0]) ? res2[0][0] : null;
    }
  }
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const modelSlug: string = String(template?.falModelSlug || "fal-ai/gemini-25-flash-image/edit");
    const prompt: string = String(template?.prompt || "");

  // Compose tokens
  // Attempt to resolve vehicle from body or infer from selected image key path
    let v = body?.vehicle || {};
  try {
    if ((!v || (!v.make && !v.model)) && Array.isArray(body?.userImageKeys) && body!.userImageKeys.length > 0) {
      const first = String(body!.userImageKeys[0] || "");
      const m = first.match(/(?:^|\/)vehicles\/([^/]+)\//);
      const slugPart = m?.[1] || null;
      if (slugPart) {
        const prof = await db.query("SELECT vehicles FROM user WHERE email = $email LIMIT 1;", { email: user.email });
        const row = Array.isArray(prof) && Array.isArray(prof[0]) ? (prof[0][0] as any) : null;
        const vehicles: Array<{ make: string; model: string; type?: string; colorFinish?: string; accents?: string }> = Array.isArray(row?.vehicles) ? row.vehicles : [];
        function baseSlug(make: string, model: string){ return `${String(make||'').trim()} ${String(model||'').trim()}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
        // Compute unique slug like CarPhotosUploader
        const slugs: string[] = [];
        for (let i=0;i<vehicles.length;i++){
          const car = vehicles[i]!;
          const base = baseSlug(car.make, car.model);
          let priorSame = 0;
          for (let j=0;j<i;j++){
            const u = vehicles[j]!;
            if (u.make===car.make && u.model===car.model && (u.type||'car')===(car.type||'car')) priorSame += 1;
          }
          const suffix = priorSame > 0 ? `-${priorSame}` : '';
          slugs.push(`${base}${suffix}`);
        }
        const idx = slugs.findIndex((s)=> s === slugPart);
        if (idx >= 0) {
          const sel = vehicles[idx]!;
          v = { make: sel.make, model: sel.model, colorFinish: sel.colorFinish, accents: sel.accents } as any;
        }
      }
    }
  } catch {}
    const variablesFromUi = body?.variables || {};
    const cf = (v as any)?.colorFinish ? String((v as any).colorFinish) : "";
    const acc = (v as any)?.accents ? String((v as any).accents) : "";
    const cfCombo = acc ? `${cf} with ${acc}` : cf;
    const tokens: Record<string, string> = {
      BRAND: (v as any)?.make ? String((v as any).make) : "",
      MAKE: (v as any)?.make ? String((v as any).make) : "", // alias for compatibility
      MODEL: (v as any)?.model ? String((v as any).model) : "",
      COLOR_FINISH: cf,
      ACCENTS: acc,
      COLOR_FINISH_ACCENTS: cfCombo,
      BRAND_CAPS: (v as any)?.make ? String((v as any).make).toUpperCase() : "",
      DOMINANT_COLOR_TONE: typeof variablesFromUi["DOMINANT_COLOR_TONE"] === "string" ? String(variablesFromUi["DOMINANT_COLOR_TONE"]) : "",
    };
    // Also inject any arbitrary variables: [KEY]
    for (const [key, val] of Object.entries(variablesFromUi)) {
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        tokens[key] = String(val);
      }
    }
    // Derive dependent tokens if not explicitly provided
    try {
      const brandFromAny = tokens.BRAND || (typeof variablesFromUi["BRAND"] === "string" ? String(variablesFromUi["BRAND"]) : "");
      if (!tokens.BRAND_CAPS && brandFromAny) tokens.BRAND_CAPS = brandFromAny.toUpperCase();
      // Ensure MAKE mirrors BRAND when not provided separately
      if (!tokens.MAKE && brandFromAny) tokens.MAKE = brandFromAny;
      // Compose COLOR_FINISH_ACCENTS if missing using provided COLOR_FINISH/ACCENTS
      if (!tokens.COLOR_FINISH_ACCENTS) {
        const cfAny = tokens.COLOR_FINISH || (typeof variablesFromUi["COLOR_FINISH"] === "string" ? String(variablesFromUi["COLOR_FINISH"]) : "");
        const accAny = tokens.ACCENTS || (typeof variablesFromUi["ACCENTS"] === "string" ? String(variablesFromUi["ACCENTS"]) : "");
        tokens.COLOR_FINISH_ACCENTS = accAny ? `${cfAny} with ${accAny}` : cfAny;
      }
    } catch {}
    const finalPrompt = substituteTokens(prompt, tokens);

  // Build image URLs: upload to FAL media so they are publicly retrievable by FAL (works in dev + prod)
    const imageUrls: string[] = [];
    async function streamToUint8Array(stream: unknown): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      const s = stream as { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> } | undefined;
      if (s && typeof s[Symbol.asyncIterator] === 'function') {
        for await (const chunk of s as unknown as AsyncIterable<unknown>) {
          chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk as ArrayBufferLike));
        }
      }
      return Buffer.concat(chunks);
    }
    async function uploadToFal(bytes: Uint8Array, mimeType: string): Promise<string | null> {
      try {
        const uploaded = await (fal as any)?.storage?.upload?.(bytes, { mimeType });
        const url = uploaded?.url || (typeof uploaded === 'string' ? uploaded : null);
        if (url) return url as string;
      } catch {}
      try {
        const putRes = await (fal as any)?.storage?.put?.(bytes, { mimeType });
        const url = putRes?.url || (typeof putRes === 'string' ? putRes : null);
        if (url) return url as string;
      } catch {}
      return null;
    }
    const adminKeys: string[] = Array.isArray(template?.adminImageKeys) ? template.adminImageKeys.filter((x: unknown) => typeof x === "string") : [];
    for (const k of adminKeys) {
      try {
        const key = k.startsWith("admin/") ? k : `admin/${k.replace(/^\/+/, "")}`;
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await streamToUint8Array(obj.Body as unknown);
        const mime = (obj.ContentType as string) || 'image/jpeg';
        const url = await uploadToFal(bytes, mime);
        if (url) imageUrls.push(url);
      } catch {}
    }
    const userKeys = Array.isArray(body?.userImageKeys) ? body!.userImageKeys.filter((x) => typeof x === "string") : [];
    const userRoot = `users/${sanitizeUserId(user.email)}`;
    for (const k of userKeys) {
      try {
        const normalized = k.replace(/^\/+/, "");
        const key = `${userRoot}/${normalized}`;
        const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await streamToUint8Array(obj.Body as unknown);
        const mime = (obj.ContentType as string) || 'image/jpeg';
        const url = await uploadToFal(bytes, mime);
        if (url) imageUrls.push(url);
      } catch {}
    }
    // If provided, also accept data URLs (last) when files haven't been uploaded — upload them to FAL
    const dataUrls = Array.isArray(body?.userImageDataUrls) ? body!.userImageDataUrls.filter((x) => typeof x === "string" && x.startsWith("data:")) : [];
    for (const du of dataUrls) {
      try {
        const m = du.match(/^data:([^;]+);base64,(.*)$/);
        if (!m) continue;
        const mime = m[1] || 'image/jpeg';
        const b64 = m[2] || '';
        const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
        const url = await uploadToFal(bytes, mime);
        if (url) imageUrls.push(url);
      } catch {}
    }
    // FAL expects 1-4 URLs for Gemini and up to 6 for Seedream; keep last N so user images are retained.
    let urlsForFal = imageUrls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
    if (urlsForFal.length === 0) return NextResponse.json({ error: "No valid image URLs provided" }, { status: 400 });
    const isSeedream = /bytedance\/seedream\/v4\/edit$/i.test(modelSlug);
    const maxUrls = isSeedream ? 6 : 4;
    if (urlsForFal.length > maxUrls) urlsForFal = urlsForFal.slice(-maxUrls);

  // Call FAL
    if (!finalPrompt.trim()) {
      return NextResponse.json({ error: "Prompt is required for generation" }, { status: 400 });
    }

    let result: any;
    try {
      try {
        await requireAndReserveCredits(user.email, GENERATION_CREDITS_PER_IMAGE, "generation", String(template?.slug || template?.id || "template"));
      } catch {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
      }
      function clampImageSize(w?: number, h?: number): { width: number; height: number } | null {
        try {
          const min = 1024, max = 4096;
          const W = Math.max(1, Math.round(Number(w || 0)));
          const H = Math.max(1, Math.round(Number(h || 0)));
          if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return null;
          const sMin = Math.max(min / W, min / H);
          const sMax = Math.min(max / W, max / H);
          let s = sMin;
          if (sMin > sMax) s = sMax; // best-effort fit within bounds
          if (!Number.isFinite(s) || s <= 0) s = 1;
          let outW = Math.round(W * s);
          let outH = Math.round(H * s);
          outW = Math.max(min, Math.min(max, outW));
          outH = Math.max(min, Math.min(max, outH));
          return { width: outW, height: outH };
        } catch { return null; }
      }
      const desiredSize = ((): { width: number; height: number } | null => {
        try {
          const raw = (template as any)?.imageSize;
          if (raw && typeof raw === 'object') {
            const cs = clampImageSize((raw as any).width, (raw as any).height);
            if (cs) return cs;
          }
        } catch {}
        return null;
      })();
      const falInput = { prompt: finalPrompt, image_urls: urlsForFal, num_images: 1, ...(isSeedream && desiredSize ? { image_size: desiredSize } : {}) } as const;
      try { console.log("[FAL INPUT]", JSON.stringify({ model: modelSlug, input: falInput }, null, 2)); } catch {}
      result = await fal.subscribe(modelSlug, {
        input: falInput as any,
        logs: true,
        onQueueUpdate: (update: any) => {
          try {
            if (update?.status === 'IN_PROGRESS') {
              (update.logs || []).map((l: any) => l?.message).filter(Boolean).forEach((m: string) => console.log(`[FAL LOG] ${m}`));
            }
          } catch {}
        },
      });
    } catch (e: unknown) {
      try {
        const errObj = e as { message?: unknown; status?: unknown; body?: unknown };
        const safe = typeof errObj?.body === 'object' ? { message: String(errObj?.message || ''), status: errObj?.status, body: errObj?.body } : (errObj?.message || errObj);
        console.error("FAL subscribe error", safe);
      } catch {}
      const err = e as { status?: unknown; message?: unknown; body?: unknown };
      const status = typeof err?.status === "number" ? err.status : 502;
      const bodyAny = (typeof err?.body === 'object' && err?.body) ? (err.body as Record<string, unknown>) : undefined;
      const messageRaw = (bodyAny?.message as string | undefined) || (typeof err?.message === 'string' ? err.message : undefined) || "Generation failed. Please try again.";
      const prettyRaw = formatFalDetail((bodyAny as { detail?: unknown } | undefined)?.detail) || undefined;
      const userMsg = sanitizeModelNames(prettyRaw || messageRaw) || "Generation failed. Please try again.";
      return NextResponse.json({ error: userMsg, details: bodyAny || null }, { status });
    }
    const data = (result?.data || {}) as any;
    const candidateUrl: string | null = data?.images?.[0]?.url || data?.image?.url || data?.url || null;
    if (!candidateUrl) return NextResponse.json({ error: "Fal did not return an image url" }, { status: 502 });

  // Fetch and persist to R2 under unified library folder
    const createdIso = new Date().toISOString();
    const userKeyPrefix = `${userRoot}/library/`;
    await ensureFolder(userKeyPrefix);

    const fileRes = await fetch(candidateUrl);
    if (!fileRes.ok) return NextResponse.json({ error: "Failed to fetch generated image" }, { status: 502 });
    const arrayBuffer = await fileRes.arrayBuffer();
    const ext = (() => {
      const ct = fileRes.headers.get("content-type") || "";
      if (ct.includes("png")) return "png";
      if (ct.includes("webp")) return "webp";
      return "jpg";
    })();
    const safeSlug = (String(template?.slug || template?.name || "template").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "template";
    const fileName = `${createdIso.replace(/[:.]/g, "-")}-${safeSlug}.${ext}`;
    const outKey = `${userKeyPrefix}${fileName}`;
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: outKey, Body: new Uint8Array(arrayBuffer), ContentType: fileRes.headers.get("content-type") || "image/jpeg" }));

  // Response includes storage key and signed view url
    const { url: viewUrl } = await createViewUrl(outKey);
    return NextResponse.json({ key: outKey, url: viewUrl });
  } catch (err) {
    try { console.error("/api/templates/generate error", err); } catch {}
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


