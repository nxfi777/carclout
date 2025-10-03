import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

function formatDayKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ streak: 0, atRisk: false, hoursUntilLoss: null }, { status: 401 });
  }

  const db = await getSurreal();
  const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown } | undefined) : undefined;
  const rid = urow?.id ?? null;

  if (!rid) {
    return NextResponse.json({ streak: 0, atRisk: false, hoursUntilLoss: null });
  }

  // Get last 30 days of activity
  const end = new Date();
  const endKey = formatDayKey(end);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 29);
  const startKey = formatDayKey(start);

  const q = await db.query("SELECT day FROM activity WHERE user = $rid AND day >= $start AND day <= $end;", { rid, start: startKey, end: endKey });
  const rows = Array.isArray(q) && Array.isArray(q[0]) ? (q[0] as Array<{ day?: string }>) : [];
  const activeDays = new Set(rows.map((r) => String(r.day || "")));

  // Build days array
  const days = [] as Array<{ key: string; active: boolean }>;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = formatDayKey(d);
    days.push({ key, active: activeDays.has(key) });
  }

  // Calculate current streak from the end
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].active) {
      streak += 1;
    } else {
      break;
    }
  }

  // Check if today has activity
  const todayKey = formatDayKey(new Date());
  const hasActivityToday = activeDays.has(todayKey);

  // Calculate hours until midnight UTC (when streak would be lost)
  const now = new Date();
  const midnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  const msUntilMidnight = midnightUTC.getTime() - now.getTime();
  const hoursUntilMidnight = msUntilMidnight / (1000 * 60 * 60);

  // Streak is at risk if:
  // 1. User has a streak (> 0)
  // 2. No activity today
  // 3. Less than 24 hours until midnight
  const atRisk = streak > 0 && !hasActivityToday;

  return NextResponse.json({
    streak,
    atRisk,
    hasActivityToday,
    hoursUntilLoss: atRisk ? hoursUntilMidnight : null,
    streakValue: streak >= 7 ? '2x XP' : null,
  });
}

