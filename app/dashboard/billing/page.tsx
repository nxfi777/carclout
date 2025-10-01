"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Coins, Sparkles, Zap, Trophy, Loader2 } from "lucide-react";
import { estimateVideoCredits } from "@/lib/credits-client";

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [xpData, setXpData] = useState<{ totalXp: number; redeemedXp: number; availableXp: number; availableCredits: number } | null>(null);
  const [redeemAmount, setRedeemAmount] = useState<string>("");
  const [topup, setTopup] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);
  const GENERATION_CREDITS_PER_IMAGE = 100;
  const kling5sCredits = useMemo(() => {
    try { return Math.max(1, estimateVideoCredits("1080p", 5, 24, "auto", "kling2_5")); } catch { return 788; }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [creditsRes, xpRes, meRes] = await Promise.all([fetch("/api/credits", { cache: "no-store" }), fetch("/api/xp/redeem", { cache: "no-store" }), fetch("/api/me", { cache: "no-store" })]);
      if (creditsRes.ok) { const creditsData = await creditsRes.json(); setCredits(creditsData.credits || 0); }
      if (xpRes.ok) { const xpRedeemData = await xpRes.json(); setXpData(xpRedeemData); }
      if (meRes.ok) { const meData = await meRes.json(); setPlan(meData.plan || null); }
    } catch (err) { console.error("Failed to load billing data:", err); } finally { setLoading(false); }
  }

  useEffect(() => {
    loadData();
    const handleRefresh = () => loadData();
    window.addEventListener("credits-refresh", handleRefresh);
    let mounted = true;
    let es: EventSource | null = null;
    (async () => {
      try {
        es = new EventSource("/api/credits/live");
        esRef.current = es;
        es.addEventListener("credit-update", ((e: MessageEvent) => {
          if (!mounted) return;
          try { const data = JSON.parse(e.data); if (typeof data?.credits === "number") setCredits(data.credits); } catch {}
        }) as EventListener);
        es.onerror = () => { if (esRef.current) { try { esRef.current.close(); } catch {} esRef.current = null; } };
      } catch {}
    })();
    return () => {
      mounted = false;
      window.removeEventListener("credits-refresh", handleRefresh);
      const current = esRef.current || es;
      if (current) { try { current.close(); } catch {} esRef.current = null; }
    };
  }, []);

  async function handleRedeem() {
    const amount = parseInt(redeemAmount, 10);
    if (!amount || amount <= 0 || !xpData) { toast.error("Please enter a valid amount"); return; }
    if (amount > xpData.availableCredits) { toast.error(`You can only redeem up to ${xpData.availableCredits} credits`); return; }
    setRedeeming(true);
    try {
      const res = await fetch("/api/xp/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }), });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || "Failed to redeem XP"); return; }
      const data = await res.json();
      toast.success(`Redeemed ${data.creditsAdded} credits!`);
      setRedeemAmount("");
      await loadData();
      try { window.dispatchEvent(new CustomEvent("credits-refresh")); window.dispatchEvent(new CustomEvent("xp-refresh")); } catch {}
    } catch (err) { console.error("Redeem error:", err); toast.error("Failed to redeem XP"); } finally { setRedeeming(false); }
  }

  async function openPortal() {
    try { const res = await fetch("/api/billing/portal", { method: "POST" }); const data = await res.json(); if (data.url) window.location.href = data.url; } catch { toast.error("Failed to open portal"); }
  }

  async function handleTopup() {
    const amount = parseFloat(topup);
    if (!amount || amount < 5) { toast.error("Minimum top-up is $5"); return; }
    try {
      const res = await fetch("/api/billing/create-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topup: amount }), });
      const data = await res.json();
      if (data.url) window.location.href = data.url; else toast.error(data.error || "Failed to create checkout");
    } catch { toast.error("Failed to start checkout"); }
  }

  const freeImages = xpData ? Math.floor(xpData.availableCredits / 100) : 0;
  const freeVideos = xpData ? Math.floor(xpData.availableCredits / 1350) : 0;
  const xpProgress = xpData ? Math.round((xpData.redeemedXp / Math.max(1, xpData.totalXp)) * 100) : 0;

  return (
    <main className="p-3 md:p-4 space-y-6">
      <div><h1 className="text-2xl md:text-3xl font-bold">Billing & Rewards</h1><p className="text-sm text-white/70 mt-1">Manage your credits, redeem XP, and upgrade your plan</p></div>
      <Card><CardHeader><div className="flex items-center gap-2"><Coins className="size-5 text-[color:var(--primary)]" /><CardTitle>Credits Balance</CardTitle></div><CardDescription>Your current credits and plan</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between p-4 rounded-lg border border-[color:var(--border)] bg-white/5"><div className="text-sm text-white/70">Available Credits</div>{credits != null ? <div className="text-2xl font-bold text-white">{credits}</div> : <Skeleton className="h-8 w-24" />}</div>{!loading && (<div className="space-y-2 text-sm text-white/70"><div className="flex items-center justify-between"><span>Plan</span><span className="font-semibold text-white uppercase">{plan || "FORGELESS"}</span></div><div className="flex items-center justify-between"><span>≈ Image edits</span><span className="font-semibold text-white">{Math.floor((credits || 0) / GENERATION_CREDITS_PER_IMAGE)}</span></div><div className="flex items-center justify-between"><span>≈ Video edits (5s)</span><span className="font-semibold text-white">{Math.floor((credits || 0) / kling5sCredits)}</span></div></div>)}<div className="flex gap-2 pt-2"><Button onClick={openPortal} variant="outline" className="flex-1">Manage Subscription</Button></div></CardContent></Card>
      <Card className="border-[color:var(--primary)]/30 bg-gradient-to-br from-[color:var(--primary)]/5 to-transparent"><CardHeader><div className="flex items-center gap-2"><Trophy className="size-5 text-yellow-500" /><CardTitle>Redeem XP for Credits</CardTitle></div><CardDescription>Every 1,000 XP = 100 credits (1 free image edit)</CardDescription></CardHeader><CardContent className="space-y-4">{loading ? (<div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full" /></div>) : xpData ? (<><div className="space-y-3"><div className="flex items-center justify-between p-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]"><div><div className="text-xs uppercase tracking-wide text-white/60">Total XP Earned</div><div className="text-2xl font-bold text-white mt-1">{xpData.totalXp.toLocaleString()}</div></div><Sparkles className="size-8 text-[color:var(--primary)]" /></div><div className="grid grid-cols-2 gap-3"><div className="p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]"><div className="text-xs uppercase tracking-wide text-white/60">Available</div><div className="text-xl font-bold text-emerald-400 mt-1">{xpData.availableXp.toLocaleString()} XP</div></div><div className="p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]"><div className="text-xs uppercase tracking-wide text-white/60">Redeemed</div><div className="text-xl font-bold text-white/70 mt-1">{xpData.redeemedXp.toLocaleString()} XP</div></div></div>{xpData.availableCredits > 0 ? (<><div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5"><div className="flex items-center justify-between mb-2"><span className="text-sm text-white/70">You can redeem</span><Zap className="size-5 text-emerald-500" /></div><div className="text-3xl font-bold text-emerald-400">{xpData.availableCredits} credits</div><div className="text-sm text-white/60 mt-2">= {freeImages} free image{freeImages !== 1 ? "s" : ""}{freeVideos > 0 && ` or ${freeVideos} free video${freeVideos !== 1 ? "s" : ""}`}</div></div><div className="space-y-2"><label className="text-sm font-medium text-white">Redeem amount (credits)</label><div className="flex gap-2"><Input type="number" min="1" max={xpData.availableCredits} value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)} placeholder={`Max ${xpData.availableCredits}`} disabled={redeeming} /><Button onClick={() => setRedeemAmount(String(xpData.availableCredits))} variant="outline" disabled={redeeming}>Max</Button></div><Button onClick={handleRedeem} className="w-full" disabled={redeeming || !redeemAmount}>{redeeming ? <><Loader2 className="size-4 mr-2 animate-spin" />Redeeming...</> : "Redeem XP"}</Button></div></>) : (<div className="p-6 text-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]"><Sparkles className="size-12 mx-auto mb-3 text-white/40" /><div className="text-sm text-white/60">Keep earning XP to unlock free credits!<br /><span className="text-white/80 font-medium">1,000 XP = 1 free image edit</span></div></div>)}</div>{xpData.totalXp > 0 && (<div className="pt-3 border-t border-white/10"><div className="flex items-center justify-between text-xs text-white/60 mb-2"><span>Redemption Progress</span><span>{xpProgress}%</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[color:var(--primary)]" style={{ width: `${xpProgress}%` }} /></div></div>)}</>) : <div className="text-center py-6 text-white/60">Failed to load XP data</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Buy More Credits</CardTitle><CardDescription>One-time credit top-up</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-sm text-white/70">Minimum $5. {plan === "pro" ? "1000" : "500"} credits per dollar on your current plan.</div><div className="flex gap-2"><Input type="number" min="5" step="1" value={topup} onChange={(e) => setTopup(e.target.value)} placeholder="Amount in USD" /><Button onClick={handleTopup} disabled={!topup}>Buy Credits</Button></div></CardContent></Card>
    </main>
  );
}
