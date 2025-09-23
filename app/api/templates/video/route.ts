/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { RecordId } from "surrealdb";
import { estimateVideoCredits, DEFAULT_VIDEO_FPS, requireAndReserveCredits } from "@/lib/credits";
export const runtime = "nodejs";

fal.config({ credentials: process.env.FAL_KEY || "" });

type AnimateVideoRequest = {
  templateId?: string;
  templateSlug?: string;
  // Workspace key under users/<id>/..., e.g. users/abc/library/design-123.png
  startKey?: string;
  // Optional overrides (admin testing); normally taken from template.video
  prompt?: string;
  duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
  resolution?: '480p'|'720p'|'1080p';
  aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
  camera_fixed?: boolean;
  seed?: number | null;
  fps?: number;
};

function coerceRecordId(raw: string): RecordId<string> | string {
  try {
    const parts = String(raw).split(":");
    const tb = parts[0];
    const id = parts.slice(1).join(":");
    return new RecordId(tb as string, id);
  } catch {}
  return raw;
}

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

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(()=>({}))) as AnimateVideoRequest;
    if (!body?.templateId && !body?.templateSlug) return NextResponse.json({ error: 'Missing template id or slug' }, { status: 400 });

    const db = await getSurreal();
    let template: any | null = null;
    if (body.templateSlug) {
      const res = await db.query("SELECT * FROM template WHERE slug = $slug LIMIT 1;", { slug: body.templateSlug });
      template = Array.isArray(res) && Array.isArray(res[0]) ? res[0][0] : null;
    }
    if (!template && body.templateId) {
      const rid = coerceRecordId(String(body.templateId));
      try {
        const res1 = await db.query("SELECT * FROM $rid LIMIT 1;", { rid });
        template = Array.isArray(res1) && Array.isArray(res1[0]) ? res1[0][0] : null;
      } catch {}
      if (!template) {
        const res2 = await db.query("SELECT * FROM template WHERE id = $rid LIMIT 1;", { rid });
        template = Array.isArray(res2) && Array.isArray(res2[0]) ? res2[0][0] : null;
      }
    }
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const vconf = (template?.video && typeof template.video === 'object') ? template.video as any : null;
    const enabled = !!(vconf?.enabled);
    const provider: 'seedance' | 'kling2_5' = ((): 'seedance' | 'kling2_5' => {
      const raw = String((vconf?.provider || 'seedance')).toLowerCase();
      return raw === 'kling2_5' ? 'kling2_5' : 'seedance';
    })();
    const videoPrompt = String((body?.prompt ?? vconf?.prompt ?? '') || '').trim();
    if (!enabled || !videoPrompt) return NextResponse.json({ error: 'This template does not support video' }, { status: 400 });

    const durationStr = (body?.duration ?? vconf?.duration ?? '5') as AnimateVideoRequest['duration'];
    const resolution = (body?.resolution ?? vconf?.resolution ?? '1080p') as NonNullable<AnimateVideoRequest['resolution']>;
    const aspect_ratio = (body?.aspect_ratio ?? vconf?.aspect_ratio ?? 'auto') as NonNullable<AnimateVideoRequest['aspect_ratio']>;
    const camera_fixed = !!(body?.camera_fixed ?? vconf?.camera_fixed ?? false);
    const seed = ((): number | null => {
      const n = Number(body?.seed ?? vconf?.seed);
      return Number.isFinite(n) ? Math.round(n) : null;
    })();
    const fps = ((): number => {
      const n = Number(body?.fps ?? vconf?.fps ?? DEFAULT_VIDEO_FPS);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_VIDEO_FPS;
    })();

    const duration = Math.max(1, Math.min(120, Math.round(Number(durationStr || 5))));

    // Pricing: estimate credits and reserve
    const credits = estimateVideoCredits(resolution, duration, fps, aspect_ratio);
    try {
      await requireAndReserveCredits(user.email, credits, 'video', String(template?.slug || template?.id || 'template'));
    } catch {
      return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Resolve the start image, upload to FAL storage
    const userRoot = `users/${sanitizeUserId(user.email)}`;
    const startKeyRel = String(body?.startKey || '').replace(/^\/+/, '');
    if (!startKeyRel) return NextResponse.json({ error: 'Missing start frame' }, { status: 400 });
    const startKey = startKeyRel.startsWith(userRoot) ? startKeyRel : `${userRoot}/${startKeyRel}`;

    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: startKey }));
    const bytes = await streamToUint8Array(obj.Body as unknown);
    const startMime = (obj.ContentType as string) || 'image/png';
    const image_url = await uploadToFal(bytes, startMime);
    if (!image_url) return NextResponse.json({ error: 'Failed to upload start frame to video service' }, { status: 502 });

    let result: any;
    try {
      if (provider === 'kling2_5') {
        const klingDuration = duration >= 10 ? '10' : '5';
        const input = {
          prompt: videoPrompt,
          image_url,
          duration: klingDuration,
          negative_prompt: 'blur, distort, and low quality',
          cfg_scale: 0.5,
        } as const;
        result = await fal.subscribe("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", {
          input: input as any,
          logs: true,
          onQueueUpdate: (update: any) => {
            try {
              if (update?.status === 'IN_PROGRESS') {
                (update.logs || []).map((l: any)=> l?.message).filter(Boolean).forEach((m: string)=> console.log(`[FAL VIDEO-KLING] ${m}`));
              }
            } catch {}
          },
        });
      } else {
        const input = {
          prompt: videoPrompt,
          image_url,
          aspect_ratio,
          resolution,
          duration: String(duration) as AnimateVideoRequest['duration'],
          camera_fixed,
          enable_safety_checker: true,
          ...(typeof seed === 'number' ? { seed } : {}),
        } as const;
        result = await fal.subscribe("fal-ai/bytedance/seedance/v1/pro/image-to-video", {
          input: input as any,
          logs: true,
          onQueueUpdate: (update: any) => {
            try {
              if (update?.status === 'IN_PROGRESS') {
                (update.logs || []).map((l: any)=> l?.message).filter(Boolean).forEach((m: string)=> console.log(`[FAL VIDEO-SEEDANCE] ${m}`));
              }
            } catch {}
          },
        });
      }
    } catch (e: unknown) {
      try {
        console.error('Video generation error', e);
      } catch {}
      return NextResponse.json({ error: 'Video generation failed' }, { status: 502 });
    }
    const data = (result?.data || {}) as any;
    const videoUrl: string | null = data?.video?.url || data?.url || null;
    if (!videoUrl) return NextResponse.json({ error: 'Service did not return video url' }, { status: 502 });

    // Persist to R2 as a single MP4 file with embedded cover art (the input image) when possible
    const createdIso = new Date().toISOString();
    const safeSlug = (String(template?.slug || template?.name || 'template').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')) || 'template';
    const fileBase = `${createdIso.replace(/[:.]/g, '-')}-${safeSlug}`;
    const singleOutKey = `${userRoot}/library/${fileBase}.mp4`;
    const fileRes = await fetch(videoUrl);
    if (!fileRes.ok) return NextResponse.json({ error: 'Failed to fetch generated video' }, { status: 502 });
    const videoBytes = new Uint8Array(await fileRes.arrayBuffer());

    // Try to embed cover art using ffmpeg.wasm in browser-like runtimes only; fall back silently on Node
    let finalVideoBytes: Uint8Array = videoBytes;
    try {
      const canUseFfmpegWasm = typeof (globalThis as any).window !== 'undefined';
      if (!canUseFfmpegWasm) throw new Error('ffmpeg.wasm unavailable in this runtime');

      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      // Write inputs
      const videoIn = 'input.mp4';
      await ffmpeg.writeFile(videoIn, videoBytes);
      const coverExt = (startMime.includes('png') ? 'png' : (startMime.includes('webp') ? 'webp' : 'jpg'));
      const coverIn = `cover.${coverExt}`;
      await ffmpeg.writeFile(coverIn, bytes);

      // Build with attached cover picture
      const outName = 'output.mp4';
      await ffmpeg.exec([
        '-i', videoIn,
        '-i', coverIn,
        '-map', '0',
        '-map', '1',
        '-c', 'copy',
        '-c:v:1', 'mjpeg',
        '-disposition:v:1', 'attached_pic',
        '-movflags', '+faststart',
        outName,
      ]);
      const outArr = await ffmpeg.readFile(outName);
      finalVideoBytes = outArr as Uint8Array;
    } catch {
      // Skip embedding on server; use original bytes without noisy warnings
      try { console.log('[video] Skipping ffmpeg cover embedding'); } catch {}
    }

    await ensureFolder(`${userRoot}/library/`);
    await r2.send(new PutObjectCommand({ Bucket: bucket, Key: singleOutKey, Body: finalVideoBytes, ContentType: 'video/mp4' }));

    const { url } = await createViewUrl(singleOutKey);
    return NextResponse.json({ key: singleOutKey, url, credits });
  } catch (err) {
    try { console.error('/api/templates/video error', err); } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


