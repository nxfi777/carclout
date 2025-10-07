import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY as string;

if (!STRIPE_SECRET_KEY) {
  console.warn("[Stripe] Missing STRIPE_SECRET_KEY");
}

export const stripe = new Stripe(STRIPE_SECRET_KEY || "sk_test_", {
  apiVersion: "2025-09-30.clover",
});

export type Plan = "minimum" | "pro" | "ultra";
export type BillingInterval = "monthly" | "yearly";

// Stripe Price IDs for each plan and billing interval
export const PLAN_PRICE_IDS: Record<Plan, Partial<Record<BillingInterval, string>>> = {
  minimum: {
    monthly: process.env.STRIPE_PRICE_MINIMUM || "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO || "", // fallback for backwards compat
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
  },
  ultra: {
    monthly: process.env.STRIPE_PRICE_ULTRA_MONTHLY || "",
    yearly: process.env.STRIPE_PRICE_ULTRA_YEARLY || "",
  },
};

export function planFromPriceId(priceId?: string | null): Plan | null {
  if (!priceId) return null;
  for (const [plan, intervals] of Object.entries(PLAN_PRICE_IDS) as [Plan, Partial<Record<BillingInterval, string>>][]) {
    for (const priceIdValue of Object.values(intervals)) {
      if (priceIdValue && priceIdValue === priceId) return plan;
    }
  }
  return null;
}


