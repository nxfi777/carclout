"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ElectricBorder from "@/components/electric-border";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export type PlanKey = "minimum" | "pro" | "ultra";
export type BillingInterval = "monthly" | "yearly";

type PlanFeature = {
  text: string;
  included: boolean;
};

type ActiveSubscription = {
  hasActiveSubscription: boolean;
  activePlan: PlanKey | null;
  subscriptionStatus?: string;
};

export default function PlanSelector({ ctaLabel = "Join" }: { ctaLabel?: string }) {
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const [billingInterval, _setBillingInterval] = useState<BillingInterval>("yearly");
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const router = useRouter();

  // Derived feature blurbs without exposing raw credits
  const minPosts = 11; // 1100 credits / 100 credits per post (90 gen + 10 cutout)
  // const proPosts = 139; // 13,900 credits / 100 credits per post
  // const ultraPosts = 261; // 26,165 credits / 100 credits per post

  // Fetch active subscription status
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/subscription/active", { cache: "no-store" });
        if (res.ok && mounted) {
          const data = await res.json();
          setActiveSubscription(data);
        }
      } catch (err) {
        console.error("Failed to fetch active subscription:", err);
      } finally {
        if (mounted) setCheckingSubscription(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const plans = useMemo(() => ([
    {
      key: "minimum" as const,
      name: "Growth",
      monthlyPrice: 1,
      yearlyPrice: 1,
      features: [
        { text: `≈ ${minPosts} posts/month`, included: true },
        { text: "All templates unlocked", included: true },
        { text: "Showroom chat access", included: true },
        { text: "Video generation", included: true },
        { text: "4K Upscales", included: true },
        { text: "60fps Smoothing", included: true },
        { text: "1GB storage", included: true },
        { text: "Top up anytime", included: true },
      ] as PlanFeature[],
      comingSoon: false,
      accent: "#8b5cf6", // indigo electric border (same as old ultra)
      badge: "BEST VALUE",
    },
    // Comment out Pro and Ultra plans - single plan model
    /*
    {
      key: "pro" as const,
      name: "Pro",
      monthlyPrice: 17,
      yearlyPrice: 13,
      features: [
        { text: `≈ ${proPosts} posts`, included: true, highlight: true },
        { text: "Community access", included: true },
        { text: "Feature voting", included: true },
        { text: "100GB storage", included: true },
        { text: "On-demand upscales", included: true },
        { text: "Video generation", included: true },
        { text: "All templates unlocked", included: true },
        { text: "Priority updates", included: true },
        { text: "Exclusive discounts", included: true },
        { text: "Video upscale & 60fps", included: false },
        { text: "@nytforge collabs", included: false },
      ] as (PlanFeature & { highlight?: boolean })[],
      comingSoon: false,
      badge: "MOST POPULAR",
      accent: "#ff6a00", // orange electric border
    },
    {
      key: "ultra" as const,
      name: "Ultra",
      monthlyPrice: 39,
      yearlyPrice: 32,
      features: [
        { text: `≈ ${ultraPosts} posts`, included: true, highlight: true },
        { text: "Community access", included: true },
        { text: "Feature voting", included: true },
        { text: "On-demand upscales", included: true },
        { text: "Video generation", included: true },
        { text: "All templates unlocked", included: true },
        { text: "Priority updates", included: true },
        { text: "Exclusive discounts", included: true },
        { text: "Video upscale", included: true },
        { text: "60fps smoothing", included: true },
        { text: "@nytforge collabs", included: true },
        { text: "1TB storage", included: true },
        { text: "Early access features", included: true },
        { text: "Priority support", included: true },
      ] as (PlanFeature & { highlight?: boolean })[],
      comingSoon: false,
      badge: "PREMIUM",
      accent: "#8b5cf6", // purple electric border
    },
    */
  ]), [minPosts]);

  async function startCheckout(plan: PlanKey) {
    try {
      setLoading(plan);
      
      // Track upgrade initiation
      try {
        window.dispatchEvent(new CustomEvent("upgrade-initiated", { 
          detail: { plan, interval: billingInterval, currentPlan: activeSubscription?.activePlan }
        }));
      } catch {}
      
      // If user is not authenticated, redirect to signup with selected plan
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.status === 401) {
          router.push(`/auth/signup?plan=${plan}`);
          return;
        }
      } catch {}
      
      // Track checkout started
      try {
        window.dispatchEvent(new CustomEvent("checkout-started", { 
          detail: { plan, interval: billingInterval }
        }));
      } catch {}
      
      const res = await fetch("/api/billing/create-checkout", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ plan, interval: billingInterval }) 
      });
      const json = await res.json();
      if (json.url) {
        // Store checkout intent for tracking after return
        try {
          sessionStorage.setItem('checkoutIntent', JSON.stringify({ plan, interval: billingInterval, timestamp: Date.now() }));
        } catch {}
        router.push(json.url);
      } else {
        toast.error(json.error || "Failed to start checkout");
        // Track checkout error
        try {
          window.dispatchEvent(new CustomEvent("checkout-error", { 
            detail: { plan, error: json.error }
          }));
        } catch {}
      }
    } finally {
      setLoading(null);
    }
  }

  async function openBillingPortal() {
    try {
      // Track billing portal opened
      try {
        window.dispatchEvent(new CustomEvent("billing-portal-opened", { 
          detail: { currentPlan: activeSubscription?.activePlan }
        }));
      } catch {}
      
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error("Failed to open billing portal");
    } catch {
      toast.error("Failed to open billing portal");
    }
  }

  // Determine plan hierarchy for comparison
  const planHierarchy: Record<PlanKey, number> = {
    minimum: 1,
    pro: 2,
    ultra: 3,
  };

  function getButtonText(planKey: PlanKey): string {
    if (!activeSubscription?.hasActiveSubscription || !activeSubscription.activePlan) {
      return ctaLabel;
    }

    const currentPlanLevel = planHierarchy[activeSubscription.activePlan];
    const targetPlanLevel = planHierarchy[planKey];

    if (currentPlanLevel === targetPlanLevel) {
      return "Manage";
    } else if (targetPlanLevel > currentPlanLevel) {
      return "Upgrade";
    } else {
      return "Downgrade";
    }
  }

  function handlePlanAction(planKey: PlanKey) {
    // If this is their current plan, open billing portal
    if (activeSubscription?.hasActiveSubscription && activeSubscription.activePlan === planKey) {
      openBillingPortal();
    } else {
      // Otherwise, start checkout for upgrade/downgrade
      startCheckout(planKey);
    }
  }

  return (
    <div className="space-y-6">
      {/* Billing Interval Toggle - Hidden for single plan */}
      {/* 
      <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10 max-w-md mx-auto">
        <Label htmlFor="billing-toggle" className={`text-sm font-medium cursor-pointer transition-colors ${billingInterval === "monthly" ? "text-white" : "text-white/50"}`}>
          Monthly
        </Label>
        <Switch 
          id="billing-toggle"
          checked={billingInterval === "yearly"}
          onCheckedChange={(checked) => setBillingInterval(checked ? "yearly" : "monthly")}
          className="data-[state=checked]:bg-[color:var(--primary)]"
        />
        <Label htmlFor="billing-toggle" className={`text-sm font-medium cursor-pointer transition-colors ${billingInterval === "yearly" ? "text-white" : "text-white/50"}`}>
          Yearly <span className="text-green-400 ml-1">(Save 24%)</span>
        </Label>
      </div>
      */}

      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-1 max-w-md mx-auto" style={{ gridAutoRows: '1fr' }}>
        {plans.map((p) => {
          const _isMinimum = p.key === "minimum";
          const color = p.accent || "#8b5cf6";
          const currentPrice = billingInterval === "yearly" ? p.yearlyPrice : p.monthlyPrice;
          const showSavings = billingInterval === "yearly" && p.monthlyPrice !== p.yearlyPrice;
          const monthlyEquivalent = p.monthlyPrice;
          
          // Check if this is the user's current active plan
          const isCurrentPlan = activeSubscription?.hasActiveSubscription && activeSubscription.activePlan === p.key;
          const buttonText = getButtonText(p.key);

          const cardInner = (
            <Card className="border-transparent h-full flex flex-col gap-3">
              <CardHeader className="py-3 pb-0">
                <CardTitle className="flex items-center justify-between min-h-[1.5rem]">
                  <span className="text-lg md:text-xl">{p.name}</span>
                  {isCurrentPlan ? (
                    <span 
                      className="text-xs rounded px-2 py-1 font-semibold" 
                      style={{ 
                        backgroundColor: "rgba(34,197,94,0.12)",
                        color: "#22c55e"
                      }}
                    >
                      CURRENT PLAN
                    </span>
                  ) : p.badge ? (
                    <span 
                      className="text-xs rounded px-2 py-1 font-semibold" 
                      style={{ 
                        backgroundColor: "rgba(139,92,246,0.12)",
                        color: "#8b5cf6"
                      }}
                    >
                      {p.badge}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 h-full">
                <div className="flex flex-col gap-1">
                  <div className="text-2xl font-semibold flex items-baseline gap-2 leading-none">
                    <span>${currentPrice}/mo</span>
                  </div>
                  {showSavings && (
                    <div className="text-xs text-white/50">
                      <span className="line-through">${monthlyEquivalent}/mo</span>
                      <span className="text-green-400 ml-1">Save ${((monthlyEquivalent - currentPrice) * 12).toFixed(0)}/year</span>
                    </div>
                  )}
                </div>
                <ul className="text-sm space-y-2">
                  {p.features.map((feature) => {
                    const _isHighlight = 'highlight' in feature && feature.highlight;
                    const isIncluded = feature.included;
                    
                    return (
                      <li key={feature.text} className="flex items-start gap-2">
                        <span className={`flex-shrink-0 mt-0.5 ${isIncluded ? 'text-green-500' : 'text-red-400/60'}`}>
                          {isIncluded ? (
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          ) : (
                            <X className="h-4 w-4" strokeWidth={2.5} />
                          )}
                        </span>
                        <span className={`flex-1 ${!isIncluded ? 'text-muted-foreground/60 line-through' : ''}`}>
                          {feature.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex-1" />
                <Button
                  variant={isCurrentPlan ? "outline" : undefined}
                  className={"w-full transition-colors " + (
                    isCurrentPlan ? "border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-400" :
                    "text-white hover:brightness-110"
                  )}
                  style={!isCurrentPlan ? { backgroundColor: color, borderColor: color } : undefined}
                  onClick={() => { if (!p.comingSoon && !checkingSubscription) handlePlanAction(p.key); }}
                  disabled={!!p.comingSoon || loading === p.key || checkingSubscription}
                >
                  {p.comingSoon ? "Coming soon" : (loading === p.key ? "Loading…" : checkingSubscription ? "..." : buttonText)}
                </Button>
              </CardContent>
            </Card>
          );
          return (
            <div key={p.key} className="h-full relative overflow-visible">
              <ElectricBorder color={color} speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }} className="h-full">
                {cardInner}
              </ElectricBorder>
            </div>
          );
        })}
      </div>
    </div>
  );
}


