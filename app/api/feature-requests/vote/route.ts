import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  // Ensure uniqueness on (request, userEmail)
  try {
    await db.query("DEFINE INDEX idx_feature_vote_unique ON TABLE feature_vote FIELDS request, userEmail UNIQUE;");
  } catch {}
  const body = await request.json().catch(() => ({}));
  const requestIdRaw: unknown = (body as { requestId?: unknown }).requestId;
  const stanceRaw: unknown = (body as { stance?: unknown }).stance;
  const requestId = String(requestIdRaw || '').trim();
  const stance = String(stanceRaw || '').toLowerCase();
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  if (stance !== 'up' && stance !== 'down') return NextResponse.json({ error: "Invalid stance" }, { status: 400 });

  // Upsert vote (unique on request+userEmail)
  // Use Surreal SQL: delete existing then insert new to avoid permission headaches
  // Normalize request id as RecordId to avoid string/RecordId mismatch
  let rid: RecordId<"feature_request"> | string = requestId;
  try {
    if (requestId.includes(":")) {
      const parts = requestId.split(":");
      const table = (parts[0] || '').trim();
      const idPart = parts.slice(1).join(":");
      if (table === 'feature_request') {
        rid = new RecordId('feature_request', idPart);
      }
    } else {
      rid = new RecordId('feature_request', requestId);
    }
  } catch {}

  const createdIso = new Date().toISOString();
  await db.query(
    `DELETE feature_vote WHERE request = $rid AND userEmail = $email;\nCREATE feature_vote SET request = $rid, userEmail = $email, stance = $stance, created_at = d"${createdIso}";`,
    { rid, email: session.user.email, stance }
  );

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


