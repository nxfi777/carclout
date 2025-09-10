'use client';
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MusicSuggestions from '@/components/music/music-suggestions';
// import { createViewUrl, listAllObjects } from '@/lib/r2';
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TextBehindEditor from '@/components/templates/text-behind-editor';
import { Dialog as AppDialog, DialogContent as AppDialogContent, DialogHeader as AppDialogHeader, DialogTitle as AppDialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { R2FileTree } from '@/components/ui/file-tree';
import { Skeleton } from '@/components/ui/skeleton';
import type { Vehicle } from '@/components/vehicles-editor';
// import CircularGallery from '@/components/ui/circular-gallery';
import ThreeDCarousel from '@/components/ui/three-d-carousel';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import carLoadAnimation from '@/public/carload.json';
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });
import FixedAspectCropper from '@/components/ui/fixed-aspect-cropper';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
 

export function HooksTabContent() {
  const [items, setItems] = useState<{ image: string; text: string; videoUrl?: string }[] | null>(null);
  const [thumbsReady, setThumbsReady] = useState(false);
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/hooks/previews', { cache: 'no-store' }).then(r=>r.json());
        const arr = Array.isArray(res.items) ? res.items as { name: string; thumbUrl?: string; videoUrl?: string }[] : [];
        const mapped = arr.filter(x => x.thumbUrl).map(x => ({ image: x.thumbUrl as string, text: x.name, videoUrl: x.videoUrl }));
        if (!aborted) setItems(mapped);
      } catch { if (!aborted) setItems([]); }
    })();
    return () => { aborted = true; };
  }, []);
  useEffect(() => {
    if (items === null) { setThumbsReady(false); return; }
    if (items.length === 0) { setThumbsReady(true); return; }
    let cancelled = false;
    const loaders = items.map((it) => new Promise<void>((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = it.image;
        if (img.complete) resolve();
      } catch { resolve(); }
    }));
    Promise.all(loaders).then(() => { if (!cancelled) setThumbsReady(true); });
    return () => { cancelled = true; };
  }, [items]);
  if (items === null) return <CurvedGallerySkeleton />;
  if (items.length === 0) return <div>No hooks yet</div>;
  if (!thumbsReady) return <CurvedGallerySkeleton />;
  return (
    <div className="w-full h-full min-h-[65vh]">
      <div className="flex items-center justify-end mb-2">
        <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={async()=>{
          try{
            const list = (items || []).filter(it=>it.videoUrl);
            for(let i=0;i<list.length;i++){
              const it=list[i]!; const url = it.videoUrl as string; const name = `${it.text || `hook-${i+1}`}.mp4`;
              const res = await fetch(url, { cache: 'no-store' }); const blob = await res.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name.replace(/[^a-z0-9_.-]+/gi,'_'); document.body.appendChild(a); a.click(); setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
            }
          } catch {}
        }}>Download All</Button>
      </div>
      <div className="w-full h-[65vh] min-h-[24rem]">
        <ThreeDCarousel items={items} />
      </div>
    </div>
  );
}

