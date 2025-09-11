"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import fireAnimation from "@/public/fire.json";
import { Skeleton } from "@/components/ui/skeleton";
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type StreakPoint = { day: string; value: number };

export default function DashboardHome() {
  const [name, setName] = useState<string>("");
  const [streak, setStreak] = useState<number>(0);
  const [series, setSeries] = useState<StreakPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Array<{ id?: string; title: string; content: string; level?: "info"|"update"|"warning" }>>([]);

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
        const res = await fetch('/api/announcements?limit=5', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        if (mounted) setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
      } catch {}
    })();
    return () => {
      mounted = false;
      window.removeEventListener('streak-refresh', onStreakRefresh as EventListener);
    };
  }, []);

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
            <div className="text-sm text-white/70">
              Streak: <span className="text-white">{streak}</span> days
            </div>
          )}
        </div>
        <div className="w-full overflow-x-auto">
          <div className="min-w-[32rem]">
            {loading || !series ? (
              <div className="grid grid-cols-[repeat(14,minmax(2rem,1fr))] gap-3">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="w-12 h-12 md:w-14 md:h-14 rounded" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              <StreakFireChart data={series} />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="text-lg font-semibold mb-3">Announcements</div>
        <div className="space-y-2">
          {announcements.length ? (
            announcements.map((a, i) => (
              <AnnouncementItem key={a.id || i} title={a.title} content={a.content} level={a.level || 'info'} />
            ))
          ) : (
            <div className="text-sm text-white/60">No announcements yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}

function StreakFireChart({ data }: { data: StreakPoint[] }) {
  return (
    <div className="grid grid-cols-[repeat(14,minmax(2rem,1fr))] gap-3">
      {data.map((d, i) => (
        <div key={`${d.day}-${i}`} className="flex flex-col items-center gap-2">
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

function AnnouncementItem({ title, content, level }: { title: string; content: string; level: 'info'|'update'|'warning' }) {
  const intent = level === 'warning' ? 'warning' : (level === 'update' ? 'update' : 'info');
  const border = intent === 'warning' ? 'border-amber-500/30' : (intent === 'update' ? 'border-blue-500/30' : 'border-white/10');
  const bg = intent === 'warning' ? 'bg-amber-500/10' : (intent === 'update' ? 'bg-blue-500/10' : 'bg-white/5');
  return (
    <div className={`rounded border ${border} ${bg} p-3`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-white/80 whitespace-pre-wrap mt-1">{content}</div>
    </div>
  );
}


