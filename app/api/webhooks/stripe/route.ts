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
    
    // Get customer ID from subscription
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    
    // Check if this is an upgrade from minimum to pro
    if (planToSet === "pro") {
      const userResult = await surreal.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
      const previousPlan = Array.isArray(userResult) && Array.isArray(userResult[0]) 
        ? (userResult[0][0] as { plan?: Plan } | undefined)?.plan
        : null;
      
      // If upgrading from minimum to pro, reset welcome flag and store Stripe IDs
      if (previousPlan === "minimum") {
        await surreal.query(
          "UPDATE user SET plan = $plan, welcomeProShown = false, stripeCustomerId = $customerId, stripeSubscriptionId = $subscriptionId WHERE email = $email;", 
          { plan: planToSet, email, customerId, subscriptionId: subId }
        );
        return;
      }
    }
    
    // Update plan and store Stripe IDs
    await surreal.query(
      "UPDATE user SET plan = $plan, stripeCustomerId = $customerId, stripeSubscriptionId = $subscriptionId WHERE email = $email;", 
      { plan: planToSet, email, customerId, subscriptionId: subId }
    );
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
          
          // Capture and store customer ID from top-up session
          const customerId = typeof session.customer === 'string' ? session.customer : null;
          if (customerId) {
            try {
              // Check if user already has this customer ID stored
              const userResult = await surreal.query(
                "SELECT stripeCustomerId FROM user WHERE email = $email LIMIT 1;", 
                { email: customerEmail }
              );
              const existingCustomerId = Array.isArray(userResult) && Array.isArray(userResult[0]) 
                ? (userResult[0][0] as { stripeCustomerId?: string } | undefined)?.stripeCustomerId
                : null;
              
              // Only update if missing or different
              if (!existingCustomerId || existingCustomerId !== customerId) {
                await surreal.query(
                  "UPDATE user SET stripeCustomerId = $customerId WHERE email = $email;", 
                  { customerId, email: customerEmail }
                );
                console.log(`[Webhook] Stored Stripe customer ID for ${customerEmail} from top-up`);
              }
            } catch (e) {
              console.error("[Webhook] Failed to store customer ID from top-up:", e);
            }
          }
          
          // Track revenue for credit top-up (server-side logging for analytics)
          try {
            const revenueAmount = typeof session.amount_total === 'number' ? session.amount_total / 100 : 0; // Convert cents to dollars
            if (revenueAmount > 0 && customerEmail) {
              console.log('[REVENUE] Credit top-up:', {
                email: customerEmail,
                amount: revenueAmount,
                credits: credits,
                currency: session.currency || 'usd',
                sessionId: session.id,
                eventType: 'topup'
              });
              // Note: This logs for server-side tracking. Client-side revenue tracking
              // happens via checkout-completed event with revenue property
            }
          } catch (e) {
            console.error('Failed to log revenue:', e);
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
            // Store customer ID if available
            const customerId = typeof session.customer === 'string' ? session.customer : null;
            
            // Check if this is an upgrade from minimum to pro/ultra
            if (plan === "pro" || plan === "ultra") {
              const userResult = await surreal.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email: customerEmail });
              const previousPlan = Array.isArray(userResult) && Array.isArray(userResult[0]) 
                ? (userResult[0][0] as { plan?: Plan } | undefined)?.plan
                : null;
              
              // If upgrading from minimum to pro/ultra, reset welcome flag and store customer ID
              if (previousPlan === "minimum") {
                if (customerId) {
                  await surreal.query(
                    "UPDATE user SET plan = $plan, welcomeProShown = false, stripeCustomerId = $customerId WHERE email = $email;", 
                    { plan, email: customerEmail, customerId }
                  );
                } else {
                  await surreal.query("UPDATE user SET plan = $plan, welcomeProShown = false WHERE email = $email;", { plan, email: customerEmail });
                }
              } else {
                if (customerId) {
                  await surreal.query("UPDATE user SET plan = $plan, stripeCustomerId = $customerId WHERE email = $email;", { plan, email: customerEmail, customerId });
                } else {
                  await surreal.query("UPDATE user SET plan = $plan WHERE email = $email;", { plan, email: customerEmail });
                }
              }
            } else {
              if (customerId) {
                await surreal.query("UPDATE user SET plan = $plan, stripeCustomerId = $customerId WHERE email = $email;", { plan, email: customerEmail, customerId });
              } else {
                await surreal.query("UPDATE user SET plan = $plan WHERE email = $email;", { plan, email: customerEmail });
              }
            }
          }
          // Seed included credits on first-time plan purchase
          if (customerEmail && plan) {
            const creditTier: "$1" | "$20" | "$200" | "minimum" | "pro" | "ultra" =
              plan === "minimum" ? "$1" : plan;
            const included = includedMonthlyCreditsForPlan(creditTier);
            if (included > 0) {
              await adjustCredits(customerEmail, included, "plan_included", session.id);
            }
          }
          
          // Track revenue for subscription purchase (server-side logging for analytics)
          try {
            const revenueAmount = typeof session.amount_total === 'number' ? session.amount_total / 100 : 0; // Convert cents to dollars
            if (revenueAmount > 0 && customerEmail && plan) {
              console.log('[REVENUE] Subscription purchase:', {
                email: customerEmail,
                plan,
                amount: revenueAmount,
                currency: session.currency || 'usd',
                sessionId: session.id,
                eventType: 'subscription'
              });
              // Note: This logs for server-side tracking. Client-side revenue tracking
              // happens via checkout-completed event with revenue property
            }
          } catch (e) {
            console.error('Failed to log revenue:', e);
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
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      try {
        // Remove plan and subscription ID when subscription is deleted
        const email = await getCustomerEmailFromStripe(sub.customer);
        if (email) {
          const surreal = await getSurreal();
          await surreal.query(
            "UPDATE user SET plan = $plan, stripeSubscriptionId = NONE WHERE email = $email;", 
            { plan: null, email }
          );
          console.log(`Subscription deleted for ${email}, plan and subscription ID removed`);
        }
      } catch (e) {
        console.error("Failed to remove plan on customer.subscription.deleted:", e);
      }
      break;
    }
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      try {
        const intent = paymentIntent.metadata?.intent || null;
        if (intent === "auto_reload") {
          const email = paymentIntent.metadata?.userEmail;
          const credits = Number(paymentIntent.metadata?.credits || 0);
          if (email && credits > 0) {
            await adjustCredits(email, credits, "auto_reload", paymentIntent.id);
            console.log(`Auto-reload webhook processed for ${email}: ${credits} credits added`);
          }
        }
      } catch (e) {
        console.error("Failed to process payment_intent.succeeded for auto-reload:", e);
      }
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}