function CurvedGallerySkeleton() {
  // Mirror ThreeDCarousel defaults/layout so loading state matches final render
  const count = 10;
  const cardW = 180;
  const cardH = 240;
  const gap = 16;
  const minCircumference = count * (cardW + gap);
  const minRadius = minCircumference / (2 * Math.PI);
  const radius = Math.max(240, minRadius);
  const cards = Array.from({ length: count }).map((_, idx) => ({ idx, angle: (idx * 360) / count }));
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function updateScale(){
      try {
        const desiredW = Math.max(cardW * 1.5, radius * 2.2);
        const desiredH = Math.max(cardH * 1.8, radius * 1.5);
        const vw = typeof window !== 'undefined' ? window.innerWidth : desiredW;
        const vh = typeof window !== 'undefined' ? window.innerHeight : desiredH;
        const sW = Math.min(1, (vw - 24) / desiredW);
        const sH = Math.min(1, (vh * 0.65) / desiredH);
        const s = Math.max(0.6, Math.min(sW, sH));
        setScale(Number.isFinite(s) ? s : 1);
      } catch { setScale(1); }
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => { window.removeEventListener('resize', updateScale); };
  }, [radius]);
  return (
    <div className="w-full h-full min-h-[65vh] flex items-center justify-center overflow-hidden">
      <div
        className="relative"
        style={{
          perspective: 1500,
          perspectiveOrigin: 'center',
          width: Math.max(cardW * 1.5, radius * 2.2),
          height: Math.max(cardH * 1.8, radius * 1.5),
          maxWidth: '100%',
          maxHeight: '100%',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <div
          className="relative"
          style={{
            width: cardW,
            height: cardH,
            transformStyle: 'preserve-3d',
            position: 'absolute',
            left: '50%',
            top: '50%',
            marginLeft: -cardW / 2,
            marginTop: -cardH / 2,
            transform: 'rotateX(-10deg)',
          }}
        >
          {cards.map((c) => (
            <div
              key={c.idx}
              className="absolute"
              style={{
                width: cardW,
                height: cardH,
                transform: `rotateY(${c.angle}deg) translateZ(${radius}px)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <Skeleton className="w-full h-full rounded-2xl bg-white/10 border border-white/10 shadow" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// extractFirstFrame not used; remove to satisfy unused warnings

export default function TabsViewFancy() {
  const [activeTab, setActiveTab] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Allow external navigation to a specific tab (used by dock pages)
  useEffect(() => {
    function onSwitch(e: Event) {
      try {
        const id = (e as CustomEvent).detail?.id;
        if (typeof id === 'number') setActiveTab(id);
      } catch {}
    }
    window.addEventListener('content:switch-tab', onSwitch as EventListener);
    return () => window.removeEventListener('content:switch-tab', onSwitch as EventListener);
  }, []);

  useEffect(() => {
    if (activeTab) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const tabs = [
    { id: 1, name: 'Hooks', icon: '🪝', type: 'content', content: <HooksTabContent /> },
    { id: 2, name: 'Templates', icon: '📝', type: 'content', content: <TemplatesTabContent /> },
    { id: 3, name: 'Suggestions', icon: '🎵', type: 'content', content: <MusicSuggestions /> },
  ];

  return (
    <div className='w-full h-full'>
      <div className='flex flex-col gap-4 rounded-xl overflow-hidden h-full'>
        <div className='rounded-xl bg-black/5 dark:bg-white/5 backdrop-filter backdrop-blur-lg p-1 overflow-x-auto'>
          <div className='mx-auto w-max flex items-center gap-2'>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative group flex items-center gap-3 px-4 py-2 rounded-lg transition-all min-w-fit ${activeTab === tab.id ? 'text-white dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'}`}>
                {activeTab === tab.id && (
                  <motion.div layoutId='tabBackground' className='absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg' initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
                )}
                <div className='flex items-center gap-3 z-10'>
                  <span className='text-xl'>{tab.icon}</span>
                  <span className='font-medium'>{tab.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className='flex-1 relative rounded-xl bg-[var(--card)] shadow-lg overflow-hidden min-h-[24rem] h-[calc(100%-0px)]'>
          <AnimatePresence>
            {isLoading && (
              <motion.div key='loader' className='absolute inset-0 z-20 flex items-center justify-center bg-[color:var(--card)]/90 backdrop-blur-sm' initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <svg className='animate-spin h-8 w-8 text-indigo-600' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                  <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                  <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode='wait'>
            <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }} className='p-6 h-full min-h-[16rem] overflow-hidden flex flex-col'>
              <h3 className='text-lg font-semibold flex items-center gap-2 mb-4 text-white shrink-0'>
                <span>{tabs.find((t) => t.id === activeTab)?.icon}</span>
                <span>{tabs.find((t) => t.id === activeTab)?.name}</span>
              </h3>
              <div className='not-prose flex-1 min-h-0'>
                {tabs.find((tab) => tab.id === activeTab)?.content || tabs[0].content}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TemplatesSkeletonGrid(){
  const count = 8;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
          <Skeleton className="w-full aspect-[3/4]" />
          <div className="p-2">
            <Skeleton className="h-4 w-2/5" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type TemplateVariable = { key?: string; type?: string; label?: string; options?: string[]; defaultValue?: string };
type Template = {
  id?: string;
  name: string;
  desc?: string;
  thumbUrl?: string;
  slug?: string;
  variables?: TemplateVariable[];
  prompt?: string;
  favoriteCount?: number;
  isFavorited?: boolean;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle'|'user'>;
};

export function TemplatesTabContent(){
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<{ id?: string; name: string; slug?: string } | null>(null);
  const [me, setMe] = useState<{ plan?: string | null } | null>(null);
  const [source, setSource] = useState<'vehicle' | 'upload' | 'workspace'>('vehicle');
  const [sortBy, setSortBy] = useState<'recent'|'favorites'>('recent');
  const [filterBy, setFilterBy] = useState<'all'|'favorites'>('all');
  const [favBusy, setFavBusy] = useState<Record<string, boolean>>({});
  const [vehiclePhotos, setVehiclePhotos] = useState<string[]>([]);
  const [profileVehicles, setProfileVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // const [dominantTone, setDominantTone] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const [upscales, setUpscales] = useState<Array<{ key: string; url: string }>>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [upscaleBusy, setUpscaleBusy] = useState<boolean>(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetch('/api/me', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
        if (!cancelled) setMe({ plan: m?.plan ?? null });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function canonicalPlan(p?: string | null): 'base' | 'premium' | 'ultra' | null {
    const s = (p || '').toLowerCase();
    if (s === 'ultra' || s === 'pro') return 'ultra';
    if (s === 'premium') return 'premium';
    if (s === 'base' || s === 'basic' || s === 'minimum') return 'base';
    return null;
  }

  async function getCredits(): Promise<number> {
    try {
      const r = await fetch('/api/credits', { cache: 'no-store' }).then(r=>r.json());
      const c = typeof r?.credits === 'number' ? Number(r.credits) : 0;
      return Number.isFinite(c) ? c : 0;
    } catch { return 0; }
  }

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        setLoading(true);
        // Load templates
        const qs: string[] = [];
        if (sortBy === 'favorites') qs.push('sort=most_favorited');
        if (filterBy === 'favorites') qs.push('filter=favorites');
        const q = qs.length ? `?${qs.join('&')}` : '';
        const res = await fetch(`/api/templates${q}`, { cache: 'no-store' }).then(r=>r.json());
        const list = Array.isArray(res?.templates) ? res.templates : [];
        async function resolveThumb(keyRaw?: string | null): Promise<string | undefined>{
          if (!keyRaw || typeof keyRaw !== 'string') return undefined;
          const key = keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`;
          const cacheKey = `ignite:thumb:${key}`;
          try {
            const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
            if (cached) {
              const obj = JSON.parse(cached) as { url?: string; ts?: number };
              const ttlMs = 10*60*1000; // 10m
              if (obj?.url && obj?.ts && Date.now() - obj.ts < ttlMs) return obj.url;
            }
          } catch {}
          try {
            const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key, scope: 'admin' }) }).then(r=>r.json()).catch(()=>({}));
            if (v?.url) {
              try { if (typeof window !== 'undefined') sessionStorage.setItem(cacheKey, JSON.stringify({ url: v.url, ts: Date.now() })); } catch {}
              return v.url;
            }
          } catch {}
          return undefined;
        }
        const out: Template[] = await Promise.all(list.map(async (tRaw: unknown)=>{
          const t = (tRaw as Record<string, unknown>) || {};
          const thumbUrl = await resolveThumb(typeof t.thumbnailKey === 'string' ? t.thumbnailKey : undefined);
          return {
            id: typeof t.id === 'string' ? t.id : undefined,
            name: typeof t.name === 'string' ? t.name : 'Template',
            desc: typeof t.description === 'string' ? t.description : '',
            thumbUrl,
            slug: typeof t.slug === 'string' ? t.slug : undefined,
            variables: Array.isArray(t.variables) ? (t.variables as TemplateVariable[]) : [],
            prompt: String(t.prompt || ''),
            fixedAspectRatio: Boolean(t.fixedAspectRatio),
            aspectRatio: typeof t.aspectRatio === 'number' ? Number(t.aspectRatio) : undefined,
            allowedImageSources: Array.isArray(t.allowedImageSources) ? (t.allowedImageSources as Array<'vehicle'|'user'>) : ['vehicle','user'],
            favoriteCount: Number((t as Record<string, unknown>).favoriteCount || 0),
            isFavorited: Boolean((t as Record<string, unknown>).isFavorited),
          };
        }));
        if (cancelled) return;
        setItems(out);
      } finally { if (!cancelled) setLoading(false); }
      // Load vehicle photo keys for default vehicle source
      try {
        const profile = await fetch('/api/profile', { cache: 'no-store' }).then(r=>r.json());
        const keys: string[] = Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
        setVehiclePhotos(keys);
        const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? profile.profile.vehicles : [];
        setProfileVehicles(vehicles);
        // Choose a primary photo if available
        const primary = keys.find(Boolean) || null;
        setSelectedVehicleKey(primary);
      } catch {}
    })();
    return ()=>{cancelled=true};
  },[sortBy, filterBy]);

  async function toggleFavorite(id?: string, slug?: string) {
    if (!id && !slug) return;
    const key = String(id || slug);
    if (!key) return;
    if (favBusy[key]) return;
    let snapshot: { isFavorited?: boolean; favoriteCount?: number } | null = null;
    setFavBusy(prev => ({ ...prev, [key]: true }));
    setItems(prev => prev.map(it => {
      if ((id && it.id === id) || (slug && it.slug === slug)) {
        snapshot = { isFavorited: !!it.isFavorited, favoriteCount: Number(it.favoriteCount || 0) };
        const nextFav = !it.isFavorited;
        const nextCount = Math.max(0, Number(it.favoriteCount || 0) + (nextFav ? 1 : -1));
        return { ...it, isFavorited: nextFav, favoriteCount: nextCount };
      }
      return it;
    }));
    try {
      const res = await fetch('/api/templates/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: id, templateSlug: slug, action: 'toggle' }) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        // rollback
        if (snapshot) {
          setItems(prev => prev.map(it => ((id && it.id === id) || (slug && it.slug === slug)) ? { ...it, isFavorited: !!snapshot!.isFavorited, favoriteCount: Number(snapshot!.favoriteCount || 0) } : it));
        }
        toast.error(data?.error || 'Failed to update favorite');
        return;
      }
      const favorited: boolean = !!data?.favorited;
      const count: number = Number(data?.count || 0);
      setItems(prev => prev.map(it => ((id && it.id === id) || (slug && it.slug === slug)) ? { ...it, isFavorited: favorited, favoriteCount: count } : it));
    } catch {
      if (snapshot) {
        setItems(prev => prev.map(it => ((id && it.id === id) || (slug && it.slug === slug)) ? { ...it, isFavorited: !!snapshot!.isFavorited, favoriteCount: Number(snapshot!.favoriteCount || 0) } : it));
      }
    } finally {
      setFavBusy(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  const grid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map((it, idx)=> (
        <div key={idx} className="relative">
          <button className={`absolute top-[0.5rem] right-[0.5rem] z-10 rounded-full ${favBusy[String(it.id||it.slug)] ? 'bg-black/40' : 'bg-black/60 hover:bg-black/70'} text-white px-[0.6rem] py-[0.4rem] focus:outline-none focus:ring-2 focus:ring-primary`} aria-label={it.isFavorited ? 'Remove from favourites' : 'Add to favourites'} onClick={(e)=>{ e.stopPropagation(); toggleFavorite(it.id, it.slug); }} disabled={!!favBusy[String(it.id||it.slug)]}>
            <Heart className={`w-[1rem] h-[1rem] ${it.isFavorited ? 'text-red-500 fill-red-500' : ''}`} />
          </button>
          <button className="text-left w-full rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 border border-[color:var(--border)] focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer" onClick={()=>{ setActive({ id: it.id, name: it.name, slug: it.slug }); setOpen(true); }}>
            {it.thumbUrl ? (
              <img src={it.thumbUrl} alt={it.name} className="w-full h-auto" />
            ) : (
              <div className="w-full grid place-items-center text-white/60" style={{ aspectRatio: '16 / 10' }}>No preview</div>
            )}
            <div className="p-2">
              <div className="text-sm font-medium truncate">{it.name}</div>
              {it.desc ? <div className="text-xs text-white/60 line-clamp-2">{it.desc}</div> : null}
              <div className="mt-[0.25rem] text-[0.75rem] text-white/70">{Number(it.favoriteCount||0)} favourite{Number(it.favoriteCount||0)===1?'':'s'}</div>
            </div>
          </button>
        </div>
      ))}
    </div>
  );

  async function saveDesignToGenerations(blob: Blob) {
    try {
      const filename = `design-${Date.now()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file, filename);
      form.append('path', 'generations');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!res.ok) {
        try { const d = await res.json(); toast.error(d?.error || 'Failed to save'); } catch { toast.error('Failed to save'); }
        return;
      }
      try { toast.success('Saved to /generations'); } catch {}
      setDesignOpen(false);
    } catch {}
  }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('path', 'uploads');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const data = await res.json();
      const key: string | undefined = data?.key;
      if (key) setBrowseSelected(key);
    } finally {
      setUploading(false);
    }
  }

  // Build dynamic variable fields from template
  const activeTemplate = useMemo(()=> items.find((t)=> t.id === active?.id || t.slug === active?.slug), [items, active]);
  useEffect(()=>{
    const srcs: Array<'vehicle'|'user'> = Array.isArray(activeTemplate?.allowedImageSources) ? (activeTemplate!.allowedImageSources as Array<'vehicle'|'user'>) : ['vehicle','user'];
    if (srcs.includes('vehicle')) setSource('vehicle'); else setSource('upload');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id, activeTemplate?.slug]);
  const [varState, setVarState] = useState<Record<string, string>>({});
  useEffect(()=>{
    setVarState({});
  }, [open, active?.id, active?.slug]);

  // Prefill defaults for color variables from template definitions (without overriding user input)
  useEffect(()=>{
    try {
      const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
      const defs: any[] = Array.isArray(activeTemplate?.variables) ? (activeTemplate!.variables as any[]) : [];
      if (!defs.length) return;
      const next: Record<string,string> = { ...varState };
      let changed = false;
      for (const d of defs) {
        const key = String(d?.key || '').trim();
        if (!key) continue;
        if (tokensInPrompt.size && !tokensInPrompt.has(key)) continue;
        const type = String(d?.type || 'text');
        if (type === 'color') {
          const def = typeof d?.defaultValue === 'string' ? (d.defaultValue as string) : '';
          if (def && !next[key]) { next[key] = def; changed = true; }
        }
      }
      if (changed) setVarState(next);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id, activeTemplate?.slug, open]);

  // Helpers to map image key to vehicle and prefill built-in vars
  function baseSlug(v: Vehicle | undefined): string {
    if (!v) return '';
    const name = `${v.make} ${v.model}`.trim().toLowerCase();
    return name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function uniqueSlugForIndex(list: Vehicle[], index: number): string {
    const v = list[index];
    if (!v) return '';
    const base = baseSlug(v);
    let priorSame = 0;
    for (let i=0;i<index;i++) {
      const u = list[i];
      if (u && u.make===v.make && u.model===v.model && u.type===v.type) priorSame += 1;
    }
    const suffix = priorSame > 0 ? `-${priorSame}` : '';
    return `${base}${suffix}`;
  }
  function findVehicleForSelected(): Vehicle | null {
    if (!selectedVehicleKey || !profileVehicles.length) return null;
    const idx = selectedVehicleKey.indexOf('/vehicles/');
    if (idx === -1) return null;
    const sub = selectedVehicleKey.slice(idx);
    const m = sub.match(/\/vehicles\/([^/]+)\//);
    const slug = m?.[1] || '';
    const slugs = profileVehicles.map((_, i)=> uniqueSlugForIndex(profileVehicles, i));
    const at = slugs.findIndex(s=> s === slug);
    return at >= 0 ? profileVehicles[at] : null;
  }
  useEffect(()=>{
    const v = findVehicleForSelected();
    if (!v) return;
    const brand = v.make || '';
    const model = v.model || '';
    const cf = (v as any)?.colorFinish ? String((v as any).colorFinish) : '';
    const acc = (v as any)?.accents ? String((v as any).accents) : '';
    const combo = acc ? `${cf} with ${acc}` : cf;
    setVarState(prev=> ({
      ...prev,
      BRAND: brand,
      MODEL: model,
      COLOR_FINISH: cf,
      ACCENTS: acc,
      COLOR_FINISH_ACCENTS: combo,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleKey, JSON.stringify(profileVehicles)]);

  async function generate() {
    if (!active) return;
    setResultUrl(null);
    try {
      // Prevent negative balance: require at least 6 credits before attempting a generation
      const bal = await getCredits();
      if (bal < 6) { toast.error('Not enough credits to generate. Top up in Billing.'); return; }
      // Preflight checks without showing the generating UI
      const userImageKeys: string[] = [];
      let selectedFullKey: string | null = null;
      if (source === 'vehicle') {
        if (!selectedVehicleKey) { toast.error('Select a vehicle image'); return; }
        // selectedVehicleKey is a full key starting with users/<id>/...
        const m = selectedVehicleKey.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : selectedVehicleKey.replace(/^users\//,'');
        userImageKeys.push(rel.replace(/^\/+/,''));
        selectedFullKey = selectedVehicleKey;
      } else if (source === 'workspace') {
        if (!browseSelected) { toast.error('Select a workspace image'); return; }
        const m = browseSelected.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : browseSelected.replace(/^users\//,'');
        userImageKeys.push(rel.replace(/^\/+/,''));
        selectedFullKey = browseSelected;
      } else if (source === 'upload') {
        if (!browseSelected) { toast.error('Upload an image'); return; }
        const m = browseSelected.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : browseSelected.replace(/^users\//,'');
        userImageKeys.push(rel.replace(/^\/+/,''));
        selectedFullKey = browseSelected;
      }

      // Aspect ratio enforcement based on active template
      const t = activeTemplate;
      if (t?.fixedAspectRatio && typeof t?.aspectRatio === 'number' && selectedFullKey) {
        try {
          const res = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: selectedFullKey }) }).then(r=>r.json());
          const url: string | null = res?.url || null;
          if (url) {
            const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img = new Image(); img.onload=()=> resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
            if (dims) {
              const ar = dims.w / dims.h;
              const tolerance = 0.02;
              if (Math.abs(ar / Number(t.aspectRatio) - 1) > tolerance) {
                setPendingKeys([]);
                // Use same-origin proxy to ensure drawable image for canvas
                setCropUrl(`/api/storage/file?key=${encodeURIComponent(selectedFullKey)}`);
                setCropOpen(true);
                return; // wait for crop flow
              }
            }
          }
        } catch {}
      }
      const variables: Record<string, string> = {};
      // Built-ins derived from selected vehicle, when available
      const v = findVehicleForSelected();
      if (v) {
        const brand = v.make || '';
        const model = v.model || '';
        const cf = (v as any)?.colorFinish ? String((v as any).colorFinish) : '';
        const acc = (v as any)?.accents ? String((v as any).accents) : '';
        const combo = acc ? `${cf} with ${acc}` : cf;
        if (brand) variables.BRAND = brand;
        if (model) variables.MODEL = model;
        if (cf) variables.COLOR_FINISH = cf;
        if (acc) variables.ACCENTS = acc;
        if (combo) variables.COLOR_FINISH_ACCENTS = combo;
      }
      if (source !== 'vehicle') {
        const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
        const builtinNeeded = ["BRAND","MODEL","COLOR_FINISH","ACCENTS"].filter(k=> tokensInPrompt.has(k));
        const missing: string[] = [];
        for (const key of builtinNeeded) {
          const val = varState[key] || '';
          if (val) variables[key] = val; else missing.push(key);
        }
        if (builtinNeeded.length && missing.length) {
          toast.error(`Please fill: ${missing.join(', ')}`);
          return;
        }
      }
      // Pull in only template-defined variables (skips built-ins that are auto-filled)
      const vars = Array.isArray(activeTemplate?.variables) ? activeTemplate?.variables as any[] : [];
      for (const vDef of vars) {
        const key = String(vDef?.key || '').trim();
        if (!key) continue;
        const val = varState[key] || '';
        if (val) variables[key] = val;
      }
      // Now we actually start generating: show busy UI
      setBusy(true);
      const payload = { templateId: active.id, templateSlug: active.slug, userImageKeys, variables };
      const res = await fetch('/api/templates/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      let d: unknown = {};
      try { d = await res.json(); } catch { d = {}; }
      const data = d as Record<string, unknown>;
      if (!res.ok) { toast.error(String(data?.error || 'Generation failed')); return; }
      if (typeof data?.url === 'string') setResultUrl(String(data.url));
      if (typeof data?.key === 'string') setResultKey(String(data.key));
      if (typeof data?.url === 'string') setActiveUrl(String(data.url));
      if (typeof data?.key === 'string') setActiveKey(String(data.key));
      setUpscales([]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <TemplatesSkeletonGrid />;
  if (!items.length) return <div>No templates yet</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/70">Filter</div>
            <Select value={filterBy} onValueChange={(v: 'all' | 'favorites')=> setFilterBy(v || 'all')}>
              <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="favorites">My favourites</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/70">Sort</div>
            <Select value={sortBy} onValueChange={(v: 'recent' | 'favorites')=> setSortBy(v || 'recent')}>
              <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder="Most recent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="favorites">Most favourited</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {grid}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
          <DialogHeader>
            <DialogTitle>Use template{active ? ` — ${active.name}` : ''}</DialogTitle>
          </DialogHeader>
          {busy ? (
            <div className="p-10 min-h-[16rem] grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <Lottie animationData={carLoadAnimation as object} loop style={{ width: 280, height: 170 }} />
                <div className="text-sm text-white/80">Generating… this may take a moment</div>
              </div>
            </div>
          ) : resultUrl ? (
            <div className="space-y-3">
              <div className="w-full grid place-items-center">
                <div className="text-xs text-white/70 mb-1">Image auto-saved to <a href="/dashboard?view=forge&tab=workspace&path=generations" target="_blank" rel="noreferrer" className="font-mono text-white/90 underline hover:text-white">/generations</a></div>
                <img src={(activeUrl || resultUrl)} alt="result" className="rounded w-auto max-w-[32rem] max-h-[56vh] h-auto object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button onClick={()=>{ setResultUrl(null); }}>Try again</Button>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={()=> setDesignOpen(true)}>Designer</Button>
                  <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" disabled={upscaleBusy || !resultKey} onClick={async()=>{
                    if (canonicalPlan(me?.plan) !== 'ultra') {
                      try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
                      return;
                    }
                    if (!resultKey) return;
                    setUpscaleBusy(true);
                    try {
                      // Try to offer better estimate by fetching current image dimensions
                      let payloadObj: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                      try {
                        const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: resultKey }) }).then(r=>r.json()).catch(()=>({}));
                        const url: string | null = v?.url || null;
                        if (url) {
                          const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
                          if (dims && dims.w>0 && dims.h>0) { payloadObj = { r2_key: String(resultKey), original_width: dims.w, original_height: dims.h }; }
                        }
                      } catch {}
                      const res = await fetch('/api/tools/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadObj) });
                      const data = await res.json().catch(()=>({}));
                      if (res.status === 402) { toast.error('Not enough credits. Top up in Billing.'); return; }
                      if (res.status === 400 && (data?.error === 'UPSCALE_LIMIT_6MP')) { toast.error('Upscale exceeds the 6MP limit. Try a smaller image.'); return; }
                      if (res.status === 400 && (data?.error === 'ALREADY_UPSCALED')) { toast.error('This image was already upscaled. Use the original.'); return; }
                      if (!res.ok || !data?.url || !data?.key) { toast.error(data?.error || 'Upscale failed'); return; }
                      const entry = { key: String(data.key), url: String(data.url) };
                      setUpscales((prev)=> [...prev, entry]);
                      setActiveKey(entry.key);
                      setActiveUrl(entry.url);
                    } finally { setUpscaleBusy(false); }
                  }}>{upscales.length ? 'Upscale again' : `Upscale (up to 6MP)${canonicalPlan(me?.plan) !== 'ultra' ? ' 🔒' : ''}`}
                  </Button>
                  <Button onClick={async()=>{
                  try {
                    const r = await fetch((activeUrl || resultUrl)!, { cache:'no-store' });
                    const blob = await r.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `image-${Date.now()}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
                  } catch {}
                }}>Download</Button>
                </div>
              </div>
              {upscales.length ? (
                <div className="space-y-2">
                  {upscales.map((u, idx)=> (
                    <div key={u.key} className="flex items-center gap-2">
                      <div className="text-xs text-white/70">Attempt {idx+1}</div>
                      <Select defaultValue={`up-${idx}`} onValueChange={(v)=>{
                        if (v === 'orig') { setActiveKey(resultKey); setActiveUrl(resultUrl); }
                        else { setActiveKey(u.key); setActiveUrl(u.url); }
                      }}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Choose image" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="orig">Original</SelectItem>
                          <SelectItem value={`up-${idx}`}>Upscale #{idx+1}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="text-xs text-white/60">Designer will use the currently selected image. You can't upscale an image that was already upscaled. Upscaling is limited to 6MP.</div>
                </div>
              ) : null}
              <AppDialog open={designOpen} onOpenChange={setDesignOpen}>
                <AppDialogContent className="sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
                  <AppDialogHeader>
                    <AppDialogTitle>Designer</AppDialogTitle>
                  </AppDialogHeader>
                  <div className="mt-2">
                    <TextBehindEditor
                      bgKey={String((activeKey || resultKey) || '')}
                      rembg={{ enabled: true }}
                      defaultHeadline={(findVehicleForSelected()?.make || '').toUpperCase()}
                      onClose={()=> setDesignOpen(false)}
                      onSave={saveDesignToGenerations}
                      saveLabel={'Save to workspace'}
                      aspectRatio={typeof activeTemplate?.aspectRatio === 'number' ? Number(activeTemplate.aspectRatio) : undefined}
                    />
                  </div>
                </AppDialogContent>
              </AppDialog>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {(() => {
                  const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
                  const builtin = new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]);
                  const needBuiltins = source !== 'vehicle' ? ["BRAND","MODEL","COLOR_FINISH","ACCENTS"].filter(k=> tokensInPrompt.has(k)) : [];
                  const customVarDefs = Array.isArray(activeTemplate?.variables) ? (activeTemplate!.variables as any[]).filter((v:any)=> tokensInPrompt.has(String(v?.key || '')) && !builtin.has(String(v?.key || ''))) : [];
                  if (!needBuiltins.length && !customVarDefs.length) return null;
                  return (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Options</div>
                      <div className="space-y-2">
                        {needBuiltins.map((key)=> (
                          <div key={key} className="space-y-1">
                            <div className="text-xs text-white/70">{key.replace(/_/g,' ').toLowerCase().replace(/\b\w/g, (c)=> c.toUpperCase())}</div>
                            <Input value={varState[key] || ''} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} placeholder={key} />
                          </div>
                        ))}
                        {customVarDefs.map((v: any)=> {
                          const key = String(v?.key || '').trim();
                          if (!key) return null;
                          const type = String(v?.type || 'text');
                          const label = String(v?.label || key);
                          if (type === 'select' && Array.isArray(v?.options) && v.options.length) {
                            return (
                              <div key={key} className="space-y-1">
                                <div className="text-xs text-white/70">{label}</div>
                                <Select value={varState[key] || ''} onValueChange={(val)=> setVarState((prev)=> ({ ...prev, [key]: val }))}>
                                  <SelectTrigger className="h-9"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
                                  <SelectContent>
                                    {v.options.map((opt: string, i: number)=> (<SelectItem key={`${key}-${i}`} value={opt}>{opt}</SelectItem>))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          if (type === 'color') {
                            return (
                              <div key={key} className="space-y-1">
                                <div className="text-xs text-white/70">{label}</div>
                                <div className="flex items-center gap-2">
                                  <input type="color" value={varState[key] || '#ffffff'} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]" />
                                  <Input className="w-36" value={varState[key] || '#ffffff'} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} placeholder="#ffffff" />
                                </div>
                              </div>
                            );
                          }
                          if (type === 'color') {
                            return (
                              <div key={key} className="space-y-1">
                                <div className="text-xs text-white/70">{label}</div>
                                <div className="flex items-center gap-2">
                                  <input type="color" value={varState[key] || '#ffffff'} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} className="h-9 w-12 rounded bg-transparent border border-[color:var(--border)]" />
                                  <Input className="w-36" value={varState[key] || '#ffffff'} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} placeholder="#ffffff" />
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={key} className="space-y-1">
                              <div className="text-xs text-white/70">{label}</div>
                              <Input value={varState[key] || ''} onChange={(e)=> setVarState((prev)=> ({ ...prev, [key]: e.target.value }))} placeholder={label} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <div className="text-sm font-medium">Source</div>
                  <Select value={source} onValueChange={(v: 'vehicle' | 'upload' | 'workspace')=>setSource(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray((activeTemplate as any)?.allowedImageSources) ? (activeTemplate as any).allowedImageSources : ['vehicle','user']).includes('vehicle') ? (
                        <SelectItem value="vehicle">Your vehicles</SelectItem>
                      ) : null}
                      {(Array.isArray((activeTemplate as any)?.allowedImageSources) ? (activeTemplate as any).allowedImageSources : ['vehicle','user']).includes('user') ? (
                        <>
                          <SelectItem value="upload">Upload image</SelectItem>
                          <SelectItem value="workspace">Browse workspace</SelectItem>
                        </>
                      ) : null}
                    </SelectContent>
                  </Select>

                  {source === 'vehicle' ? (
                    <div className="space-y-2">
                      {profileVehicles.length ? (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-white/70">Vehicle</div>
                          <Select value={(() => { const v = findVehicleForSelected(); if (!v) return ''; const i = profileVehicles.indexOf(v); return String(i); })()} onValueChange={(v)=>{
                            const idx = parseInt(v);
                            const vobj = profileVehicles[idx];
                            if (!vobj) return;
                            const slug = uniqueSlugForIndex(profileVehicles, idx);
                            const first = vehiclePhotos.find(k=> (k||'').includes(`/vehicles/${slug}/`)) || null;
                            setSelectedVehicleKey(first);
                          }}>
                            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                            <SelectContent>
                              {profileVehicles.map((v, i)=> (
                                <SelectItem key={`${v.make}-${v.model}-${i}`} value={String(i)}>{v.make} {v.model} ({v.type})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-white/70">
                          No vehicles found.
                          <Button size="sm" variant="secondary" onClick={()=>{ try { window.dispatchEvent(new CustomEvent('open-profile')); setTimeout(()=>{ try { window.dispatchEvent(new CustomEvent('highlight-vehicles')); } catch {} }, 300); } catch {} }}>Add vehicle</Button>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <div className="flex gap-3 pb-2">
                          {vehiclePhotos.length ? vehiclePhotos.map((k)=> (
                            <button key={k} onClick={()=>setSelectedVehicleKey(k)} className="relative focus:outline-none shrink-0 w-28">
                              <div className={`w-28 rounded p-0.5 ${selectedVehicleKey===k ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                                <div className="rounded overflow-hidden"><VehicleImage keyStr={k} /></div>
                              </div>
                            </button>
                          )) : (
                            <div className="text-sm text-white/60">No vehicle photos found. Upload in profile.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : source === 'upload' ? (
                    <div className="space-y-2">
                      <input type="file" accept="image/*" onChange={onUploadChange} disabled={uploading} />
                      {uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}
                      {browseSelected ? <div className="text-xs text-white/60">Uploaded: {browseSelected}</div> : null}
                    </div>
                  ) : (
                    <div className="h-[300px] border border-[color:var(--border)] rounded p-2 overflow-hidden">
                      <R2FileTree
                        onNavigate={(p)=>setBrowsePath(p)}
                        onFileSelect={(k)=>setBrowseSelected(k)}
                        scope={'user'}
                        selectedKeys={browseSelected ? [browseSelected] : []}
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={generate} disabled={busy} className="w-full justify-center">Generate</Button>
              </DialogFooter>
              <FixedAspectCropper
                open={cropOpen}
                imageUrl={cropUrl}
                aspectRatio={typeof (activeTemplate as any)?.aspectRatio === 'number' ? Number((activeTemplate as any).aspectRatio) : 1}
                title={`Crop image to match aspect ratio`}
                onCancel={()=>{ setCropOpen(false); setCropUrl(null); setPendingKeys(null); }}
                onCropped={async(blob)=>{
                  setCropOpen(false);
                  setBusy(true);
                  try {
                    const fr = new FileReader();
                    const dataUrl: string = await new Promise((resolve)=>{ fr.onloadend=()=> resolve(String(fr.result||'')); fr.readAsDataURL(blob); });
                    const variables: Record<string, string> = {};
                    const v = findVehicleForSelected();
                    if (v) {
                      const brand = v.make || '';
                      const model = v.model || '';
                      const cf = (v as any)?.colorFinish ? String((v as any).colorFinish) : '';
                      const acc = (v as any)?.accents ? String((v as any).accents) : '';
                      const combo = acc ? `${cf} with ${acc}` : cf;
                      if (brand) variables.BRAND = brand;
                      if (model) variables.MODEL = model;
                      if (cf) variables.COLOR_FINISH = cf;
                      if (acc) variables.ACCENTS = acc;
                      if (combo) variables.COLOR_FINISH_ACCENTS = combo;
                    }
                    if (source !== 'vehicle') {
                      const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
                      const builtinNeeded = ["BRAND","MODEL","COLOR_FINISH","ACCENTS"].filter(k=> tokensInPrompt.has(k));
                      const missing: string[] = [];
                      for (const key of builtinNeeded) {
                        const val = varState[key] || '';
                        if (val) variables[key] = val; else missing.push(key);
                      }
                      if (builtinNeeded.length && missing.length) {
                        toast.error(`Please fill: ${missing.join(', ')}`);
                        setBusy(false);
                        return;
                      }
                    }
                    const varDefs = Array.isArray(activeTemplate?.variables) ? (activeTemplate?.variables as any[]) : [];
                    for (const vDef of varDefs) {
                      const key = String(vDef?.key || '').trim();
                      if (!key) continue;
                      const val = varState[key] || '';
                      if (val) variables[key] = val;
                    }
                    const payload = { templateId: active?.id, templateSlug: active?.slug, userImageKeys: pendingKeys || [], userImageDataUrls: [dataUrl], variables } as any;
                    const res = await fetch('/api/templates/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                    let data: any = {}; try { data = await res.json(); } catch { data = {}; }
                    if (!res.ok) { toast.error(data?.error || 'Generation failed'); return; }
                    if (data?.url) setResultUrl(String(data.url));
                    if (data?.key) setResultKey(String(data.key));
                    if (data?.key) setResultKey(String(data.key));
                  } finally {
                    setBusy(false);
                    setPendingKeys(null);
                    setCropUrl(null);
                  }
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VehicleImage({ keyStr }: { keyStr: string }){
  const [url, setUrl] = useState<string | null>(null);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        const res = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: keyStr }) }).then(r=>r.json());
        if (!cancelled && res?.url) setUrl(res.url);
      } catch {}
    })();
    return ()=>{cancelled=true};
  },[keyStr]);
  if (!url) return <Skeleton className="w-full aspect-square" />
  return <img src={url} alt="vehicle" className="block w-full aspect-square object-cover" />
}

export { TabsViewFancy };


