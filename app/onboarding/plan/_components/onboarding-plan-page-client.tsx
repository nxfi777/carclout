"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlanSelector from "@/components/plan-selector";

export default function OnboardingPlanPageClient() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await fetch("/api/me", { cache: "no-store" }).then((response) => response.json());
        const plan = me?.plan as string | null | undefined;
        const isSubscribed = plan === "minimum" || plan === "basic" || plan === "pro" || plan === "ultra";
        if (isSubscribed) router.replace("/dashboard/templates");
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (checking) return null;

  return (
    <div className="container mx-auto py-[2.5rem]">
      <h1 className="text-3xl font-bold mb-[1.5rem]">Choose your plan</h1>
      <PlanSelector />
    </div>
  );
}
