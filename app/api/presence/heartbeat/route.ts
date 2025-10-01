import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { retryOnConflict } from "@/lib/retry";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();

  const nowMs = Date.now();
  const res = await db.query("SELECT presence_updated_at FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ presence_updated_at?: string | null }>) : [];
  const lastIso = rows[0]?.presence_updated_at ?? null;
  const lastMs = lastIso ? Date.parse(lastIso as string) : NaN;
  const ageMs = isFinite(lastMs) ? nowMs - lastMs : Number.POSITIVE_INFINITY;

  const WINDOW_MS = 60_000;
  if (ageMs < WINDOW_MS) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - ageMs) / 1000));
    return new NextResponse(
      JSON.stringify({ ok: false, limited: true, retryAfter }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
    );
  }

  const now = new Date(nowMs).toISOString();
  await retryOnConflict(async () => {
    await db.query("UPDATE user SET presence_updated_at = $now, last_seen = $now WHERE email = $email;", { now, email: session.user.email });
  });
  return NextResponse.json({ ok: true, at: now });
}


