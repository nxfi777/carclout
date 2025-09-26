"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ElectricBorder from "@/components/electric-border";
import { toast } from "sonner";

export type PlanKey = "minimum" | "pro";

export default function PlanSelector({ ctaLabel = "Join" }: { ctaLabel?: string }) {
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const router = useRouter();

  // Derived feature blurbs without exposing raw credits
  const minPosts = 7; // marketing estimate
  const proPosts = 357; // marketing estimate

  const plans = useMemo(() => ([
    {
      key: "minimum" as const,
      name: "Minimum",
      price: 1,
      features: [
        `≈ ${minPosts} posts`,
        "Community access",
        "2GB storage",
      ],
      comingSoon: false,
      accent: undefined as string | undefined, // bland
    },
    {
      key: "pro" as const,
      name: "Pro",
      price: 25,
      features: [
        `≈ ${proPosts} posts`,
        "Community access",
        "100GB storage",
        "On-demand upscales",
        "Video generation",
        "All tools unlocked",
        "Priority updates",
        "Exclusive discounts",
      ],
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
          <Card className={(isMinimum ? "" : "border-transparent ") + "h-full flex flex-col gap-4"} style={isMinimum ? undefined : undefined}>
            <CardHeader className="py-2 pb-0">
              <CardTitle className="flex items-center justify-between">
                <span>{p.name}</span>
                {isPro && p.badge ? (
                  <span className="text-xs rounded px-2 py-1" style={{ backgroundColor: "rgba(255,106,0,0.12)", color: "#ff6a00" }}>{p.badge}</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 h-full">
              <div className="text-2xl font-semibold flex items-baseline gap-2 leading-none">
                <span>${p.price}/mo</span>
              </div>
              <ul className="text-sm list-disc pl-5">
                {p.features.map((f, i) => {
                  if (isPro && i === 0) {
                    return (
                      <li key="pro-posts">
                        <span className="inline-flex items-center gap-2">
                          <span>
                            ≈ <span className="tabular-nums">{proPosts}</span> posts
                          </span>
                          <span className="relative text-[0.625rem] px-[0.5em] py-[0.25em] rounded-full border shadow badge-new">
                            <span className="shiny-text">2x VALUE</span>
                          </span>
                        </span>
                      </li>
                    );
                  }
                  return <li key={f}>{f}</li>;
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


