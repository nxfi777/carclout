import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planFromPriceId, type Plan } from "@/lib/stripe";
import { getSurreal } from "@/lib/surrealdb";
import { adjustCredits, includedMonthlyCreditsForPlan } from "@/lib/credits";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

async function getCustomerEmailFromStripe(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): Promise<string | null> {
  try {
    if (!customer) return null;
    if (typeof customer === "string") {
      const c = await stripe.customers.retrieve(customer);
      if ("deleted" in c && (c as Stripe.DeletedCustomer).deleted) {
        return null;
      }
      const email = (c as Stripe.Customer).email;
      return typeof email === "string" ? email : null;
    }
    const c = customer as Stripe.Customer | Stripe.DeletedCustomer;
    if ("deleted" in c && (c as Stripe.DeletedCustomer).deleted) {
      return null;
    }
    const email = (c as Stripe.Customer).email;
    return typeof email === "string" ? email : null;
  } catch (e) {
    console.error("Failed to resolve customer email:", e);
    return null;
  }
}

async function syncPlanFromSubscription(subId: string): Promise<void> {
  try {
    if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    const email = await getCustomerEmailFromStripe(sub.customer);
    if (!email) return;
    const status = sub.status;
    const priceId = sub?.items?.data?.[0]?.price?.id || null;
    const mappedPlan: Plan | null = planFromPriceId(priceId);
    const shouldHaveAccess = status === "active" || status === "trialing";
    const planToSet: Plan | null = shouldHaveAccess ? mappedPlan : null;
    const surreal = await getSurreal();
    await surreal.query("UPDATE user SET plan = $plan WHERE email = $email;", { plan: planToSet, email });
  } catch (e) {
    console.error("syncPlanFromSubscription failed:", e);
  }
}

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
          // Prefer syncing from live subscription status if we have a subscription id
          const maybeSubId = typeof (session as unknown as Record<string, unknown>).subscription === "string"
            ? String((session as unknown as Record<string, unknown>).subscription)
            : null;
          if (maybeSubId) {
            await syncPlanFromSubscription(maybeSubId);
          } else if (customerEmail && plan) {
            await surreal.query("UPDATE user SET plan = $plan WHERE email = $email;", { plan, email: customerEmail });
          }
          // Seed included credits on first-time plan purchase
          if (customerEmail && plan) {
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
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only suspend on subscription-related invoices
      const inv = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null };
      if (!inv.subscription) break;
      try {
        // Always source-of-truth from live subscription status to avoid ordering races
        const subId = typeof inv.subscription === "string" ? inv.subscription : String(inv.subscription.id);
        await syncPlanFromSubscription(subId);
      } catch (e) {
        console.error("Failed to suspend user on invoice.payment_failed:", e);
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only restore on subscription-related invoices
      const inv = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null };
      if (!inv.subscription) break;
      try {
        // Always source-of-truth from live subscription status
        const subId = typeof inv.subscription === "string" ? inv.subscription : String(inv.subscription.id);
        await syncPlanFromSubscription(subId);
      } catch (e) {
        console.error("Failed to restore user plan on invoice.paid:", e);
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      try {
        await syncPlanFromSubscription(sub.id);
      } catch (e) {
        console.error("Failed to sync plan on customer.subscription.updated:", e);
      }
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}


