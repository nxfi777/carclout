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

  const res = await db.query(
    `SELECT id, dmKey, text, created_at, senderEmail, senderName, recipientEmail, sender
     FROM dm_message
     WHERE dmKey = $key
       AND senderEmail NOT IN (SELECT targetEmail FROM block WHERE userEmail = $me)
     ORDER BY created_at DESC
     LIMIT 200;`,
    { key, me }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  // Build display name map for rows missing a safe senderName (or containing an email)
  const needIds: any[] = [];
  for (const r of rows) {
    const nm: string | undefined = typeof r?.senderName === 'string' ? r.senderName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    if (!nm || looksEmail) {
      if (r?.sender) needIds.push(r.sender);
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
  const messagesDesc = rows.map((row: any) => {
    const ridStr = typeof row?.sender?.toString === 'function' ? row.sender.toString() : (row?.sender ? String(row.sender) : '');
    const nm: string | undefined = typeof row?.senderName === 'string' ? row.senderName : undefined;
    const looksEmail = typeof nm === 'string' && /@/.test(nm);
    const safeName = (!nm || looksEmail) ? (nameMap.get(ridStr) || 'Member') : nm;
    return {
      id: row?.id?.id?.toString?.() || row?.id,
      text: row?.text,
      userName: safeName,
      userEmail: row?.senderEmail,
      created_at: row?.created_at,
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
  const last = Array.isArray(dupRes) && Array.isArray(dupRes[0]) ? (dupRes[0][0] as any) : null;
  if (last && typeof last.text === "string") {
    const same = last.text.trim() === text;
    const lastTs = Date.parse(last.created_at || 0);
    if (same && isFinite(lastTs) && Date.now() - lastTs < 30_000) {
      return NextResponse.json({ error: "Duplicate message" }, { status: 409 });
    }
  }

  // Find sender's RecordId to link
  const ures = await db.query("SELECT id, name FROM user WHERE email = $email LIMIT 1;", { email: meEmail });
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


