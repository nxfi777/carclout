import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any)?.role || "user";
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as any));
  const channelRaw: unknown = body?.channel;
  const limitRaw: unknown = body?.limit;
  const channel = (typeof channelRaw === "string" && channelRaw.trim()) ? channelRaw.trim() : "general";
  let limit = 10;
  if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) limit = Math.floor(limitRaw);
  if (typeof limitRaw === "string" && /\d+/.test(limitRaw)) limit = parseInt(limitRaw, 10);
  if (limit < 1) limit = 1;
  if (limit > 500) limit = 500;

  const db = await getSurreal();
  const res = await db.query(
    "SELECT id, created_at FROM message WHERE channel = $c ORDER BY created_at DESC LIMIT $l;",
    { c: channel, l: limit }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const ids = rows.map((r: any) => r?.id).filter(Boolean);

  let purged = 0;
  if (ids.length > 0) {
    const results = await Promise.all(
      ids.map(async (rid: any) => {
        try {
          await db.delete(rid);
          return true;
        } catch {
          return false;
        }
      })
    );
    purged = results.filter(Boolean).length;
  }

  return NextResponse.json({ ok: true, purged });
}


