"use client";

import { useEffect, useState } from "react";
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
import { Trophy, Sparkles } from "lucide-react";

export default function LevelUpDrawer() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<number>(0);
  const [availableCredits, setAvailableCredits] = useState<number>(0);
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");

  useEffect(() => {
    if (!isDashboard) return;

    async function handleLevelUp(e: Event) {
      const customEvent = e as CustomEvent<{ level: number }>;
      const newLevel = customEvent.detail?.level || 0;
      
      setLevel(newLevel);
      
      // Fetch available XP redemption info
      try {
        const res = await fetch("/api/xp/redeem", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAvailableCredits(data.availableCredits || 0);
        }
      } catch {
        setAvailableCredits(0);
      }

      setOpen(true);
    }

    window.addEventListener("level-up", handleLevelUp as EventListener);

    return () => {
      window.removeEventListener("level-up", handleLevelUp as EventListener);
    };
  }, [isDashboard]);

  if (!isDashboard) return null;

  const freeImages = Math.floor(availableCredits / 100);
  const freeVideos = Math.floor(availableCredits / 1350);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6">
          <SheetHeader className="items-center gap-4 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20 border-2 border-yellow-500/30">
              <Trophy className="size-8 text-yellow-500" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)]/15 px-4 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--primary)]">
              <Sparkles className="size-4" />
              Level Up
            </div>
            <SheetTitle className="text-balance text-3xl font-semibold text-white">
              Level {level} Reached!
            </SheetTitle>
            <SheetDescription className="text-sm text-white/75">
              You&apos;re crushing it. Keep grinding to unlock more rewards.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {/* Level badge - more compact */}
            <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--primary)]/20 via-[color:var(--primary)]/10 to-transparent px-5 py-5 text-center">
              <div className="space-y-2">
                <div className="text-[0.625rem] uppercase tracking-[0.2em] text-white/60">
                  Your Level
                </div>
                <div className="text-5xl font-bold text-white">{level}</div>
                <div className="text-xs text-white/70">
                  New badge unlocked
                </div>
              </div>
            </div>

            {/* Available rewards - compact inline */}
            {availableCredits > 0 && (
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/80 p-4 text-sm">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[0.625rem] uppercase tracking-wide text-white/60">Redeemable</div>
                    <div className="font-semibold text-white">{availableCredits * 10} XP</div>
                  </div>
                  <div>
                    <div className="text-[0.625rem] uppercase tracking-wide text-white/60">Worth</div>
                    <div className="font-semibold text-white">{availableCredits} credits</div>
                  </div>
                </div>
                {freeImages > 0 && (
                  <div className="pt-2 border-t border-white/10 text-center">
                    <span className="text-emerald-300 font-medium text-sm">
                      ≈ {freeImages} free image{freeImages !== 1 ? "s" : ""}
                      {freeVideos > 0 ? ` or ${freeVideos} video${freeVideos !== 1 ? "s" : ""}` : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="px-5 pb-5 sm:px-6 pt-3 flex-col gap-2">
          {availableCredits > 0 ? (
            <>
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  try {
                    window.dispatchEvent(new CustomEvent("open-billing"));
                  } catch {}
                }}
              >
                Redeem Rewards
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Keep grinding
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Keep grinding
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

