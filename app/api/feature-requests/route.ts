import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { getSessionLite } from "@/lib/chatPerms";
import { RecordId } from "surrealdb";

type FeatureRequestRow = {
  id?: { toString?: () => string } | string
  title?: string
  description?: string | null
  created_by?: RecordId<"user"> | string
  created_byEmail?: string
  created_at?: string
}

let ensured = false;
async function ensureIndexes() {
  if (ensured) return;
  try {
    const db = await getSurreal();
    await db.query("DEFINE INDEX idx_feature_request_creator_time ON TABLE feature_request FIELDS created_byEmail, created_at;");
    await db.query("DEFINE INDEX idx_feature_vote_unique ON TABLE feature_vote FIELDS request, userEmail UNIQUE;");
  } catch {
  } finally {
    ensured = true;
  }
}

function canonicalPlan(p?: string | null): 'base' | 'premium' | 'ultra' | null {
  const s = (p || '').toLowerCase();
  if (s === 'ultra' || s === 'pro') return 'ultra';
  if (s === 'premium') return 'premium';
  if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
  return null;
}

export async function GET(request: Request) {
  const session = await getSessionLite();
  const db = await getSurreal();
  await ensureIndexes();
  const { searchParams } = new URL(request.url);
  const metaOnly = searchParams.get('meta') === '1';

  // Admins: unlimited posting
  const isAdmin = (session.role || 'user') === 'admin';

  if (metaOnly) {
    // Rate limit meta only
    let canCreate = !!session.email;
    let nextAllowedAt: string | null = null;
    try {
      if (session.email) {
        if (isAdmin) {
          canCreate = true;
          nextAllowedAt = null;
        } else {
          function canonicalPlan(p?: string | null): 'base' | 'premium' | 'ultra' | null {
            const s = (p || '').toLowerCase();
            if (s === 'ultra' || s === 'pro') return 'ultra';
            if (s === 'premium') return 'premium';
            if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
            return null;
          }
          const p = canonicalPlan(session.plan);
          const windowMs = p === 'ultra' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
          const lastRes = await db.query("SELECT created_at FROM feature_request WHERE created_byEmail = $email ORDER BY created_at DESC LIMIT 1;", { email: session.email });
          const last = Array.isArray(lastRes) && Array.isArray(lastRes[0]) ? (lastRes[0][0] as { created_at?: string } | undefined) : undefined;
          const lastIso = (last?.created_at as string | undefined) || null;
          if (lastIso) {
            const ts = Date.parse(lastIso);
            if (Number.isFinite(ts)) {
              const next = ts + windowMs;
              if (Date.now() < next) {
                canCreate = false;
                nextAllowedAt = new Date(next).toISOString();
              }
            }
          }
        }
      }
    } catch {}
    return NextResponse.json({ canCreate, nextAllowedAt });
  }

  // Fetch latest feature requests
  const res = await db.query("SELECT id, title, description, created_by, created_byEmail, created_at FROM feature_request ORDER BY created_at DESC LIMIT 200;");
  const rows: FeatureRequestRow[] = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as FeatureRequestRow[]) : [];

  // Build id list for vote aggregation
  const ids: Array<string | RecordId<"feature_request">> = [];
  const idStrings = new Set<string>();
  for (const r of rows) {
    try {
      const key = typeof (r?.id as { toString?: () => string } | undefined)?.toString === 'function' ? (r!.id as { toString: () => string }).toString() : String(r?.id || '');
      if (key && !idStrings.has(key)) { idStrings.add(key); ids.push(r!.id as string); }
    } catch {}
  }

  // Aggregate votes for all requests
  const votesRes = ids.length > 0
    ? await db.query("SELECT request, stance, count() AS c FROM feature_vote WHERE request IN $ids GROUP BY request, stance;", { ids })
    : [];
  const voteRows: Array<{ request?: { toString?: () => string } | string; stance?: string; c?: number }> = Array.isArray(votesRes) && Array.isArray(votesRes[0]) ? (votesRes[0] as Array<{ request?: { toString?: () => string } | string; stance?: string; c?: number }>) : [];
  const counts = new Map<string, { up: number; down: number }>();
  for (const v of voteRows) {
    const k = typeof (v?.request as { toString?: () => string } | undefined)?.toString === 'function' ? (v!.request as { toString: () => string }).toString() : String(v?.request || '');
    if (!k) continue;
    const prev = counts.get(k) || { up: 0, down: 0 };
    if ((v?.stance || '').toLowerCase() === 'up' || (v?.stance || '').toLowerCase() === 'wanted') prev.up += Number(v?.c || 0);
    if ((v?.stance || '').toLowerCase() === 'down' || (v?.stance || '').toLowerCase() === 'not_wanted') prev.down += Number(v?.c || 0);
    counts.set(k, prev);
  }

  // Current user's votes
  const myVotesRes = session.email && ids.length > 0
    ? await db.query("SELECT request, stance FROM feature_vote WHERE userEmail = $email AND request IN $ids;", { email: session.email, ids })
    : [];
  const myVoteRows: Array<{ request?: { toString?: () => string } | string; stance?: string }> = Array.isArray(myVotesRes) && Array.isArray(myVotesRes[0]) ? (myVotesRes[0] as Array<{ request?: { toString?: () => string } | string; stance?: string }>) : [];
  const myVotes = new Map<string, 'up' | 'down'>();
  for (const mv of myVoteRows) {
    const k = typeof (mv?.request as { toString?: () => string } | undefined)?.toString === 'function' ? (mv!.request as { toString: () => string }).toString() : String(mv?.request || '');
    const s = (mv?.stance || '').toLowerCase();
    if (k && (s === 'up' || s === 'down')) myVotes.set(k, s);
  }

  // Resolve creator names for display (mask emails)
  const creatorIds: Array<unknown> = [];
  const creatorKeys = new Set<string>();
  for (const r of rows) {
    const u = r?.created_by;
    try {
      const key = typeof (u as { toString?: () => string } | undefined)?.toString === 'function' ? (u as { toString: () => string }).toString() : (u ? String(u) : '');
      if (key && !creatorKeys.has(key)) { creatorKeys.add(key); creatorIds.push(u as unknown); }
    } catch {}
  }
  const nameMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    try {
      const ures = await db.query("SELECT id, name FROM user WHERE id IN $ids;", { ids: creatorIds });
      const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<Record<string, unknown>>) : [];
      for (const u of urows) {
        const key = typeof (u as { id?: { toString?: () => string } } | undefined)?.id?.toString === 'function' ? (u as { id: { toString: () => string } }).id.toString() : String((u as { id?: unknown } | undefined)?.id);
        const nm = (u as { name?: string } | undefined)?.name || 'Member';
        if (key) nameMap.set(key, nm);
      }
    } catch {}
  }

  // Rate limit data
  let canCreate = !!session.email;
  let nextAllowedAt: string | null = null;
  try {
    if (session.email) {
      if (isAdmin) {
        canCreate = true;
        nextAllowedAt = null;
      } else {
        const p = canonicalPlan(session.plan);
        const windowMs = p === 'ultra' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        const lastRes = await db.query("SELECT created_at FROM feature_request WHERE created_byEmail = $email ORDER BY created_at DESC LIMIT 1;", { email: session.email });
        const last = Array.isArray(lastRes) && Array.isArray(lastRes[0]) ? (lastRes[0][0] as { created_at?: string } | undefined) : undefined;
        const lastIso = (last?.created_at as string | undefined) || null;
        if (lastIso) {
          const ts = Date.parse(lastIso);
          if (Number.isFinite(ts)) {
            const next = ts + windowMs;
            if (Date.now() < next) {
              canCreate = false;
              nextAllowedAt = new Date(next).toISOString();
            }
          }
        }
      }
    }
  } catch {}

  const normalized = rows.map((r) => {
    const idStr = typeof (r?.id as { toString?: () => string } | undefined)?.toString === 'function' ? (r!.id as { toString: () => string }).toString() : String(r?.id || '');
    const creatorKey = typeof (r?.created_by as { toString?: () => string } | undefined)?.toString === 'function' ? (r!.created_by as { toString: () => string }).toString() : (r?.created_by ? String(r.created_by) : '');
    const cnt = counts.get(idStr) || { up: 0, down: 0 };
    return {
      id: idStr,
      title: r?.title || '',
      description: (typeof r?.description === 'string' ? r.description : null),
      created_at: r?.created_at || null,
      created_byName: nameMap.get(creatorKey) || 'Member',
      wanted: cnt.up,
      notWanted: cnt.down,
      myVote: (myVotes.get(idStr) || null),
    };
  });

  return NextResponse.json({ requests: normalized, canCreate, nextAllowedAt });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawTitle: unknown = (body as { title?: unknown }).title;
  const rawDesc: unknown = (body as { description?: unknown }).description;
  const title = String(rawTitle || '').trim();
  const description = typeof rawDesc === 'string' ? rawDesc.trim() : null;
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title too long" }, { status: 400 });
  if (description && description.length > 2000) return NextResponse.json({ error: "Description too long" }, { status: 400 });

  const db = await getSurreal();
  await ensureIndexes();

  // Rate limit by plan: ultra -> daily, otherwise weekly; admins unlimited
  const userRole = (session.user as { role?: string } | undefined)?.role || 'user';
  if (userRole !== 'admin') {
    let plan: string | null | undefined = undefined;
    try {
      const lite = await getSessionLite();
      plan = lite.plan;
    } catch {}
    const canonical = canonicalPlan(plan);
    const windowMs = canonical === 'ultra' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const lastRes = await db.query("SELECT created_at FROM feature_request WHERE created_byEmail = $email ORDER BY created_at DESC LIMIT 1;", { email: session.user.email });
    const last = Array.isArray(lastRes) && Array.isArray(lastRes[0]) ? (lastRes[0][0] as { created_at?: string } | undefined) : undefined;
    const lastIso = (last?.created_at as string | undefined) || null;
    if (lastIso) {
      const ts = Date.parse(lastIso);
      if (Number.isFinite(ts)) {
        const next = ts + windowMs;
        if (Date.now() < next) {
          return NextResponse.json({ error: "You can only create a feature request periodically.", nextAllowedAt: new Date(next).toISOString() }, { status: 429 });
        }
      }
    }
  }

  // Resolve creator id
  const ures = await db.query("SELECT id, name FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: RecordId<"user"> | string } | undefined) : undefined;
  const rid = urow?.id;

  const created = await db.create("feature_request", {
    title,
    description,
    created_by: rid,
    created_byEmail: session.user.email,
    created_at: new Date().toISOString(),
  });
  const row = Array.isArray(created) ? (created[0] as FeatureRequestRow) : (created as FeatureRequestRow);
  const idStr = typeof (row?.id as { toString?: () => string } | undefined)?.toString === 'function' ? (row!.id as { toString: () => string }).toString() : String(row?.id || '');

  return NextResponse.json({ request: { id: idStr, title, description, created_at: row?.created_at || null, created_byName: session.user.name || 'Member', wanted: 0, notWanted: 0, myVote: null } });
}


