import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any)?.role || "user";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({} as any));
  const channelRaw: unknown = body?.channel;
  const minutesRaw: unknown = body?.minutes;
  const slug = (typeof channelRaw === "string" ? channelRaw : "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Missing channel" }, { status: 400 });

  let minutes: number | null = null;
  if (typeof minutesRaw === "number" && Number.isFinite(minutesRaw)) minutes = Math.max(1, Math.floor(minutesRaw));
  if (typeof minutesRaw === "string" && /\d+/.test(minutesRaw)) minutes = Math.max(1, parseInt(minutesRaw, 10));

  const db = await getSurreal();
  let until: string | null = null;
  if (minutes && minutes > 0) {
    until = new Date(Date.now() + minutes * 60_000).toISOString();
  }

  // For timed lock we rely on locked_until being in the future; for indefinite lock set locked=true and locked_until=null
  const locked = until ? false : true;
  const res = await db.query(
    `UPDATE channel SET locked = $locked, locked_until = $until WHERE slug = $slug RETURN AFTER;`,
    { slug, locked, until }
  );
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ channel: row });
}


