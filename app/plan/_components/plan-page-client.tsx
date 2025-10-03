"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlanSelector from "@/components/plan-selector";
import PaymentProcessorsMarquee from "@/components/payment-processors-marquee";

function PlanPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.status === 401) {
          router.replace("/auth/signin");
          return;
        }
        const profileRes = await fetch("/api/profile", { cache: "no-store" }).then((response) => response.json()).catch(() => null);
        const profile = profileRes?.profile || null;
        if (!profile?.onboardingCompleted) {
          const search = new URLSearchParams();
          const chosen = params.get("plan");
          if (chosen) search.set("plan", chosen);
          router.replace(`/onboarding${search.toString() ? `?${search.toString()}` : ""}`);
          return;
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router, params]);

  if (checking) return null;

  return (
    <main className="container mx-auto px-[1rem] py-[2rem]">
      <section className="max-w-4xl mx-auto text-center space-y-3 mb-[2rem]">
        <h1 className="text-2xl md:text-3xl font-semibold">Choose your plan</h1>
        <p className="text-sm md:text-base text-white/70">You can upgrade or cancel anytime.</p>
      </section>
      <section className="max-w-5xl mx-auto">
        <PlanSelector />
      </section>
      <PaymentProcessorsMarquee />
    </main>
  );
}

export default function PlanPageClient() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}>
      <PlanPageInner />
    </Suspense>
  );
}
