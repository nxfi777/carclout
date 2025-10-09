import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

type TemplateDoc = {
  id?: unknown;
  name: string;
  slug?: string;
  description?: string;
  prompt: string;
  falModelSlug?: string;
  thumbnailKey?: string; // admin storage key for preview
  blurhash?: string; // BlurHash for thumbnail
  adminImageKeys?: string[]; // optional admin-scope image keys to prepend
  imageSize?: { width: number; height: number } | null;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle' | 'user'>; // 'user' covers upload + workspace
  proOnly?: boolean;
  status?: 'draft' | 'public'; // visibility status (defaults to 'draft')
  // Maximum number of user images allowed per upload action in the Use Template UI
  maxUploadImages?: number;
  variables?: Array<{ key: string; label?: string; type?: string; required?: boolean; defaultValue?: string | number | boolean }>;
  categories?: string[];
  // Foreground masking config (BiRefNet / rembg)
  rembg?: {
    enabled?: boolean;
    model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
    operating_resolution?: '1024x1024' | '2048x2048';
    output_format?: 'png' | 'webp';
    refine_foreground?: boolean;
    output_mask?: boolean;
  } | null;
  // Isolate car: remove background and use black backdrop before generation
  isolateCar?: {
    mode: 'user_choice' | 'force_on' | 'force_off'; // How to handle background removal
    defaultEnabled?: boolean; // Default state when mode is 'user_choice'
  } | null;
  designerDefaults?: {
    headline?: string | null;
  } | null;
  // Video generation config (Seedance/Kling/Sora 2 image-to-video)
  video?: {
    enabled?: boolean;
    provider?: 'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro';
    prompt?: string;
    duration?: '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
    resolution?: 'auto' | '480p' | '720p' | '1080p';
    aspect_ratio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto';
    camera_fixed?: boolean;
    seed?: number | null;
    fps?: number; // for cost estimation only
    cfg_scale?: number; // Kling only (0..1)
    previewKey?: string | null; // admin-scope R2 key for hover preview
    allowedDurations?: Array<'3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12'>; // User-selectable durations
  } | null;
  created_at?: string;
  created_by?: string;
};

