import { NextResponse } from "next/server";
import { stripe, PLAN_PRICE_IDS, type Plan } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { CREDITS_PER_DOLLAR } from "@/lib/credits";
import { RecordId } from "surrealdb";

function resolveOrigin(req: Request): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.APP_URL ||
    "";
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    const sessionAuth = await auth();
    const email = sessionAuth?.user?.email || "";
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan, topup } = (await req.json().catch(()=>({} as Record<string, unknown>))) as { plan?: unknown; topup?: unknown };
    // Credits top-up flow (one-time payment)
    if (typeof topup === "number") {
      // Load plan for differential credit rates
      let currentPlan: Plan | null = null;
      try {
        const db = await getSurreal();
        const r = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
        const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { plan?: Plan }) : null;
        const p = row?.plan as Plan | undefined;
        currentPlan = p === "pro" ? "pro" : "minimum"; // default minimum if unset
      } catch {}

      const minUsd = 5;
      const amountUsd = Math.max(minUsd, Math.floor(Number(topup)));
      if (!Number.isFinite(amountUsd) || amountUsd < minUsd) {
        return NextResponse.json({ error: `Minimum top-up is $${minUsd}` }, { status: 400 });
      }
      
      // Tiered pricing structure that scales to exactly 1:1000
      // Based on Hormozi's pricing psychology: anchor high, volume incentives, psychological pricing
      let credits: number;
      let ratePerDollar = 0;
      
      if (currentPlan === "pro") {
        // Pro plan: Tiered topups that scale progressively better
        // Designed to encourage larger purchases while rewarding bulk buyers
        if (amountUsd >= 199) {
          // Tier 6: $199+ = 1,060 cr/$ (6% bonus for bulk commitment)
          credits = Math.floor(amountUsd * 1060);
        } else if (amountUsd >= 99) {
          // Tier 5: $99+ = 1,030 cr/$ (3% bonus, "BULK VALUE")
          credits = Math.floor(amountUsd * 1030);
        } else if (amountUsd >= 50) {
          // Tier 4: $50+ = 1,000 cr/$ (EXACTLY 1:1000 - "BEST VALUE")
          credits = Math.floor(amountUsd * 1000);
        } else if (amountUsd >= 27) {
          // Tier 3: $27+ = 926 cr/$ (requested anchor tier, "POPULAR")
          credits = Math.floor((amountUsd / 27) * 25000);
        } else if (amountUsd >= 20) {
          // Tier 2: $20+ = 950 cr/$ (better than base but not optimal)
          credits = Math.floor(amountUsd * 950);
        } else if (amountUsd >= 10) {
          // Tier 1: $10-19 = 900 cr/$ (entry tier, encourages going bigger)
          credits = Math.floor(amountUsd * 900);
        } else {
          // Minimum $5-9: 850 cr/$ (intentionally least attractive to drive upgrades)
          credits = Math.floor(amountUsd * 850);
        }
      } else {
        // Minimum plan: Half the pro rate (maintains 2:1 differential)
        // - minimum plan: 2,500 credits for $5 (500 cr/$)
        ratePerDollar = Math.floor(2500 / 5); // 500
        credits = amountUsd * ratePerDollar;
      }
      const origin = resolveOrigin(req);
      const upgradeHint = currentPlan === "minimum" && ratePerDollar < CREDITS_PER_DOLLAR;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `${credits} Credits Top-up${upgradeHint ? " (more value on Pro)" : ""}` },
              unit_amount: amountUsd * 100,
            },
            quantity: 1,
          },
        ],
        customer_email: email,
        metadata: { intent: "credits_topup", credits: String(credits), amount_usd: String(amountUsd), userEmail: email, planAtPurchase: currentPlan || "minimum" },
        success_url: `${origin}/dashboard?topup=success`,
        cancel_url: `${origin}/dashboard?topup=cancelled`,
      });
      return NextResponse.json({ url: session.url, ...(upgradeHint ? { hint: "You get more credits per dollar on Pro." } : {}) });
    }

    const key = ((plan as Plan) || "minimum") as Plan;
    if (key === "basic") {
      return NextResponse.json({ error: "This plan is coming soon." }, { status: 400 });
    }
    const price = PLAN_PRICE_IDS[key];
    if (!price) {
      return NextResponse.json({ error: `Invalid plan: ${key}` }, { status: 400 });
    }

    // Fetch Surreal user id
    let userIdString = "";
    try {
      const db = await getSurreal();
      const q = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email });
      const row = Array.isArray(q) && Array.isArray(q[0]) ? (q[0][0] as { id?: unknown }) : null;
      const rid = row?.id as unknown;
      if (rid) userIdString = rid instanceof RecordId ? rid.toString() : String(rid);
    } catch {}

    const origin = resolveOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],
      customer_email: email,
      client_reference_id: userIdString || undefined,
      metadata: { plan: key, userId: userIdString, userEmail: email },
      subscription_data: { metadata: { plan: key, userId: userIdString, userEmail: email } },
        success_url: `${origin}/dashboard/templates?welcome=1`,
      cancel_url: `${origin}/plan?canceled=1`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const err = e as { message?: string } & { raw?: { message?: string } };
    const detail = err?.raw?.message || err?.message || "Stripe error";
    console.error("[checkout] create session error:", detail);
    return NextResponse.json({ error: `Failed to create session: ${detail}` }, { status: 500 });
  }
}


