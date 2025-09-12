import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const body = await request.json().catch(() => ({}));
  const requestIdRaw: unknown = (body as { requestId?: unknown }).requestId;
  const stanceRaw: unknown = (body as { stance?: unknown }).stance;
  const requestId = String(requestIdRaw || '').trim();
  const stance = String(stanceRaw || '').toLowerCase();
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  if (stance !== 'up' && stance !== 'down') return NextResponse.json({ error: "Invalid stance" }, { status: 400 });

  // Upsert vote (unique on request+userEmail)
  // Use Surreal SQL: delete existing then insert new to avoid permission headaches
  await db.query("DELETE feature_vote WHERE request = $rid AND userEmail = $email;", { rid: requestId, email: session.user.email });
  await db.create("feature_vote", {
    request: requestId,
    userEmail: session.user.email,
    stance,
    created_at: new Date().toISOString(),
  });

  // Return new counts
  const res = await db.query(
    "SELECT stance, count() AS c FROM feature_vote WHERE request = $rid GROUP BY stance;",
    { rid: requestId }
  );
  const rows: Array<{ stance?: string; c?: number }> = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ stance?: string; c?: number }>) : [];
  let up = 0, down = 0;
  for (const r of rows) {
    const s = (r?.stance || '').toLowerCase();
    if (s === 'up' || s === 'wanted') up += Number(r?.c || 0);
    if (s === 'down' || s === 'not_wanted') down += Number(r?.c || 0);
  }
  return NextResponse.json({ wanted: up, notWanted: down, myVote: stance });
}