function toIdString(id: unknown): string | undefined {
  try {
    if (typeof id === "object" && id !== null && "toString" in (id as object)) {
      const s = (id as { toString(): string }).toString();
      if (typeof s === "string" && s.length > 0) return s;
    }
  } catch {}
  if (typeof id === "string") return id;
  return undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sortParam = String(searchParams.get('sort') || '').toLowerCase();
  const filterParam = String(searchParams.get('filter') || '').toLowerCase();
  const limit = Math.max(1, Math.min(500, parseInt(String(searchParams.get('limit') || '500')) || 500));
  const db = await getSurreal();

  // Optional user context for per-user "favorited" flag and admin role
  let email: string | null = null;
  let isAdmin = false;
  try { 
    const u = await getSessionUser(); 
    email = u?.email || null; 
    isAdmin = (u as { role?: unknown })?.role === 'admin';
  } catch {}

  // Load templates (recent by default) - filter by status for non-admin users
  const statusFilter = isAdmin ? '' : `WHERE (status = 'public' OR status IS NONE)`;
  const res = await db.query(`SELECT * FROM template ${statusFilter} ORDER BY created_at DESC LIMIT ${limit};`);
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as TemplateDoc[]) : [];

  // Map to string ids first for easier joins
  const base = rows.map((t) => ({ ...t, id: toIdString((t as { id?: unknown })?.id) }));

  // Load favorite counts for all templates in one go
  const counts: Record<string, number> = {};
  try {
    const favAgg = await db.query("SELECT template, count() AS n FROM template_favorite GROUP BY template;");
    const arr = Array.isArray(favAgg) && Array.isArray(favAgg[0]) ? (favAgg[0] as Array<{ template?: unknown; n?: number }>) : [];
    for (const r of arr) {
      const key = toIdString((r as { template?: unknown })?.template);
      if (key) counts[key] = Number(r?.n || 0);
    }
  } catch {}

  // Load current user's favorites set
  const favSet = new Set<string>();
  if (email) {
    try {
      const uidRes = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email });
      const row = Array.isArray(uidRes) && Array.isArray(uidRes[0]) ? (uidRes[0][0] as { id?: unknown } | undefined) : undefined;
      const uid = row?.id instanceof RecordId ? (row.id as RecordId<'user'>) : (row?.id ? new RecordId('user', String(row.id as string)) : null);
      if (uid) {
        const f = await db.query("SELECT template FROM template_favorite WHERE user = $uid LIMIT 10000;", { uid });
        const favRows = Array.isArray(f) && Array.isArray(f[0]) ? (f[0] as Array<{ template?: unknown }>) : [];
        for (const r of favRows) {
          const key = toIdString((r as { template?: unknown })?.template);
          if (key) favSet.add(key);
        }
      }
    } catch {}
  }

  // Optional filtering by current user's favourites
  let filtered = base;
  const wantFavs = filterParam === 'favorites' || filterParam === 'favourites';
  if (wantFavs) {
    if (email) {
      filtered = base.filter(t => t.id ? favSet.has(String(t.id)) : false);
    } else {
      filtered = [];
    }
  }

  // Optional filtering by templates that support video
  const wantVideo = filterParam === 'video' || filterParam === 'videos' || filterParam === 'video_only';
  if (wantVideo) {
    filtered = filtered.filter((t) => {
      try {
        const v = (t as { video?: { enabled?: unknown } | null })?.video;
        return !!(v && typeof v === 'object' && !!(v as { enabled?: unknown }).enabled);
      } catch {
        return false;
      }
    });
  }

  let list = filtered.map((t) => ({
    ...t,
    favoriteCount: counts[t.id as string] || 0,
    isFavorited: t.id ? favSet.has(String(t.id)) : false,
  }));

  // Sorting
  const byFav = sortParam === 'most_favorited' || sortParam === 'most_favourited' || sortParam === 'favorites' || sortParam === 'favourites';
  if (byFav) {
    list = [...list].sort((a, b) => {
      const da = Number((a as { favoriteCount?: unknown }).favoriteCount || 0);
      const dbv = Number((b as { favoriteCount?: unknown }).favoriteCount || 0);
      if (dbv !== da) return dbv - da;
      const at = (a as { created_at?: unknown })?.created_at ? new Date(String((a as { created_at?: unknown }).created_at)).getTime() : 0;
      const bt = (b as { created_at?: unknown })?.created_at ? new Date(String((b as { created_at?: unknown }).created_at)).getTime() : 0;
      return bt - at;
    });
  }

  return NextResponse.json({ templates: list });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: unknown })?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({} as Partial<TemplateDoc>));
  const name = String(body?.name || "").trim();
  const prompt = String(body?.prompt || "").trim();
  if (!name || !prompt) return NextResponse.json({ error: "Missing name or prompt" }, { status: 400 });
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const createdIso = new Date().toISOString();
  const payload: TemplateDoc = {
    name,
    slug: slugBase,
    description: body?.description || "",
    prompt,
    falModelSlug: body?.falModelSlug || "fal-ai/gemini-25-flash-image/edit", // default; admin can override
    thumbnailKey: body?.thumbnailKey || undefined,
    adminImageKeys: Array.isArray(body?.adminImageKeys) ? (body!.adminImageKeys as string[]).filter((x) => typeof x === "string") : [],
    status: (body?.status === 'public' || body?.status === 'draft') ? body.status : 'draft', // default to draft
    imageSize: ((): TemplateDoc['imageSize'] => {
      try {
        const sz = (body as { imageSize?: { width?: unknown; height?: unknown } })?.imageSize;
        const w = Math.round(Number(sz?.width));
        const h = Math.round(Number(sz?.height));
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
      } catch {}
      // sensible default for Bytedance if client didn't send
      return { width: 1280, height: 1280 };
    })(),
    fixedAspectRatio: !!body?.fixedAspectRatio,
    aspectRatio: typeof body?.aspectRatio === 'number' ? Number(body?.aspectRatio) : undefined,
    allowedImageSources: Array.isArray((body as { allowedImageSources?: unknown })?.allowedImageSources)
      ? ((body as { allowedImageSources?: unknown }).allowedImageSources as unknown[])
          .map((s) => String(s || '').trim().toLowerCase())
          .filter((s) => s === 'vehicle' || s === 'user')
          .filter((v, i, a) => a.indexOf(v) === i)
      : ['vehicle', 'user'],
    proOnly: !!(body as { proOnly?: unknown })?.proOnly,
    maxUploadImages: ((): number | undefined => {
      try {
        const raw = (body as { maxUploadImages?: unknown })?.maxUploadImages;
        const n = Math.round(Number(raw));
        if (Number.isFinite(n) && n > 0) return Math.min(25, Math.max(1, n));
      } catch {}
      return undefined;
    })(),
    variables: Array.isArray(body?.variables) ? (body!.variables as unknown[]).filter(Boolean) as TemplateDoc['variables'] : [],
    categories: Array.isArray((body as { categories?: unknown })?.categories)
      ? ((body as { categories?: unknown }).categories as unknown[])
          .filter((x) => typeof x === "string")
          .map((s) => (s as string).trim())
          .filter((s) => s.length > 0)
          .slice(0, 20)
      : [],
    designerDefaults: ((): TemplateDoc['designerDefaults'] => {
      try {
        const cfg = (body as { designerDefaults?: { headline?: unknown } | null })?.designerDefaults;
        if (!cfg || typeof cfg !== 'object') return null;
        const headlineRaw = (cfg as { headline?: unknown }).headline;
        if (typeof headlineRaw !== 'string') return null;
        const trimmed = headlineRaw.trim().slice(0, 280);
        return trimmed ? { headline: trimmed } : null;
      } catch {
        return null;
      }
    })(),
    rembg: ((): TemplateDoc['rembg'] => {
      try {
        const incoming = (body as { rembg?: TemplateDoc['rembg'] })?.rembg as TemplateDoc['rembg'];
        const def = {
          enabled: true,
          model: 'General Use (Heavy)' as const,
          operating_resolution: '2048x2048' as const,
          output_format: 'png' as const,
          refine_foreground: true,
          output_mask: false,
        };
        if (incoming && typeof incoming === 'object') {
          return {
            enabled: true,
            model: (incoming.model as TemplateDoc['rembg'] extends infer R ? R extends { model?: infer M } ? M : never : never) || def.model,
            operating_resolution: (incoming.operating_resolution as TemplateDoc['rembg'] extends infer R ? R extends { operating_resolution?: infer M } ? M : never : never) || def.operating_resolution,
            output_format: (incoming.output_format as TemplateDoc['rembg'] extends infer R ? R extends { output_format?: infer M } ? M : never : never) || def.output_format,
            refine_foreground: typeof incoming.refine_foreground === 'boolean' ? incoming.refine_foreground : def.refine_foreground,
            output_mask: typeof incoming.output_mask === 'boolean' ? incoming.output_mask : def.output_mask,
          };
        }
        return def;
      } catch { return {
        enabled: true,
        model: 'General Use (Heavy)',
        operating_resolution: '2048x2048',
        output_format: 'png',
        refine_foreground: true,
        output_mask: false,
      }; }
    })(),
    video: ((): TemplateDoc['video'] => {
      try {
        const v = (body as { video?: TemplateDoc['video'] })?.video as Record<string, unknown> | undefined;
        if (v && typeof v === 'object') {
          const durRaw = String((v as { duration?: unknown })?.duration || '5');
          const durations = ['3','4','5','6','7','8','9','10','11','12'] as const;
          const dur = (durations as readonly string[]).includes(durRaw) ? (durRaw as (typeof durations)[number]) : '5';
          const resRaw = String((v as { resolution?: unknown })?.resolution || 'auto');
          const resolutions = ['auto','480p','720p','1080p'] as const;
          const res = (resolutions as readonly string[]).includes(resRaw) ? (resRaw as (typeof resolutions)[number]) : 'auto';
          const arRaw = String((v as { aspect_ratio?: unknown })?.aspect_ratio || 'auto');
          const aspectRatios = ['21:9','16:9','4:3','1:1','3:4','9:16','auto'] as const;
          const ar = (aspectRatios as readonly string[]).includes(arRaw) ? (arRaw as (typeof aspectRatios)[number]) : 'auto';
          const provRaw = String((v as { provider?: unknown })?.provider || 'seedance');
          const provider: 'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro' = provRaw === 'kling2_5' ? 'kling2_5' : provRaw === 'sora2' ? 'sora2' : provRaw === 'sora2_pro' ? 'sora2_pro' : 'seedance';
          const cfg_scale = ((): number | undefined => {
            try {
              const n = Number((v as { cfg_scale?: unknown })?.cfg_scale);
              if (!Number.isFinite(n)) return undefined;
              const clamped = Math.min(1, Math.max(0, n));
              return clamped;
            } catch { return undefined; }
          })();
          const allowedDurations = ((): NonNullable<TemplateDoc['video']>['allowedDurations'] => {
            const ad = (v as { allowedDurations?: unknown })?.allowedDurations;
            if (Array.isArray(ad)) {
              const filtered = ad.filter(d => (durations as readonly string[]).includes(String(d))) as Array<'3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12'>;
              return filtered.length > 0 ? filtered : undefined;
            }
            return undefined;
          })();
          return {
            enabled: !!(v as { enabled?: unknown })?.enabled,
            provider,
            prompt: typeof (v as { prompt?: unknown })?.prompt === 'string' ? String((v as { prompt?: unknown }).prompt) : '',
            duration: dur,
            resolution: res,
            aspect_ratio: ar,
            camera_fixed: !!(v as { camera_fixed?: unknown })?.camera_fixed,
            seed: ((): number | null => { const n = Number((v as { seed?: unknown })?.seed); return Number.isFinite(n) ? Math.round(n) : null; })(),
            fps: ((): number | undefined => { const n = Number((v as { fps?: unknown })?.fps); return Number.isFinite(n) && n>0 ? Math.round(n) : undefined; })(),
            cfg_scale,
            previewKey: typeof (v as { previewKey?: unknown })?.previewKey === 'string' ? String((v as { previewKey?: unknown }).previewKey) : null,
            allowedDurations,
          } as TemplateDoc['video'];
        }
      } catch {}
      return { enabled: false, provider: 'seedance', prompt: '', duration: '4', resolution: '720p', aspect_ratio: 'auto', camera_fixed: false, seed: null, fps: 24, cfg_scale: undefined, previewKey: null, allowedDurations: ['4', '8'] } as TemplateDoc['video'];
    })(),
    created_at: createdIso,
    created_by: user.email,
  };
  const db = await getSurreal();
  // Surreal datetime cast
  const query = `CREATE template SET 
    name = $name,
    slug = $slug,
    description = $description,
    prompt = $prompt,
    falModelSlug = $falModelSlug,
    thumbnailKey = $thumbnailKey,
    blurhash = $blurhash,
    adminImageKeys = $adminImageKeys,
    imageSize = $imageSize,
    fixedAspectRatio = $fixedAspectRatio,
    aspectRatio = $aspectRatio,
    allowedImageSources = $allowedImageSources,
    proOnly = $proOnly,
    status = $status,
    maxUploadImages = $maxUploadImages,
    variables = $variables,
    categories = $categories,
    rembg = $rembg,
    video = $video,
    created_by = $created_by,
    created_at = d"${createdIso}";`;
  const res = await db.query(query, payload as Record<string, unknown>);
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as TemplateDoc) : (Array.isArray(res) ? (res[0] as TemplateDoc) : null);
  return NextResponse.json({ template: row ? { ...row, id: toIdString((row as { id?: unknown })?.id) } : null });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: unknown })?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const slug = searchParams.get('slug');
  if (!id && !slug) return NextResponse.json({ error: 'Missing id or slug' }, { status: 400 });
  const db = await getSurreal();
  if (id) {
    let rid: string | RecordId<string> = id;
    try {
      // Parse RecordId e.g. template:... and pass as RecordId instance
      const parts = String(id).split(":");
      const tb = parts[0];
      const raw = parts.slice(1).join(":");
      rid = new RecordId(tb as string, raw);
    } catch {}
    await db.query("DELETE $rid;", { rid });
  } else if (slug) {
    await db.query("DELETE template WHERE slug = $slug;", { slug });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: string }).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Partial<TemplateDoc> & { id?: string; slug?: string };
  const idRaw = body?.id;
  const slug = body?.slug;
  if (!idRaw && !slug) return NextResponse.json({ error: "Missing id or slug" }, { status: 400 });

  // Build dynamic SET clause only for provided properties
  const fields: Array<keyof TemplateDoc | 'slug'> = [
    'name',
    'slug',
    'description',
    'prompt',
    'falModelSlug',
    'thumbnailKey',
    'adminImageKeys',
    'imageSize',
    'fixedAspectRatio',
    'aspectRatio',
    'allowedImageSources',
    'proOnly',
    'status',
    'maxUploadImages',
    'variables',
    'categories',
    'designerDefaults',
    'rembg',
    'video',
  ];
  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      if (f === 'rembg') {
        // Force enabled true if rembg provided, and merge defaults
        const incoming = (body as { rembg?: TemplateDoc['rembg'] }).rembg;
        const def = { enabled: true, model: 'General Use (Heavy)' as const, operating_resolution: '2048x2048' as const, output_format: 'png' as const, refine_foreground: true, output_mask: false };
        const next = incoming && typeof incoming === 'object' ? {
          enabled: true,
          model: (incoming.model as TemplateDoc['rembg'] extends infer R ? R extends { model?: infer M } ? M : never : never) || def.model,
          operating_resolution: (incoming.operating_resolution as TemplateDoc['rembg'] extends infer R ? R extends { operating_resolution?: infer M } ? M : never : never) || def.operating_resolution,
          output_format: (incoming.output_format as TemplateDoc['rembg'] extends infer R ? R extends { output_format?: infer M } ? M : never : never) || def.output_format,
          refine_foreground: typeof incoming.refine_foreground === 'boolean' ? incoming.refine_foreground : def.refine_foreground,
          output_mask: typeof incoming.output_mask === 'boolean' ? incoming.output_mask : def.output_mask,
        } : def;
        sets.push(`${f} = $${f}`);
        params[f] = next as unknown as Record<string, unknown>;
      } else if (f === 'designerDefaults') {
        const incoming = (body as { designerDefaults?: TemplateDoc['designerDefaults'] }).designerDefaults;
        let next: TemplateDoc['designerDefaults'] | null = null;
        try {
          const raw = incoming && typeof incoming === 'object' ? (incoming as { headline?: unknown }).headline : undefined;
          if (typeof raw === 'string') {
            const trimmed = raw.trim().slice(0, 280);
            next = trimmed ? { headline: trimmed } : null;
          }
        } catch {}
        sets.push(`${f} = $${f}`);
        params[f] = next;
      } else {
        sets.push(`${f} = $${f}`);
        params[f] = (body as Record<string, unknown>)[f as keyof typeof body] as unknown;
      }
    }
  }

  // Always set updated_* fields
  const updatedIso = new Date().toISOString();
  sets.push(`updated_by = $updated_by`);
  params.updated_by = user.email as string;
  // Use Surreal datetime cast for updated_at
  // We'll inject the d"..." literal for updated_at to ensure correct type
  sets.push(`updated_at = d"${updatedIso}"`);

  if (!sets.length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const db = await getSurreal();
  let result: TemplateDoc | null = null;

  if (idRaw) {
    let rid: string | RecordId<string> = idRaw;
    try {
      const parts = String(idRaw).split(":");
      const tb = parts[0];
      const raw = parts.slice(1).join(":");
      rid = new RecordId(tb as string, raw);
    } catch {}
    params.rid = rid as unknown as Record<string, unknown>;
    const query = `UPDATE $rid SET ${sets.join(", ")};`;
    const res = await db.query(query, params);
    result = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as TemplateDoc) : (Array.isArray(res) ? (res[0] as TemplateDoc) : null);
  } else if (slug) {
    params.slugParam = slug;
    const query = `UPDATE template SET ${sets.join(", ")}
      WHERE slug = $slugParam
      LIMIT 1;`;
    const res = await db.query(query, params);
    result = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as TemplateDoc) : (Array.isArray(res) ? (res[0] as TemplateDoc) : null);
  }

  if (!result) return NextResponse.json({ error: "Not found or not updated" }, { status: 404 });
  return NextResponse.json({ template: { ...result, id: toIdString((result as unknown as { id?: unknown })?.id) } });
}


