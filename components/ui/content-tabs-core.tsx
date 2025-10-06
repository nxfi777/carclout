'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import NextImage from 'next/image';
import { BlurhashImage } from '@/components/ui/blurhash-image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import MusicSuggestions from '@/components/music/music-suggestions';
// import { createViewUrl, listAllObjects } from '@/lib/r2';
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Designer from '@/components/layer-editor/designer';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { UploadIcon, ChevronRight, SquarePlus, SquareCheckBig, RotateCw } from 'lucide-react';
import { TemplateCard } from '@/components/templates/template-card';
import { DropZone } from '@/components/ui/drop-zone';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { confirmToast } from '@/components/ui/toast-helpers';
import { getViewUrl, getViewUrls } from '@/lib/view-url-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CreditDepletionDrawer from '@/components/credit-depletion-drawer';
import { useCreditDepletion } from '@/lib/use-credit-depletion';
 

export function HooksTabContent() {
  const [items, setItems] = useState<{ image: string; text: string; videoUrl?: string }[] | null>(null);
  const [thumbsReady, setThumbsReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, _setActiveIdx] = useState<number | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const [downloadIdx, setDownloadIdx] = useState<number | null>(null);
  const [playerIdx, setPlayerIdx] = useState<number | null>(null);

  async function downloadVideo(url?: string, name?: string) {
    try {
      if (!url) return;
      const safeName = (name || 'hook').replace(/[^a-z0-9_.-]+/gi, '_');
      const res = await fetch(url, { cache: 'no-store' });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.mp4`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(a.href); document.body.removeChild(a); } catch {} }, 1000);
    } catch {}
  }

  // Pause inactive previews so only the selected card plays
  useEffect(() => {
    try {
      videoRefs.current.forEach((video, idx) => {
        if (!video) return;
        if (activeIdx !== null && idx === activeIdx) return;
        try { video.pause(); } catch {}
      });
    } catch {}
  }, [activeIdx]);

  const activateCard = useCallback((idx: number) => {
    const video = videoRefs.current[idx] ?? null;
    _setActiveIdx((prev) => {
      if (prev === idx) return prev;
      if (video) {
        try {
          video.playsInline = true;
          video.muted = false;
          video.controls = true;
          video.play().catch(() => {});
        } catch {}
      }
      if (prev !== null && prev !== idx) {
        const prevVideo = videoRefs.current[prev] ?? null;
        if (prevVideo) {
          try {
            prevVideo.pause();
          } catch {}
        }
      }
      return idx;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mql.matches);
    update();
    try {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    } catch {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
  }, []);
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
        const img = new window.Image();
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
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items?.length, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e && e.isIntersecting) {
        setVisibleCount((c) => Math.min((items?.length || 0), c + PAGE_SIZE));
      }
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });
    observer.observe(el);
    return () => { try { observer.unobserve(el); observer.disconnect(); } catch {} };
  }, [isMobile, items?.length]);

  if (items === null) return isMobile ? <MobileHooksSkeleton /> : <CurvedGallerySkeleton />;
  if (items.length === 0) return <div>No hooks yet</div>;
  if (!thumbsReady) return isMobile ? <MobileHooksSkeleton /> : <CurvedGallerySkeleton />;

  if (isMobile) {
    const toShow = (items || []).slice(0, visibleCount);
    const hasMore = visibleCount < (items?.length || 0);
    return (
      <div className="w-full h-full min-h-[65vh]">
        <div className="px-6 pt-1 pb-2">
          <Button size="sm" variant="outline" className="h-9 w-full text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={async()=>{
            try{
              const list = (items || []).filter(it=>it.videoUrl);
              for(let i=0;i<list.length;i++){
                const it=list[i]!; const url = it.videoUrl as string; const name = `${it.text || `hook-${i+1}`}.mp4`;
                const res = await fetch(url, { cache: 'no-store' }); const blob = await res.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name.replace(/[^a-z0-9_.-]+/gi,'_'); document.body.appendChild(a); a.click(); setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
              }
            } catch {}
          }}>Download All</Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="grid grid-cols-2 gap-3 pb-6">
            {toShow.map((it, _idx) => (
              <div
                key={`${it.text}-${_idx}`}
                role="button"
                tabIndex={0}
                onClick={(e)=>{
                  try {
                    if (activeIdx === _idx) return;
                    e.preventDefault();
                    e.stopPropagation();
                    activateCard(_idx);
                  } catch {}
                }}
                onContextMenu={(e)=>{ try { e.preventDefault(); } catch {} }}
                className="relative rounded-lg overflow-hidden bg-white/5 border border-white/10 text-left select-none"
                style={{ WebkitUserSelect: 'none' as unknown as undefined, WebkitTouchCallout: 'none' as unknown as undefined }}
              >
                <div className="relative w-full aspect-[3/4]">
                  {/* Keep video mounted to leverage browser caching and avoid refetches */}
                  {it.videoUrl ? (
                    <video
                      ref={(el) => { videoRefs.current[_idx] = el; }}
                      src={it.videoUrl}
                      poster={it.image}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${activeIdx === _idx ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                      playsInline
                      controls={activeIdx === _idx}
                      controlsList="nodownload noplaybackrate"
                      preload="metadata"
                      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                      onClick={(e)=>{
                        try {
                          if (activeIdx === _idx) return; // native controls are visible; let iOS handle clicks
                          if (e.target === e.currentTarget) {
                            e.stopPropagation();
                            activateCard(_idx);
                          }
                        } catch {}
                      }}
                      onContextMenu={(e)=>{ try { e.preventDefault(); } catch {} }}
                      onPlay={(e)=>{
                        try {
                          const idx = videoRefs.current.indexOf(e.currentTarget ?? null);
                          if (idx >= 0) {
                            _setActiveIdx(idx);
                          }
                        } catch {}
                      }}
                      onPause={(e)=>{
                        try {
                          const idx = videoRefs.current.indexOf(e.currentTarget ?? null);
                          if (idx >= 0 && activeIdx === idx) {
                            _setActiveIdx(idx);
                          }
                        } catch {}
                      }}
                    />
                  ) : null}
                  <NextImage src={it.image} alt="Hook" fill draggable={false} sizes="(max-width: 640px) 50vw, 33vw" className={`object-cover transition-opacity duration-200 ${activeIdx === _idx ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }} />
                </div>
                <div className="border-t border-white/10 bg-black/40 px-2 py-2 flex items-center justify-center text-white">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9 w-full max-w-[16rem] rounded-full text-xs"
                    onClick={(e)=>{
                      try {
                        e.preventDefault();
                        e.stopPropagation();
                        setDownloadIdx(_idx);
                      } catch {}
                    }}
                  >
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Dialog open={downloadIdx !== null} onOpenChange={(v)=>{ try { if (!v) setDownloadIdx(null); } catch {} }}>
            <DialogContent className="p-4">
              <DialogHeader>
                <DialogTitle>Download hook?</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button onClick={async()=>{
                  try {
                    const it = toShow[downloadIdx ?? -1];
                    if (it?.videoUrl) await downloadVideo(it.videoUrl, it.text);
                  } finally { try { setDownloadIdx(null); } catch {} }
                }}>Download</Button>
                <Button variant="outline" onClick={()=> setDownloadIdx(null)}>Cancel</Button>
              </div>
            </DialogContent>
          </Dialog>
          <div ref={sentinelRef} className="h-8" aria-hidden />
          {!hasMore ? null : (
            <div className="pb-6 px-1">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
                    <Skeleton className="w-full aspect-[3/4]" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
        <ThreeDCarousel
          items={items}
          onItemClick={(_it, idx) => { try { setPlayerIdx(idx); } catch {} }}
        />
      </div>
      <Dialog open={playerIdx !== null} onOpenChange={(v)=>{ try { if (!v) setPlayerIdx(null); } catch {} }}>
        <DialogContent className="p-2 sm:p-4 md:p-6 lg:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{(() => { try { return items[playerIdx ?? -1]?.text || 'Hook'; } catch { return 'Hook'; } })()}</DialogTitle>
          </DialogHeader>
          <div className="relative w-full">
            {playerIdx !== null ? (
              <video
                src={String(items[playerIdx]?.videoUrl || '')}
                controls
                autoPlay
                playsInline
                className="w-full h-auto max-h-[70vh] rounded-md bg-black"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
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

function MobileHooksSkeleton(){
  const count = 8;
  return (
    <div className="w-full h-full min-h-[65vh]">
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="sticky top-0 z-20 -mx-6 px-6 pt-1 pb-2 bg-[color:var(--card)]/80 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--card)]/60">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 pb-6">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
              <Skeleton className="w-full aspect-[3/4]" />
              <div className="p-2">
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// extractFirstFrame not used; remove to satisfy unused warnings

export default function ContentTabs() {
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
    if (!activeTab) return;
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [activeTab, setIsLoading]);

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
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`relative group flex items-center gap-3 px-4 py-2 rounded-lg transition-all min-w-fit ${activeTab === t.id ? 'text-white dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'}`}>
                {activeTab === t.id && (
                  <motion.div layoutId='tabBackground' className='absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg' initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
                )}
                <div className='flex items-center gap-3 z-10'>
                  <span className='text-xl'>{t.icon}</span>
                  <span className='font-medium'>{t.name}</span>
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
            <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }} className='p-6 h-full min-h-[16rem] overflow-hidden flex flex-col absolute inset-0'>
              <h3 className='text-lg font-semibold flex items-center gap-2 mb-4 text-white shrink-0'>
                <span>{tabs.find((t) => t.id === activeTab)?.icon}</span>
                <span>{tabs.find((t) => t.id === activeTab)?.name}</span>
              </h3>
              <div className='not-prose flex-1 min-h-0 overflow-hidden'>
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
      <div className="hidden lg:block rounded-lg overflow-hidden bg-white/5 border border-white/10">
        <Skeleton className="w-full aspect-[3/4]" />
        <div className="p-2">
          <Skeleton className="h-4 w-2/5" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      </div>
      <div className="hidden lg:block rounded-lg overflow-hidden bg-white/5 border border-white/10">
        <Skeleton className="w-full aspect-[3/4]" />
        <div className="p-2">
          <Skeleton className="h-4 w-2/5" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

type TemplateVariable = { key?: string; type?: string; label?: string; options?: string[]; defaultValue?: string };
type Template = {
  id?: string;
  name: string;
  desc?: string;
  thumbUrl?: string;
  blurhash?: string;
  slug?: string;
  variables?: TemplateVariable[];
  prompt?: string;
  favoriteCount?: number;
  isFavorited?: boolean;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle'|'user'>;
  // deprecated
  autoOpenDesigner?: boolean;
  createdAt?: string;
  maxUploadImages?: number;
  video?: {
    enabled?: boolean;
    prompt?: string;
    duration?: '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12';
    resolution?: '480p'|'720p'|'1080p';
    aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
    camera_fixed?: boolean;
    fps?: number;
    provider?: 'seedance'|'kling2_5';
  } | null;
};

export function TemplatesTabContent(){
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Template[]>([]);
  const [displayedCount, setDisplayedCount] = useState(20); // Start with 20 templates
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<{ id?: string; name: string; slug?: string } | null>(null);
  const [chevHover, setChevHover] = useState(false);
  const [me, setMe] = useState<{ plan?: string | null } | null>(null);
  const [source, setSource] = useState<'vehicle' | 'upload' | 'workspace'>('vehicle');
  const [sortBy, setSortBy] = useState<'recent'|'favorites'>('recent');
  const [filterBy, setFilterBy] = useState<'all'|'favorites'|'video'>('all');
  const [favBusy, setFavBusy] = useState<Record<string, boolean>>({});
  const [vehiclePhotos, setVehiclePhotos] = useState<string[]>([]);
  const [profileVehicles, setProfileVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [_browsePath] = useState<string>("");
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([]);
  const [libraryItems, setLibraryItems] = useState<Array<{ key: string; url: string; name: string; blurhash?: string }>>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [_requiredShake, setRequiredShake] = useState(false);
  const [requiredImages, setRequiredImages] = useState<number>(1);
  const [uploading, setUploading] = useState(false);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<Record<string, string>>({});
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
  // Video animation modal state
  const [animConfirmOpen, setAnimConfirmOpen] = useState(false);
  const [animBusy, setAnimBusy] = useState(false);
  const [animCredits, setAnimCredits] = useState<number | undefined>(undefined);
  const [animResultUrl, setAnimResultUrl] = useState<string | null>(null);
  const [animResultKey, setAnimResultKey] = useState<string | null>(null);
  const [animLoading, setAnimLoading] = useState(false);
  const sessionRef = useRef<number>(0);
  const deeplinkedRef = useRef<boolean>(false);
  const animPendingBlobRef = useRef<Blob | null>(null);
  const [animHasPending, setAnimHasPending] = useState(false);

  // Credit depletion drawer hook
  const creditDepletion = useCreditDepletion();

  // Reset generated output/designer state when switching templates or closing the dialog
  function resetTemplateSession() {
    try {
      setResultUrl(null);
      setResultKey(null);
      setDesignOpen(false);
      setUpscales([]);
      setActiveKey(null);
      setActiveUrl(null);
      setUpscaleBusy(false);
      setCropOpen(false);
      setCropUrl(null);
      setPendingKeys(null);
      setBusy(false);
      // Ensure fresh start: clear any previously selected images
      setSelectedImageKeys([]);
      // Reset animation session state
      setAnimConfirmOpen(false);
      setAnimBusy(false);
      animPendingBlobRef.current = null;
      setAnimHasPending(false);
      setAnimCredits(undefined);
      setAnimResultUrl(null);
      setAnimResultKey(null);
      setAnimLoading(false);
    } catch {}
  }

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
        if (filterBy === 'video') qs.push('filter=video');
        const q = qs.length ? `?${qs.join('&')}` : '';
        const res = await fetch(`/api/templates${q}`, { cache: 'no-store' }).then(r=>r.json());
        const list = Array.isArray(res?.templates) ? res.templates as Array<Record<string, unknown>> : [];
        // Bulk resolve thumbs with caching
        const TTL = 10*60*1000; const now = Date.now();
        const toResolve: string[] = [];
        function adminKey(keyRaw?: string | null) { if (!keyRaw || typeof keyRaw !== 'string') return undefined; return keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`; }
        for (const tRaw of list) {
          const k = adminKey(String((tRaw as { thumbnailKey?: string })?.thumbnailKey || ''));
          if (!k) continue;
          try {
            const cached = typeof window !== 'undefined' ? sessionStorage.getItem(`carclout:thumb:${k}`) : null;
            if (cached) { const obj = JSON.parse(cached) as { url?: string; ts?: number }; if (obj?.url && obj?.ts && now - obj.ts < TTL) continue; }
          } catch {}
          toResolve.push(k);
        }
        let urlsMap: Record<string,string> = {};
        if (toResolve.length) {
          try {
            urlsMap = await getViewUrls(toResolve, 'admin');
            if (typeof window !== 'undefined') {
              for (const [k,u] of Object.entries(urlsMap)) { try { sessionStorage.setItem(`carclout:thumb:${k}`, JSON.stringify({ url: u, ts: now })); } catch {} }
            }
          } catch {}
        }
        const out: Template[] = list.map((tRaw)=>{
          const t = (tRaw as Record<string, unknown>) || {};
          const k = adminKey(typeof t.thumbnailKey === 'string' ? t.thumbnailKey : undefined);
          let thumbUrl: string | undefined = undefined;
          if (k) {
            try { const cached = typeof window !== 'undefined' ? sessionStorage.getItem(`carclout:thumb:${k}`) : null; if (cached) { const obj = JSON.parse(cached) as { url?: string }; if (obj?.url) thumbUrl = obj.url; } } catch {}
            if (!thumbUrl && urlsMap[k]) thumbUrl = urlsMap[k];
          }
          return {
            id: typeof t.id === 'string' ? t.id : undefined,
            name: typeof t.name === 'string' ? t.name : 'Template',
            desc: typeof t.description === 'string' ? t.description : '',
            thumbUrl,
            blurhash: typeof t.blurhash === 'string' ? t.blurhash : undefined,
            slug: typeof t.slug === 'string' ? t.slug : undefined,
            variables: Array.isArray(t.variables) ? (t.variables as TemplateVariable[]) : [],
            prompt: String(t.prompt || ''),
            fixedAspectRatio: Boolean(t.fixedAspectRatio),
            aspectRatio: typeof t.aspectRatio === 'number' ? Number(t.aspectRatio) : undefined,
            allowedImageSources: Array.isArray(t.allowedImageSources) ? (t.allowedImageSources as Array<'vehicle'|'user'>) : ['vehicle','user'],
            favoriteCount: Number((t as Record<string, unknown>).favoriteCount || 0),
            isFavorited: Boolean((t as Record<string, unknown>).isFavorited),
    proOnly: Boolean((t as Record<string, unknown>).proOnly),
            // deprecated field ignored
            autoOpenDesigner: Boolean((t as Record<string, unknown>).autoOpenDesigner),
            createdAt: typeof (t as { created_at?: unknown })?.created_at === 'string' ? String((t as { created_at?: unknown }).created_at) : undefined,
             maxUploadImages: typeof (t as { maxUploadImages?: unknown })?.maxUploadImages === 'number' ? Number((t as { maxUploadImages?: number }).maxUploadImages) : undefined,
            video: ((): Template['video'] => {
              const v = (t as { video?: unknown })?.video as Record<string, unknown> | undefined;
              if (v && typeof v === 'object') {
                return {
                  enabled: !!(v as { enabled?: unknown })?.enabled,
                  prompt: typeof v?.prompt === 'string' ? (v?.prompt as string) : undefined,
                  duration: typeof v?.duration === 'string' ? (v?.duration as '3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12') : undefined,
                  resolution: typeof v?.resolution === 'string' ? (v?.resolution as '480p'|'720p'|'1080p') : undefined,
                  aspect_ratio: typeof v?.aspect_ratio === 'string' ? (v?.aspect_ratio as '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto') : undefined,
                  camera_fixed: !!(v as { camera_fixed?: unknown })?.camera_fixed,
                  fps: ((): number | undefined => { const n = Number((v as { fps?: unknown })?.fps); return Number.isFinite(n) && n>0 ? Math.round(n) : undefined; })(),
                  provider: (v as { provider?: unknown })?.provider as 'seedance'|'kling2_5' | undefined,
                };
              }
              return null;
            })(),
          };
        });
        if (cancelled) return;
        setItems(out);
      } finally { if (!cancelled) setLoading(false); }
      // Load vehicle photo keys for default vehicle source
      try {
        const profile = await fetch('/api/profile', { cache: 'no-store' }).then(r=>r.json());
        const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? profile.profile.vehicles : [];
        setProfileVehicles(vehicles);
        const keys: string[] = (() => {
          const flat = vehicles.flatMap((v: Vehicle) => Array.isArray((v as unknown as { photos?: string[] }).photos) ? ((v as unknown as { photos?: string[] }).photos as string[]) : []);
          if (flat.length) return flat;
          return Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
        })();
        setVehiclePhotos(keys);
        const primary = keys.find(Boolean) || null;
        setSelectedVehicleKey(primary);
        // Prefetch vehicle photo URLs in bulk and cache in sessionStorage
        try {
          const now = Date.now(); const TTL = 10*60*1000;
          const toResolve = keys.filter(Boolean).filter((k)=>{
            try { const c = typeof window !== 'undefined' ? sessionStorage.getItem(`carclout:veh:${k}`) : null; if (!c) return true; const obj = JSON.parse(c) as { url?: string; ts?: number }; return !(obj?.url && obj?.ts && now - obj.ts < TTL); } catch { return true; }
          });
        if (toResolve.length) {
          const urls: Record<string, string> = await getViewUrls(toResolve);
          if (typeof window !== 'undefined') { for (const [k,u] of Object.entries(urls)) { try { sessionStorage.setItem(`carclout:veh:${k}`, JSON.stringify({ url: u, ts: now })); } catch {} } }
        }
        } catch {}
      } catch {}
    })();
    return ()=>{cancelled=true};
  },[sortBy, filterBy]);

  // Deep-link open by slug param
  useEffect(()=>{
    try {
      if (deeplinkedRef.current) return;
      if (!items.length) return;
      const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const slug = sp.get('slug');
      if (!slug) return;
      const t = items.find((x)=> x.slug === slug);
      if (t) {
        setActive({ id: t.id, name: t.name, slug: t.slug });
        setOpen(true);
        deeplinkedRef.current = true;
      }
    } catch {}
  }, [items]);
  // Load library for workspace picker grid
  useEffect(()=>{
    let aborted=false;
    (async()=>{
      try {
        setLibraryLoading(true);
        const listRes = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache:'no-store' });
        const obj = await listRes.json().catch(()=>({}));
        const arr: Array<{ type?: string; name?: string; key?: string; lastModified?: string; blurhash?: string }> = Array.isArray(obj?.items) ? obj.items : [];
        const files = arr.filter((it)=> String(it?.type) === 'file');
        const imageFiles = files.filter((it)=> { const s = String(it?.key || it?.name || '').toLowerCase(); return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(s); });
        // Sort by most recent first
        imageFiles.sort((a, b) => {
          const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return bTime - aTime;
        });
        const keys = imageFiles.map((it)=> it.key || `library/${String(it?.name || '')}`);
        if (!keys.length) { if (!aborted) setLibraryItems([]); return; }
        const urls: Record<string,string> = await getViewUrls(keys);
        const out = imageFiles.map((it)=> ({ 
          key: it.key || `library/${String(it?.name || '')}`, 
          name: (it.key || '').split('/').pop() || 'file', 
          url: urls[it.key || ''] || '',
          blurhash: it.blurhash
        }));
        if (!aborted) setLibraryItems(out);
      } finally { if (!aborted) setLibraryLoading(false); }
    })();
    return ()=>{ aborted=true };
  },[]);

  async function refreshLibrary() {
    try {
      setLibraryLoading(true);
      const listRes = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache:'no-store' });
      const obj = await listRes.json().catch(()=>({}));
      const arr: Array<{ type?: string; name?: string; key?: string; lastModified?: string; blurhash?: string }> = Array.isArray(obj?.items) ? obj.items : [];
      const files = arr.filter((it)=> String(it?.type) === 'file');
      const imageFiles = files.filter((it)=> { const s = String(it?.key || it?.name || '').toLowerCase(); return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(s); });
      // Sort by most recent first
      imageFiles.sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return bTime - aTime;
      });
      const keys = imageFiles.map((it)=> it.key || `library/${String(it?.name || '')}`);
      if (!keys.length) { setLibraryItems([]); return; }
      const urls: Record<string,string> = await getViewUrls(keys);
      const out = imageFiles.map((it)=> ({ 
        key: it.key || `library/${String(it?.name || '')}`, 
        name: (it.key || '').split('/').pop() || 'file', 
        url: urls[it.key || ''] || '',
        blurhash: it.blurhash
      }));
      setLibraryItems(out);
    } finally { setLibraryLoading(false); }
  }

  function toggleSelect(k: string) {
    const existsNow = selectedImageKeys.includes(k);
    if (!existsNow && selectedImageKeys.length >= requiredImages) {
      try { toast.error('Deselect an image first'); } catch {}
      return;
    }
    setSelectedImageKeys((prev)=> {
      const exists = prev.includes(k);
      if (exists) return prev.filter((x)=> x!==k);
      return [...prev, k];
    });
  }


  useEffect(() => {
    function onProfileUpdated() {
      // Refresh vehicles/photos on profile updates without full page reload
      (async () => {
        try {
          const profile = await fetch('/api/profile', { cache: 'no-store' }).then(r=>r.json());
          const vehicles: Vehicle[] = Array.isArray(profile?.profile?.vehicles) ? profile.profile.vehicles : [];
          setProfileVehicles(vehicles);
          const keys: string[] = (() => {
            const flat = vehicles.flatMap((v: Vehicle) => Array.isArray((v as unknown as { photos?: string[] }).photos) ? ((v as unknown as { photos?: string[] }).photos as string[]) : []);
            if (flat.length) return flat;
            return Array.isArray(profile?.profile?.carPhotos) ? profile.profile.carPhotos : [];
          })();
          setVehiclePhotos(keys);
          if (!keys.includes(selectedVehicleKey || '')) {
            setSelectedVehicleKey(keys.find(Boolean) || null);
          }
        } catch {}
      })();
    }
    window.addEventListener('profile-updated', onProfileUpdated as EventListener);
    return () => window.removeEventListener('profile-updated', onProfileUpdated as EventListener);
  }, [selectedVehicleKey]);

  // Infinite scroll observer with prefetching
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && displayedCount < items.length) {
          // Load 20 more templates when user scrolls to bottom
          setDisplayedCount(prev => Math.min(prev + 20, items.length));
          
          // Prefetch next batch of images for instant loading
          const nextBatch = items.slice(displayedCount, displayedCount + 20);
          nextBatch.forEach(template => {
            if (template.thumbUrl) {
              const img = new Image();
              img.src = template.thumbUrl;
            }
          });
        }
      },
      { rootMargin: '400px' } // Start loading 400px before reaching bottom (prefetch earlier)
    );
    
    observer.observe(sentinel);
    return () => {
      try {
        observer.unobserve(sentinel);
        observer.disconnect();
      } catch {}
    };
  }, [displayedCount, items]);

  // Reset displayed count when items change (filter/sort)
  useEffect(() => {
    setDisplayedCount(20);
  }, [filterBy, sortBy]);

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

  // Only show templates up to displayedCount
  const displayedItems = items.slice(0, displayedCount);
  const hasMore = displayedCount < items.length;

  const grid = (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-stretch">
        {displayedItems.map((it, idx)=> (
          <div key={idx} className="h-full">
            <TemplateCard
              data={{ id: it.id, name: it.name, description: it.desc, slug: it.slug, thumbUrl: it.thumbUrl, blurhash: it.blurhash, createdAt: it.createdAt, favoriteCount: it.favoriteCount, isFavorited: it.isFavorited, videoUrl: ((): string | undefined => { try { const v = it.video as { previewKey?: string } | null | undefined; const key = v?.previewKey; if (!key) return undefined; const cached = typeof window !== 'undefined' ? sessionStorage.getItem(`carclout:vprev:${key}`) : null; if (cached) { const obj = JSON.parse(cached) as { url?: string; ts?: number }; const ttl = 10*60*1000; if (obj?.url && obj?.ts && Date.now()-obj.ts < ttl) return obj.url; } return undefined; } catch { return undefined; } })(), proOnly: Boolean((it as Record<string, unknown>).proOnly), isVideoTemplate: Boolean(it.video?.enabled) }}
              className="h-full"
              showNewBadge={true}
              showLike={true}
              showFavoriteCount={true}
              userHasPro={canonicalPlan(me?.plan) === 'ultra'}
              onLikeToggle={()=> toggleFavorite(it.id, it.slug)}
              onClick={()=>{
                if (Boolean((it as Record<string, unknown>).proOnly) && canonicalPlan(me?.plan) !== 'ultra') {
                  try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
                  return;
                }
                setActive({ id: it.id, name: it.name, slug: it.slug });
                setOpen(true);
              }}
            />
          </div>
        ))}
      </div>
      {/* Sentinel for infinite scroll */}
      {hasMore && (
        <div ref={sentinelRef} className="py-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-white/60">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading more templates...
          </div>
        </div>
      )}
    </>
  );

  const saveDesignToGenerations = useCallback(async (blob: Blob, projectState?: string) => {
    try {
      const filename = `design-${Date.now()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file, filename);
      form.append('path', 'library');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!res.ok) {
        try { const d = await res.json(); toast.error(d?.error || 'Failed to save'); } catch { toast.error('Failed to save'); }
        return;
      }
      
      const uploadData = await res.json();
      const uploadedKey = uploadData?.key as string | undefined;
      
      // Save the project state if provided - store in managed designer_states folder
      if (projectState && uploadedKey) {
        try {
          const { default: SparkMD5 } = await import('spark-md5');
          const hash = SparkMD5.hash(uploadedKey);
          const projectFilename = `${hash}.json`;
          
          const projectForm = new FormData();
          const projectFile = new File([projectState], projectFilename, { type: 'application/json' });
          projectForm.append('file', projectFile, projectFilename);
          projectForm.append('path', 'designer_states'); // Managed folder
          await fetch('/api/storage/upload', { method: 'POST', body: projectForm });
        } catch (err) {
          console.warn('[saveDesignToGenerations] Failed to save project state:', err);
        }
      }
      
      // Close designer first
      setDesignOpen(false);
      setSelectedImageKeys([]);
      
      try {
        toast.success('Saved to your library', {
          action: {
            label: 'View',
            onClick: () => {
              try {
                // Navigate to workspace and trigger preview
                const url = `/dashboard?view=forge&tab=workspace&path=library&preview=${encodeURIComponent(uploadedKey || '')}`;
                window.location.href = url;
              } catch {}
            },
          },
        });
      } catch {}
    } catch {}
  }, []);

  async function handleUploadFiles(files: File[]) {
    const arr = Array.isArray(files) ? files : (files as unknown as File[]);
    const images = arr.filter((f) => (f?.type || '').startsWith('image/'));
    if (!images.length) return;
    setUploading(true);
    try {
      const newKeys: string[] = [];
      const newPreviews: Record<string, string> = {};
      for (const file of images) {
        try {
          const form = new FormData();
          form.append('file', file);
          form.append('path', 'library');
          const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
          const data = await res.json();
          const key: string | undefined = data?.key;
          if (key) {
            newKeys.push(key);
            try {
              const url = await getViewUrl(key);
              if (typeof url === 'string' && url) newPreviews[key] = url;
            } catch {}
          }
        } catch {}
      }
      if (newKeys.length) {
        setUploadedKeys((prev) => Array.from(new Set([...
          prev,
          ...newKeys
        ])));
        setUploadedPreviews((prev) => ({ ...prev, ...newPreviews }));
        if (!browseSelected) setBrowseSelected(newKeys[0] || null);
      }
    } finally {
      setUploading(false);
    }
  }

  // Build dynamic variable fields from template
  const activeTemplate = useMemo(()=> items.find((t)=> t.id === active?.id || t.slug === active?.slug), [items, active]);
  
  // Stable callbacks for Designer component
  const handleDesignerClose = useCallback(() => {
    setDesignOpen(false);
    setSelectedImageKeys([]);
  }, []);

  const handleDesignerTryAgain = useCallback(() => {
    try {
      setDesignOpen(false);
      setResultUrl(null);
    } catch {}
  }, []);

  const handleDesignerReplaceBgKey = useCallback((newKey: string, newUrl?: string) => {
    try {
      if (newKey) {
        setActiveKey(newKey);
        if (newUrl) setActiveUrl(newUrl);
      }
    } catch {}
  }, []);

  const handleDesignerAnimate = useCallback(async (getBlob: () => Promise<Blob | null>) => {
    try {
      if (canonicalPlan(me?.plan) !== 'ultra') {
        try {
          window.dispatchEvent(new CustomEvent('open-pro-upsell'));
        } catch {}
        return;
      }
      setAnimConfirmOpen(true);
      setAnimCredits(undefined as unknown as number);
      setAnimResultUrl(null);
      setAnimResultKey(null);
      const blob = await getBlob();
      if (!blob) {
        setAnimConfirmOpen(false);
        return;
      }
      animPendingBlobRef.current = blob;
      setAnimHasPending(true);
    } catch {}
  }, [me?.plan]);

  useEffect(()=>{
    const srcs: Array<'vehicle'|'user'> = Array.isArray(activeTemplate?.allowedImageSources) ? (activeTemplate!.allowedImageSources as Array<'vehicle'|'user'>) : ['vehicle','user'];
    if (srcs.includes('vehicle')) { setSource('vehicle'); setImageTab('vehicles'); }
    else { setSource('upload'); setImageTab('upload'); }
    try { const n = Number((activeTemplate as { maxUploadImages?: number } | undefined)?.maxUploadImages || 1); setRequiredImages(Number.isFinite(n) && n>0 ? Math.max(1, Math.floor(n)) : 1); } catch { setRequiredImages(1); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id, activeTemplate?.slug]);
  const [varState, setVarState] = useState<Record<string, string>>({});
  const [imageTab, setImageTab] = useState<'vehicles'|'upload'|'workspace'>('vehicles');
  useEffect(()=>{
    setVarState({});
  }, [open, active?.id, active?.slug]);

  // When user switches to a different template while the dialog is open, clear previous results/designer
  useEffect(()=>{
    sessionRef.current += 1;
    resetTemplateSession();
  }, [active?.id, active?.slug]);

  // Prefill defaults for color variables from template definitions (without overriding user input)
  useEffect(()=>{
    try {
      const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
      const defs: Array<{ key?: string; type?: string; defaultValue?: string }> = Array.isArray(activeTemplate?.variables) ? (activeTemplate!.variables as Array<{ key?: string; type?: string; defaultValue?: string }>) : [];
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
    const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : '';
    const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : '';
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

  // Reuse generating logic for both manual and automatic crop flows
  async function finalizeWithCroppedBlob(blob: Blob) {
    const sess = sessionRef.current;
    const fr = new FileReader();
    const dataUrl: string = await new Promise((resolve)=>{ fr.onloadend=()=> resolve(String(fr.result||'')); fr.readAsDataURL(blob); });
    const variables: Record<string, string> = {};
    const v = findVehicleForSelected();
    if (v) {
      const brand = v.make || '';
      const model = v.model || '';
      const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : '';
      const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : '';
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
    const varDefs = Array.isArray(activeTemplate?.variables) ? (activeTemplate?.variables as Array<Record<string, unknown>>) : [];
    for (const vDef of varDefs) {
      const key = String(vDef?.key || '').trim();
      if (!key) continue;
      const val = varState[key] || '';
      if (val) variables[key] = val;
    }
    const payload = { templateId: active?.id, templateSlug: active?.slug, userImageDataUrls: [dataUrl], variables } as Record<string, unknown>;
    const res = await fetch('/api/templates/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    let data: Record<string, unknown> = {}; try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) { toast.error(String((data as { error?: string }).error || 'Generation failed')); return; }
    if (sess !== sessionRef.current) { return; }
    if ((data as { url?: string }).url) setResultUrl(String((data as { url?: string }).url));
    if ((data as { key?: string }).key) setResultKey(String((data as { key?: string }).key));
    if (data?.key) setResultKey(String(data.key));
    try { if (typeof (data as { key?: string })?.key === 'string') setDesignOpen(true); } catch {}
  }

  async function autoCropAndGenerateFromUrl(safeUrl: string, targetAspect: number) {
    // Fetch image and crop minimally to exact aspect ratio, then finalize
    const img = await new Promise<HTMLImageElement | null>((resolve)=>{ try { const el = new Image(); el.onload=()=> resolve(el); el.onerror=()=> resolve(null); el.src = safeUrl; } catch { resolve(null); } });
    if (!img) return;
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height; if (!w || !h) return;
    const ar = w / h;
    let cropW = w, cropH = h, cropX = 0, cropY = 0;
    if (ar > targetAspect) { cropW = Math.round(h * targetAspect); cropH = h; cropX = Math.round((w - cropW) / 2); cropY = 0; }
    else if (ar < targetAspect) { cropW = w; cropH = Math.round(w / targetAspect); cropX = 0; cropY = Math.round((h - cropH) / 2); }
    const canvas = document.createElement('canvas'); canvas.width = cropW; canvas.height = cropH;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const blob: Blob | null = await new Promise((resolve)=> canvas.toBlob((b)=> resolve(b), 'image/jpeg', 0.92));
    if (!blob) return;
    await finalizeWithCroppedBlob(blob);
  }

  async function generate() {
    if (!active) return;
    const sess = sessionRef.current;
    setResultUrl(null);
    try {
      // Check credits and show warning if running low
      const bal = await getCredits();
      const shouldBlock = creditDepletion.checkAndTrigger(bal, 100);
      if (shouldBlock) return; // Block if truly insufficient
      // Preflight checks without showing the generating UI
      const requiredImages = Math.max(1, Number((activeTemplate as { maxUploadImages?: number })?.maxUploadImages || 1));
      let selectedFullKey: string | null = null;
      // Build selection set allowing mix across sources
      let allSelected = Array.from(new Set(selectedImageKeys));
      if (source === 'vehicle' && selectedVehicleKey) {
        if (!allSelected.includes(selectedVehicleKey)) allSelected = [...allSelected, selectedVehicleKey];
      }
      if (allSelected.length < requiredImages) { setRequiredShake(true); setTimeout(()=> setRequiredShake(false), 700); return; }
      selectedFullKey = allSelected[0] || null;
      const userImageKeys: string[] = allSelected.slice(0, requiredImages).map((k)=>{
        const m = k.match(/^users\/[^/]+\/(.+)$/);
        const rel = m ? m[1] : k.replace(/^users\//,'');
        return rel.replace(/^\/+/, '');
      });

      // Aspect ratio enforcement based on active template
      const t = activeTemplate;
      if (t?.fixedAspectRatio && typeof t?.aspectRatio === 'number' && selectedFullKey) {
        try {
          const url: string | null = await getViewUrl(selectedFullKey);
          if (url) {
            const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img = new Image(); img.onload=()=> resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
            if (dims) {
              const ar = dims.w / dims.h;
              const tolerance = 0.05;
              const targetAR = Number(t.aspectRatio);
              if (Math.abs(ar / targetAR - 1) <= tolerance) {
                // Auto-crop minimally and continue without popup
                setBusy(true);
                try { await autoCropAndGenerateFromUrl(`/api/storage/file?key=${encodeURIComponent(selectedFullKey)}`, targetAR); } finally { setBusy(false); }
                return;
              } else {
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
        const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : '';
        const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : '';
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
      const vars = Array.isArray(activeTemplate?.variables) ? (activeTemplate?.variables as Array<Record<string, unknown>>) : [];
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
      if (sess !== sessionRef.current) { return; }
      if (typeof data?.url === 'string') setResultUrl(String(data.url));
      if (typeof data?.key === 'string') setResultKey(String(data.key));
      if (typeof data?.url === 'string') setActiveUrl(String(data.url));
      if (typeof data?.key === 'string') setActiveKey(String(data.key));
      try {
        if (typeof data?.key === 'string') {
          setDesignOpen(true);
        }
      } catch {}
      setUpscales([]);
    } finally {
      setBusy(false);
    }
  }

  // Ensure Designer opens for any path that sets a result key
  useEffect(()=>{
    try { if (resultKey && !designOpen) setDesignOpen(true); } catch {}
  }, [resultKey, designOpen]);

  if (loading) return <TemplatesSkeletonGrid />;
  if (!items.length) return <div>No templates yet</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="grid gap-3 mb-4 sm:gap-4 shrink-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/70">Filter</div>
            <Select value={filterBy} onValueChange={(v: 'all' | 'favorites' | 'video')=> setFilterBy(v || 'all')}>
              <SelectTrigger className="h-8 min-w-[8rem] sm:min-w-[10rem]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="favorites">My favourites</SelectItem>
                <SelectItem value="video">Video only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-white/70 text-right whitespace-nowrap">
            {items.length} template{items.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/70">Sort</div>
            <Select value={sortBy} onValueChange={(v: 'recent' | 'favorites')=> setSortBy(v || 'recent')}>
              <SelectTrigger className="h-8 min-w-[8rem] sm:min-w-[10rem]"><SelectValue placeholder="Most recent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="favorites">Most favourited</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Link
            href="/dashboard/workspace?path=library"
            className="inline-flex items-center gap-2 justify-self-end text-xs font-medium text-white/80 hover:text-white transition sm:text-sm"
            onMouseEnter={()=> setChevHover(true)}
            onMouseLeave={()=> setChevHover(false)}
          >
            Recent images
            <motion.span
              className="inline-flex"
              animate={chevHover ? { x: [0, 6, 0] } : { x: 0 }}
              transition={chevHover ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            >
              <ChevronRight className="w-4 h-4" />
            </motion.span>
          </Link>
        </div>
      </div>
      {grid}
      <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if (!v) { resetTemplateSession(); setVarState({}); } }}>
        <DialogContent className="p-2 sm:p-6 sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw] flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>{designOpen ? 'Designer' : (active?.name || 'Template')}</span>
              {(!designOpen && !busy && !resultUrl) ? (
                <span className="hidden sm:inline mx-auto absolute left-1/2 -translate-x-1/2 text-xs text-white/70">
                  For best results, use a car photo that matches this template&apos;s orientation
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {busy ? (
            <div className="p-6 sm:p-10 min-h-[12rem] grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-[14rem] h-[8rem] sm:w-[17.5rem] sm:h-[10.5rem]">
                  <Lottie animationData={carLoadAnimation as object} loop style={{ width: '100%', height: '100%' }} />
                </div>
                <div className="text-sm text-white/80 text-center px-2">Generating… this may take a moment</div>
              </div>
            </div>
          ) : (designOpen && resultUrl) ? (
            <div className="mt-2">
              {upscales.length ? (
                <div className="space-y-2 mb-3">
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
                </div>
              ) : null}
              {animLoading ? (
                <div className="p-6 sm:p-10 min-h-[12rem] grid place-items-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-[14rem] h-[8rem] sm:w-[17.5rem] sm:h-[10.5rem]">
                      <Lottie animationData={carLoadAnimation as object} loop style={{ width: '100%', height: '100%' }} />
                    </div>
                    <div className="text-sm text-white/80 text-center px-2">Generating video…</div>
                  </div>
                </div>
              ) : animResultUrl ? (
                <div className="space-y-3">
                  <div className="w-full grid place-items-center">
                    <video src={animResultUrl} controls autoPlay loop muted playsInline className="rounded bg-black w-auto max-w-full sm:max-w-[48rem] max-h-[56vh] h-auto object-contain" />
                    <div className="text-xs text-white/70 mt-2">Saved to <a href="/dashboard?view=forge&tab=workspace&path=library" target="_blank" rel="noreferrer" className="underline">/library</a></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className="w-full sm:w-auto" variant="outline" onClick={()=>{ setAnimResultUrl(null); setAnimResultKey(null); }}>Return to designer</Button>
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                      <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70" onClick={async()=>{
                        const ok = await confirmToast({ title: 'Delete video?', message: 'This will delete it from your workspace library.' });
                        if (!ok) return;
                        try {
                          const folder = String(animResultKey || '').replace(/\/[^\\/]+$/, '/').replace(/\/[^/]+$/, '/').replace(/\/+/g,'/').replace(/\/$/, '/');
                          const normalized = folder || String(animResultKey || '').replace(/\/[^/]+$/, '/');
                          if (!normalized) return;
                          await fetch('/api/storage/delete', { method: 'POST', body: JSON.stringify({ key: normalized, isFolder: true }) });
                          setAnimResultUrl(null); setAnimResultKey(null);
                          toast.success('Deleted');
                        } catch { toast.error('Delete failed'); }
                      }}>Delete</Button>
                      <Button className="flex-1 sm:flex-none min-w-[9rem]" onClick={async()=>{
                        try {
                          const r = await fetch(String(animResultUrl), { cache:'no-store' });
                          const blob = await r.blob();
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `video-${Date.now()}.mp4`;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
                        } catch {}
                      }}>Download</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <Designer
                    bgKey={String((activeKey || resultKey) || '')}
                    rembg={{ enabled: true }}
                    closeOnDownload={false}
                    onClose={handleDesignerClose}
                    onTryAgain={handleDesignerTryAgain}
                    onSave={saveDesignToGenerations}
                    aspectRatio={typeof activeTemplate?.aspectRatio === 'number' ? Number(activeTemplate.aspectRatio) : undefined}
                    onReplaceBgKey={handleDesignerReplaceBgKey}
                    showAnimate={!!(activeTemplate?.video && (activeTemplate.video as { enabled?: boolean } | null | undefined)?.enabled)}
                    onAnimate={handleDesignerAnimate}
                  />
                  {/* Animate confirm modal */}
                  <Dialog open={animConfirmOpen} onOpenChange={(o)=>{
                    if (!o) {
                      if (animBusy) {
                        return;
                      }
                      setAnimConfirmOpen(false);
                      animPendingBlobRef.current = null;
                      setAnimHasPending(false);
                      setAnimCredits(undefined);
                    }
                  }}>
                    <DialogContent
                      className="max-w-md"
                    >
                      <DialogHeader>
                        <DialogTitle>Animate this design?</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="text-sm text-white/80">Generate a short video from your current canvas. The video will be auto-saved to /library.</div>
                        {animBusy ? (
                          <div className="text-xs text-white/60">Preparing start frame…</div>
                        ) : null}
                        {typeof animCredits === 'number' ? (
                          <div className="text-xs text-white/70">Estimated credits: <span className="font-medium text-white/90">{animCredits}</span></div>
                        ) : null}
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={()=>{
                            if (animBusy) return;
                            animPendingBlobRef.current = null;
                            setAnimHasPending(false);
                            setAnimConfirmOpen(false);
                          }}
                          disabled={animBusy}
                        >
                          Cancel
                        </Button>
                        <Button type="button" disabled={!animHasPending || animBusy || animLoading} onClick={async()=>{
                          if (!animHasPending || !animPendingBlobRef.current) return;
                          setAnimBusy(true);
                          try {
                            const filename = `design-${Date.now()}.png`;
                            const file = new File([animPendingBlobRef.current], filename, { type: 'image/png' });
                            const form = new FormData(); form.append('file', file, filename); form.append('path', 'library');
                            const up = await fetch('/api/storage/upload', { method: 'POST', body: form });
                            const dj = await up.json().catch(()=>({}));
                            const startKey = typeof dj?.key === 'string' ? String(dj.key) : '';
                            if (!startKey) { toast.error('Failed to prepare animation'); return; }

                            try {
                              const { estimateVideoCredits } = await import('@/lib/credits-client');
                              const v = activeTemplate?.video as { duration?: string|number; resolution?: '480p'|'720p'|'1080p'; fps?: number; aspect_ratio?: '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto'; provider?: 'seedance'|'kling2_5' } | null | undefined;
                              const duration = Number(v?.duration || 5);
                              const resolution = (v?.resolution || '1080p') as '480p'|'720p'|'1080p';
                              const provider = (v?.provider === 'kling2_5') ? 'kling2_5' : 'seedance';
                              const fps = provider === 'kling2_5' ? 24 : Number(v?.fps || 24);
                              const aspect = (v?.aspect_ratio || 'auto') as '21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'auto';
                              const credits = estimateVideoCredits(resolution, duration, fps, aspect, provider);
                              setAnimCredits(credits);
                            } catch { setAnimCredits(undefined as unknown as number); }

                            setAnimConfirmOpen(false);
                            // Check credits before video generation
                            const bal = await getCredits();
                            const insufficientCredits = creditDepletion.checkAndTrigger(bal, animCredits || 500);
                            if (insufficientCredits) return;
                            setAnimLoading(true);
                            const resp = await fetch('/api/templates/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: active?.id, templateSlug: active?.slug, startKey }) });
                            const out = await resp.json().catch(()=>({}));
                            if (resp.status === 402) { const bal = await getCredits(); creditDepletion.checkAndTrigger(bal, animCredits || 500); setAnimLoading(false); return; }
                            if (!resp.ok || !out?.url) { toast.error(out?.error || 'Video generation failed'); setAnimLoading(false); return; }
                            setAnimResultUrl(String(out.url));
                            if (typeof out?.key === 'string') setAnimResultKey(String(out.key));
                          } finally {
                            setAnimLoading(false);
                            setAnimBusy(false);
                            animPendingBlobRef.current = null;
                            setAnimHasPending(false);
                          }
                        }}>Generate</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          ) : resultUrl ? (
            <div className="space-y-3">
              <div className="w-full grid place-items-center">
                {activeUrl || resultUrl ? (
                  <NextImage src={(activeUrl || resultUrl)!} alt="result" width={1024} height={768} className="rounded w-auto max-w-full sm:max-w-[32rem] max-h-[56vh] h-auto object-contain" />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="w-full sm:w-auto" onClick={()=>{ setDesignOpen(false); setResultUrl(null); }}>Try again</Button>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                  <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[9rem]" onClick={()=> setDesignOpen(true)}>Designer</Button>
                  <Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70 flex-1 sm:flex-none min-w-[12rem]" disabled={upscaleBusy || !resultKey} onClick={async()=>{
                    if (canonicalPlan(me?.plan) !== 'ultra') {
                      try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
                      return;
                    }
                    if (!resultKey) return;
                    // Check credits before attempting upscale
                    const bal = await getCredits();
                    const insufficientCredits = creditDepletion.checkAndTrigger(bal, 20);
                    if (insufficientCredits) return;
                    setUpscaleBusy(true);
                    try {
                      // Try to offer better estimate by fetching current image dimensions
                      let payloadObj: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                      try {
                        const url: string | null = await getViewUrl(String(resultKey));
                        if (url) {
                          const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new window.Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
                          if (dims && dims.w>0 && dims.h>0) { payloadObj = { r2_key: String(resultKey), original_width: dims.w, original_height: dims.h }; }
                        }
                      } catch {}
                      const res = await fetch('/api/tools/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadObj) });
                      const data = await res.json().catch(()=>({}));
                      if (res.status === 402) { const bal = await getCredits(); creditDepletion.checkAndTrigger(bal, 20); return; }
                      if (res.status === 400 && (data?.error === 'UPSCALE_AT_MAX')) { toast.error('Already at maximum resolution.'); return; }
                      if (res.status === 400 && (data?.error === 'UPSCALE_DIM_OVERFLOW')) { toast.error('Upscale would exceed the 4K limit.'); return; }
                      if (res.status === 400 && (data?.error === 'ALREADY_UPSCALED')) { toast.error('This image was already upscaled. Use the original.'); return; }
                      if (!res.ok || !data?.url || !data?.key) { toast.error(data?.error || 'Upscale failed'); return; }
                      const entry = { key: String(data.key), url: String(data.url) };
                      setUpscales((prev)=> [...prev, entry]);
                      setActiveKey(entry.key);
                      setActiveUrl(entry.url);
                    } finally { setUpscaleBusy(false); }
                  }}>{upscales.length ? 'Upscale again' : `Upscale${canonicalPlan(me?.plan) !== 'ultra' ? ' 🔒' : ''}`}
                  </Button>
                  <Button className="flex-1 sm:flex-none min-w-[9rem]" onClick={async()=>{
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
                  <div className="text-xs text-white/60">Designer will use the currently selected image. You can&apos;t upscale an image that was already upscaled. Upscaling is limited to 6MP.</div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pb-4">
                {(() => {
                  const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
                  const builtin = new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]);
                  const needBuiltins = ["BRAND","MODEL","COLOR_FINISH","ACCENTS"].filter(k=> tokensInPrompt.has(k));
                  const customVarDefs = Array.isArray(activeTemplate?.variables) ? (activeTemplate!.variables as Array<{ key?: string; type?: string; label?: string; options?: string[] }>).filter((v)=> tokensInPrompt.has(String(v?.key || '')) && !builtin.has(String(v?.key || ''))) : [];
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
                        {customVarDefs.map((v)=> {
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
                                    {v.options.map((opt, i)=> (<SelectItem key={`${key}-${i}`} value={opt}>{opt}</SelectItem>))}
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

                <div className="space-y-4">
                  {(() => {
                    const allowSrcs = (Array.isArray((activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> })?.allowedImageSources) ? (activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> }).allowedImageSources! : ['vehicle','user']);
                    const allowVehicle = allowSrcs.includes('vehicle');
                    const allowUser = allowSrcs.includes('user');
                    return (
                      <div className="space-y-3">
                        <Tabs
                          value={(() => {
                            // Normalize current tab if disabled by template
                            if (!allowUser && (imageTab === 'upload' || imageTab === 'workspace')) return 'vehicles';
                            if (!allowVehicle && imageTab === 'vehicles') return 'upload';
                            return imageTab;
                          })()}
                          onValueChange={(v)=>{ setImageTab(v as 'vehicles'|'upload'|'workspace'); setSource(v === 'vehicles' ? 'vehicle' : 'upload'); }}
                          className="w-full"
                        >
                          <TabsList className="bg-transparent p-0 gap-2">
                          {allowVehicle ? (
                            <TabsTrigger value="vehicles" className="px-3 py-1.5 rounded-md border data-[state=active]:bg-white/5">Vehicles</TabsTrigger>
                          ) : null}
                          {allowUser ? (
                            <TabsTrigger value="upload" className="px-3 py-1.5 rounded-md border data-[state=active]:bg-white/5">Upload</TabsTrigger>
                          ) : null}
                          {allowUser ? (
                            <TabsTrigger value="workspace" className="px-3 py-1.5 rounded-md border data-[state=active]:bg-white/5">Library</TabsTrigger>
                          ) : null}
                        </TabsList>

                        {allowVehicle ? (
                          <TabsContent value="vehicles" className="mt-2 space-y-2">
                            {profileVehicles.length ? (
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-white/70">Vehicle</div>
                                <Select value={(() => { const v = findVehicleForSelected(); if (!v) return ''; const i = profileVehicles.indexOf(v); return String(i); })()} onValueChange={(v)=>{
                                  setSource('vehicle');
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
                            <div className="overflow-visible sm:overflow-x-auto">
                              <div className="flex flex-wrap gap-3 pb-2">
                                {vehiclePhotos.length ? vehiclePhotos.map((k)=> (
                                  <button key={k} onClick={()=>{ setSource('vehicle'); setSelectedVehicleKey(k); toggleSelect(k); }} className="relative focus:outline-none shrink sm:shrink-0 w-36 sm:w-44 cursor-pointer">
                                    <div className={`w-full rounded p-0.5 ${selectedImageKeys.includes(k) ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                                      <div className="rounded overflow-hidden relative bg-black/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={(() => { try { const c = typeof window!== 'undefined' ? sessionStorage.getItem(`carclout:veh:${k}`) : null; if (c) { const obj = JSON.parse(c) as { url?: string }; if (obj?.url) return obj.url; } } catch {} return ''; })()} alt="vehicle" className="w-full h-auto object-contain cursor-pointer" />
                                        <span className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 ${(!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages) ? 'cursor-not-allowed text-white/50' : 'hover:bg-black/70 cursor-pointer'} ${selectedImageKeys.includes(k)?'text-green-400':'text-white'} p-1`} onClick={(e)=>{ e.stopPropagation(); if (!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages) { try { toast.error('Deselect an image first'); } catch {} return; } setSource('vehicle'); setSelectedVehicleKey(k); toggleSelect(k); }}>
                                          <motion.span animate={selectedImageKeys.includes(k) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                            {selectedImageKeys.includes(k) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                                          </motion.span>
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                )) : (
                                  <div className="text-sm text-white/60">No vehicle photos found. Upload in profile.</div>
                                )}
                              </div>
                            </div>
                          </TabsContent>
                        ) : null}

                        {allowUser ? (
                          <TabsContent value="upload" className="mt-2 space-y-2">
                            <DropZone accept="image/*" onDrop={(files)=>{ setSource('upload'); return handleUploadFiles(files); }} disabled={uploading}>
                              <div className="flex flex-col items-center gap-2 py-10">
                                <UploadIcon className="w-[1.25rem] h-[1.25rem] text-white/70" />
                                <div className="text-sm text-white/80">Drag and drop image(s)</div>
                                <div className="text-xs text-white/60">Select up to {requiredImages}</div>
                              </div>
                            </DropZone>
                            {uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}
                            {uploadedKeys.length ? (
                              <div className="space-y-2">
                                <div className="text-xs text-white/70">Uploaded this session</div>
                                <ul className="flex flex-wrap gap-3 pb-2">
                                  {uploadedKeys.map((k) => (
                                    <ContextMenu key={k}>
                                      <ContextMenuTrigger asChild>
                                        <li className="relative focus:outline-none shrink sm:shrink-0 w-36 sm:w-44 cursor-pointer">
                                          <button type="button" className="block w-full h-full" onClick={() => { setSource('upload'); toggleSelect(k); }}>
                                            <div className={`w-full rounded p-0.5 ${selectedImageKeys.includes(k) ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                                              <div className="rounded overflow-hidden relative bg-black/20">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={uploadedPreviews[k] || ''} alt="Uploaded" className="w-full h-auto object-contain cursor-pointer" />
                                                <span
                                                  className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 ${(!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages) ? 'cursor-not-allowed text-white/50' : 'hover:bg-black/70 cursor-pointer'} ${selectedImageKeys.includes(k)?'text-green-400':'text-white'} p-1`}
                                                  onClick={(e)=>{ e.stopPropagation(); if (!selectedImageKeys.includes(k) && selectedImageKeys.length >= requiredImages) { try { toast.error('Deselect an image first'); } catch {} return; } setSource('upload'); toggleSelect(k); }}
                                                >
                                                  <motion.span animate={selectedImageKeys.includes(k) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                                    {selectedImageKeys.includes(k) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                                                  </motion.span>
                                                </span>
                                              </div>
                                            </div>
                                          </button>
                                        </li>
                                      </ContextMenuTrigger>
                                      <ContextMenuContent className="w-48 z-[60]">
                                        <ContextMenuItem onSelect={async()=>{
                                          const ok = await confirmToast({ title: 'Delete image?', message: 'This will also delete any associated masks.' });
                                          if (!ok) return;
                                          try {
                                            await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: k, isFolder: false }) });
                                            setUploadedKeys(prev=> prev.filter(x=> x!==k));
                                            setUploadedPreviews(prev=> { const next = { ...prev }; try { delete (next as Record<string,string>)[k]; } catch {}; return next; });
                                            setSelectedImageKeys(prev=> prev.filter(x=> x!==k));
                                            toast.success('Deleted');
                                          } catch {
                                            toast.error('Delete failed');
                                          }
                                        }}>Delete</ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </TabsContent>
                        ) : null}

                        {allowUser ? (
                          <TabsContent value="workspace" className="mt-2">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs text-white/70">Your library</div>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={refreshLibrary} disabled={libraryLoading} aria-label="Refresh library">
                                <RotateCw className={`w-4 h-4 ${libraryLoading ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                            {libraryLoading ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {Array.from({ length: 8 }).map((_, i)=> (<Skeleton key={`wkl-${i}`} className="w-full aspect-square" />))}
                              </div>
                            ) : (
                              <ul className="flex flex-wrap gap-3 pb-2">
                                {libraryItems.map((it)=> (
                                  <ContextMenu key={it.key}>
                                    <ContextMenuTrigger asChild>
                                      <li className="relative focus:outline-none shrink sm:shrink-0 w-36 sm:w-44 cursor-pointer">
                                        <button type="button" className="block w-full h-full" onClick={()=> { setSource('upload'); toggleSelect(it.key); }}>
                                          <div className={`w-full rounded p-0.5 ${selectedImageKeys.includes(it.key) ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
                                            <div className="rounded overflow-hidden relative bg-black/20 aspect-square">
                                              {it.blurhash ? (
                                                <BlurhashImage
                                                  src={it.url}
                                                  alt={it.name}
                                                  width={400}
                                                  height={400}
                                                  className="w-full h-full object-contain cursor-pointer"
                                                  blurhash={it.blurhash}
                                                  showSkeleton={false}
                                                />
                                              ) : (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={it.url} alt={it.name} className="w-full h-auto object-contain cursor-pointer" />
                                              )}
                                              <span
                                                className={`absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded bg-black/60 ${(!selectedImageKeys.includes(it.key) && selectedImageKeys.length >= requiredImages) ? 'cursor-not-allowed text-white/50' : 'hover:bg-black/70 cursor-pointer'} ${selectedImageKeys.includes(it.key)?'text-green-400':'text-white'} p-1`}
                                                onClick={(e)=>{ e.stopPropagation(); if (!selectedImageKeys.includes(it.key) && selectedImageKeys.length >= requiredImages) { try { toast.error('Deselect an image first'); } catch {} return; } setSource('upload'); toggleSelect(it.key); }}
                                              >
                                                <motion.span animate={selectedImageKeys.includes(it.key) ? { scale: [0.7, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
                                                  {selectedImageKeys.includes(it.key) ? (<SquareCheckBig className="w-4 h-4" />) : (<SquarePlus className="w-4 h-4" />)}
                                                </motion.span>
                                              </span>
                                            </div>
                                          </div>
                                        </button>
                                      </li>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="w-48 z-[60]">
                                      <ContextMenuItem onSelect={async()=>{
                                        const ok = await confirmToast({ title: 'Delete image?', message: 'This will also delete any associated masks.' });
                                        if (!ok) return;
                                        try {
                                          await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key: it.key, isFolder: false }) });
                                          setLibraryItems(prev=> prev.filter(x=> x.key !== it.key));
                                          setSelectedImageKeys(prev=> prev.filter(x=> x !== it.key));
                                          toast.success('Deleted');
                                        } catch {
                                          toast.error('Delete failed');
                                        }
                                      }}>Delete</ContextMenuItem>
                                    </ContextMenuContent>
                                  </ContextMenu>
                                ))}
                              </ul>
                            )}
                          </TabsContent>
                        ) : null}
                      </Tabs>
                    </div>
                    );
                  })()}
                </div>
              </div>
              <FixedAspectCropper
                open={cropOpen}
                imageUrl={cropUrl}
                aspectRatio={typeof (activeTemplate as { aspectRatio?: number })?.aspectRatio === 'number' ? Number((activeTemplate as { aspectRatio?: number }).aspectRatio) : 1}
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
                      const cf = (v as unknown as { colorFinish?: string })?.colorFinish ? String((v as unknown as { colorFinish?: string }).colorFinish) : '';
                      const acc = (v as unknown as { accents?: string })?.accents ? String((v as unknown as { accents?: string }).accents) : '';
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
                    const varDefs = Array.isArray(activeTemplate?.variables) ? (activeTemplate?.variables as Array<Record<string, unknown>>) : [];
                    for (const vDef of varDefs) {
                      const key = String(vDef?.key || '').trim();
                      if (!key) continue;
                      const val = varState[key] || '';
                      if (val) variables[key] = val;
                    }
                    const payload = { templateId: active?.id, templateSlug: active?.slug, userImageKeys: pendingKeys || [], userImageDataUrls: [dataUrl], variables } as Record<string, unknown>;
                    const res = await fetch('/api/templates/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                    let data: Record<string, unknown> = {}; try { data = await res.json(); } catch { data = {}; }
                    if (!res.ok) { toast.error(String((data as { error?: string }).error || 'Generation failed')); return; }
                    if ((data as { url?: string }).url) setResultUrl(String((data as { url?: string }).url));
                    if ((data as { key?: string }).key) setResultKey(String((data as { key?: string }).key));
                    if (data?.key) setResultKey(String(data.key));
                  } finally {
                    setBusy(false);
                    setPendingKeys(null);
                    setCropUrl(null);
                  }
                }}
              />
              {/* Sticky bottom generate button */}
              <div className="flex-shrink-0 border-t border-[color:var(--border)]/60 pt-3 mt-auto bg-[var(--popover)] space-y-2">
                <div className="w-full flex items-center justify-between">
                  <div className="text-xs text-white/60">Selected {selectedImageKeys.length}/{requiredImages}</div>
                  {selectedImageKeys.length >= requiredImages ? (
                    <span className="text-xs text-white/70 whitespace-nowrap">Costs 100 credits</span>
                  ) : null}
                </div>
                <Button size="lg" onClick={generate} disabled={busy || selectedImageKeys.length < requiredImages} className="w-full text-base">
                  {selectedImageKeys.length < requiredImages ? (requiredImages === 1 ? 'Select an image' : `Select ${requiredImages}`) : 'Generate'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <CreditDepletionDrawer 
        open={creditDepletion.isOpen}
        onOpenChange={creditDepletion.close}
        currentPlan={creditDepletion.currentPlan}
        creditsRemaining={creditDepletion.creditsRemaining}
        requiredCredits={creditDepletion.requiredCredits}
      />
    </div>
  );
}
 