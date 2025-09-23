"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlanSelector from "@/components/plan-selector";

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
        const profileRes = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        const profile = profileRes?.profile || null;
        // Require onboarding before plan selection
        if (!profile?.onboardingCompleted) {
          const qp = new URLSearchParams();
          const chosen = params.get("plan");
          if (chosen) qp.set("plan", chosen);
          router.replace(`/onboarding${qp.toString() ? `?${qp.toString()}` : ""}`);
          return;
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
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
    </main>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <PlanPageInner />
    </Suspense>
  );
}


