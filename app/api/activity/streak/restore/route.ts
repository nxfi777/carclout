import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { STREAK_RESTORE_CREDITS_PER_DAY, getUserRecordIdByEmail, requireAndReserveCredits } from "@/lib/credits";

type ActivityRow = { day?: string };

function formatDayKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST() {
  const session = await auth();
  const email = session?.user?.email || "";
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getSurreal();
  const rid = await getUserRecordIdByEmail(email);
  if (!rid) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Load recent activity days (last 30 days)
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 29);
  const startKey = formatDayKey(start);
  const endKey = formatDayKey(end);
  const q = await db.query("SELECT day FROM activity WHERE user = $rid AND day >= $start AND day <= $end ORDER BY day ASC;", { rid, start: startKey, end: endKey });
  const rows = Array.isArray(q) && Array.isArray(q[0]) ? (q[0] as ActivityRow[]) : [];
  const activeSet = new Set(rows.map((r) => String(r.day || "")));

  // Build the ordered list of the last 30 days
  const days: Array<{ key: string; active: boolean }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = formatDayKey(d);
    days.push({ key, active: activeSet.has(key) });
  }

  // Identify segments: [prevActive][gap][currentActive] from right (today) backwards
  // Step 1: trailing current active length
  let i = days.length - 1;
  let currentStreakLen = 0;
  while (i >= 0 && days[i].active) { currentStreakLen += 1; i -= 1; }
  const trailingStartIdx = i + 1; // start index of current trailing active segment (may equal days.length)

  // Step 2: gap length (consecutive inactive days before trailing active)
  let gapEndIdx = i;
  while (i >= 0 && !days[i].active) { i -= 1; }
  const gapStartIdx = i + 1;
  const gapLen = gapEndIdx >= gapStartIdx ? (gapEndIdx - gapStartIdx + 1) : 0;

  // Step 3: previous active length before the gap
  let prevStreakEndIdx = i;
  while (i >= 0 && days[i].active) { i -= 1; }
  const prevStreakStartIdx = i + 1;
  const prevStreakLen = prevStreakEndIdx >= prevStreakStartIdx ? (prevStreakEndIdx - prevStreakStartIdx + 1) : 0;

  // Must have a previous streak and a gap to bridge
  if (gapLen <= 0 || prevStreakLen <= 0) {
    return NextResponse.json({ error: "NOTHING_TO_RESTORE", message: "No recent break between streaks." }, { status: 400 });
  }

  // Restore only allowed within 7 days from the most recent missed day in the gap
  const daysSinceGapEnd = (days.length - 1) - gapEndIdx;
  if (daysSinceGapEnd > 7) {
    return NextResponse.json({ error: "RESTORE_WINDOW_ELAPSED" }, { status: 400 });
  }

  // Hide if user has already matched/exceeded prior streak without restore
  if (currentStreakLen >= prevStreakLen) {
    return NextResponse.json({ error: "NO_LONGER_NEEDED" }, { status: 400 });
  }

  const missedDays = gapLen;

  // Compute cost
  const cost = missedDays * STREAK_RESTORE_CREDITS_PER_DAY;

  // Ensure sufficient credits and charge (reserve)
  try {
    await requireAndReserveCredits(email, cost, `streak_restore:${missedDays}d`, null);
  } catch {
    return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }

  // Backfill activity ONLY for missed gap days to connect previous and current streaks
  const nowIso = new Date().toISOString();
  for (let idx = gapStartIdx; idx <= gapEndIdx; idx++) {
    const key = days[idx].key;
    const ares = await db.query("SELECT id FROM activity WHERE user = $rid AND day = $day LIMIT 1;", { rid, day: key });
    const arow = Array.isArray(ares) && Array.isArray(ares[0]) ? (ares[0][0] as { id?: unknown } | undefined) : undefined;
    if (arow?.id) {
      await db.query("UPDATE $rec SET active = true, updated_at = $now;", { rec: arow.id, now: nowIso });
    } else {
      await db.create("activity", { user: rid, day: key, active: true, created_at: nowIso });
    }
  }

  // Recompute resulting streak
  const rq = await db.query("SELECT day FROM activity WHERE user = $rid AND day >= $start AND day <= $end;", { rid, start: startKey, end: endKey });
  const rrows = Array.isArray(rq) && Array.isArray(rq[0]) ? (rq[0] as ActivityRow[]) : [];
  const rset = new Set(rrows.map((r) => String(r.day || "")));
  const daysAfter: Array<{ active: boolean }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = formatDayKey(d);
    daysAfter.push({ active: rset.has(key) });
  }
  let newStreak = 0;
  for (let idx = daysAfter.length - 1; idx >= 0; idx--) {
    if (daysAfter[idx].active) newStreak += 1; else break;
  }

  try { (globalThis as any).window?.dispatchEvent?.(new CustomEvent('streak-refresh')); } catch {}

  return NextResponse.json({ restored: true, missedDays, cost, newStreak, prevStreakLen, currentStreakLen });
}


