"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlanSelector from "@/components/plan-selector";

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
        const isSubscribed = plan === 'minimum' || plan === 'basic' || plan === 'pro';
        if (mounted) setOpen(!isSubscribed);
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
    <Dialog open={open} onOpenChange={(o)=>{ /* Prevent closing if not subscribed */ if (open && o === false) setOpen(true); }}>
      <DialogContent showCloseButton={false} overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Choose your plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">Subscribe to access the dashboard. The background is disabled until you pick a plan.</p>
          <PlanSelector />
        </div>
      </DialogContent>
    </Dialog>
  );
}


