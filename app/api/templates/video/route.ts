/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { fal } from "@fal-ai/client";
import { RecordId } from "surrealdb";
import { estimateVideoCredits, DEFAULT_VIDEO_FPS, type VideoResolution, type VideoAspectRatio, type VideoProvider } from "@/lib/credits";
export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutes for video generation

fal.config({ credentials: process.env.FAL_KEY || "" });

type AnimateVideoRequest = {
  templateId?: string;
  templateSlug?: string;
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
  seedance: ['720p','1080p'],
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

    // Parse multipart form data
    const form = await req.formData();
    const startImageFile = form.get('startImage') as File | null;
    if (!startImageFile) return NextResponse.json({ error: 'Missing start image' }, { status: 400 });
    
    const bodyJson = form.get('data') as string | null;
    const body = bodyJson ? (JSON.parse(bodyJson) as AnimateVideoRequest) : {} as AnimateVideoRequest;
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
      const raw = String((vconf?.provider || 'seedance')).toLowerCase();
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

    // Upload start image directly to FAL storage
    const arrayBuffer = await startImageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const startMime = startImageFile.type || 'image/png';
    const image_url = await uploadToFal(bytes, startMime);
    if (!image_url) return NextResponse.json({ error: 'Failed to upload start frame to video service' }, { status: 502 });

    // ASYNC JOB SUBMISSION - Queue the job instead of waiting for completion
    let queueResult: any;
    let modelName: string;
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
        modelName = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
        try { console.log("[FAL ASYNC INPUT]", JSON.stringify({ model: modelName, input }, null, 2)); } catch {}
        queueResult = await fal.queue.submit(modelName, { input: input as any });
      } else if (provider === 'sora2') {
        const input = {
          prompt: videoPrompt,
          image_url,
          aspect_ratio,
          resolution,
          duration: durationSeconds,
        } as const;
        modelName = "fal-ai/sora-2/image-to-video";
        try { console.log("[FAL ASYNC INPUT]", JSON.stringify({ model: modelName, input }, null, 2)); } catch {}
        queueResult = await fal.queue.submit(modelName, { input: input as any });
      } else if (provider === 'sora2_pro') {
        const input = {
          prompt: videoPrompt,
          image_url,
          aspect_ratio,
          resolution,
          duration: durationSeconds,
        } as const;
        modelName = "fal-ai/sora-2/image-to-video/pro";
        try { console.log("[FAL ASYNC INPUT]", JSON.stringify({ model: modelName, input }, null, 2)); } catch {}
        queueResult = await fal.queue.submit(modelName, { input: input as any });
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
        modelName = "fal-ai/bytedance/seedance/v1/pro/image-to-video";
        try { console.log("[FAL ASYNC INPUT]", JSON.stringify({ model: modelName, input }, null, 2)); } catch {}
        queueResult = await fal.queue.submit(modelName, { input: input as any });
      }
    } catch (e: unknown) {
      try {
        console.error('Video generation queue error', e);
      } catch {}
      return NextResponse.json({ error: 'Video generation failed to start. Please try again in a moment.' }, { status: 502 });
    }

    const requestId = queueResult?.requestId || queueResult?.request_id;
    if (!requestId) return NextResponse.json({ error: 'Failed to queue video generation' }, { status: 502 });
    
    console.log(`[VIDEO JOB] Queued job ${requestId} for user ${user.email}`);

    // Store job metadata in database
    const templateIdStr = template?.id instanceof RecordId ? template.id.toString() : String(template?.id || body.templateId || body.templateSlug);
    
    try {
      // Use time::now() in SurrealDB for datetime fields
      await db.query(`
        CREATE video_job CONTENT {
          email: $email,
          fal_request_id: $fal_request_id,
          fal_model: $fal_model,
          template_id: $template_id,
          status: $status,
          provider: $provider,
          prompt: $prompt,
          duration: $duration,
          resolution: $resolution,
          aspect_ratio: $aspect_ratio,
          credits: $credits,
          created_at: time::now(),
          updated_at: time::now()
        };
      `, {
        email: user.email,
        fal_request_id: requestId,
        fal_model: modelName,
        template_id: templateIdStr,
        status: 'pending',
        provider,
        prompt: videoPrompt,
        duration: durationSeconds,
        resolution,
        aspect_ratio,
        credits
      });
    } catch (dbErr) {
      console.error('Failed to store video job in database:', dbErr);
      // Job is queued on fal.ai, so we continue despite DB error
    }

    // Return job ID immediately - client will poll for status
    return NextResponse.json({ 
      jobId: requestId,
      status: 'pending',
      credits,
      message: 'Video generation started. Check status at /api/templates/video/status'
    });
  } catch (err) {
    try { console.error('/api/templates/video error', err); } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


