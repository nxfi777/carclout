import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId, type Plan } from "@/lib/stripe";
import { getSurreal } from "@/lib/surrealdb";
import { adjustCredits, includedMonthlyCreditsForPlan } from "@/lib/credits";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: unknown) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const surreal = await getSurreal();
      try {
        const customerEmail = session.customer_details?.email || session.customer_email;
        const intent = session.metadata?.intent || null;
        if (customerEmail && intent === "credits_topup") {
          const credits = Number(session.metadata?.credits || 0);
          if (credits > 0) {
            await adjustCredits(customerEmail, credits, "topup", session.id);
          }
        } else {
          let plan: Plan | null = (session.metadata?.plan as Plan) || null;
          if (!plan) {
            const s = session as unknown as {
              line_items?: { data?: Array<{ price?: { id?: string } }> };
              subscription?: { items?: { data?: Array<{ price?: { id?: string } }> } };
            };
            const linePrice = s?.line_items?.data?.[0]?.price?.id || s?.subscription?.items?.data?.[0]?.price?.id;
            plan = planFromPriceId(linePrice);
          }
          if (customerEmail && plan) {
            await surreal.query("UPDATE user SET plan = $plan WHERE email = $email;", { plan, email: customerEmail });
            // First-time plan purchase: seed monthly credits immediately
            // Map Plan (minimum|basic|pro) to the credit tiers used by includedMonthlyCreditsForPlan
            const creditTier: "$1" | "$20" | "$200" | "basic" | "pro" | "ultra" =
              plan === "minimum" ? "$1" : (plan === "basic" ? "basic" : "pro");
            const included = includedMonthlyCreditsForPlan(creditTier);
            if (included > 0) {
              await adjustCredits(customerEmail, included, "plan_included", session.id);
            }
          }
        }
      } catch (e) {
        console.error("Failed to update user plan:", e);
      }
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}


