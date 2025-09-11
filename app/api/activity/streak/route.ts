import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

type UserRow = { id: { toString?: () => string } | string };

function formatDayKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ days: [], streak: 0 });

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") || "14");
  const totalDays = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 60 ? Math.floor(daysParam) : 14;

  const db = await getSurreal();
  const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as UserRow | undefined) : undefined;
  const rid = urow?.id ?? null;

  if (!rid) return NextResponse.json({ days: [], streak: 0 });

  const end = new Date();
  const endKey = formatDayKey(end);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (totalDays - 1));
  const startKey = formatDayKey(start);

  const q = await db.query("SELECT day FROM activity WHERE user = $rid AND day >= $start AND day <= $end;", { rid, start: startKey, end: endKey });
  const rows = Array.isArray(q) && Array.isArray(q[0]) ? (q[0] as Array<{ day?: string }>) : [];
  const activeDays = new Set(rows.map((r) => String(r.day || "")));

  const days = [] as Array<{ date: string; active: boolean }>;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = formatDayKey(d);
    const iso = `${key}T00:00:00.000Z`;
    days.push({ date: iso, active: activeDays.has(key) });
  }

  // Compute current streak from the end of the array
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].active) streak += 1; else break;
  }

  return NextResponse.json({ days, streak });
}


