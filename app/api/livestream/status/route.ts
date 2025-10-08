import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { retryOnConflict } from "@/lib/retry";

const CALL_ID = "carclout-global";

export async function GET() {
  const db = await getSurreal();
  try {
    const res = await db.query("SELECT * FROM livestream_status WHERE callId = $callId LIMIT 1;", { callId: CALL_ID });
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
    return NextResponse.json({
      isLive: !!(row as { isLive?: unknown })?.isLive,
      updated_at: (row as { updated_at?: unknown })?.updated_at || null,
      sessionSlug: (row as { sessionSlug?: unknown })?.sessionSlug || null,
      started_at: (row as { started_at?: unknown })?.started_at || null,
      ended_at: (row as { ended_at?: unknown })?.ended_at || null,
    });
  } catch {
    return NextResponse.json({ isLive: false });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const isLive = !!body?.isLive;

  // Only admins or cohosts can update
  if (user.role !== 'admin') {
    const db = await getSurreal();
    const cres = await db.query("SELECT * FROM cohost WHERE userEmail = $email LIMIT 1;", { email: user.email });
    const crow = Array.isArray(cres) && Array.isArray(cres[0]) ? (cres[0][0] as Record<string, unknown>) : null;
    if (!crow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = await getSurreal();
  const nowIso = new Date().toISOString();
  
  const result = await retryOnConflict(async () => {
    // Check existing status by callId
    const sel = await db.query("SELECT * FROM livestream_status WHERE callId = $callId LIMIT 1;", { callId: CALL_ID });
    const existing = Array.isArray(sel) && Array.isArray(sel[0]) ? (sel[0][0] as Record<string, unknown>) : null;
    let sessionSlug = (existing as { sessionSlug?: string })?.sessionSlug as string | undefined;
    if (isLive) {
      // Starting or continuing a live session
      if (!existing || !(existing as { isLive?: unknown })?.isLive) {
        sessionSlug = `livestream-${Date.now()}`;
        await db.create('livestream_status', { callId: CALL_ID, isLive: true, sessionSlug, started_at: `d\"${nowIso}\"`, updated_at: `d\"${nowIso}\"` });
      } else {
        await db.query("UPDATE livestream_status SET isLive = true, updated_at = d\"" + nowIso + "\" WHERE callId = $callId;", { callId: CALL_ID });
      }
    } else {
      // Stopping live
      if (existing) {
        await db.query("UPDATE livestream_status SET isLive = false, ended_at = d\"" + nowIso + "\", updated_at = d\"" + nowIso + "\" WHERE callId = $callId;", { callId: CALL_ID });
      } else {
        await db.create('livestream_status', { callId: CALL_ID, isLive: false, updated_at: `d\"${nowIso}\"` });
      }
    }
    return sessionSlug;
  }, { context: 'Livestream status update' });
  
  return NextResponse.json({ ok: true, sessionSlug: result || null });
}


