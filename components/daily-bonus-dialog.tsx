"use client";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function DailyBonusDialog() {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<number>(0);
  const [level, setLevel] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [streakDelta, setStreakDelta] = useState<number>(0);
  const [claiming, setClaiming] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  useEffect(() => {
    async function onPrompt() {
      try {
        // Check if already claimed today without mutating any state
        const chk = await fetch('/api/activity/streak?days=1', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({}));
        const days: Array<{ date?: string; active?: boolean }> = Array.isArray(chk?.days) ? chk.days : [];
        const today = new Date();
        const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,'0')}-${String(today.getUTCDate()).padStart(2,'0')}`;
        const claimed = days.some(d => (String(d?.date||'').slice(0,10) === todayKey) && !!d.active);
        if (claimed) return;
      } catch {}
      // Open the dialog; user clicks Claim to attempt award
      setOpen(true);
      // Preload current XP for context
      try {
        const r = await fetch('/api/xp', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
        if (r) { setLevel(r.level); setRemaining(r.remaining); }
      } catch {}
    }
    window.addEventListener('prompt-daily-bonus', onPrompt as EventListener);
    // Also attempt prompting on mount in case no component dispatches the event
    onPrompt();
    return () => window.removeEventListener('prompt-daily-bonus', onPrompt as EventListener);
  }, []);

  const title = useMemo(() => {
    if (added > 0) return "Daily Bonus Claimed";
    return "Daily Bonus";
  }, [added]);

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    try {
      const before = await fetch('/api/activity/streak', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({}));
      const beforeStreak = Number(before?.streak || 0);
      const post = await fetch('/api/xp', { method: 'POST', body: JSON.stringify({ reason: 'daily-login' }) }).then(r=>r.json()).catch(()=>({}));
      const awarded = Number(post?.added || 0);
      setAdded(Math.max(0, awarded));
      const xr = await fetch('/api/xp', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
      if (xr) { setLevel(xr.level); setRemaining(xr.remaining); }
      const after = await fetch('/api/activity/streak', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({}));
      const afterStreak = Number(after?.streak || 0);
      setStreakDelta(Math.max(0, afterStreak - beforeStreak));
      if (awarded > 0) {
        try { window.dispatchEvent(new CustomEvent('streak-refresh')); } catch {}
        try { window.dispatchEvent(new CustomEvent('xp-refresh')); } catch {}
      } else {
        setAlreadyClaimed(true);
        // auto-close shortly when already claimed
        setTimeout(() => setOpen(false), 900);
      }
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {added > 0 ? (
              <span>+{added} XP added to your account.</span>
            ) : (
              <span>Claim your daily login bonus to keep your streak alive.</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {level != null && remaining != null ? (
            <div>Level {level} · {remaining} XP to next</div>
          ) : null}
          {streakDelta > 0 ? (
            <div className="text-emerald-400">Streak +{streakDelta} 🔥</div>
          ) : null}
        </div>
        <div className="pt-3">
          <Button className="w-full" onClick={claim} disabled={claiming || alreadyClaimed}>
            {claiming ? 'Claiming…' : (alreadyClaimed ? 'Already claimed' : (added > 0 ? 'Claimed' : 'Claim Bonus'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


