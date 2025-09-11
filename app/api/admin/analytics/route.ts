import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { CREDITS_PER_DOLLAR, PRICE_PER_CREDIT_USD } from "@/lib/credits";

type CreditTxn = {
  user?: unknown;
  delta?: number;
  reason?: string;
  created_at?: string | Date;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toIsoUtc(date: Date): string {
  return new Date(date).toISOString();
}

export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  const role = session?.user?.role || "user";
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const range = String(searchParams.get("range") || "30d");
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;

    const end = startOfDay(new Date());
    const start = addDays(end, -days + 1);

    const startIso = toIsoUtc(start);
    const endIso = toIsoUtc(addDays(end, 1));

    const db = await getSurreal();

    const topupRes = await db.query<CreditTxn[]>(
      `SELECT * FROM credit_txn WHERE reason = 'topup' AND created_at >= d"${startIso}" AND created_at < d"${endIso}";`
    );
    const reserveRes = await db.query<CreditTxn[]>(
      `SELECT * FROM credit_txn WHERE string::starts_with(reason, 'reserve:') AND created_at >= d"${startIso}" AND created_at < d"${endIso}";`
    );

    const topups: CreditTxn[] = Array.isArray(topupRes) && Array.isArray(topupRes[0]) ? (topupRes[0] as CreditTxn[]) : [];
    const reserves: CreditTxn[] = Array.isArray(reserveRes) && Array.isArray(reserveRes[0]) ? (reserveRes[0] as CreditTxn[]) : [];

    const totalTopupCredits = topups.reduce((sum, t) => sum + (typeof t.delta === "number" ? t.delta : 0), 0);
    const totalRevenueUsd = totalTopupCredits / CREDITS_PER_DOLLAR;

    const creditsSpent = reserves.reduce((sum, t) => sum + Math.abs(typeof t.delta === "number" ? t.delta : 0), 0);
    const userIdsSpent = new Set<string>();
    for (const r of reserves) {
      const uid = r.user ? String(r.user as unknown as string) : "";
      if (uid) userIdsSpent.add(uid);
    }
    const spendingUsers = userIdsSpent.size;
    const avgUserCostUsd = spendingUsers ? (creditsSpent * PRICE_PER_CREDIT_USD) / spendingUsers : 0;

    const userIdsTopup = new Set<string>();
    for (const t of topups) {
      const uid = t.user ? String(t.user as unknown as string) : "";
      if (uid) userIdsTopup.add(uid);
    }
    const payingUsers = userIdsTopup.size;
    const avgUserSpendUsd = payingUsers ? totalRevenueUsd / payingUsers : 0;

    const daysMap: Record<string, { date: string; revenueUsd: number; creditsSpent: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const key = toIsoUtc(d).slice(0, 10);
      daysMap[key] = { date: key, revenueUsd: 0, creditsSpent: 0 };
    }
    for (const t of topups) {
      const k = toIsoUtc(new Date(t.created_at || 0)).slice(0, 10);
      if (!daysMap[k]) continue;
      daysMap[k].revenueUsd += (typeof t.delta === "number" ? t.delta : 0) / CREDITS_PER_DOLLAR;
    }
    for (const r of reserves) {
      const k = toIsoUtc(new Date(r.created_at || 0)).slice(0, 10);
      if (!daysMap[k]) continue;
      daysMap[k].creditsSpent += Math.abs(typeof r.delta === "number" ? r.delta : 0);
    }

    const series = Object.values(daysMap);

    const subsRes = await db.query<Record<string, unknown>[]>(
      `SELECT id FROM user WHERE plan != NONE AND plan != '' LIMIT 10000;`
    );
    const subscribers = Array.isArray(subsRes) && Array.isArray(subsRes[0]) ? (subsRes[0] as Array<Record<string, unknown>>) : [];

    return NextResponse.json({
      metrics: {
        totalRevenueUsd,
        creditsSpent,
        spendingUsers,
        payingUsers,
        avgUserCostUsd,
        avgUserSpendUsd,
        subscribers: subscribers.length,
      },
      series,
      rangeDays: days,
    });
  } catch (e) {
    console.error("[admin/analytics] error", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}


