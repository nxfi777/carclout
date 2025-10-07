import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/stripe";

/**
 * GET /api/subscription/active
 * Returns the user's ACTIVE Stripe subscription plan (not just the plan field).
 * Only returns a plan if they have an active/trialing Stripe subscription.
 */
export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    
    if (!email) {
      return NextResponse.json({ hasActiveSubscription: false, activePlan: null });
    }

    const db = await getSurreal();
    const result = await db.query(
      "SELECT stripeSubscriptionId FROM user WHERE email = $email LIMIT 1;",
      { email }
    );

    const row = Array.isArray(result) && Array.isArray(result[0]) 
      ? (result[0][0] as { stripeSubscriptionId?: string } | undefined)
      : undefined;

    const subscriptionId = row?.stripeSubscriptionId;

    if (!subscriptionId) {
      return NextResponse.json({ hasActiveSubscription: false, activePlan: null });
    }

    // Retrieve the actual subscription from Stripe
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Check if subscription is active or trialing
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      
      if (!isActive) {
        return NextResponse.json({ hasActiveSubscription: false, activePlan: null });
      }

      // Get the plan from the price ID
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = planFromPriceId(priceId);

      return NextResponse.json({ 
        hasActiveSubscription: true, 
        activePlan: plan,
        subscriptionStatus: subscription.status,
      });
    } catch (error) {
      console.error("Error retrieving Stripe subscription:", error);
      // If subscription doesn't exist or can't be retrieved, they don't have an active one
      return NextResponse.json({ hasActiveSubscription: false, activePlan: null });
    }
  } catch (error) {
    console.error("Error checking active subscription:", error);
    return NextResponse.json({ hasActiveSubscription: false, activePlan: null });
  }
}

