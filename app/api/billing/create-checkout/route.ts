import { NextResponse } from "next/server";
import { stripe, PLAN_PRICE_IDS, type Plan } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { CREDITS_PER_DOLLAR } from "@/lib/credits";
import { RecordId } from "surrealdb";

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
      // Base rate: 100 credits per $1 (CREDITS_PER_DOLLAR)
      // Special rule for $5 top-ups:
      // - minimum plan: 250 credits for $5 (50 cr/$)
      // - pro plan: 500 credits for $5 (100 cr/$)
      // For amounts > $5, keep the same per-dollar rate as $5 case for simplicity.
      const ratePerDollar = currentPlan === "pro" ? CREDITS_PER_DOLLAR : Math.floor(250 / 5); // 100 or 50
      const credits = amountUsd * ratePerDollar;
      const origin = new URL(req.url).origin;
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

    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],
      customer_email: email,
      client_reference_id: userIdString || undefined,
      metadata: { plan: key, userId: userIdString, userEmail: email },
      subscription_data: { metadata: { plan: key, userId: userIdString, userEmail: email } },
      success_url: `${origin}/dashboard/home?welcome=1`,
      cancel_url: `${origin}/onboarding/plan?canceled=1`,
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


