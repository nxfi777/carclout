import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { checkChannelRead, checkChannelWrite, getSessionLite, type ChannelLike, type Role, type Plan } from "@/lib/chatPerms";
import { RecordId } from "surrealdb";

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  try {
    const db = await getSurreal();
    // Sender rate limiting support (avoid duplicates; channel+created_at already exists)
    await db.query(
      "DEFINE INDEX idx_message_sender_time ON TABLE message FIELDS userEmail, created_at;"
    );
  } catch {
    // Ignore errors if indexes already exist or permissions restrict defines
  } finally {
    indexesEnsured = true;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || "general";
  const session = await getSessionLite();
  const me = session.email;
  const db = await getSurreal();
  await ensureIndexes();
  // Enforce channel read permissions
  try {
    const cres = await db.query("SELECT * FROM channel WHERE slug = $slug LIMIT 1;", { slug: channel });
    const crow: ChannelLike | null = Array.isArray(cres) && Array.isArray(cres[0]) ? ((cres[0][0] as ChannelLike) || null) : null;
    if (crow && !checkChannelRead(session, crow)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {}
  const res = await db.query(
    `SELECT id, text, channel, created_at, userEmail, userName, user
     FROM message
     WHERE channel = $c
       AND ($me IS NONE OR userEmail NOT IN (SELECT targetEmail FROM block WHERE userEmail = $me))
     ORDER BY created_at DESC
     LIMIT 200;`,
    { c: channel, me }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];

  // Build display name map for rows missing a safe userName (or containing an email)
  const needIds: Array<unknown> = [];
  for (const r of rows) {
    const nm: string | undefined = typeof r?.userName === 'string' ? r.userName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    if (!nm || looksEmail) {
      if (r?.user) needIds.push(r.user);
    }
  }
  const idStrings = new Set<string>();
  const ids: Array<unknown> = [];
  for (const u of needIds) {
    try {
      const k = typeof u?.toString === 'function' ? u.toString() : String(u);
      if (!idStrings.has(k)) { idStrings.add(k); ids.push(u); }
    } catch {}
  }
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const ures = await db.query("SELECT id, name FROM user WHERE id IN $ids;", { ids });
      const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<Record<string, unknown>>) : [];
      for (const u of urows) {
        const key = typeof (u as { id?: { toString?: () => string } } | undefined)?.id?.toString === 'function' ? (u as { id: { toString: () => string } }).id.toString() : String((u as { id?: unknown } | undefined)?.id);
        const nm = (u as { name?: string } | undefined)?.name || 'Member';
        if (key) nameMap.set(key, nm);
      }
    } catch {}
    try {
      const igres = await db.query("SELECT user, username FROM instagram_account WHERE user IN $ids;", { ids });
      const igrows = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0] as Array<Record<string, unknown>>) : [];
      for (const ig of igrows) {
        const key = typeof (ig as { user?: { toString?: () => string } } | undefined)?.user?.toString === 'function' ? (ig as { user: { toString: () => string } }).user.toString() : String((ig as { user?: unknown } | undefined)?.user);
        const uname = (ig as { username?: string } | undefined)?.username;
        if (key && uname) nameMap.set(key, uname);
      }
    } catch {}
  }

  const normalizedDesc = rows.map((row: Record<string, unknown>) => {
    const ridStr = typeof (row as { user?: { toString?: () => string } } | undefined)?.user?.toString === 'function' ? (row as { user: { toString: () => string } }).user.toString() : ((row as { user?: unknown } | undefined)?.user ? String((row as { user?: unknown }).user) : '');
    const nm: string | undefined = typeof (row as { userName?: unknown } | undefined)?.userName === 'string' ? (row as { userName: string }).userName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    const safeName = (!nm || looksEmail) ? (nameMap.get(ridStr) || 'Member') : nm;
    return {
      id: (row as { id?: { id?: unknown; toString?: () => string } | string } | undefined)?.id && typeof (row as { id?: { id?: unknown; toString?: () => string } | string }).id !== 'string' && typeof ((row as { id: { toString?: () => string } }).id as { toString?: () => string } | undefined)?.toString === 'function'
        ? ((row as { id: { toString: () => string } }).id.toString())
        : (row as { id?: string } | undefined)?.id,
      text: (row as { text?: unknown } | undefined)?.text,
      channel: (row as { channel?: unknown } | undefined)?.channel,
      created_at: (row as { created_at?: unknown } | undefined)?.created_at,
      userEmail: (row as { userEmail?: unknown } | undefined)?.userEmail,
      userName: safeName,
    };
  });
  // Return oldest->newest order for UI
  const normalized = normalizedDesc.slice().reverse();
  return NextResponse.json({ messages: normalized });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const channel: string = (body as { channel?: string } | undefined)?.channel || "general";
  const rawText: string = (body as { text?: string } | undefined)?.text || "";
  const text = String(rawText).trim();
  if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Too long" }, { status: 400 });
  const db = await getSurreal();
  await ensureIndexes();

  // Enforce channel write permissions and lock state
  try {
    const cres = await db.query("SELECT * FROM channel WHERE slug = $slug LIMIT 1;", { slug: channel });
    const crow: (ChannelLike & { locked?: boolean; locked_until?: string }) | null = Array.isArray(cres) && Array.isArray(cres[0]) ? ((cres[0][0] as unknown as ChannelLike & { locked?: boolean; locked_until?: string }) || null) : null;
    if (crow) {
      const lite = {
        email: session.user.email,
        role: ((session.user as { role?: Role } | undefined)?.role) ?? "user",
        plan: ((session.user as { plan?: Plan } | undefined)?.plan) ?? null,
      };
      if (!checkChannelWrite(lite, crow)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // If channel is locked (either permanently or until a future time), block non-admins
      const lockedFlag = !!(crow as { locked?: boolean } | undefined)?.locked;
      const lockedUntil = (crow as { locked_until?: string } | undefined)?.locked_until;
      let isLocked = lockedFlag;
      if (!isLocked && typeof lockedUntil === "string") {
        const ts = Date.parse(lockedUntil);
        if (Number.isFinite(ts) && ts > Date.now()) isLocked = true;
      }
      if (isLocked && lite.role !== "admin") {
        return NextResponse.json({ error: "Channel is locked" }, { status: 403 });
      }
    }
  } catch {}

  // basic spam heuristic: long repeated character runs
  function longestRunLength(s: string): number {
    let maxRun = 0;
    let current = 0;
    let last = "\u0000";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === last) current++; else { last = ch; current = 1; }
      if (current > maxRun) maxRun = current;
    }
    return maxRun;
  }
  if (longestRunLength(text) > 20) {
    return NextResponse.json({ error: "Looks spammy" }, { status: 400 });
  }

  // Enforce mutes: check if the user is muted globally or for this channel, and not expired
  const _nowIso = new Date().toISOString();
  const muteRes = await db.query(
    "SELECT id, channels, expires_at FROM mute WHERE targetEmail = $email;",
    { email: session.user.email }
  );
  const mutedRows = Array.isArray(muteRes) && Array.isArray(muteRes[0]) ? (muteRes[0] as Array<Record<string, unknown>>) : [];
  const isMuted = mutedRows.some((m: Record<string, unknown>) => {
    const exp = (m as { expires_at?: string } | undefined)?.expires_at ? Date.parse((m as { expires_at?: string }).expires_at as string) : NaN;
    if (Number.isFinite(exp) && exp < Date.now()) return false; // expired
    const chans: string[] | null = Array.isArray((m as { channels?: unknown[] } | undefined)?.channels) ? (m as { channels?: string[] }).channels as string[] : null;
    if (!chans || chans.length === 0) return true; // global mute
    return chans.includes(channel);
  });
  if (isMuted) {
    return NextResponse.json({ error: "You are muted and cannot send messages." }, { status: 403 });
  }

  // Rate limit: max 12 channel messages in 30s across channels
  const since30 = new Date(Date.now() - 30_000).toISOString();
  const rl = await db.query(
    "SELECT count() AS c FROM message WHERE userEmail = $email AND created_at >= $since;",
    { email: session.user.email, since: since30 }
  );
  const c = Array.isArray(rl) && Array.isArray(rl[0]) ? (rl[0][0]?.c as number) : 0;
  if ((c || 0) >= 12) {
    return NextResponse.json({ error: "Too many messages, slow down" }, { status: 429 });
  }

  // Duplicate check per-channel within 30s
  const dupRes = await db.query(
    "SELECT text, created_at FROM message WHERE channel = $channel AND userEmail = $email ORDER BY created_at DESC LIMIT 1;",
    { channel, email: session.user.email }
  );
  const last = Array.isArray(dupRes) && Array.isArray(dupRes[0]) ? (dupRes[0][0] as Record<string, unknown>) : null;
  if (last && typeof last.text === "string") {
    const same = last.text.trim() === text;
    const lastCreatedAt = typeof (last as { created_at?: unknown }).created_at === "string" ? (last as { created_at: string }).created_at : "";
    const lastTs = Date.parse(lastCreatedAt);
    if (same && isFinite(lastTs) && Date.now() - lastTs < 30_000) {
      return NextResponse.json({ error: "Duplicate message" }, { status: 409 });
    }
  }

  // Find the user's RecordId to link from message.user
  const ures = await db.query("SELECT id, name FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as Record<string, unknown>) : null;
  const rid = urow?.id as RecordId<"user"> | string | undefined;
  // Prefer Instagram username, then user.name, then session name, never email
  let igName: string | undefined;
  try {
    if (rid) {
      const ridObj = rid instanceof RecordId ? rid : new RecordId("user", String(rid));
      const igres = await db.query("SELECT username FROM instagram_account WHERE user = $u LIMIT 1;", { u: ridObj });
      const igrow = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0][0] as Record<string, unknown>) : null;
      igName = (igrow as { username?: string } | undefined)?.username;
    }
  } catch {}
  const userName = igName || (urow?.name as string | undefined) || (session.user.name as string | undefined) || "Member";

  const created = await db.create("message", {
    channel,
    text,
    user: rid,
    userEmail: session.user.email,
    userName,
    created_at: new Date().toISOString(),
  });
  const row = Array.isArray(created) ? created[0] : created;
  try {
    // fire-and-forget XP reward for chat message
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/xp`, { method: "POST", body: JSON.stringify({ reason: "chat-message" }) });
  } catch {}
  return NextResponse.json({ message: { ...row, userName } });
}


