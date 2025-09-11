import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

type UserRow = { id: unknown; email: string; xp?: number; level?: number; lastLoginAt?: string };

function xpForLevel(level: number): number {
  // Quadratic curve: 100, 300, 600, 1000, ...
  return Math.max(0, Math.floor((level * (level + 1) * 100) / 2));
}

function levelForXp(xp: number): { level: number; nextLevelXp: number; remaining: number } {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level += 1;
  const nextLevelXp = xpForLevel(level + 1);
  return { level, nextLevelXp, remaining: Math.max(0, nextLevelXp - xp) };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ xp: 0, level: 0, nextLevelXp: 100, remaining: 100 });
  const db = await getSurreal();
  const r = await db.query("SELECT id, xp, level, lastLoginAt FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as UserRow | undefined) : undefined;
  const xp = row?.xp || 0;
  const derived = levelForXp(xp);
  const level = row?.level ?? derived.level;
  const currentBase = xpForLevel(level);
  const span = Math.max(1, derived.nextLevelXp - currentBase);
  const into = Math.max(0, xp - currentBase);
  return NextResponse.json({ xp, level, nextLevelXp: derived.nextLevelXp, remaining: derived.remaining, currentLevelBaseXp: currentBase, xpIntoLevel: into, levelSpan: span });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reason } = await request.json().catch(() => ({ reason: "" }));
  const db = await getSurreal();
  const r = await db.query("SELECT id, xp, level, lastLoginAt FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as UserRow | undefined) : undefined;
  const nowIso = new Date().toISOString();

  let add = 0;
  let didDailyBonus = false;
  if (reason === "daily-login") {
    const last = row?.lastLoginAt ? new Date(row.lastLoginAt) : undefined;
    const now = new Date();
    const isNewDay = !last || last.toDateString() !== now.toDateString();
    if (isNewDay) {
      add = 20; // daily login bonus
      didDailyBonus = true;
    }
  } else if (reason === "chat-message") {
    add = 2; // per message
  }

  const newXp = Math.max(0, (row?.xp || 0) + add);
  const derived = levelForXp(newXp);
  await db.query(
    "UPDATE user SET xp = $xp, level = $level, lastLoginAt = $lastLoginAt WHERE email = $email;",
    { xp: newXp, level: derived.level, lastLoginAt: nowIso, email: session.user.email }
  );

  // Ensure today's activity row exists for streak logic when daily-login is attempted
  if (reason === "daily-login") {
    try {
      const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
      const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown } | undefined) : undefined;
      const rid = urow?.id;
      if (rid) {
        const day = new Date();
        const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
        const ares = await db.query("SELECT id FROM activity WHERE user = $rid AND day = $day LIMIT 1;", { rid, day: key });
        const arow = Array.isArray(ares) && Array.isArray(ares[0]) ? (ares[0][0] as { id?: unknown } | undefined) : undefined;
        if (arow?.id) {
          await db.query("UPDATE $rec SET active = true, updated_at = $now;", { rec: arow.id, now: nowIso });
        } else {
          await db.create("activity", { user: rid, day: key, active: true, created_at: nowIso });
        }
      }
    } catch {}
  }

  return NextResponse.json({ xp: newXp, level: derived.level, nextLevelXp: derived.nextLevelXp, remaining: derived.remaining, added: add, didDailyBonus });
}
