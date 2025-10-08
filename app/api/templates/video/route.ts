/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl, ensureFolder, r2, bucket } from "@/lib/r2";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { RecordId } from "surrealdb";
import { estimateVideoCredits, DEFAULT_VIDEO_FPS, chargeCreditsOnce, type VideoResolution, type VideoAspectRatio, type VideoProvider } from "@/lib/credits";
import { generateVideoBlurHash } from "@/lib/video-blurhash-server";
import type { LibraryVideo } from "@/lib/library-image";
export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutes for video generation

fal.config({ credentials: process.env.FAL_KEY || "" });

type AnimateVideoRequest = {
  templateId?: string;
  templateSlug?: string;
  // Workspace key under users/<id>/..., e.g. users/abc/library/design-123.png
  startKey?: string;
  // Optional overrides (admin testing); normally taken from template.video
  prompt?: string;
  duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
  resolution?: 'auto'|'480p'|'720p'|'1080p';
  aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
  camera_fixed?: boolean;
  seed?: number | null;
  fps?: number;
  variables?: Record<string, string>;
};

const PROVIDER_DURATION_OPTIONS: Record<VideoProvider, ReadonlyArray<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>> = {
  seedance: ['3','4','5','6','7','8','9','10','11','12'],
  kling2_5: ['5','10'],
  sora2: ['4','8','12'],
  sora2_pro: ['4','8','12'],
} as const;

const PROVIDER_RESOLUTION_OPTIONS: Record<VideoProvider, ReadonlyArray<VideoResolution>> = {
  seedance: ['480p','720p','1080p'],
  kling2_5: ['720p','1080p'],
  sora2: ['720p','auto'],
  sora2_pro: ['720p','auto'],
} as const;

