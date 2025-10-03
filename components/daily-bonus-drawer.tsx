"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Flame, Loader2, Sparkles } from "lucide-react";
import { useDrawerQueue, DRAWER_PRIORITY } from "@/lib/drawer-queue";

type DrawerState = "idle" | "claiming" | "awarded" | "already";

export default function DailyBonusDrawer() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DrawerState>("idle");
  const [added, setAdded] = useState(0);
  const [streakDelta, setStreakDelta] = useState(0);
  const [level, setLevel] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [xpIntoLevel, setXpIntoLevel] = useState<number | null>(null);
  const [levelSpan, setLevelSpan] = useState<number | null>(null);
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const hasClaimedRef = useRef(false);
  const lastPromptKeyRef = useRef<string | null>(null);
  const claimingRef = useRef(false);
  const { requestShow, notifyDismissed } = useDrawerQueue();

  useEffect(() => {
    if (!isDashboard) return;
    let cancelled = false;

    function currentDayKey() {
      const today = new Date();
      return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    }

    async function needsProfileCompletion(): Promise<boolean> {
      try {
        const prof = await fetch("/api/profile", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        const vehicles = Array.isArray(prof?.profile?.vehicles)
          ? (prof.profile.vehicles as unknown[])
          : [];
        const carPhotos = Array.isArray(prof?.profile?.carPhotos)
          ? (prof.profile.carPhotos as unknown[])
          : [];
        return vehicles.length < 1 || carPhotos.length < 1;
      } catch {
        return false;
      }
    }

    async function alreadyActiveToday(): Promise<boolean> {
      try {
        const res = await fetch("/api/activity/streak?days=1", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days)
          ? data.days
          : [];
        const today = new Date();
        const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
        return days.some(
          (d) => String(d?.date || "").slice(0, 10) === todayKey && !!d.active,
        );
      } catch {
        return false;
      }
    }

    async function fetchStreakValue(): Promise<number> {
      try {
        const res = await fetch("/api/activity/streak", { cache: "no-store" });
        if (!res.ok) return 0;
        const json = await res.json().catch(() => ({}));
        return Number(json?.streak || 0);
      } catch {
        return 0;
      }
    }

    async function refreshXpDetails() {
      try {
        const res = await fetch("/api/xp", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setLevel(typeof data?.level === "number" ? data.level : Number(data?.level || 0));
        setRemaining(
          Number.isFinite(Number(data?.remaining)) ? Number(data.remaining) : null,
        );
        const span = Number.isFinite(Number(data?.levelSpan))
          ? Number(data.levelSpan)
          : Number.isFinite(Number(data?.nextLevelXp)) && Number.isFinite(Number(data?.currentLevelBaseXp))
            ? Math.max(1, Number(data.nextLevelXp) - Number(data.currentLevelBaseXp))
            : null;
        const into = Number.isFinite(Number(data?.xpIntoLevel))
          ? Number(data.xpIntoLevel)
          : Number.isFinite(Number(data?.xp)) && Number.isFinite(Number(data?.currentLevelBaseXp))
            ? Math.max(0, Number(data.xp) - Number(data.currentLevelBaseXp))
            : null;
        setLevelSpan(span);
        setXpIntoLevel(span && span > 0 ? into : null);
      } catch {
        if (!cancelled) {
          setLevel(null);
          setRemaining(null);
          setLevelSpan(null);
          setXpIntoLevel(null);
        }
      }
    }

    async function handlePrompt() {
      if (cancelled) return;
      const todayKey = currentDayKey();
      if (hasClaimedRef.current && lastPromptKeyRef.current !== todayKey) {
        hasClaimedRef.current = false;
      }
      if (hasClaimedRef.current || claimingRef.current) return;
      if (lastPromptKeyRef.current === todayKey) return;
      if (await needsProfileCompletion()) return;
      if (await alreadyActiveToday()) {
        hasClaimedRef.current = true;
        lastPromptKeyRef.current = todayKey;
        return;
      }

      claimingRef.current = true;
      setState("claiming");
      
      // Request to show via queue system with medium priority
      requestShow(
        "daily-bonus",
        DRAWER_PRIORITY.MEDIUM,
        () => setOpen(true),
        () => setOpen(false)
      );
      
      await refreshXpDetails();

      const before = await fetchStreakValue();
      let awarded = 0;
      let leveledUp = false;
      let newLevel = 0;
      try {
        const res = await fetch("/api/xp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "daily-login" }),
        });
        const data = await res.json().catch(() => ({}));
        awarded = Number(data?.added || 0);
        leveledUp = !!data?.leveledUp;
        newLevel = Number(data?.level || 0);
      } catch {
        awarded = 0;
      }
      if (cancelled) {
        claimingRef.current = false;
        return;
      }
      setAdded(Math.max(0, awarded));

      await refreshXpDetails();
      const after = await fetchStreakValue();
      if (!cancelled) {
        setStreakDelta(Math.max(0, after - before));
      }

      if (awarded > 0) {
        setState("awarded");
        hasClaimedRef.current = true;
        lastPromptKeyRef.current = todayKey;
        try {
          window.dispatchEvent(new CustomEvent("streak-refresh"));
        } catch {}
        try {
          window.dispatchEvent(new CustomEvent("xp-refresh"));
        } catch {}
        
        // Trigger level-up drawer if leveled up
        if (leveledUp && newLevel > 0) {
          window.setTimeout(() => {
            try {
              window.dispatchEvent(new CustomEvent("level-up", { detail: { level: newLevel } }));
            } catch {}
          }, 1000);
        }
      } else {
        setState("already");
        hasClaimedRef.current = true;
        lastPromptKeyRef.current = todayKey;
        window.setTimeout(() => {
          if (!cancelled) setOpen(false);
        }, 500);
      }

      claimingRef.current = false;
    }

    window.addEventListener("prompt-daily-bonus", handlePrompt as EventListener);
    handlePrompt();

    return () => {
      cancelled = true;
      window.removeEventListener("prompt-daily-bonus", handlePrompt as EventListener);
    };
  }, [isDashboard, requestShow]);

  const progressValue = useMemo(() => {
    if (xpIntoLevel == null || levelSpan == null || levelSpan <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((xpIntoLevel / levelSpan) * 100)));
  }, [xpIntoLevel, levelSpan]);

  const description = useMemo(() => {
    switch (state) {
      case "claiming":
        return "Securing your streak bonus…";
      case "awarded":
        return added > 0
          ? `You just banked +${added} XP for showing up today.`
          : "You just banked today’s XP bonus.";
      case "already":
        return "You already grabbed today’s bonus. See you tomorrow.";
      default:
        return "Daily bonus";
    }
  }, [added, state]);

  const busy = state === "claiming";

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    setOpen(next);
    if (!next) {
      notifyDismissed("daily-bonus");
    }
  };

  const showProgress = level != null && levelSpan != null && levelSpan > 0 && xpIntoLevel != null;

  if (!isDashboard) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6">
          <SheetHeader className="items-center gap-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)]/15 px-4 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--primary)]">
              <Sparkles className="size-4" />
              Daily Bonus
            </div>
            <SheetTitle className="text-balance text-2xl font-semibold text-white">
              {state === "awarded" ? "Bonus unlocked" : "Checking in"}
            </SheetTitle>
            <SheetDescription className="text-sm text-white/75">
              {description}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--primary)]/20 via-[color:var(--primary)]/10 to-transparent px-6 py-8 text-center">
              {busy ? (
                <div className="flex flex-col items-center gap-3 text-white/80">
                  <Loader2 className="size-10 animate-spin text-[color:var(--primary)]" />
                  <span className="text-sm">Claiming your bonus…</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-white/60">
                    Today&apos;s XP
                  </div>
                  <div className="text-5xl font-semibold text-white">+{added}</div>
                  {streakDelta > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-1 text-xs font-medium text-emerald-200">
                      <Flame className="size-4" />
                      Streak +{streakDelta}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {showProgress ? (
              <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/80 p-5 text-sm text-white/80">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-white/60">
                  <span>Level</span>
                  <span className="text-sm font-semibold text-white">{level}</span>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-white/60">
                    <span>Progress</span>
                    <span className="text-sm font-semibold text-white">{progressValue}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[color:var(--primary)]"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  {remaining != null ? (
                    <div className="mt-3 text-xs text-white/65">
                      {remaining} XP to next level
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <SheetFooter className="px-5 pb-6 sm:px-6">
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            Keep building
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


