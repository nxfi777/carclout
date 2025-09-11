import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY as string;

if (!STRIPE_SECRET_KEY) {
  console.warn("[Stripe] Missing STRIPE_SECRET_KEY");
}

export const stripe = new Stripe(STRIPE_SECRET_KEY || "sk_test_", {
  apiVersion: "2025-08-27.basil",
});

export type Plan = "minimum" | "basic" | "pro";

export const PLAN_PRICE_IDS: Record<Plan, string> = {
  minimum: process.env.STRIPE_PRICE_MINIMUM || "",
  // 'basic' plan is not currently sold; intentionally no env var
  basic: "",
  pro: process.env.STRIPE_PRICE_PRO || "",
};

export function planFromPriceId(priceId?: string | null): Plan | null {
  if (!priceId) return null;
  const entries = Object.entries(PLAN_PRICE_IDS) as [Plan, string][];
  for (const [plan, id] of entries) {
    if (id && id === priceId) return plan;
  }
  return null;
}


