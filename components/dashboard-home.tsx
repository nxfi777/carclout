"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getViewUrl } from "@/lib/view-url-client";
// import NextImage from "next/image";
import Link from "next/link";
import { TemplateCard } from "@/components/templates/template-card";
import fireAnimation from "@/public/fire.json";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { STREAK_RESTORE_CREDITS_PER_DAY } from "@/lib/credits";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type StreakPoint = { day: string; value: number };

export default function DashboardHome() {
  const [name, setName] = useState<string>("");
  const [streak, setStreak] = useState<number>(0);
  const [series, setSeries] = useState<StreakPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Array<{ id?: string; name: string; description?: string; slug?: string; thumbnailKey?: string; thumbUrl?: string; createdAt?: string }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const streakScrollRef = useRef<HTMLDivElement | null>(null);

  function computeTrailingStreak(points: StreakPoint[]): number {
    let s = 0;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].value) s += 1; else break;
    }
    return s;
  }

  useEffect(() => {
    let mounted = true;
    function onStreakRefresh() {
      (async () => {
        try {
          const res = await fetch("/api/activity/streak", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
          const pts: StreakPoint[] = days.length
            ? days.map((d) => ({ day: new Date(d.date || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: d.active ? 1 : 0 })).slice(-14)
            : [];
          if (!mounted) return;
          if (pts.length) {
            setSeries(pts);
            const s = Number.isFinite(Number(data?.streak)) ? Number(data.streak) : computeTrailingStreak(pts);
            setStreak(s);
          }
        } catch {}
      })();
    }
    window.addEventListener('streak-refresh', onStreakRefresh as EventListener);
    (async () => {
      try {
        const me = await fetch("/api/me", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({}));
        if (!mounted) return;
        setName(String(me?.name || me?.email || ""));
      } catch {}
      try {
        // Try to load real activity streak; fallback to zeroed series if unavailable
        let pts: StreakPoint[] | null = null;
        try {
          const res = await fetch("/api/activity/streak", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
            if (days.length) {
              pts = days.map((d) => ({ day: new Date(d.date || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: d.active ? 1 : 0 })).slice(-14);
              const s = Number.isFinite(Number(data?.streak)) ? Number(data.streak) : computeTrailingStreak(pts);
              setStreak(s);
            }
          }
        } catch {}
        if (!pts) {
          const days = 14;
          const today = new Date();
          pts = [];
          for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            pts.push({ day: label, value: 0 });
          }
        }
        if (!mounted) return;
        setSeries(pts);
        setStreak(computeTrailingStreak(pts));
      } finally {
        if (mounted) setLoading(false);
      }
      try {
        const res = await fetch('/api/templates?limit=200', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        const all = Array.isArray(data?.templates) ? data.templates as Array<{ id?: string; name?: string; description?: string; slug?: string; thumbnailKey?: string; created_at?: string }> : [];
        const pool = [...all];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
        const pick = pool.slice(0, 8);
        const resolved = await Promise.all(pick.map(async (t)=>{
          const name = String(t?.name || 'Template');
          const slug = typeof t?.slug === 'string' ? t.slug : undefined;
          const description = typeof (t as { description?: string })?.description === 'string' ? (t as { description?: string }).description : '';
          const createdAt = typeof (t as { created_at?: unknown })?.created_at === 'string' ? String((t as { created_at?: unknown }).created_at) : undefined;
          const keyRaw = typeof t?.thumbnailKey === 'string' ? t.thumbnailKey : undefined;
          let thumbUrl: string | undefined;
          if (keyRaw) {
            try {
              const key = keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`;
              const url = await getViewUrl(key, 'admin');
              if (typeof url === 'string') thumbUrl = url as string;
            } catch {}
          }
          return { id: typeof t?.id === 'string' ? t.id : undefined, name, description, slug, thumbnailKey: keyRaw, thumbUrl, createdAt };
        }));
        const filtered = resolved.filter((t)=> !!t.thumbUrl).slice(0,4);
        if (mounted) setSuggestions(filtered);
      } catch {}
    })();
    return () => {
      mounted = false;
      window.removeEventListener('streak-refresh', onStreakRefresh as EventListener);
    };
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 767px)');
      const update = () => setIsMobile(!!mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    } catch {}
  }, []);

  // Auto-scroll streak container to the end on mobile when data loads/changes
  useEffect(() => {
    if (!isMobile || loading) return;
    const el = streakScrollRef.current;
    if (!el) return;
    try {
      const scrollToEnd = () => { el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth); };
      scrollToEnd();
      requestAnimationFrame(scrollToEnd);
      setTimeout(scrollToEnd, 0);
    } catch {}
  }, [isMobile, loading, series]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <main className="px-0 py-3 md:py-4 space-y-4">
      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : (
          <>
            <div className="text-xl md:text-2xl font-semibold">
              {greeting}
              {name ? `, ${name.split(" ")[0]}` : ""} 👋
            </div>
            <div className="text-sm text-white/70 mt-1">Welcome back to your dashboard.</div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Consistency</div>
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-sm text-white/70">
                Streak: <span className="text-white">{streak}</span> days
              </div>
              <RestoreStreakButton onRestored={async()=>{ try { window.dispatchEvent(new CustomEvent('streak-refresh')); } catch {} }} />
            </div>
          )}
        </div>
        <div ref={streakScrollRef} className="w-full overflow-x-auto">
          <div className="min-w-0 md:min-w-[32rem]">
            {loading || !series ? (
              <div className="flex gap-3 md:grid md:grid-cols-[repeat(14,minmax(2rem,1fr))]">
                {Array.from({ length: isMobile ? 7 : 14 }).map((_, i) => (
                  <div key={i} className="shrink-0 flex flex-col items-center gap-2">
                    <Skeleton className="w-12 h-12 md:w-14 md:h-14 rounded" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              <StreakFireChart data={isMobile ? series.slice(-7) : series} />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="text-lg font-semibold mb-3">Suggestions for you</div>
        {suggestions.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {suggestions.map((t, i)=> (
              <Link key={t.id || t.slug || i} href={t.slug ? `/dashboard/templates?slug=${encodeURIComponent(t.slug)}` : '/dashboard/templates'} className="block">
                <TemplateCard
                  data={{ id: t.id, name: t.name, description: t.description, slug: t.slug, thumbUrl: t.thumbUrl, createdAt: t.createdAt }}
                  showNewBadge={true}
                  showLike={false}
                  showFavoriteCount={false}
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/60">No suggestions yet.</div>
        )}
      </section>
    </main>
  );
}

function StreakFireChart({ data }: { data: StreakPoint[] }) {
  return (
    <div className="flex gap-3 md:grid md:grid-cols-[repeat(14,minmax(2rem,1fr))]">
      {data.map((d, i) => (
        <div key={`${d.day}-${i}`} className="shrink-0 flex flex-col items-center gap-2">
          <LottieFireCell active={!!d.value} />
          <div className="text-2xs text-white/60">{d.day}</div>
        </div>
      ))}
    </div>
  );
}

function LottieFireCell({ active }: { active: boolean }) {
  const ref = useRef<{ goToAndStop?: (frame: number, isFrame: boolean) => void } | null>(null);
  useEffect(() => {
    if (!active && ref.current && typeof ref.current.goToAndStop === "function") {
      try {
        ref.current.goToAndStop(0, true);
      } catch {}
    }
  }, [active]);
  return (
    <div className={`w-12 h-12 md:w-14 md:h-14 rounded overflow-hidden ${active ? "" : "opacity-70 grayscale"}`}>
      <Lottie lottieRef={ref as unknown as never} animationData={fireAnimation} autoplay={active} loop={active} />
    </div>
  );
}

function RestoreStreakButton({ onRestored }: { onRestored?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [missedDays, setMissedDays] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Mirror the dashboard page logic: compute gap between previous and current streaks
    (async () => {
      try {
        const res = await fetch('/api/activity/streak?days=14', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
        if (!days.length) { setMissedDays(null); setCost(null); return; }
        let i = days.length - 1;
        let current = 0;
        while (i >= 0 && days[i]?.active) { current += 1; i -= 1; }
        const gapEnd = i;
        let j = i;
        while (j >= 0 && !days[j]?.active) { j -= 1; }
        const gapStart = j + 1;
        const gap = gapEnd >= gapStart ? (gapEnd - gapStart + 1) : 0;
        let k = j;
        let prev = 0;
        while (k >= 0 && days[k]?.active) { prev += 1; k -= 1; }
        const withinWindow = (days.length - 1) - gapEnd <= 7;
        if (gap > 0 && prev > 0 && current < prev && withinWindow) {
          setMissedDays(gap);
          setCost(gap * STREAK_RESTORE_CREDITS_PER_DAY);
        } else {
          setMissedDays(null); setCost(null);
        }
      } catch { setMissedDays(null); setCost(null); }
    })();
  }, []);

  async function onConfirm() {
    if (busy) return;
    if (!missedDays || missedDays <= 0) { setOpen(false); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/activity/streak/restore', { method: 'POST' });
      const json = await res.json().catch(()=>({}));
      if (res.status === 402) { toast.error('Not enough credits to restore. Top up in Billing.'); return; }
      if (!res.ok) { toast.error(json?.error || 'Failed to restore'); return; }
      toast.success(`Streak restored +${json?.missedDays||missedDays} days`);
      try { window.dispatchEvent(new CustomEvent('streak-refresh')); } catch {}
      try { window.dispatchEvent(new CustomEvent('credits-refresh')); } catch {}
      if (onRestored) onRestored();
      setMissedDays(0); setCost(0); setOpen(false);
    } finally { setBusy(false); }
  }

  if (missedDays == null || missedDays <= 0) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={()=>setOpen(true)} disabled={busy}>{busy ? 'Restoring…' : 'Restore Streak'}</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore streak?</AlertDialogTitle>
            <AlertDialogDescription>
              {cost != null && missedDays != null
                ? `This will restore ${missedDays} day${missedDays>1?'s':''} for ${cost} credits (${STREAK_RESTORE_CREDITS_PER_DAY}/day).`
                : 'This will restore missed days and cost credits.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={busy}>{busy ? 'Restoring…' : 'Confirm'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


