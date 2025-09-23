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
  status?: "accepted" | "rejected" | string | null
  decided_byEmail?: string | null
  decided_at?: string | null
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
  const res = await db.query("SELECT id, title, description, created_by, created_byEmail, created_at, status, decided_byEmail, decided_at FROM feature_request ORDER BY created_at DESC LIMIT 200;");
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
      status: (typeof r?.status === 'string' ? r.status : null) || null,
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


export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string } | undefined)?.role || 'user';
  if (role !== 'admin') return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({} as { id?: unknown; action?: unknown }));
  const idRaw = String((body as { id?: unknown }).id || '').trim();
  const actionRaw = String((body as { action?: unknown }).action || '').toLowerCase();
  if (!idRaw) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (actionRaw !== 'accept' && actionRaw !== 'reject') return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Normalize feature request id
  let rid: RecordId<'feature_request'> | string = idRaw;
  try {
    if (idRaw.includes(':')) {
      const parts = idRaw.split(':');
      const table = (parts[0] || '').trim();
      const idPart = parts.slice(1).join(':');
      if (table === 'feature_request') rid = new RecordId('feature_request', idPart);
    } else {
      rid = new RecordId('feature_request', idRaw);
    }
  } catch {}

  const db = await getSurreal();
  const nowIso = new Date().toISOString();

  // Load current row
  const curRes = await db.query("SELECT id, title, status FROM feature_request WHERE id = $rid LIMIT 1;", { rid });
  const curRow = Array.isArray(curRes) && Array.isArray(curRes[0]) ? (curRes[0][0] as { id?: unknown; title?: string; status?: string } | undefined) : undefined;
  if (!curRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const prevStatus = (curRow?.status || '').toString().toLowerCase();
  const newStatus: 'accepted' | 'rejected' = actionRaw === 'accept' ? 'accepted' : 'rejected';

  // Update status
  await db.query(
    `UPDATE $rid SET status = $status, decided_byEmail = $by, decided_at = d"${nowIso}";`,
    { rid, status: newStatus, by: session.user.email }
  );

  // If accepted, notify all upvoters by email
  let notified = 0;
  if (newStatus === 'accepted' && prevStatus !== 'accepted') {
    try {
      // Fetch upvoter emails
      const vres = await db.query("SELECT userEmail FROM feature_vote WHERE request = $rid AND (stance = 'up' OR stance = 'wanted');", { rid });
      const vrows: Array<{ userEmail?: string | null }> = Array.isArray(vres) && Array.isArray(vres[0]) ? (vres[0] as Array<{ userEmail?: string | null }>) : [];
      const emails = Array.from(new Set(
        vrows
          .map((r) => (r?.userEmail || '').toString().trim().toLowerCase())
          .filter((e) => /.+@.+\..+/.test(e))
      ));

      // Minimal email sender using Resend
      async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
        const apiKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY || "";
        const from = process.env.EMAIL_FROM || "ignite@nytforge.com";
        if (!apiKey) throw new Error("Missing Resend API key");
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject, html, text }),
        });
        if (!res.ok) throw new Error("Resend error: " + (await res.text()));
      }

      const title = (curRow?.title || '').toString();
      const subject = title ? `Feature accepted: ${title}` : 'A feature you voted for was accepted';
      const textBase = title
        ? `Good news! The feature you voted for ("${title}") was accepted and will be added soon.\n\nThanks for your feedback!`
        : `Good news! A feature you voted for was accepted and will be added soon.\n\nThanks for your feedback!`;
      const htmlBase = `<div style=\"font-family:Arial,Helvetica,sans-serif;\"><h2 style=\"margin:0 0 .6rem\">${title ? "Feature accepted: " + title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "Feature accepted"}</h2><p style=\"margin:.4rem 0\">We\'re excited to share that this feature was accepted and will be added soon.</p><p style=\"margin:1rem 0 0;color:#555\">Thank you for voting and helping us prioritize!</p></div>`;

      for (const to of emails) {
        try {
          await sendEmail({ to, subject, html: htmlBase, text: textBase });
          notified++;
        } catch {}
      }
    } catch {}
  }

  // Recompute counts for response
  const countsRes = await db.query("SELECT stance, count() AS c FROM feature_vote WHERE request = $rid GROUP BY stance;", { rid });
  const countRows: Array<{ stance?: string; c?: number }> = Array.isArray(countsRes) && Array.isArray(countsRes[0]) ? (countsRes[0] as Array<{ stance?: string; c?: number }>) : [];
  let up = 0, down = 0;
  for (const r of countRows) {
    const s = (r?.stance || '').toLowerCase();
    if (s === 'up' || s === 'wanted') up += Number(r?.c || 0);
    if (s === 'down' || s === 'not_wanted') down += Number(r?.c || 0);
  }

  const idStr = ((): string => {
    try { return (curRow!.id as { toString?: () => string }).toString?.() || String(curRow!.id); } catch { return idRaw; }
  })();
  const result = {
    id: idStr,
    title: (curRow?.title || '').toString(),
    description: null as string | null,
    created_at: null as string | null,
    created_byName: 'Member',
    wanted: up,
    notWanted: down,
    myVote: null as 'up' | 'down' | null,
    status: newStatus,
  };

  return NextResponse.json({ request: result, notified });
}


