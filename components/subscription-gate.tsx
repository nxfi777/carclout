"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import PlanSelector from "@/components/plan-selector";
import { isSubscribedPlan } from "@/lib/plans";

type MeResponse = { email?: string; role?: string; plan?: string | null } | { error: string };

export default function SubscriptionGate() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me: MeResponse = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json());
        const plan = 'plan' in me ? (me.plan ?? null) : null;
        if (mounted) setOpen(!isSubscribedPlan(plan));
      } catch {
        if (mounted) setOpen(true);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (checking) return null;

  return (
    <Sheet open={open} onOpenChange={(o)=>{ /* Prevent closing if not subscribed */ if (open && o === false) setOpen(true); }}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-3xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto [&>button]:hidden"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6">
          <SheetHeader className="mb-4 text-center">
            <SheetTitle className="text-2xl font-semibold">Choose your plan</SheetTitle>
            <SheetDescription className="text-sm text-white/75">
              Subscribe to access the dashboard
            </SheetDescription>
          </SheetHeader>
          <PlanSelector />
        </div>
      </SheetContent>
    </Sheet>
  );
}


