import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { sanitizeUserId } from "@/lib/user";
import { RecordId } from "surrealdb";

const ALLOWED_ATTACHMENT_ROOTS = new Set(["chat-uploads", "car-photos", "vehicles", "library"]);

function normalizeAttachmentKey(raw: unknown, email: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/^\/+/u, "");
  if (!cleaned || cleaned.includes("..")) return null;
  const safeUser = sanitizeUserId(email);
  const prefix = `users/${safeUser}/`;
  if (!cleaned.startsWith(prefix)) return null;
  const remainder = cleaned.slice(prefix.length);
  const topFolder = remainder.split("/")[0] || "";
  if (!ALLOWED_ATTACHMENT_ROOTS.has(topFolder)) return null;
  return cleaned;
}

function normalizeAttachmentKeys(raw: unknown, email: string): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = normalizeAttachmentKey(item, email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 6) break;
  }
  return out;
}

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
  
  // Check if user has Pro plan (community access required)
  const userPlan = (session.user as { plan?: string })?.plan;
  const canonicalPlan = ((p: string | null | undefined): 'base' | 'ultra' | null => {
    const s = (p || '').toLowerCase();
    if (s === 'ultra' || s === 'pro') return 'ultra';
    if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
    return null;
  })(userPlan);
  if (canonicalPlan !== 'ultra' && (session.user as { role?: string })?.role !== 'admin') {
    return NextResponse.json({ error: "Pro plan required for community access" }, { status: 403 });
  }
  
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
    `SELECT id, dmKey, text, created_at, senderEmail, senderName, recipientEmail, sender, attachments
     FROM dm_message
     WHERE dmKey = $key
       AND senderEmail NOT IN (SELECT targetEmail FROM block WHERE userEmail = $me)
       AND ($cutoff IS NONE OR created_at >= $cutoff)
     ORDER BY created_at DESC
     LIMIT 200;`,
    { key, me, cutoff: cutoffIso }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
  // Build display name map for ALL rows so changes propagate instantly
  const allRefs: Array<unknown> = [];
  for (const r of rows) { const sender = (r as { sender?: unknown })?.sender; if (sender) allRefs.push(sender); }
  const idStrings = new Set<string>();
  const ids: Array<unknown> = [];
  for (const u of allRefs) {
    try {
      const k = typeof (u as { toString?: () => string })?.toString === 'function' ? (u as { toString: () => string }).toString() : String(u);
      if (!idStrings.has(k)) { idStrings.add(k); ids.push(u); }
    } catch {}
  }
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const ures = await db.query("SELECT id, displayName, name FROM user WHERE id IN $ids;", { ids });
      const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<{ id?: unknown; displayName?: string; name?: string }>) : [];
      for (const u of urows) {
        const key = typeof (u?.id as { toString?: () => string })?.toString === 'function' ? (u!.id as { toString: () => string }).toString() : String(u?.id);
        const dn = (u?.displayName as string | undefined);
        const nm = (typeof dn === 'string' && dn.trim().length > 0) ? dn : (u?.name as string | undefined);
        if (key) nameMap.set(key, nm || 'Member');
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
    const fromMap = nameMap.get(ridStr);
    const safeName = fromMap || ((!nm || looksEmail) ? 'Member' : nm);
    const attachmentsRaw = Array.isArray((row as { attachments?: unknown })?.attachments)
      ? ((row as { attachments?: unknown }).attachments as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    return {
      id: (row as { id?: { id?: { toString?: () => string }; toString?: () => string } | string })?.id && typeof (row as { id?: unknown })?.id === 'object'
        ? ((row as { id?: { id?: { toString?: () => string }; toString?: () => string } }).id!.id?.toString?.() || (row as { id?: { toString?: () => string } }).id!.toString?.())
        : (row as { id?: string }).id,
      text: (row as { text?: string }).text,
      userName: safeName,
      userEmail: (row as { senderEmail?: string }).senderEmail,
      created_at: (row as { created_at?: string }).created_at,
      attachments: attachmentsRaw.slice(0, 6),
    };
  });
  const messages = messagesDesc.slice().reverse();
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  // Check if user has Pro plan (community access required)
  const userPlan = (session.user as { plan?: string })?.plan;
  const canonicalPlan = ((p: string | null | undefined): 'base' | 'ultra' | null => {
    const s = (p || '').toLowerCase();
    if (s === 'ultra' || s === 'pro') return 'ultra';
    if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
    return null;
  })(userPlan);
  if (canonicalPlan !== 'ultra' && (session.user as { role?: string })?.role !== 'admin') {
    return NextResponse.json({ error: "Pro plan required for community access" }, { status: 403 });
  }
  
  const body = await request.json();
  const targetEmail: string = body?.targetEmail || "";
  const textRaw: string = body?.text || "";
  const text = String(textRaw).trim();
  const meEmail = session.user.email;
  const attachments = normalizeAttachmentKeys(body?.attachments, meEmail);
  if (!targetEmail) return NextResponse.json({ error: "Missing targetEmail" }, { status: 400 });
  if (!text && attachments.length === 0) return NextResponse.json({ error: "Empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Too long" }, { status: 400 });
  if (longestRunLength(text) > 20) return NextResponse.json({ error: "Looks spammy" }, { status: 400 });
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
    "SELECT text, created_at, attachments FROM dm_message WHERE dmKey = $key AND senderEmail = $email ORDER BY created_at DESC LIMIT 1;",
    { key, email: meEmail }
  );
  const last = Array.isArray(dupRes) && Array.isArray(dupRes[0]) ? (dupRes[0][0] as { text?: string; created_at?: string; attachments?: unknown[] } | null) : null;
  if (last && typeof last.text === "string") {
    const same = last.text.trim() === text;
    const lastTs = Date.parse(last.created_at || "");
    const lastAttachments = Array.isArray(last?.attachments)
      ? (last.attachments as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const sameAttachments = lastAttachments.length === attachments.length && lastAttachments.every((keyVal, i) => keyVal === attachments[i]);
    if (same && sameAttachments && isFinite(lastTs) && Date.now() - lastTs < 30_000) {
      return NextResponse.json({ error: "Duplicate message" }, { status: 409 });
    }
  }

  // Find sender's RecordId to link
  const ures = await db.query("SELECT id, displayName, name FROM user WHERE email = $email LIMIT 1;", { email: meEmail });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown; displayName?: string; name?: string } | null) : null;
  const rid = urow?.id as RecordId<"user"> | string | undefined;
  // Prefer displayName, then handle (user.name), then session name; ignore email
  let igName: string | undefined;
  try {
    if (rid) {
      const ridObj = rid instanceof RecordId ? rid : new RecordId("user", String(rid));
      const igres = await db.query("SELECT username FROM instagram_account WHERE user = $u LIMIT 1;", { u: ridObj });
      const igrow = Array.isArray(igres) && Array.isArray(igres[0]) ? (igres[0][0] as { username?: string } | null) : null;
      igName = igrow?.username;
    }
  } catch {}
  const dn = urow?.displayName;
  const senderName = (typeof dn === 'string' && dn.trim().length > 0 ? dn : (urow?.name as string | undefined)) || igName || (session.user.name as string | undefined) || "Member";

  const senderRid = rid instanceof RecordId ? rid : (rid ? new RecordId("user", String(rid)) : undefined);
  const created = await db.create("dm_message", {
    dmKey: key,
    text,
    sender: senderRid,
    senderEmail: meEmail,
    senderName,
    recipientEmail: targetEmail,
    created_at: new Date().toISOString(),
    attachments,
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ message: { ...row, userName: senderName } });
}


