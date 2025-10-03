"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Crown, Sparkles, Zap, Video, Upload, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { useDrawerQueue, DRAWER_PRIORITY } from "@/lib/drawer-queue";

export default function WelcomeToProDrawer() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const hasCheckedRef = useRef(false);
  const { requestShow, notifyDismissed } = useDrawerQueue();

  useEffect(() => {
    if (!isDashboard || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    let cancelled = false;

    async function checkForUpgrade() {
      try {
        const res = await fetch("/api/upgrade-status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        
        const data = await res.json();
        if (data?.shouldShowWelcome && !cancelled) {
          // Request to show via queue system with highest priority
          requestShow(
            "welcome-to-pro",
            DRAWER_PRIORITY.CRITICAL,
            () => setOpen(true),
            () => setOpen(false)
          );
        }
      } catch (err) {
        console.error("Failed to check upgrade status:", err);
      }
    }

    checkForUpgrade();

    return () => {
      cancelled = true;
    };
  }, [isDashboard, requestShow]);

  async function handleDismiss() {
    setLoading(true);
    try {
      await fetch("/api/upgrade-status/dismiss", { method: "POST" });
      setOpen(false);
      notifyDismissed("welcome-to-pro");
    } catch (err) {
      console.error("Failed to dismiss welcome:", err);
      setOpen(false);
      notifyDismissed("welcome-to-pro");
    } finally {
      setLoading(false);
    }
  }

  if (!isDashboard) return null;

  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (!loading && !next) {
        handleDismiss();
      }
    }}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-gradient-to-b from-[#ff6a00]/5 to-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-2xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-4rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-8">
          <SheetHeader className="items-center gap-4 text-center">
            {/* Premium Crown Icon */}
            <div className="inline-flex items-center justify-center size-20 rounded-full bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-yellow-500/20 border-2 border-orange-500/40 shadow-lg shadow-orange-500/20">
              <Crown className="size-10 text-orange-500 fill-orange-500/30" />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 px-5 py-1.5 text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold border border-orange-500/30">
              <Sparkles className="size-4" />
              Welcome to Pro
            </div>

            {/* Headline - Hormozi style: Make it about them */}
            <SheetTitle className="text-balance text-3xl font-bold text-white leading-tight">
              You&apos;re officially Pro.
            </SheetTitle>

            {/* Subheadline - Reinforce the investment decision */}
            <SheetDescription className="text-base text-white/85 max-w-md">
              Smart move. You just unlocked everything you need to dominate car content and scale faster than anyone grinding on the base plan.
            </SheetDescription>
          </SheetHeader>

          {/* Benefits Grid - Show what they get (exclusive benefits messaging) */}
          <div className="mt-8 space-y-4">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider text-center">
              What you get that others don&apos;t
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Feature 1: Credits */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[color:var(--card)]/50 border border-[color:var(--border)]/50">
                <div className="shrink-0 mt-0.5">
                  <div className="size-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Zap className="size-4 text-orange-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white mb-1">≈250 Posts/Month</h4>
                  <p className="text-xs text-white/60">50× more content than minimum. Scale like crazy.</p>
                </div>
              </div>

              {/* Feature 2: Video */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[color:var(--card)]/50 border border-[color:var(--border)]/50">
                <div className="shrink-0 mt-0.5">
                  <div className="size-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Video className="size-4 text-purple-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white mb-1">Video Generation</h4>
                  <p className="text-xs text-white/60">Turn static posts into viral video clips.</p>
                </div>
              </div>

              {/* Feature 3: Storage */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[color:var(--card)]/50 border border-[color:var(--border)]/50">
                <div className="shrink-0 mt-0.5">
                  <div className="size-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Upload className="size-4 text-blue-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white mb-1">100GB Storage</h4>
                  <p className="text-xs text-white/60">100× more space. Never delete again.</p>
                </div>
              </div>

              {/* Feature 4: Community */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[color:var(--card)]/50 border border-[color:var(--border)]/50">
                <div className="shrink-0 mt-0.5">
                  <div className="size-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Users className="size-4 text-green-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white mb-1">Community Access</h4>
                  <p className="text-xs text-white/60">Network with top creators. Feature voting.</p>
                </div>
              </div>
            </div>

            {/* Premium Pricing Benefits */}
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30">
              <div className="flex items-start gap-3">
                <TrendingUp className="size-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white mb-1.5">
                    Better Top-Up Rates
                  </h4>
                  <p className="text-xs text-white/70 leading-relaxed">
                    As a Pro member, you get <span className="text-orange-500 font-semibold">up to 2× better rates</span> on credit top-ups compared to minimum plan. More content, lower cost.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* What's Next - Clear next steps */}
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              What to do next
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="size-5 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-white/80">
                  <span className="font-semibold text-white">Create your first Pro-level content</span> — Use video generation and advanced tools
                </p>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="size-5 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-white/80">
                  <span className="font-semibold text-white">Upload your entire library</span> — You&apos;ve got 100GB now
                </p>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="size-5 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-white/80">
                  <span className="font-semibold text-white">Join the community</span> — Network with other Pro creators
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <SheetFooter className="mt-8 gap-3">
            <Button
              onClick={handleDismiss}
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold text-base py-6 rounded-xl shadow-lg shadow-orange-500/25 transition-all"
            >
              {loading ? "Loading..." : "Let's Go"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

