"use client";
import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillingDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [topup, setTopup] = useState<string>("");
  const [credits, setCredits] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function onOpenBilling() {
      try {
        const cached = (window as unknown as { __CREDITS?: unknown }).__CREDITS;
        if (typeof cached === 'number') setCredits(cached);
      } catch {}
      setOpen(true);
    }
    window.addEventListener("open-billing", onOpenBilling as EventListener);
    return () => window.removeEventListener("open-billing", onOpenBilling as EventListener);
  }, []);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" }).then(r => r.json());
      if (typeof res?.url === 'string' && res.url) { window.location.href = res.url; }
    } finally {
      setLoading(false);
    }
  }

  async function startTopup(){
    const amt = Math.max(5, Math.floor(Number(topup)));
    if (!amt || Number.isNaN(amt)) { toast.error("Enter $ amount (min $5)"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/create-checkout", { method: "POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ topup: amt }) }).then(r=>r.json());
      if (res?.url) {
        if (res?.hint) toast.message("Tip", { description: res.hint });
        window.location.href = res.url;
      } else {
        toast.error(res?.error || "Failed to start top-up");
      }
    } finally { setLoading(false); }
  }

  // Load credits when dialog opens and subscribe to live updates while open
  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let onCache: EventListener | null = null;
    (async () => {
      if (!open) return;
      // Instant seed from global cache if available to avoid UI delay
      try {
        const cached = (window as unknown as { __CREDITS?: unknown }).__CREDITS;
        if (typeof cached === 'number') setCredits(cached);
      } catch {}
      // Listen for cache broadcasts while open
      onCache = ((ev: Event) => {
        try {
          const detail = (ev as CustomEvent).detail as { credits?: unknown } | undefined;
          const c = typeof detail?.credits === 'number' ? Number(detail.credits) : null;
          if (c != null && mounted) setCredits(c);
        } catch {}
      }) as EventListener;
      try { window.addEventListener('credits-cache', onCache as EventListener); } catch {}
      try {
        const r = await fetch("/api/credits", { cache: "no-store" }).then(r => r.json());
        if (!mounted) return;
        const c = typeof r?.credits === "number" ? Number(r.credits) : null;
        if (c != null) setCredits(c);
      } catch {}
      try {
        es = new EventSource("/api/credits/live");
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const c = typeof data?.credits === "number" ? Number(data.credits) : null;
            if (c != null && mounted) setCredits(c);
          } catch {}
        };
        es.onerror = () => {
          try { if (es) { es.close(); } } catch {}
          esRef.current = null;
        };
      } catch {}
    })();
    return () => {
      mounted = false;
      const current = esRef.current || es;
      if (current) { try { current.close(); } catch {} esRef.current = null; }
      if (onCache) { try { window.removeEventListener('credits-cache', onCache); } catch {} }
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-3 rounded border border-[color:var(--border)] bg-white/5">
            <div className="text-sm">
              <span className="text-white/70">Credits balance:</span>
              {credits != null ? (
                <span className="ml-2 font-medium text-white">{`${credits} credits`}</span>
              ) : (
                <Skeleton className="ml-2 inline-block align-middle h-[1em] w-[6em]" />
              )}
            </div>
          </div>
          <div className="text-sm text-white/70">Manage your subscription, payment methods, and invoices in the customer portal.</div>
          <Button disabled={loading} onClick={openPortal}>Open customer portal</Button>
          <div className="mt-2 p-3 rounded border border-[color:var(--border)]">
            <div className="text-sm font-medium mb-2">Top up credits</div>
            <div className="flex items-center gap-2">
              <input className="rounded bg-white/5 px-3 py-2 text-sm w-28" placeholder="$ Amount" value={topup} onChange={(e)=> setTopup(e.target.value)} />
              <Button disabled={loading} onClick={startTopup}>Buy credits</Button>
            </div>
            <div className="text-xs text-white/60 mt-1">Minimum $5 per purchase. Better value on Pro.</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


