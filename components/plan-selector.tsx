"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ElectricBorder from "@/components/electric-border";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export type PlanKey = "minimum" | "pro";

type PlanFeature = {
  text: string;
  included: boolean;
};

export default function PlanSelector({ ctaLabel = "Join" }: { ctaLabel?: string }) {
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const router = useRouter();

  // Derived feature blurbs without exposing raw credits
  const minPosts = 5; // 500 credits / 100 credits per post (90 gen + 10 cutout)
  const proPosts = 250; // 25,000 credits / 100 credits per post

  const plans = useMemo(() => ([
    {
      key: "minimum" as const,
      name: "Minimum",
      price: 1,
      // Show what they DON'T get with minimum plan - key pricing psychology
      features: [
        { text: `≈ ${minPosts} posts`, included: true },
        { text: "1GB storage", included: true },
        { text: "Community access", included: false },
        { text: "Feature voting", included: false },
        { text: "On-demand upscales", included: false },
        { text: "Video generation", included: false },
        { text: "All tools unlocked", included: false },
        { text: "Priority updates", included: false },
      ] as PlanFeature[],
      comingSoon: false,
      accent: undefined as string | undefined, // bland
    },
    {
      key: "pro" as const,
      name: "Pro",
      price: 27,
      features: [
        { text: `≈ ${proPosts} posts`, included: true, highlight: true },
        { text: "Community access", included: true },
        { text: "Feature voting", included: true },
        { text: "100GB storage", included: true },
        { text: "On-demand upscales", included: true },
        { text: "Video generation", included: true },
        { text: "All tools unlocked", included: true },
        { text: "Priority updates", included: true },
        { text: "Exclusive discounts", included: true },
      ] as (PlanFeature & { highlight?: boolean })[],
      comingSoon: false,
      badge: "BEST VALUE",
      accent: "#ff6a00", // orange electric border
    },
  ]), [minPosts, proPosts]);

  async function startCheckout(plan: PlanKey) {
    try {
      setLoading(plan);
      // If user is not authenticated, redirect to signup with selected plan
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.status === 401) {
          router.push(`/auth/signup?plan=${plan}`);
          return;
        }
      } catch {}
      const res = await fetch("/api/billing/create-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const json = await res.json();
      if (json.url) router.push(json.url);
      else toast.error(json.error || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
      {plans.map((p) => {
        const isMinimum = p.key === "minimum";
        const isPro = p.key === "pro";
        const color = p.accent || "#999999";

        const cardInner = (
          <Card className={(isMinimum ? "" : "border-transparent ") + "h-full flex flex-col gap-3"} style={isMinimum ? undefined : undefined}>
            <CardHeader className="py-3 pb-0">
              <CardTitle className="flex items-center justify-between min-h-[1.5rem]">
                <span>{p.name}</span>
                {isPro && p.badge ? (
                  <span className="text-xs rounded px-2 py-1" style={{ backgroundColor: "rgba(255,106,0,0.12)", color: "#ff6a00" }}>{p.badge}</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 h-full">
              <div className="text-2xl font-semibold flex items-baseline gap-2 leading-none">
                <span>${p.price}/mo</span>
              </div>
              <ul className="text-sm space-y-2">
                {p.features.map((feature) => {
                  const isHighlight = 'highlight' in feature && feature.highlight;
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
                        {isHighlight && isPro ? (
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            <span>
                              ≈ <span className="tabular-nums">{proPosts}</span> posts
                            </span>
                            <span className="relative text-[0.625rem] px-[0.5em] py-[0.25em] rounded-full border shadow badge-new">
                              <span className="shiny-text">50x MORE EDITS</span>
                            </span>
                          </span>
                        ) : (
                          feature.text
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex-1" />
              <Button
                variant={isMinimum ? "outline" : undefined}
                className={"w-full transition-colors " + (isMinimum ? "bg-transparent hover:bg-white/5" : (isPro ? "text-white hover:brightness-110" : ""))}
                style={isPro ? { backgroundColor: color, borderColor: color } : undefined}
                onClick={() => { if (!p.comingSoon) startCheckout(p.key); }}
                disabled={!!p.comingSoon || loading === p.key}
              >
                {p.comingSoon ? "Coming soon" : (loading === p.key ? "Loading…" : ctaLabel)}
              </Button>
            </CardContent>
          </Card>
        );
        return (
          <div key={p.key} className="h-full relative overflow-visible">
            {isPro ? (
              <>
                <ElectricBorder color={color} speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }} className="h-full">
                  {cardInner}
                </ElectricBorder>
              </>
            ) : (
              cardInner
            )}
          </div>
        );
      })}
    </div>
  );
}


