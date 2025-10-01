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
  const rid = row?.id;

  let add = 0;
  let didDailyBonus = false;
  let hitChatLimit = false;
  let isFirstPost = false;

  if (reason === "daily-login") {
    const last = row?.lastLoginAt ? new Date(row.lastLoginAt) : undefined;
    const now = new Date();
    const isNewDay = !last || last.toDateString() !== now.toDateString();
    if (isNewDay) {
      add = 20; // daily login bonus
      didDailyBonus = true;
    }
  } else if (reason === "chat-message") {
    // Rate limit: max 100 XP per day from chat messages (100 messages at 1 XP each)
    const MAX_CHAT_XP_PER_DAY = 100;
    if (rid) {
      try {
        const today = new Date();
        const dayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
        const xpRes = await db.query(
          "SELECT SUM(amount) AS total FROM xp_log WHERE user = $rid AND day = $day AND reason = 'chat-message';",
          { rid, day: dayKey }
        );
        const xpRow = Array.isArray(xpRes) && Array.isArray(xpRes[0]) ? (xpRes[0][0] as { total?: number } | undefined) : undefined;
        const chatXpToday = typeof xpRow?.total === "number" ? xpRow.total : 0;
        if (chatXpToday < MAX_CHAT_XP_PER_DAY) {
          add = Math.min(1, MAX_CHAT_XP_PER_DAY - chatXpToday);
        } else {
          hitChatLimit = true;
        }
      } catch {
        add = 1; // Fallback if query fails
      }
    } else {
      add = 1;
    }
  } else if (reason === "showroom-post") {
    // Check if this is their first showroom post
    if (rid) {
      try {
        const postRes = await db.query(
          "SELECT id FROM xp_log WHERE user = $rid AND reason = 'showroom-post' LIMIT 1;",
          { rid }
        );
        const hasPosted = Array.isArray(postRes) && Array.isArray(postRes[0]) && postRes[0].length > 0;
        if (!hasPosted) {
          isFirstPost = true;
          add = 100; // First post bonus: +100 XP instead of 50
        } else {
          add = 50; // Regular showroom post bonus
        }
      } catch {
        add = 50; // Fallback
      }
    } else {
      add = 50;
    }
  }

  // Apply streak multiplier (2× XP for 7+ day streaks)
  let streakMultiplier = 1;
  let currentStreak = 0;
  if (add > 0) {
    try {
      const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
      const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown } | undefined) : undefined;
      const rid = urow?.id;
      if (rid) {
        // Calculate current streak
        const end = new Date();
        const start = new Date(end);
        start.setUTCDate(end.getUTCDate() - 29);
        const endKey = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
        const startKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}`;
        const q = await db.query("SELECT day FROM activity WHERE user = $rid AND day >= $start AND day <= $end ORDER BY day DESC;", { rid, start: startKey, end: endKey });
        const activityRows = Array.isArray(q) && Array.isArray(q[0]) ? (q[0] as Array<{ day?: string }>) : [];
        
        // Count consecutive days from today backwards
        const today = new Date();
        let streak = 0;
        for (let i = 0; i <= 29; i++) {
          const checkDate = new Date(today);
          checkDate.setUTCDate(today.getUTCDate() - i);
          const checkKey = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, "0")}-${String(checkDate.getUTCDate()).padStart(2, "0")}`;
          const hasActivity = activityRows.some((r) => String(r.day || "") === checkKey);
          if (hasActivity) {
            streak += 1;
          } else {
            break;
          }
        }
        currentStreak = streak;
        if (streak >= 7) {
          streakMultiplier = 2;
        }
      }
    } catch {
      // Ignore errors in streak calculation
    }
  }

  add = Math.floor(add * streakMultiplier);

  const oldLevel = row?.level ?? 0;
  const newXp = Math.max(0, (row?.xp || 0) + add);
  const derived = levelForXp(newXp);
  const leveledUp = derived.level > oldLevel;

  await db.query(
    "UPDATE user SET xp = $xp, level = $level, lastLoginAt = $lastLoginAt WHERE email = $email;",
    { xp: newXp, level: derived.level, lastLoginAt: nowIso, email: session.user.email }
  );

  // Log XP activity for rate limiting and analytics
  if (add > 0 && rid) {
    try {
      const today = new Date();
      const dayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
      await db.create("xp_log", {
        user: rid,
        amount: add,
        reason,
        day: dayKey,
        created_at: nowIso,
      });
    } catch {}
  }

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

  return NextResponse.json({
    xp: newXp,
    level: derived.level,
    oldLevel,
    leveledUp,
    nextLevelXp: derived.nextLevelXp,
    remaining: derived.remaining,
    added: add,
    didDailyBonus,
    streakMultiplier,
    currentStreak,
    hitChatLimit,
    isFirstPost,
  });
}
