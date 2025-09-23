import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { CREDITS_PER_DOLLAR, PRICE_PER_CREDIT_USD, GENERATION_CREDITS_PER_IMAGE, REMBG_CREDITS_PER_CALL, UPSCALE_CREDITS_PER_MP } from "@/lib/credits";

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

    // Top-up revenue (funds added, not necessarily spent yet)
    // If user is on minimum plan, credits are 2x more expensive (≈50 credits/$ instead of 100 credits/$)
    // Approximate USD by dividing credits by user-plan rate at time of query (best effort).
    const userRefsTopup = new Set<unknown>();
    for (const t of topups) {
      const uref = t.user;
      if (uref) userRefsTopup.add(uref);
    }
    const idToPlan = new Map<string, string>();
    if (userRefsTopup.size > 0) {
      try {
        const ids = Array.from(userRefsTopup);
        const plansRes = await db.query<Array<{ id?: unknown; plan?: string }>>(
          `SELECT id, plan FROM user WHERE id IN $ids;`,
          { ids }
        );
        const rows = Array.isArray(plansRes) && Array.isArray(plansRes[0]) ? (plansRes[0] as Array<{ id?: unknown; plan?: string }>) : [];
        for (const row of rows) {
          const ridStr = row?.id ? (row.id as unknown as { toString?: () => string }).toString?.() || String(row.id) : "";
          if (ridStr) idToPlan.set(ridStr, (row?.plan || "").toString());
        }
      } catch {}
    }
    const MIN_PLAN_CREDITS_PER_DOLLAR = Math.floor(250 / 5); // 50 credits / $ on minimum
    const topupRevenueUsd = topups.reduce((sum, t) => {
      const credits = typeof t.delta === "number" ? t.delta : 0;
      const uid = t.user ? ((t.user as unknown as { toString?: () => string }).toString?.() || String(t.user)) : "";
      const plan = (uid ? (idToPlan.get(uid) || "") : "").toLowerCase();
      const ratePerDollar = plan === "minimum" ? MIN_PLAN_CREDITS_PER_DOLLAR : CREDITS_PER_DOLLAR;
      const usd = credits / Math.max(1, ratePerDollar);
      return sum + usd;
    }, 0);

    // Settled usage (credits actually consumed)
    const creditsSpent = reserves.reduce((sum, t) => sum + Math.abs(typeof t.delta === "number" ? t.delta : 0), 0);
    const settledRevenueUsd = creditsSpent * PRICE_PER_CREDIT_USD;
    const userIdsSpent = new Set<string>();
    for (const r of reserves) {
      const uid = r.user ? String(r.user as unknown as string) : "";
      if (uid) userIdsSpent.add(uid);
    }
    const spendingUsers = userIdsSpent.size;
    const avgUserCostUsd = spendingUsers ? (settledRevenueUsd) / spendingUsers : 0;

    const payingUsers = userRefsTopup.size;
    // Average user spend based on top-ups
    const avgUserSpendUsd = payingUsers ? topupRevenueUsd / payingUsers : 0;

    const daysMap: Record<string, { date: string; revenueUsd: number; creditsSpent: number; costUsd: number; stripeFeesUsd: number; profitUsd: number }> = {};
    const topupsByDay: Record<string, { amountUsd: number; count: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const key = toIsoUtc(d).slice(0, 10);
      daysMap[key] = { date: key, revenueUsd: 0, creditsSpent: 0, costUsd: 0, stripeFeesUsd: 0, profitUsd: 0 };
      topupsByDay[key] = { amountUsd: 0, count: 0 };
    }
    // Track top-ups by day to estimate Stripe fees (2.9% + $0.30 per charge by default)
    for (const t of topups) {
      const k = toIsoUtc(new Date(t.created_at || 0)).slice(0, 10);
      if (!topupsByDay[k]) continue;
      const credits = (typeof t.delta === "number" ? t.delta : 0);
      const uid = t.user ? ((t.user as unknown as { toString?: () => string }).toString?.() || String(t.user)) : "";
      const plan = (uid ? (idToPlan.get(uid) || "") : "").toLowerCase();
      const ratePerDollar = plan === "minimum" ? MIN_PLAN_CREDITS_PER_DOLLAR : CREDITS_PER_DOLLAR;
      const usd = credits / Math.max(1, ratePerDollar);
      topupsByDay[k].amountUsd += usd;
      topupsByDay[k].count += 1;
    }
    // For charting, show settled revenue (USD) from credits spent and the raw credits spent.
    for (const r of reserves) {
      const k = toIsoUtc(new Date(r.created_at || 0)).slice(0, 10);
      if (!daysMap[k]) continue;
      const spent = Math.abs(typeof r.delta === "number" ? r.delta : 0);
      daysMap[k].creditsSpent += spent;
      daysMap[k].revenueUsd += spent * PRICE_PER_CREDIT_USD;
      // Estimate vendor cost per credit by operation type
      const reasonRaw = typeof r.reason === 'string' ? String(r.reason) : '';
      const op = reasonRaw.startsWith('reserve:') ? reasonRaw.substring('reserve:'.length) : reasonRaw;
      let costPerCreditUsd = 0;
      if (op === 'generation') {
        costPerCreditUsd = 0.039 / Math.max(1, GENERATION_CREDITS_PER_IMAGE);
      } else if (op === 'rembg') {
        costPerCreditUsd = 0.00666 / Math.max(1, REMBG_CREDITS_PER_CALL);
      } else if (op === 'upscale') {
        costPerCreditUsd = 0.03 / Math.max(1, UPSCALE_CREDITS_PER_MP);
      } else if (op.startsWith('streak_restore')) {
        costPerCreditUsd = 0; // internal, no vendor spend
      } else {
        costPerCreditUsd = 0; // unknown op → assume no vendor cost
      }
      daysMap[k].costUsd += spent * costPerCreditUsd;
    }

    // Estimate Stripe fees from top-ups only (subscriptions not included in this estimate)
    const STRIPE_PERCENT_FEE = Number(process.env.STRIPE_PERCENT_FEE || process.env.NEXT_PUBLIC_STRIPE_PERCENT_FEE || "0.029");
    const STRIPE_FIXED_FEE = Number(process.env.STRIPE_FIXED_FEE || process.env.NEXT_PUBLIC_STRIPE_FIXED_FEE || "0.3");
    for (const k of Object.keys(daysMap)) {
      const t = topupsByDay[k];
      if (!t) continue;
      daysMap[k].stripeFeesUsd = t.amountUsd * STRIPE_PERCENT_FEE + t.count * STRIPE_FIXED_FEE;
      // Profit per day ≈ percentage of settled revenue
      const PROFIT_RATE = Number(process.env.ANALYTICS_PROFIT_RATE || "0.4");
      daysMap[k].profitUsd = Math.max(0, daysMap[k].revenueUsd * PROFIT_RATE);
    }

    const series = Object.values(daysMap);
    const estimatedVendorCostUsd = series.reduce((sum, d) => sum + (Number.isFinite(d.costUsd) ? d.costUsd : 0), 0);
    const estimatedStripeFeesUsd = series.reduce((sum, d) => sum + (Number.isFinite(d.stripeFeesUsd) ? d.stripeFeesUsd : 0), 0);

    // Subscription revenue from active subscriptions (pro-rated by selected range)
    const subsRes = await db.query<Array<{ id?: unknown; plan?: string }>>(
      `SELECT id, plan FROM user WHERE plan != NONE AND plan != '' LIMIT 10000;`
    );
    const subsRows = Array.isArray(subsRes) && Array.isArray(subsRes[0]) ? (subsRes[0] as Array<{ id?: unknown; plan?: string }>) : [];
    let minSubs = 0, proSubs = 0;
    for (const row of subsRows) {
      const p = (row?.plan || "").toString().toLowerCase();
      if (p === "minimum") minSubs += 1;
      else if (p === "pro") proSubs += 1;
    }
    const MONTHLY_PRICE_MINIMUM = Number(process.env.PLAN_MINIMUM_USD || "1");
    const MONTHLY_PRICE_PRO = Number(process.env.PLAN_PRO_USD || "25");
    const monthlySubscriptionRevenueUsd = (minSubs * MONTHLY_PRICE_MINIMUM) + (proSubs * MONTHLY_PRICE_PRO);
    const subscriptionRevenueUsd = monthlySubscriptionRevenueUsd * (days / 30);

    // Total revenue = subscriptions (pro-rated) + top-ups collected in range
    const totalRevenueUsd = subscriptionRevenueUsd + topupRevenueUsd;
    const PROFIT_RATE = Number(process.env.ANALYTICS_PROFIT_RATE || "0.4");
    const estimatedProfitUsd = Math.max(0, totalRevenueUsd * PROFIT_RATE);
    const settledProfitUsd = Math.max(0, settledRevenueUsd * PROFIT_RATE);

    // Top 10 users by XP
    let topUsers: Array<{ id?: unknown; email: string; displayName?: string | null; name?: string | null; plan?: string | null; xp: number; level?: number | null }> = [];
    try {
      const topRes = await db.query<Array<{ id?: unknown; email?: string; displayName?: string | null; name?: string | null; plan?: string | null; xp?: number; level?: number | null }>>(
        `SELECT id, email, displayName, name, plan, xp, level FROM user ORDER BY xp DESC LIMIT 10;`
      );
      const rows = Array.isArray(topRes) && Array.isArray(topRes[0]) ? (topRes[0] as Array<{ id?: unknown; email?: string; displayName?: string | null; name?: string | null; plan?: string | null; xp?: number; level?: number | null }>) : [];
      topUsers = rows.map((r) => ({
        id: r.id,
        email: (r.email || "").toString(),
        displayName: r.displayName ?? null,
        name: r.name ?? null,
        plan: (r.plan ?? null) as string | null,
        xp: typeof r.xp === 'number' ? r.xp : 0,
        level: typeof r.level === 'number' ? r.level : null,
      }));
    } catch {}

    return NextResponse.json({
      metrics: {
        // Total revenue = active subscriptions + top-ups (time-range)
        totalRevenueUsd,
        settledRevenueUsd,
        topupRevenueUsd,
        creditsSpent,
        spendingUsers,
        payingUsers,
        avgUserCostUsd,
        avgUserSpendUsd,
        estimatedVendorCostUsd,
        estimatedStripeFeesUsd,
        estimatedProfitUsd,
        settledProfitUsd,
          // keep aggregate subscribers for backwards-compatibility
          subscribers: subsRows.length,
          // new detailed subscriber counts
          proUsers: proSubs,
          minimumUsers: minSubs,
      },
      series,
        topUsers,
      rangeDays: days,
    });
  } catch (e) {
    console.error("[admin/analytics] error", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}


