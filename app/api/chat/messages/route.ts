import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { checkChannelRead, checkChannelWrite, getSessionLite, type ChannelLike } from "@/lib/chatPerms";
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
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];

  // Build display name map for rows missing a safe userName (or containing an email)
  const needIds: any[] = [];
  for (const r of rows) {
    const nm: string | undefined = typeof r?.userName === 'string' ? r.userName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    if (!nm || looksEmail) {
      if (r?.user) needIds.push(r.user);
    }
  }
  const idStrings = new Set<string>();
  const ids: any[] = [];
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
      const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as any[]) : [];
      for (const u of urows) {
        const key = typeof u?.id?.toString === 'function' ? u.id.toString() : String(u?.id);
        if (key) nameMap.set(key, u?.name || 'Member');
      }
    } catch {}
    try {
      const igres = await db.query("SELECT user, username FROM instagram_account WHERE user IN $ids;", { ids });
      const igrows = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0] as any[]) : [];
      for (const ig of igrows) {
        const key = typeof ig?.user?.toString === 'function' ? ig.user.toString() : String(ig?.user);
        if (key && ig?.username) nameMap.set(key, ig.username);
      }
    } catch {}
  }

  const normalizedDesc = rows.map((row: any) => {
    const ridStr = typeof row?.user?.toString === 'function' ? row.user.toString() : (row?.user ? String(row.user) : '');
    const nm: string | undefined = typeof row?.userName === 'string' ? row.userName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    const safeName = (!nm || looksEmail) ? (nameMap.get(ridStr) || 'Member') : nm;
    return {
      id: row?.id?.id?.toString?.() || row?.id,
      text: row?.text,
      channel: row?.channel,
      created_at: row?.created_at,
    userEmail: row?.userEmail,
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
  const channel: string = body?.channel || "general";
  const rawText: string = body?.text || "";
  const text = String(rawText).trim();
  if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Too long" }, { status: 400 });
  const db = await getSurreal();
  await ensureIndexes();

  // Enforce channel write permissions and lock state
  try {
    const cres = await db.query("SELECT * FROM channel WHERE slug = $slug LIMIT 1;", { slug: channel });
    const crow: ChannelLike & { locked?: boolean; locked_until?: string } | null = Array.isArray(cres) && Array.isArray(cres[0]) ? ((cres[0][0] as any) || null) : null;
    if (crow) {
      const lite = {
        email: session.user.email,
        role: (session.user as any)?.role || "user",
        plan: (session.user as any)?.plan ?? null,
      };
      if (!checkChannelWrite(lite, crow)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // If channel is locked (either permanently or until a future time), block non-admins
      const lockedFlag = !!(crow as any)?.locked;
      const lockedUntil = (crow as any)?.locked_until;
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
  const nowIso = new Date().toISOString();
  const muteRes = await db.query(
    "SELECT id, channels, expires_at FROM mute WHERE targetEmail = $email;",
    { email: session.user.email }
  );
  const mutedRows = Array.isArray(muteRes) && Array.isArray(muteRes[0]) ? (muteRes[0] as any[]) : [];
  const isMuted = mutedRows.some((m: any) => {
    const exp = m?.expires_at ? Date.parse(m.expires_at) : NaN;
    if (Number.isFinite(exp) && exp < Date.now()) return false; // expired
    const chans: string[] | null = Array.isArray(m?.channels) ? m.channels : null;
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
  const last = Array.isArray(dupRes) && Array.isArray(dupRes[0]) ? (dupRes[0][0] as any) : null;
  if (last && typeof last.text === "string") {
    const same = last.text.trim() === text;
    const lastTs = Date.parse(last.created_at || 0);
    if (same && isFinite(lastTs) && Date.now() - lastTs < 30_000) {
      return NextResponse.json({ error: "Duplicate message" }, { status: 409 });
    }
  }

  // Find the user's RecordId to link from message.user
  const ures = await db.query("SELECT id, name FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as any) : null;
  const rid = urow?.id as RecordId<"user"> | string | undefined;
  // Prefer Instagram username, then user.name, then session name, never email
  let igName: string | undefined;
  try {
    if (rid) {
      const ridObj = rid instanceof RecordId ? rid : new RecordId("user", String(rid));
      const igres = await db.query("SELECT username FROM instagram_account WHERE user = $u LIMIT 1;", { u: ridObj });
      const igrow = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0][0] as any) : null;
      igName = igrow?.username;
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


