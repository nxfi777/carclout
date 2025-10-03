"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
// import NextImage from 'next/image';
import Link from 'next/link';
import { TemplateCard } from '@/components/templates/template-card';
import fireAnimation from '@/public/fire.json';
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });
import { Skeleton } from '@/components/ui/skeleton';
// import InstagramSection from '@/components/instagram-section';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import DateTimeSelect from '@/components/ui/datetime-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { STREAK_RESTORE_CREDITS_PER_DAY } from '@/lib/credits';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getViewUrl } from '@/lib/view-url-client';
import { Trash2 } from 'lucide-react';
import { FaInstagram } from "react-icons/fa";

type StreakPoint = { day: string; value: number };

function computeTrailingStreak(points: StreakPoint[]): number {
  let s = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value) s += 1; else break;
  }
  return s;
}

function DashboardHomePageInner() {
  const [name, setName] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);
  const [series, setSeries] = useState<StreakPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Array<{ id?: string; name: string; description?: string; slug?: string; thumbnailKey?: string; thumbUrl?: string; createdAt?: string }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const streakScrollRef = useRef<HTMLDivElement | null>(null);

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
        // Determine if mobile viewport for suggestions count (5 desktop, 6 mobile)
        const isMobileViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
        const suggestionsLimit = isMobileViewport ? 6 : 5;
        
        const res = await fetch('/api/templates?limit=200', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        const all = Array.isArray(data?.templates) ? data.templates as Array<{ id?: string; name?: string; description?: string; slug?: string; thumbnailKey?: string; created_at?: string; proOnly?: boolean }> : [];
        // Resolve up to 4 random items with thumbnails
        const pool = [...all];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
        const pick = pool.slice(0, 12); // over-pick to handle missing thumbs
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
          return { id: typeof t?.id === 'string' ? t.id : undefined, name, description, slug, thumbnailKey: keyRaw, thumbUrl, createdAt, proOnly: !!t?.proOnly };
        }));
        const filtered = resolved.filter((t)=> !!t.thumbUrl).slice(0, suggestionsLimit);
        if (mounted) setSuggestions(filtered);
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
      // Try immediately and on next frame to ensure layout is settled
      scrollToEnd();
      requestAnimationFrame(scrollToEnd);
      setTimeout(scrollToEnd, 0);
    } catch {}
  }, [isMobile, loading, series]);

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/reminders?limit=20', { cache: 'no-store' });
        const json = await res.json();
        setReminders(Array.isArray(json?.reminders) ? json.reminders : []);
      } catch {}
    })();
  }, []);

  

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

  function requestDeleteReminder(id?: string) {
    if (!id) return;
    setDeletingId(id);
    setConfirmOpen(true);
  }

  async function confirmDeleteReminder() {
    if (!deletingId) { setConfirmOpen(false); return; }
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/reminders?id=${encodeURIComponent(deletingId)}`, { method: 'DELETE' });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) { toast.error(json?.error || 'Failed to delete'); return; }
      setReminders((prev)=> prev.filter((r)=> r.id !== deletingId));
      toast.success('Reminder deleted');
      setConfirmOpen(false);
      setDeletingId(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <main className="relative px-0 py-3 md:py-4 space-y-4">
      
      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="text-xl md:text-2xl font-semibold">{greeting}{name ? `, ${name.split(' ')[0]}` : ''} 👋</div>
        <div className="text-sm text-white/70 mt-1">Welcome back to your dashboard.</div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-lg font-semibold">Streak: <span className="text-white">{streak}</span> days</div>
              <RestoreStreakButton onRestored={async()=>{ try { window.dispatchEvent(new CustomEvent('streak-refresh')); } catch {} }} />
            </div>
          )}
        </div>
        <div ref={streakScrollRef} className="w-full overflow-x-auto">
          <div className="min-w-0 md:min-w-[32rem]">
            {loading || series.length === 0 ? (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {suggestions.map((t, i)=> (
              <Link key={t.id || t.slug || i} href={t.slug ? `/dashboard/templates?slug=${encodeURIComponent(t.slug)}` : '/dashboard/templates'} className="block">
                <TemplateCard
                  data={{ id: t.id, name: t.name, description: t.description, slug: t.slug, thumbUrl: t.thumbUrl, createdAt: t.createdAt }}
                  showNewBadge={true}
                  showLike={false}
                  showFavoriteCount={false}
                  className="h-full"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/60">No suggestions yet.</div>
        )}
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 md:p-6 md:relative">
        <div className="mb-4 md:hidden">
          <Button onClick={openInstagram} className="w-full">
            <FaInstagram className="mr-2" />
            Open Instagram
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 items-start md:pb-12">
          <div className="space-y-3">
            <div className="text-sm text-white/70">Schedule a reminder to post</div>
            <Input placeholder="Title (optional)" value={title} onChange={(e)=>setTitle(e.target.value)} />
            <Textarea placeholder="Optional caption/notes" value={caption} onChange={(e)=>setCaption(e.target.value)} rows={4} />
            <DateTimeSelect value={when} onChange={setWhen} />
            <Button onClick={scheduleReminder} disabled={saving || !when}>{saving ? 'Saving...' : 'Schedule reminder'}</Button>
          </div>
          <Button onClick={openInstagram} className="hidden md:inline-flex md:absolute md:right-6 md:bottom-6">
            <FaInstagram className="mr-2" />
            Open Instagram
          </Button>
          <div className="space-y-2">
            <div className="text-sm font-medium">Upcoming reminders</div>
            <div className="space-y-2">
              {reminders.length ? reminders.map((r)=> (
                <div key={r.id} className="rounded border border-[color:var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{r.title || 'Reminder'}</div>
                    <Button variant="ghost" size="icon" aria-label="Delete reminder" onClick={()=>requestDeleteReminder(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-white/70">{(function(){
                    const raw = r.scheduled_at || '';
                    try {
                      let s = raw.trim();
                      if (!s) return '';
                      if (s.includes(' ')) s = s.replace(' ', 'T');
                      s = s.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:?\d{2})$/, '$1$2');
                      s = s.replace(/(\.\d{3})\d+$/, '$1');
                      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|[+-]\d{2}:?\d{2})?$/.test(s)) {
                        s = s.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:?\d{2})?$/, '$1:00$2');
                      }
                      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) s = `${s}Z`;
                      const d = new Date(s);
                      if (isNaN(d.getTime())) return 'Invalid Date';
                      return d.toLocaleString();
                    } catch { return 'Invalid Date'; }
                  })()}{r.sent_at ? ' • sent' : ''}</div>
                  {r.caption ? <div className="text-xs text-white/80 mt-1 whitespace-pre-wrap">{r.caption}</div> : null}
                </div>
              )) : (
                <div className="text-sm text-white/60">No reminders yet.</div>
              )}
            </div>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete reminder?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDeleteReminder} disabled={deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete'}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

type LottieRef = { goToAndStop?: (value: number, isFrame?: boolean) => void } | null;
function LottieFireCell({ active }: { active: boolean }) {
  const ref = useRef<LottieRef>(null);
  useEffect(() => {
    if (!active && ref.current && typeof ref.current.goToAndStop === 'function') {
      try { ref.current.goToAndStop(0, true); } catch {}
    }
  }, [active]);
  return (
    <div className={`w-12 h-12 md:w-14 md:h-14 rounded overflow-hidden ${active ? '' : 'opacity-70 grayscale'}`}>
      <Lottie lottieRef={ref as never} animationData={fireAnimation as never} autoplay={active} loop={active} />
    </div>
  );
}

function RestoreStreakButton({ onRestored }: { onRestored?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [missedDays, setMissedDays] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Fetch last 14 days and infer gap between previous and current streaks
    (async () => {
      try {
        const res = await fetch('/api/activity/streak?days=14', { cache: 'no-store' });
        const data = await res.json().catch(()=>({}));
        const days: Array<{ date?: string; active?: boolean }> = Array.isArray(data?.days) ? data.days : [];
        if (!days.length) { setMissedDays(null); setCost(null); return; }
        // Identify current trailing active length
        let i = days.length - 1;
        let current = 0;
        while (i >= 0 && days[i]?.active) { current += 1; i -= 1; }
        const gapEnd = i;
        // gap length
        let j = i;
        while (j >= 0 && !days[j]?.active) { j -= 1; }
        const gapStart = j + 1;
        const gap = gapEnd >= gapStart ? (gapEnd - gapStart + 1) : 0;
        // previous streak before gap
        let k = j;
        let prev = 0;
        while (k >= 0 && days[k]?.active) { prev += 1; k -= 1; }
        // Show only when there is a gap and prev>0 and current<prev and gapEnd is within 7 days
        const withinWindow = (days.length - 1) - gapEnd <= 7;
        if (gap > 0 && prev > 0 && current < prev && withinWindow) {
          setMissedDays(gap);
          setCost(gap * STREAK_RESTORE_CREDITS_PER_DAY);
        } else {
          setMissedDays(null); setCost(null);
        }
      } catch {
        setMissedDays(null); setCost(null);
      }
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
    } finally {
      setBusy(false);
    }
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


