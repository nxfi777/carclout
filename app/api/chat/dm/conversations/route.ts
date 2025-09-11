import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth().catch(() => null);
  const me = session?.user?.email as string | undefined;
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getSurreal();
  // Load self profile from DB to ensure latest name/image like the header
  const selfRes = await db.query("SELECT email, name, image FROM user WHERE email = $me LIMIT 1;", { me });
  const selfRow = Array.isArray(selfRes) && Array.isArray(selfRes[0]) ? (selfRes[0][0] as { name?: string; image?: string } | null) : null;
  const selfName = (selfRow?.name as string | undefined) || (session?.user?.name as string | undefined) || me;
  const selfImage = (selfRow?.image as string | undefined) || (session?.user?.image as string | undefined) || null;
  const res = await db.query(
    "SELECT id, dmKey, text, created_at, senderEmail, recipientEmail FROM dm_message WHERE senderEmail = $me OR recipientEmail = $me ORDER BY created_at DESC LIMIT 500;",
    { me }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ senderEmail?: string; recipientEmail?: string }>) : [];
  const byOther = new Map<string, { senderEmail?: string; recipientEmail?: string }>();
  for (const r of rows) {
    const other = r?.senderEmail === me ? r?.recipientEmail : r?.senderEmail;
    if (!other) continue;
    if (!byOther.has(other)) {
      byOther.set(other, r);
    }
  }
  const others = Array.from(byOther.keys());
  if (others.length === 0) {
    return NextResponse.json({ conversations: [{ email: me, name: selfName, image: selfImage }] });
  }

  const ures = await db.query("SELECT email, name, image FROM user WHERE email IN $emails;", { emails: others });
  const urows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<{ email?: string; name?: string; image?: string }>) : [];
  const info = new Map<string, { email: string; name?: string; image?: string }>();
  for (const u of urows) {
    if (u?.email) info.set(u.email, { email: u.email, name: u?.name, image: u?.image });
  }
  const conversations = others.map((email) => {
    const fallback = { email, name: email, image: undefined } as { email: string; name?: string; image?: string };
    return info.get(email) || fallback;
  });
  // Ensure self chat is present at top
  conversations.unshift({ email: me, name: selfName, image: selfImage || undefined });
  return NextResponse.json({ conversations });
}


