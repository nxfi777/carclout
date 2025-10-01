"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { estimateVideoCredits } from "@/lib/credits-client";

export default function BillingDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [topup, setTopup] = useState<string>("");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Pricing helpers for equivalence explainer (10x scale for granular pricing)
  const GENERATION_CREDITS_PER_IMAGE = 100; // UI estimate (90 gen + 10 cutout)
  const UPSCALE_CREDITS_PER_UPSCALE = 20; // keep in sync with server
  const MIN_PER_DOLLAR = 500; // Minimum plan: 2,500 credits for $5 (10x scale)
  const PRO_PER_DOLLAR = 1000; // Pro plan: 5,000 credits for $5 (10x scale)
  const USD_5 = 5;
  const kling5sCredits = useMemo(() => {
    try {
      return Math.max(1, estimateVideoCredits('1080p', 5, 24, 'auto', 'kling2_5'));
    } catch {
      // Fallback: 0.35 vendor * 2.25 markup * 1000 credits per $ = 787.5 → 788
      return 788;
    }
  }, []);
  const eq = useMemo(() => {
    const minCredits = USD_5 * MIN_PER_DOLLAR; // 250
    const proCredits = USD_5 * PRO_PER_DOLLAR; // 500
    const minImages = Math.floor(minCredits / GENERATION_CREDITS_PER_IMAGE);
    const proImages = Math.floor(proCredits / GENERATION_CREDITS_PER_IMAGE);
    const minVideos = Math.floor(minCredits / kling5sCredits);
    const proVideos = Math.floor(proCredits / kling5sCredits);
    const minUpscales = Math.floor(minCredits / UPSCALE_CREDITS_PER_UPSCALE);
    const proUpscales = Math.floor(proCredits / UPSCALE_CREDITS_PER_UPSCALE);
    return { minCredits, proCredits, minImages, proImages, minVideos, proVideos, minUpscales, proUpscales };
  }, [kling5sCredits]);

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
      // Load plan to conditionally show Go Pro button
      try {
        const me = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
        if (mounted) setPlan((me && typeof me?.plan === 'string') ? me.plan : null);
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
            <div className="text-xs text-white/60 mt-2">Minimum $5 per purchase.</div>

            {/* $5 equivalence explainer */}
            <div className="mt-3 rounded bg-white/5 border border-[color:var(--border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium mb-1">What does $5 get you?</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/80">
                    <div className="rounded border border-white/10 p-2">
                      <div className="font-medium mb-1">Minimum</div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-white/60">Credits:</span>
                          <span className="ml-2 font-semibold tabular-nums">{eq.minCredits}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Images:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.minImages}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Videos:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.minVideos}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Upscales:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.minUpscales}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded border border-white/10 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium">Pro</div>
                        <span className="text-[0.7rem] px-[0.6em] py-[0.2em] rounded-full border border-amber-500/40 text-amber-300/90">2x VALUE</span>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-white/60">Credits:</span>
                          <span className="ml-2 font-semibold tabular-nums">{eq.proCredits}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Images:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.proImages}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Videos:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.proVideos}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Upscales:</span>
                          <span className="ml-2 font-semibold tabular-nums">≈ {eq.proUpscales}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sm:ml-3 shrink-0">
                  {plan !== 'pro' ? (
                    <Button
                      variant="outline"
                      onClick={() => { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} }}
                      className="whitespace-nowrap"
                    >
                      Go Pro
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


