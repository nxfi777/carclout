import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role || "user";
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const channelRaw: unknown = body?.channel;
  const slug = (typeof channelRaw === "string" ? channelRaw : "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Missing channel" }, { status: 400 });

  const db = await getSurreal();
  const res = await db.query(
    `UPDATE channel SET locked = false, locked_until = NULL WHERE slug = $slug RETURN AFTER;`,
    { slug }
  );
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ channel: row });
}


