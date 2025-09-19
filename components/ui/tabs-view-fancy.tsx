'use client';
import { useState, useEffect, useRef } from 'react';
import NextImage from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import MusicSuggestions from '@/components/music/music-suggestions';
// import { createViewUrl, listAllObjects } from '@/lib/r2';
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TextBehindEditor from '@/components/templates/text-behind-editor';
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
import { Heart, UploadIcon, Volume2, VolumeX, Play, Pause, Download } from 'lucide-react';
import { DropZone } from '@/components/ui/drop-zone';
 

export function HooksTabContent() {
  const [items, setItems] = useState<{ image: string; text: string; videoUrl?: string }[] | null>(null);
  const [thumbsReady, setThumbsReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const PAGE_SIZE = 24;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, _setActiveIdx] = useState<number | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [mutedByIndex, setMutedByIndex] = useState<Record<number, boolean>>({});
  const [soundUnlocked, setSoundUnlocked] = useState(false);

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

  // Play/pause active preview without remounting the <video>
  useEffect(() => {
    try {
      videoRefs.current.forEach((v, idx) => {
        if (!v) return;
        if (idx === activeIdx) {
          v.play().catch(() => {});
        } else {
          try { v.pause(); } catch {}
        }
      });
    } catch {}
  }, [activeIdx]);

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
    function unlock() {
      try { setSoundUnlocked(true); } catch {}
    }
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
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

    function playAt(index: number) {
      try {
        const v = videoRefs.current[index];
        if (!v) return;
        const isMuted = (mutedByIndex[index] ?? false);
        v.muted = isMuted;
        v.playsInline = true;
        v.preload = 'metadata';
        if (!isMuted && !soundUnlocked) setSoundUnlocked(true);
        v.play().catch(() => {});
        setPlayingIdx(index);
        _setActiveIdx(index);
        videoRefs.current.forEach((vv, i) => { if (i !== index) { try { vv?.pause(); } catch {} } });
      } catch {}
    }
    function pauseAt(index: number) {
      try {
        const v = videoRefs.current[index];
        if (!v) return;
        v.pause();
        if (playingIdx === index) { setPlayingIdx(null); _setActiveIdx(null); }
      } catch {}
    }
    function togglePlay(index: number) {
      if (playingIdx === index) pauseAt(index); else playAt(index);
    }
    function toggleMute(index: number) {
      setMutedByIndex((prev) => {
        const nextMuted = !(prev[index] ?? true);
        const next = { ...prev, [index]: nextMuted };
        try {
          const v = videoRefs.current[index];
          if (v) {
            v.muted = nextMuted;
            if (!nextMuted) { if (!soundUnlocked) setSoundUnlocked(true); v.play().catch(() => {}); }
          }
        } catch {}
        return next;
      });
    }
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
            {toShow.map((it, _idx) => {
              const isActive = playingIdx === _idx;
              const isMuted = mutedByIndex[_idx] ?? false;
              return (
                <div
                  key={`${it.text}-${_idx}`}
                  className="rounded-lg overflow-hidden bg-white/5 border border-white/10 text-left"
                >
                  <div className="relative w-full aspect-[3/4]" onClick={() => togglePlay(_idx)}>
                    {it.videoUrl ? (
                      <video
                        ref={(el) => { videoRefs.current[_idx] = el; }}
                        src={it.videoUrl}
                        poster={it.image}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        playsInline
                        muted={isMuted}
                        preload="metadata"
                      />
                    ) : null}
                    <NextImage src={it.image} alt="Hook" fill sizes="(max-width: 640px) 50vw, 33vw" className={`object-cover transition-opacity duration-200 ${isActive ? 'opacity-0' : 'opacity-100'}`} unoptimized />

                    {/* Controls overlay */}
                    <div className="absolute inset-0 flex items-start justify-end p-2 gap-2 pointer-events-none">
                      <button
                        type="button"
                        className="pointer-events-auto rounded-full bg-black/50 text-white p-2 hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                        onClick={(e) => { e.stopPropagation(); toggleMute(_idx); }}
                      >
                        {isMuted ? <VolumeX className="w-[1rem] h-[1rem]" /> : <Volume2 className="w-[1rem] h-[1rem]" />}
                      </button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-between pointer-events-none">
                      <button
                        type="button"
                        className="pointer-events-auto rounded-full bg-black/50 text-white p-2 hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={isActive ? 'Pause' : 'Play'}
                        onClick={(e) => { e.stopPropagation(); togglePlay(_idx); }}
                      >
                        {isActive ? <Pause className="w-[1rem] h-[1rem]" /> : <Play className="w-[1rem] h-[1rem]" />}
                      </button>
                      <button
                        type="button"
                        className="pointer-events-auto rounded-full bg-black/50 text-white p-2 hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label="Download"
                        onClick={(e) => { e.stopPropagation(); if (it.videoUrl) downloadVideo(it.videoUrl, it.text); }}
                      >
                        <Download className="w-[1rem] h-[1rem]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
          onItemClick={(it, _idx) => {
            try { if (it?.videoUrl) downloadVideo(it.videoUrl, it.text); } catch {}
          }}
        />
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
  slug?: string;
  variables?: TemplateVariable[];
  prompt?: string;
  favoriteCount?: number;
  isFavorited?: boolean;
  fixedAspectRatio?: boolean;
  aspectRatio?: number;
  allowedImageSources?: Array<'vehicle'|'user'>;
  autoOpenDesigner?: boolean;
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
  const [_browsePath, setBrowsePath] = useState<string>("");
  const [browseSelected, setBrowseSelected] = useState<string | null>(null);
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
  const sessionRef = useRef<number>(0);

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
            autoOpenDesigner: Boolean((t as Record<string, unknown>).autoOpenDesigner),
          };
        }));
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
      } catch {}
    })();
    return ()=>{cancelled=true};
  },[sortBy, filterBy]);

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
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map((it, idx)=> (
        <div key={idx} className="relative">
          <button className={`absolute top-[0.5rem] right-[0.5rem] z-10 rounded-full ${favBusy[String(it.id||it.slug)] ? 'bg-black/40' : 'bg-black/60 hover:bg-black/70'} text-white px-[0.6rem] py-[0.4rem] focus:outline-none focus:ring-2 focus:ring-primary`} aria-label={it.isFavorited ? 'Remove from favourites' : 'Add to favourites'} onClick={(e)=>{ e.stopPropagation(); toggleFavorite(it.id, it.slug); }} disabled={!!favBusy[String(it.id||it.slug)]}>
            <Heart className={`w-[1rem] h-[1rem] ${it.isFavorited ? 'text-red-500 fill-red-500' : ''}`} />
          </button>
          <button className="text-left w-full rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 border border-[color:var(--border)] focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer" onClick={()=>{ setActive({ id: it.id, name: it.name, slug: it.slug }); setOpen(true); }}>
            {it.thumbUrl ? (
              <NextImage src={it.thumbUrl} alt={it.name} width={640} height={360} className="w-full h-auto" unoptimized />
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
          form.append('path', 'uploads');
          const res = await fetch('/api/storage/upload', { method: 'POST', body: form });
          const data = await res.json();
          const key: string | undefined = data?.key;
          if (key) {
            newKeys.push(key);
            try {
              const vres = await fetch('/api/storage/view', { method: 'POST', body: JSON.stringify({ key }) });
              const vdata = await vres.json();
              if (typeof vdata?.url === 'string') newPreviews[key] = vdata.url as string;
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
  useEffect(()=>{
    const srcs: Array<'vehicle'|'user'> = Array.isArray(activeTemplate?.allowedImageSources) ? (activeTemplate!.allowedImageSources as Array<'vehicle'|'user'>) : ['vehicle','user'];
    if (srcs.includes('vehicle')) setSource('vehicle'); else setSource('upload');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id, activeTemplate?.slug]);
  const [varState, setVarState] = useState<Record<string, string>>({});
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
        const t = activeTemplate;
        if (t && t.autoOpenDesigner && typeof data?.key === 'string') {
          setDesignOpen(true);
        }
      } catch {}
      setUpscales([]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <TemplatesSkeletonGrid />;
  if (!items.length) return <div>No templates yet</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div />
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="text-xs text-white/70">Filter</div>
            <Select value={filterBy} onValueChange={(v: 'all' | 'favorites')=> setFilterBy(v || 'all')}>
              <SelectTrigger className="h-8 min-w-[10rem] w-full sm:w-auto"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="favorites">My favourites</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="text-xs text-white/70">Sort</div>
            <Select value={sortBy} onValueChange={(v: 'recent' | 'favorites')=> setSortBy(v || 'recent')}>
              <SelectTrigger className="h-8 min-w-[10rem] w-full sm:w-auto"><SelectValue placeholder="Most recent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="favorites">Most favourited</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {grid}
      <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if (!v) { resetTemplateSession(); setVarState({}); } }}>
        <DialogContent className="p-4 sm:p-6 sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-[54vw]">
          <DialogHeader>
            <DialogTitle>{designOpen ? 'Designer' : `Use template${active ? ` — ${active.name}` : ''}`}</DialogTitle>
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
              <TextBehindEditor
                bgKey={String((activeKey || resultKey) || '')}
                rembg={{ enabled: true }}
                defaultHeadline={(findVehicleForSelected()?.make || '').toUpperCase()}
                onClose={()=> setDesignOpen(false)}
                onSave={saveDesignToGenerations}
                saveLabel={'Save to workspace'}
                aspectRatio={typeof activeTemplate?.aspectRatio === 'number' ? Number(activeTemplate.aspectRatio) : undefined}
                onReplaceBgKey={(newKey, newUrl)=>{ try { if (newKey) { setActiveKey(newKey); if (newUrl) setActiveUrl(newUrl); } } catch {} }}
              />
            </div>
          ) : resultUrl ? (
            <div className="space-y-3">
              <div className="w-full grid place-items-center">
                <div className="text-xs text-white/70 mb-1">Image auto-saved to <a href="/dashboard?view=forge&tab=workspace&path=generations" target="_blank" rel="noreferrer" className="font-mono text-white/90 underline hover:text-white">/generations</a></div>
                {activeUrl || resultUrl ? (
                  <NextImage src={(activeUrl || resultUrl)!} alt="result" width={1024} height={768} className="rounded w-auto max-w-full sm:max-w-[32rem] max-h-[56vh] h-auto object-contain" unoptimized />
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
                    setUpscaleBusy(true);
                    try {
                      // Try to offer better estimate by fetching current image dimensions
                      let payloadObj: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: String(resultKey) };
                      try {
                        const v = await fetch('/api/storage/view', { method:'POST', body: JSON.stringify({ key: resultKey }) }).then(r=>r.json()).catch(()=>({}));
                        const url: string | null = v?.url || null;
                        if (url) {
                          const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new window.Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
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
              <div className="space-y-4">
                {(() => {
                  const tokensInPrompt = new Set(String(activeTemplate?.prompt || '').match(/\[([A-Z0-9_]+)\]/g)?.map((m)=> m.replace(/^[\[]|[\]]$/g, '')) || []);
                  const builtin = new Set(["BRAND","BRAND_CAPS","MODEL","COLOR_FINISH","ACCENTS","COLOR_FINISH_ACCENTS"]);
                  const needBuiltins = source !== 'vehicle' ? ["BRAND","MODEL","COLOR_FINISH","ACCENTS"].filter(k=> tokensInPrompt.has(k)) : [];
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

                <div className="space-y-2">
                  <div className="text-sm font-medium">Source</div>
                  <Select value={source} onValueChange={(v: 'vehicle' | 'upload' | 'workspace')=>setSource(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray((activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> })?.allowedImageSources) ? (activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> }).allowedImageSources! : ['vehicle','user']).includes('vehicle') ? (
                        <SelectItem value="vehicle">Your vehicles</SelectItem>
                      ) : null}
                      {(Array.isArray((activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> })?.allowedImageSources) ? (activeTemplate as { allowedImageSources?: Array<'vehicle'|'user'> }).allowedImageSources! : ['vehicle','user']).includes('user') ? (
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
                      <div className="overflow-visible sm:overflow-x-auto">
                        <div className="flex flex-wrap gap-3 pb-2">
                          {vehiclePhotos.length ? vehiclePhotos.map((k)=> (
                            <button key={k} onClick={()=>setSelectedVehicleKey(k)} className="relative focus:outline-none shrink sm:shrink-0 w-24 sm:w-28">
                              <div className={`w-full rounded p-0.5 ${selectedVehicleKey===k ? 'bg-primary' : 'bg-[color:var(--border)]'}`}>
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
                      <DropZone accept="image/*" onDrop={handleUploadFiles} disabled={uploading}>
                        <div className="flex flex-col items-center gap-2 py-10">
                          <UploadIcon className="w-[1.25rem] h-[1.25rem] text-white/70" />
                          <div className="text-sm text-white/80">Drag and drop an image</div>
                          <div className="text-xs text-white/60">or click to browse</div>
                        </div>
                      </DropZone>
                      {uploading ? <div className="text-sm text-white/60">Uploading…</div> : null}
                      {uploadedKeys.length ? (
                        <div className="space-y-2">
                          <div className="text-xs text-white/70">Uploaded this session</div>
                          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {uploadedKeys.map((k) => (
                              <li key={k} className={`relative rounded-md overflow-hidden border ${browseSelected === k ? 'ring-2 ring-primary' : 'border-[color:var(--border)]'}`}>
                                <button type="button" className="block w-full h-full" onClick={() => setBrowseSelected(k)}>
                                  <div className="aspect-square bg-black/20">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={uploadedPreviews[k] || ''} alt="Uploaded" className="w-full h-full object-cover" />
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {browseSelected && !uploadedKeys.includes(browseSelected) ? (
                        <div className="text-xs text-white/60">Selected: {browseSelected}</div>
                      ) : null}
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
  return (
    <NextImage src={url} alt="vehicle" width={300} height={300} className="block w-full aspect-square object-cover" unoptimized />
  )
}

export { TabsViewFancy };