const PROVIDER_ASPECT_OPTIONS: Record<VideoProvider, ReadonlyArray<VideoAspectRatio>> = {
  seedance: ['21:9','16:9','4:3','1:1','3:4','9:16','auto'],
  kling2_5: ['16:9','1:1','9:16','auto'],
  sora2: ['auto','9:16','16:9'],
  sora2_pro: ['auto','9:16','16:9'],
} as const;

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
    const provider: VideoProvider = ((): VideoProvider => {
      const raw = String((vconf?.provider || 'sora2')).toLowerCase();
      if (raw === 'kling2_5') return 'kling2_5';
      if (raw === 'sora2') return 'sora2';
      if (raw === 'sora2_pro') return 'sora2_pro';
      return 'seedance';
    })();
    let videoPrompt = String((body?.prompt ?? vconf?.prompt ?? '') || '').trim();
    if (!enabled || !videoPrompt) return NextResponse.json({ error: 'This template does not support video' }, { status: 400 });
    
    // Process custom tokens in video prompt
    if (body?.variables && typeof body.variables === 'object') {
      const variables = body.variables as Record<string, string>;
      for (const [key, value] of Object.entries(variables)) {
        if (typeof key === 'string' && typeof value === 'string') {
          const token = `[${key}]`;
          videoPrompt = videoPrompt.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }
      }
    }

    const providerDefaultDurations = PROVIDER_DURATION_OPTIONS[provider];
    const rawAllowedDurations = Array.isArray((vconf as { allowedDurations?: unknown })?.allowedDurations)
      ? ((vconf as { allowedDurations?: unknown })?.allowedDurations as Array<string>)
      : undefined;
    const allowedDurations = (rawAllowedDurations && rawAllowedDurations.length
      ? rawAllowedDurations
      : providerDefaultDurations).filter((d) => providerDefaultDurations.includes(String(d) as typeof providerDefaultDurations[number])) as ReadonlyArray<'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'>;
    const requestedDurationRaw = String(body?.duration ?? vconf?.duration ?? providerDefaultDurations[0] ?? '5');
    const normalizedDurationLabel = allowedDurations.includes(requestedDurationRaw as typeof allowedDurations[number])
      ? requestedDurationRaw as typeof allowedDurations[number]
      : (allowedDurations[0] ?? providerDefaultDurations[0] ?? '5');
    const durationSeconds = Math.max(1, Math.min(120, Math.round(Number(normalizedDurationLabel)))) || Number(providerDefaultDurations[0] ?? 5);

    const providerResOptions = PROVIDER_RESOLUTION_OPTIONS[provider];
    const requestedResolution = String(body?.resolution ?? vconf?.resolution ?? (provider === 'sora2' || provider === 'sora2_pro' ? '720p' : '1080p')) as VideoResolution;
    const resolution = providerResOptions.includes(requestedResolution) ? requestedResolution : providerResOptions[0];

    const providerAspectOptions = PROVIDER_ASPECT_OPTIONS[provider];
    const requestedAspect = String(body?.aspect_ratio ?? vconf?.aspect_ratio ?? 'auto') as VideoAspectRatio;
    const aspect_ratio = providerAspectOptions.includes(requestedAspect) ? requestedAspect : providerAspectOptions[0];

    const camera_fixed = provider === 'seedance' ? !!(body?.camera_fixed ?? vconf?.camera_fixed ?? false) : false;
    const seed = ((): number | null => {
      const n = Number(body?.seed ?? vconf?.seed);
      return Number.isFinite(n) ? Math.round(n) : null;
    })();
    const fps = ((): number => {
      const n = Number(body?.fps ?? vconf?.fps ?? DEFAULT_VIDEO_FPS);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_VIDEO_FPS;
    })();

    // Pricing: estimate credits for display/check purposes only; we'll charge post-success
    const credits = estimateVideoCredits(resolution, durationSeconds, fps, aspect_ratio, provider);

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
        const klingDuration = durationSeconds >= 10 ? '10' : '5';
        const cfgScale = ((): number => {
          try { const n = Number((vconf as { cfg_scale?: number })?.cfg_scale); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5; } catch { return 0.5; }
        })();
        const input = {
          prompt: videoPrompt,
          image_url,
          duration: klingDuration,
          negative_prompt: 'blur, distort, and low quality',
          cfg_scale: cfgScale,
        } as const;
        try { console.log("[FAL INPUT]", JSON.stringify({ model: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", input }, null, 2)); } catch {}
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
      } else if (provider === 'sora2') {
        const input = {
          prompt: videoPrompt,
          image_url,
          aspect_ratio,
          resolution,
          duration: durationSeconds,
        } as const;
        try { console.log("[FAL INPUT]", JSON.stringify({ model: "fal-ai/sora-2/image-to-video", input }, null, 2)); } catch {}
        result = await fal.subscribe("fal-ai/sora-2/image-to-video", {
          input: input as any,
          logs: true,
          onQueueUpdate: (update: any) => {
            try {
              if (update?.status === 'IN_PROGRESS') {
                (update.logs || []).map((l: any)=> l?.message).filter(Boolean).forEach((m: string)=> console.log(`[FAL VIDEO-SORA2] ${m}`));
              }
            } catch {}
          },
        });
      } else if (provider === 'sora2_pro') {
        const input = {
          prompt: videoPrompt,
          image_url,
          aspect_ratio,
          resolution,
          duration: durationSeconds,
        } as const;
        try { console.log("[FAL INPUT]", JSON.stringify({ model: "fal-ai/sora-2/image-to-video/pro", input }, null, 2)); } catch {}
        result = await fal.subscribe("fal-ai/sora-2/image-to-video/pro", {
          input: input as any,
          logs: true,
          onQueueUpdate: (update: any) => {
            try {
              if (update?.status === 'IN_PROGRESS') {
                (update.logs || []).map((l: any)=> l?.message).filter(Boolean).forEach((m: string)=> console.log(`[FAL VIDEO-SORA2-PRO] ${m}`));
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
          duration: String(durationSeconds) as AnimateVideoRequest['duration'],
          camera_fixed,
          enable_safety_checker: true,
          ...(typeof seed === 'number' ? { seed } : {}),
        } as const;
        try { console.log("[FAL INPUT]", JSON.stringify({ model: "fal-ai/bytedance/seedance/v1/pro/image-to-video", input }, null, 2)); } catch {}
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
      return NextResponse.json({ error: 'Video generation failed. Please try again in a moment.' }, { status: 502 });
    }
    const data = (result?.data || {}) as any;
    const videoUrl: string | null = data?.video?.url || data?.url || null;
    if (!videoUrl) return NextResponse.json({ error: 'Video generation failed. Please try again in a moment.' }, { status: 502 });

    // Persist to R2 as a single MP4 file with embedded cover art (the input image) when possible
    const createdIso = new Date().toISOString();
    const safeSlug = (String(template?.slug || template?.name || 'template').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')) || 'template';
    const fileBase = `${createdIso.replace(/[:.]/g, '-')}-${safeSlug}`;
    const singleOutKey = `${userRoot}/library/${fileBase}.mp4`;
    const fileRes = await fetch(videoUrl);
    if (!fileRes.ok) return NextResponse.json({ error: 'Video generation failed. Please try again in a moment.' }, { status: 502 });
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

    // Charge idempotently after successful persistence; use object key as ref
    try {
      await chargeCreditsOnce(user.email, credits, 'video', singleOutKey);
    } catch {
      try { await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: singleOutKey })); } catch {}
      return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Generate and store blurhash for video (non-fatal)
    try {
      const videoBuffer = Buffer.from(finalVideoBytes);
      const { blurhash, width, height, duration } = await generateVideoBlurHash(videoBuffer);
      
      const libraryVideoData: Omit<LibraryVideo, 'id'> = {
        key: singleOutKey,
        email: user.email,
        blurhash,
        width,
        height,
        duration,
        size: finalVideoBytes.length,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };
      
      // Check if record exists, update or create
      const existing = await db.query(
        "SELECT id FROM library_video WHERE key = $key AND email = $email LIMIT 1;",
        { key: singleOutKey, email: user.email }
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
      
      console.log(`Stored library video metadata for ${singleOutKey}`);
    } catch (error) {
      console.error('Failed to store video metadata (non-fatal):', error);
    }

    const { url } = await createViewUrl(singleOutKey);
    return NextResponse.json({ key: singleOutKey, url, credits });
  } catch (err) {
    try { console.error('/api/templates/video error', err); } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


