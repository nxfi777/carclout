type RawPlan = string | null | undefined;

export type Plan = "minimum" | "pro" | "ultra";

export function normalizePlan(plan: RawPlan): Plan | null {
  const value = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (value === "minimum" || value === "base" || value === "starter" || value === "basic") {
    return "minimum";
  }
  if (value === "pro" || value === "premium") {
    return "pro";
  }
  if (value === "ultra") {
    return "ultra";
  }
  return null;
}

export function isMinimumPlan(plan: RawPlan): boolean {
  return normalizePlan(plan) === "minimum";
}

export function isSubscribedPlan(plan: RawPlan): boolean {
  const normalized = normalizePlan(plan);
  return normalized === "minimum" || normalized === "pro" || normalized === "ultra";
}


