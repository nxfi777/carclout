"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import fireAnimation from '@/public/fire.json';
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });
import { Skeleton } from '@/components/ui/skeleton';
// import InstagramSection from '@/components/instagram-section';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import DateTimeSelect from '@/components/ui/datetime-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type StreakPoint = { day: string; value: number };

function computeTrailingStreak(points: StreakPoint[]): number {
  let s = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value) s += 1; else break;
  }
  return s;
}

function DashboardHomePageInner() {
  const search = useSearchParams();
  const [name, setName] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);
  const [series, setSeries] = useState<StreakPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Array<{ id?: string; title: string; content: string; level?: 'info'|'update'|'warning' }>>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Prefer profile name (username) for Instagram launching
        const prof = await fetch('/api/profile', { cache: 'no-store' }).then((r)=>r.json()).catch(()=>null);
        const profName = prof?.profile?.name;
        if (mounted && typeof profName === 'string' && profName.trim()) {
          setName(String(profName));
        } else {
          const me = await fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
          if (!mounted) return;
          setName(String(me?.name || me?.email || ''));
        }
      } catch {}
      try {
        // Load real activity streak from backend; fall back to empty series
        const res = await fetch('/api/activity/streak', { cache: 'no-store' });
        let pts: StreakPoint[] = [];
        let s = 0;
        if (res.ok) {
          const data = await res.json().catch(()=>({}));
          const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
          pts = days.map((d) => ({
            day: new Date(d.date || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: d.active ? 1 : 0,
          })).slice(-14);
          s = Number.isFinite(Number(data?.streak)) ? Number(data.streak) : computeTrailingStreak(pts);
        } else {
          // graceful fallback: show 14 gray cells
          const days = 14;
          const today = new Date();
          for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            pts.push({ day: label, value: 0 });
          }
          s = 0;
        }
        if (!mounted) return;
        setSeries(pts);
        setStreak(s);
      } catch {}
      finally {
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
    };
  }, []);

  // Listen for streak refresh events (e.g., after daily bonus claim)
  useEffect(() => {
    async function onStreakRefresh() {
      try {
        const res = await fetch('/api/activity/streak', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(()=>({}));
        const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
        const pts: StreakPoint[] = days.map((d) => ({
          day: new Date(d.date || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          value: d.active ? 1 : 0,
        })).slice(-14);
        setSeries(pts);
        setStreak(Number.isFinite(Number(data?.streak)) ? Number(data.streak) : computeTrailingStreak(pts));
      } catch {}
    }
    window.addEventListener('streak-refresh', onStreakRefresh as EventListener);
    return () => window.removeEventListener('streak-refresh', onStreakRefresh as EventListener);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const [reminders, setReminders] = useState<Array<{ id?: string; title?: string|null; caption?: string; scheduled_at?: string; sent_at?: string|null }>>([]);
  const [when, setWhen] = useState<Date | null>(null);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('Post on Instagram');
  const [saving, setSaving] = useState(false);
  const [showCoach, setShowCoach] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/reminders?limit=20', { cache: 'no-store' });
        const json = await res.json();
        setReminders(Array.isArray(json?.reminders) ? json.reminders : []);
      } catch {}
    })();
  }, []);

  // Show welcome coachmark if coming from successful checkout
  useEffect(() => {
    try {
      const fromWelcome = search.get('welcome') === '1';
      if (fromWelcome) {
        setShowCoach(true);
        const t = setTimeout(() => setShowCoach(false), 8000);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [search]);

  async function scheduleReminder() {
    if (!when) { toast.error('Pick a date and time'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, caption, scheduledAt: when.toISOString() }) });
      const json = await res.json();
      if (!res.ok) { toast.error(json?.error || 'Failed to schedule'); return; }
      setCaption(''); setWhen(null);
      setReminders((prev)=> [json.reminder, ...prev].slice(0, 20));
    } finally { setSaving(false); }
  }

  function openInstagram() {
    const h = (name || '').trim().replace(/^@+/, '');
    if (!h) { window.open('https://instagram.com', '_blank', 'noopener,noreferrer'); return; }
    window.open(`https://instagram.com/${encodeURIComponent(h)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <main className="relative px-0 py-3 md:py-4 space-y-4">
      {showCoach ? (
        <div className="pointer-events-none absolute -top-[0.5rem] right-[0.5rem] md:right-[1rem] z-10">
          <div className="relative">
            <div className="rounded-full bg-white/90 text-black text-xs md:text-sm px-[0.8em] py-[0.6em] shadow">
              {`Welcome${name ? `, ${name.split(' ')[0]}` : ''} — have a look around`}
            </div>
            <svg width="120" height="80" viewBox="0 0 120 80" className="absolute -bottom-[2.2rem] right-[1rem] text-white/80" aria-hidden>
              <path d="M5,10 C40,60 80,20 115,60" stroke="currentColor" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      ) : null}
      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="text-xl md:text-2xl font-semibold">{greeting}{name ? `, ${name.split(' ')[0]}` : ''} 👋</div>
        <div className="text-sm text-white/70 mt-1">Welcome back to your dashboard.</div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Consistency</div>
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <div className="text-sm text-white/70">Streak: <span className="text-white">{streak}</span> days</div>
          )}
        </div>
        <div className="w-full overflow-x-auto">
          <div className="min-w-[32rem]">
            {loading || series.length === 0 ? (
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

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">Instagram</div>
          <Button onClick={openInstagram}>Open Instagram</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="space-y-3">
            <div className="text-sm text-white/70">Schedule a reminder to post</div>
            <Input placeholder="Title (optional)" value={title} onChange={(e)=>setTitle(e.target.value)} />
            <Textarea placeholder="Optional caption/notes" value={caption} onChange={(e)=>setCaption(e.target.value)} rows={4} />
            <DateTimeSelect value={when} onChange={setWhen} />
            <Button onClick={scheduleReminder} disabled={saving || !when}>{saving ? 'Saving...' : 'Schedule reminder'}</Button>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Upcoming reminders</div>
            <div className="space-y-2">
              {reminders.length ? reminders.map((r)=> (
                <div key={r.id} className="rounded border border-[color:var(--border)] p-3">
                  <div className="text-sm font-medium">{r.title || 'Reminder'}</div>
                  <div className="text-xs text-white/70">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : ''}{r.sent_at ? ' • sent' : ''}</div>
                  {r.caption ? <div className="text-xs text-white/80 mt-1 whitespace-pre-wrap">{r.caption}</div> : null}
                </div>
              )) : (
                <div className="text-sm text-white/60">No reminders yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function DashboardHomePage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <DashboardHomePageInner />
    </Suspense>
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
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!active && ref.current && typeof ref.current.goToAndStop === 'function') {
      try { ref.current.goToAndStop(0, true); } catch {}
    }
  }, [active]);
  return (
    <div className={`w-12 h-12 md:w-14 md:h-14 rounded overflow-hidden ${active ? '' : 'opacity-70 grayscale'}`}>
      <Lottie lottieRef={ref as any} animationData={fireAnimation as any} autoplay={active} loop={active} />
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


