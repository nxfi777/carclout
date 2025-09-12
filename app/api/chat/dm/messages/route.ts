import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { RecordId } from "surrealdb";

let dmIndexesEnsured = false;
async function ensureDmIndexes() {
  if (dmIndexesEnsured) return;
  try {
    const db = await getSurreal();
    await db.query(
      "DEFINE INDEX idx_dm_message_key_created_at ON TABLE dm_message FIELDS dmKey, created_at;"
    );
    await db.query(
      "DEFINE INDEX idx_dm_message_sender_time ON TABLE dm_message FIELDS senderEmail, created_at;"
    );
  } catch {
  } finally {
    dmIndexesEnsured = true;
  }
}

function makeDmKey(aEmail: string, bEmail: string) {
  const a = String(aEmail || "").toLowerCase();
  const b = String(bEmail || "").toLowerCase();
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function longestRunLength(s: string): number {
  let maxRun = 0;
  let current = 0;
  let last = "\u0000";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === last) {
      current++;
    } else {
      last = ch;
      current = 1;
    }
    if (current > maxRun) maxRun = current;
  }
  return maxRun;
}

export async function GET(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const other = searchParams.get("user") || "";
  if (!other) return NextResponse.json({ error: "Missing user" }, { status: 400 });

  const me = session.user.email;
  const key = makeDmKey(me, other);
  const db = await getSurreal();
  await ensureDmIndexes();

  // TTL logic: by default 24h unless self-DM, which never expires; user-configurable via user.dm_ttl_seconds
  let ttlSeconds = 24 * 60 * 60;
  try {
    const sres = await db.query("SELECT dm_ttl_seconds FROM user WHERE email = $me LIMIT 1;", { me });
    const srow = Array.isArray(sres) && Array.isArray(sres[0]) ? (sres[0][0] as { dm_ttl_seconds?: number } | null) : null;
    if (typeof srow?.dm_ttl_seconds === 'number' && Number.isFinite(srow.dm_ttl_seconds)) {
      ttlSeconds = Math.max(0, Math.floor(srow.dm_ttl_seconds));
    }
  } catch {}
  const isSelf = String(me).toLowerCase() === String(other).toLowerCase();
  const cutoffIso = (() => {
    if (isSelf) return null; // self-DM never expires
    if (ttlSeconds <= 0) return null; // 0 = never expire per user's setting
    const cutoffMs = Date.now() - ttlSeconds * 1000;
    return new Date(cutoffMs).toISOString();
  })();

  // Purge-on-read: delete expired messages for this DM key (never purge self-DM)
  if (!isSelf && cutoffIso) {
    try {
      await db.query(
        "DELETE dm_message WHERE dmKey = $key AND senderEmail != recipientEmail AND created_at < $cutoff;",
        { key, cutoff: cutoffIso }
      );
    } catch {}
  }

  const res = await db.query(
    `SELECT id, dmKey, text, created_at, senderEmail, senderName, recipientEmail, sender
     FROM dm_message
     WHERE dmKey = $key
       AND senderEmail NOT IN (SELECT targetEmail FROM block WHERE userEmail = $me)
       AND ($cutoff IS NONE OR created_at >= $cutoff)
     ORDER BY created_at DESC
     LIMIT 200;`,
    { key, me, cutoff: cutoffIso }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
  // Build display name map for rows missing a safe senderName (or containing an email)
  const needIds: Array<unknown> = [];
  for (const r of rows) {
    const nm: string | undefined = typeof (r as { senderName?: unknown })?.senderName === 'string' ? (r as { senderName?: string }).senderName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    if (!nm || looksEmail) {
      const sender = (r as { sender?: unknown })?.sender;
      if (sender) needIds.push(sender);
    }
  }
  const idStrings = new Set<string>();
  const ids: Array<unknown> = [];
  for (const u of needIds) {
    try {
      const k = typeof (u as { toString?: () => string })?.toString === 'function' ? (u as { toString: () => string }).toString() : String(u);
      if (!idStrings.has(k)) { idStrings.add(k); ids.push(u); }
    } catch {}
  }
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const ures = await db.query("SELECT id, name FROM user WHERE id IN $ids;", { ids });
      const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<{ id?: unknown; name?: string }>) : [];
      for (const u of urows) {
        const key = typeof (u?.id as { toString?: () => string })?.toString === 'function' ? (u!.id as { toString: () => string }).toString() : String(u?.id);
        if (key) nameMap.set(key, (u?.name as string | undefined) || 'Member');
      }
    } catch {}
    try {
      const igres = await db.query("SELECT user, username FROM instagram_account WHERE user IN $ids;", { ids });
      const igrows = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0] as Array<{ user?: unknown; username?: string }>) : [];
      for (const ig of igrows) {
        const key = typeof (ig?.user as { toString?: () => string })?.toString === 'function' ? (ig!.user as { toString: () => string }).toString() : String(ig?.user);
        if (key && ig?.username) nameMap.set(key, ig.username as string);
      }
    } catch {}
  }
  const messagesDesc = rows.map((row) => {
    const rid = (row as { sender?: unknown })?.sender as { toString?: () => string } | string | undefined;
    const ridStr = typeof rid === 'object' && typeof rid?.toString === 'function' ? rid.toString() : (rid ? String(rid) : '');
    const nm: string | undefined = typeof (row as { senderName?: unknown })?.senderName === 'string' ? (row as { senderName?: string }).senderName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    const safeName = (!nm || looksEmail) ? (nameMap.get(ridStr) || 'Member') : nm;
    return {
      id: (row as { id?: { id?: { toString?: () => string }; toString?: () => string } | string })?.id && typeof (row as { id?: unknown })?.id === 'object'
        ? ((row as { id?: { id?: { toString?: () => string }; toString?: () => string } }).id!.id?.toString?.() || (row as { id?: { toString?: () => string } }).id!.toString?.())
        : (row as { id?: string }).id,
      text: (row as { text?: string }).text,
      userName: safeName,
      userEmail: (row as { senderEmail?: string }).senderEmail,
      created_at: (row as { created_at?: string }).created_at,
    };
  });
  const messages = messagesDesc.slice().reverse();
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const targetEmail: string = body?.targetEmail || "";
  const textRaw: string = body?.text || "";
  const text = String(textRaw).trim();
  if (!targetEmail) return NextResponse.json({ error: "Missing targetEmail" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Too long" }, { status: 400 });
  if (longestRunLength(text) > 20) return NextResponse.json({ error: "Looks spammy" }, { status: 400 });

  const meEmail = session.user.email;
  const key = makeDmKey(meEmail, targetEmail);

  const db = await getSurreal();
  await ensureDmIndexes();

  // Rate limit: max 8 DM messages in 30s per sender
  const since30 = new Date(Date.now() - 30_000).toISOString();
  const rateRes = await db.query(
    "SELECT count() AS c FROM dm_message WHERE senderEmail = $email AND created_at >= $since;",
    { email: meEmail, since: since30 }
  );
  const rateCount = Array.isArray(rateRes) && Array.isArray(rateRes[0]) ? (rateRes[0][0]?.c as number) : 0;
  if ((rateCount || 0) >= 8) {
    return NextResponse.json({ error: "Too many messages, slow down" }, { status: 429 });
  }

  // Duplicate message check: reject if last message in this DM is identical within 30s
  const dupRes = await db.query(
    "SELECT text, created_at FROM dm_message WHERE dmKey = $key AND senderEmail = $email ORDER BY created_at DESC LIMIT 1;",
    { key, email: meEmail }
  );
  const last = Array.isArray(dupRes) && Array.isArray(dupRes[0]) ? (dupRes[0][0] as { text?: string; created_at?: string } | null) : null;
  if (last && typeof last.text === "string") {
    const same = last.text.trim() === text;
    const lastTs = Date.parse(last.created_at || "");
    if (same && isFinite(lastTs) && Date.now() - lastTs < 30_000) {
      return NextResponse.json({ error: "Duplicate message" }, { status: 409 });
    }
  }

  // Find sender's RecordId to link
  const ures = await db.query("SELECT id, name FROM user WHERE email = $email LIMIT 1;", { email: meEmail });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown; name?: string } | null) : null;
  const rid = urow?.id as RecordId<"user"> | string | undefined;
  // Prefer Instagram username, then user.name, then session name, never email
  let igName: string | undefined;
  try {
    if (rid) {
      const ridObj = rid instanceof RecordId ? rid : new RecordId("user", String(rid));
      const igres = await db.query("SELECT username FROM instagram_account WHERE user = $u LIMIT 1;", { u: ridObj });
      const igrow = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0][0] as { username?: string } | null) : null;
      igName = igrow?.username;
    }
  } catch {}
  const senderName = igName || (urow?.name as string | undefined) || (session.user.name as string | undefined) || "Member";

  const created = await db.create("dm_message", {
    dmKey: key,
    text,
    sender: rid,
    senderEmail: meEmail,
    senderName,
    recipientEmail: targetEmail,
    created_at: new Date().toISOString(),
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ message: { ...row, userName: senderName } });
}


