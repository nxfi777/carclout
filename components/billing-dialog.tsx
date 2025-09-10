"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BillingDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [topup, setTopup] = useState<string>("");

  useEffect(() => {
    function onOpenBilling() { setOpen(true); }
    window.addEventListener("open-billing", onOpenBilling as EventListener);
    return () => window.removeEventListener("open-billing", onOpenBilling as EventListener);
  }, []);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" }).then(r => r.json());
      if (res.url) window.location.href = res.url;
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Billing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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


