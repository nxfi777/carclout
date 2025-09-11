"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EllipsisTooltip } from "@/components/ui/ellipsis-tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type UnifiedTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string;
  artworkUrl?: string;
  source: "itunes" | "deezer";
  externalUrl?: string;
};

type MusicSuggestionsProps = {
  admin?: boolean;
};

export default function MusicSuggestions({ admin = false }: MusicSuggestionsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // Admin-only state
  const [defaults, setDefaults] = useState<UnifiedTrack[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedTrack | null>(null);

  // User preview state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const cacheAtMount = audioCache.current;
    return () => {
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
      try {
        for (const a of cacheAtMount.values()) { try { a.pause(); } catch {} }
        cacheAtMount.clear();
      } catch {}
    };
  }, []);

  async function runSearch(q?: string) {
    const term = typeof q === "string" ? q : query;
    if (!term.trim()) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(term)}&limit=24`, { cache: "no-store" });
      const data = await res.json();
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch {
      setError("Failed to fetch tracks");
    } finally {
      setLoading(false);
    }
  }

  function prefetchTrack(track: UnifiedTrack) {
    if (!track.previewUrl) return;
    if (audioCache.current.has(track.id)) return;
    try {
      const a = new Audio(track.previewUrl);
      a.preload = "auto";
      audioCache.current.set(track.id, a);
      a.load();
    } catch {}
  }

  useEffect(() => {
    if (admin) return; // admin view doesn't auto-prefetch or load defaults here
    const slice = results.slice(0, 8);
    slice.forEach(prefetchTrack);
  }, [results, admin]);

  // Load defaults for dashboard (user) when empty; for admin also load defaults for management
  useEffect(() => {
    (async () => {
      try {
        if (admin) {
          setLoadingDefaults(true);
          const r = await fetch("/api/admin/music/defaults", { cache: "no-store" }).then(r=>r.json());
          setDefaults(Array.isArray(r?.tracks) ? r.tracks : []);
        } else {
          if (results.length > 0) return;
          setLoadingDefaults(true);
          const res = await fetch("/api/music/defaults", { cache: "no-store" });
          const data = await res.json();
          if (Array.isArray(data?.tracks) && data.tracks.length) {
            setResults(data.tracks);
          }
        }
      } catch {} finally {
        setLoadingDefaults(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  function togglePreview(track: UnifiedTrack) {
    if (!track.previewUrl) return;
    const prev = audioRef.current;
    if (activeId === track.id && prev) {
      if (prev.paused) {
        prev.play().catch(() => {});
      } else {
        prev.pause();
      }
      return;
    }
    if (prev) {
      try { prev.pause(); } catch {}
      prev.onended = null;
      prev.ontimeupdate = null;
      prev.onpause = null;
      prev.onplay = null;
    }
    const next = audioCache.current.get(track.id) || new Audio(track.previewUrl);
    next.preload = "auto";
    audioCache.current.set(track.id, next);
    audioRef.current = next;
    setActiveId(track.id);
    setProgress(0);
    next.currentTime = 0;
    next.ontimeupdate = () => {
      const d = next.duration || 0;
      setProgress(d ? Math.min(1, Math.max(0, next.currentTime / d)) : 0);
    };
    next.onended = () => { setIsPlaying(false); setActiveId(null); setProgress(0); };
    next.onplay = () => setIsPlaying(true);
    next.onpause = () => setIsPlaying(false);
    next.play().catch(() => {});
  }

  async function saveDefaults(next: UnifiedTrack[]) {
    const payload = next.map(t => ({ id: t.id, title: t.title, artist: t.artist, previewUrl: t.previewUrl, artworkUrl: t.artworkUrl, source: t.source, externalUrl: t.externalUrl }));
    await fetch("/api/admin/music/defaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracks: payload }) });
    setDefaults(next);
  }

  async function onAddTrack(track: UnifiedTrack) {
    if (!admin) return;
    if (defaults.some(t=>t.id===track.id)) return; // silently ignore
    if (defaults.length >= 20) return; // silently ignore
    setSelected(track);
    setConfirmOpen(true);
  }

  async function confirmAdd() {
    if (!selected) return;
    const next = [selected, ...defaults].slice(0, 20);
    await saveDefaults(next);
    setConfirmOpen(false);
    setSelected(null);
  }

  async function removeTrack(id: string) {
    if (!admin) return;
    const next = defaults.filter(t=>t.id!==id);
    await saveDefaults(next);
  }

  const hasResults = results.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          placeholder="Search songs, artists, albums…"
          onKeyDown={(e)=>{ if (e.key==='Enter') runSearch(); }}
        />
        <Button onClick={()=>runSearch()} disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : null}

      {admin ? (
        <>
          <div className="text-sm">Default tracks ({defaults.length}/20)</div>
          {loadingDefaults && defaults.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`def-sk-${i}`} className="rounded-lg bg-white/5 border border-white/10 overflow-hidden p-3 flex items-center gap-3">
                  <Skeleton className="size-16 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {defaults.map((t)=> (
                <div key={`def-${t.id}`} className="rounded-lg bg-white/50 dark:bg-white/5 border border-white/10 overflow-hidden" onMouseEnter={()=>prefetchTrack(t)}>
                  <div className="flex gap-3 p-3 items-start">
                    <div className='shrink-0 flex flex-col items-center gap-1'>
                    <button
                      aria-label='Preview'
                      aria-pressed={activeId===t.id && isPlaying}
                      disabled={!t.previewUrl}
                      onClick={()=>togglePreview(t)}
                      className='relative inline-grid place-items-center size-8 rounded-full bg-black/50 backdrop-blur border border-white/20 text-white disabled:opacity-50'
                    >
                      {(() => {
                        const R = 13;
                        const C = 2 * Math.PI * R;
                        const p = activeId===t.id ? progress : 0;
                        const dash = C;
                        const offset = dash * (1 - p);
                        const gid = `grad-${t.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
                        return (
                          <svg viewBox='0 0 34 34' className='absolute inset-0'>
                            <circle cx='17' cy='17' r={R} fill='none' stroke='white' strokeOpacity='0.25' strokeWidth='2.5' />
                            <circle cx='17' cy='17' r={R} fill='none' stroke={`url(#${gid})`} strokeWidth='2.5' strokeLinecap='round' strokeDasharray={dash} strokeDashoffset={offset} />
                            <defs>
                              <linearGradient id={gid} x1='0' x2='1' y1='0' y2='1'>
                                <stop offset='0%' stopColor='#6366F1' />
                                <stop offset='100%' stopColor='#A855F7' />
                              </linearGradient>
                            </defs>
                          </svg>
                        );
                      })()}
                      {activeId===t.id && isPlaying ? (
                        <svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                          <rect x='6' y='5' width='4' height='14' rx='1'></rect>
                          <rect x='14' y='5' width='4' height='14' rx='1'></rect>
                        </svg>
                      ) : (
                        <svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                          <path d='M8 5v14l11-7z'></path>
                        </svg>
                      )}
                    </button>
                      <Button size='sm' className='h-6 px-2 text-[10px] mt-1' variant='secondary' onClick={()=>removeTrack(t.id)}>Remove</Button>
                    </div>
                    <div className="relative shrink-0 size-16">
                      {t.artworkUrl ? (
                        <Image src={t.artworkUrl} alt={t.title} fill sizes="64px" unoptimized className="rounded-md object-cover" />
                      ) : (
                        <div className="absolute inset-0 rounded-md bg-white/10" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <EllipsisTooltip text={t.title} as="div" className="font-medium" />
                      <EllipsisTooltip text={t.artist} as="div" className="text-sm text-white/70" />
                      <div className='text-[10px] uppercase tracking-wide text-white/40 mt-1'>{t.source}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-sm font-medium">Search results</div>
          {loading && results.length === 0 && hasSearched ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`sk-${i}`} className="rounded-lg bg-white/5 border border-white/10 overflow-hidden p-3 flex items-center gap-3">
                  <Skeleton className="size-16 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              {results.map((t)=> (
                <div key={t.id} className="rounded-lg bg-white/50 dark:bg-white/5 border border-white/10 overflow-hidden" onMouseEnter={()=>prefetchTrack(t)}>
                  <div className="flex gap-3 p-3 items-start">
                    <div className='shrink-0 flex flex-col items-center gap-1'>
                      <button
                        aria-label='Preview'
                        aria-pressed={activeId===t.id && isPlaying}
                        disabled={!t.previewUrl}
                        onClick={()=>togglePreview(t)}
                        className='relative inline-grid place-items-center size-8 rounded-full bg-black/50 backdrop-blur border border-white/20 text-white disabled:opacity-50'
                      >
                        {(() => {
                          const R = 13;
                          const C = 2 * Math.PI * R;
                          const p = activeId===t.id ? progress : 0;
                          const dash = C;
                          const offset = dash * (1 - p);
                          const gid = `grad-${t.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
                          return (
                            <svg viewBox='0 0 34 34' className='absolute inset-0'>
                              <circle cx='17' cy='17' r={R} fill='none' stroke='white' strokeOpacity='0.25' strokeWidth='2.5' />
                              <circle cx='17' cy='17' r={R} fill='none' stroke={`url(#${gid})`} strokeWidth='2.5' strokeLinecap='round' strokeDasharray={dash} strokeDashoffset={offset} />
                              <defs>
                                <linearGradient id={gid} x1='0' x2='1' y1='0' y2='1'>
                                  <stop offset='0%' stopColor='#6366F1' />
                                  <stop offset='100%' stopColor='#A855F7' />
                                </linearGradient>
                              </defs>
                            </svg>
                          );
                        })()}
                        {activeId===t.id && isPlaying ? (
                          <svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                            <rect x='6' y='5' width='4' height='14' rx='1'></rect>
                            <rect x='14' y='5' width='4' height='14' rx='1'></rect>
                          </svg>
                        ) : (
                          <svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                            <path d='M8 5v14l11-7z'></path>
                          </svg>
                        )}
                      </button>
                      <Button size='sm' className='h-6 px-2 text-xs mt-1' onClick={()=>onAddTrack(t)}>+</Button>
                    </div>
                    <div className="relative shrink-0 size-16">
                      {t.artworkUrl ? (
                        <Image src={t.artworkUrl} alt={t.title} fill sizes="64px" unoptimized className="rounded-md object-cover" />
                      ) : (
                        <div className="absolute inset-0 rounded-md bg-white/10" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <EllipsisTooltip text={t.title} as="div" className="font-medium" />
                      <EllipsisTooltip text={t.artist} as="div" className="text-sm text-white/70" />
                      <div className='text-[10px] uppercase tracking-wide text-white/40 mt-1'>{t.source}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to defaults?</DialogTitle>
                <DialogDescription>This will add the selected track to the defaults list.</DialogDescription>
              </DialogHeader>
              <div className="text-sm">{selected?.title} – {selected?.artist}</div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setConfirmOpen(false)}>Cancel</Button>
                <Button onClick={confirmAdd}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          {!hasResults && !loading && !loadingDefaults ? (
            <div className='text-sm text-white/70'>Try searching for a trending track like &quot;Bad Bunny&quot; or &quot;Travis Scott&quot;.</div>
          ) : null}

          {loading && results.length === 0 && hasSearched ? (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`sk-${i}`} className='rounded-lg bg-white/5 border border-white/10 overflow-hidden p-3 flex items-center gap-3'>
                  <Skeleton className='size-16 rounded-md' />
                  <div className='min-w-0 flex-1 space-y-2'>
                    <Skeleton className='h-4 w-40' />
                    <Skeleton className='h-3 w-24' />
                  </div>
                  <Skeleton className='h-8 w-8 rounded' />
                </div>
              ))}
            </div>
          ) : loadingDefaults && results.length === 0 && !hasSearched ? (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`sk-${i}`} className='rounded-lg bg-white/5 border border-white/10 overflow-hidden p-3 flex items-center gap-3'>
                  <Skeleton className='size-16 rounded-md' />
                  <div className='min-w-0 flex-1 space-y-2'>
                    <Skeleton className='h-4 w-40' />
                    <Skeleton className='h-3 w-24' />
                  </div>
                  <Skeleton className='h-8 w-8 rounded' />
                </div>
              ))}
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'>
              {results.map((t)=> (
                <div key={t.id} className='rounded-lg bg-white/50 dark:bg-white/5 border border-white/10 overflow-hidden' onMouseEnter={()=>prefetchTrack(t)}>
                  <div className='flex gap-3 p-3 items-center'>
                    <div className='shrink-0'>
                      <button
                        aria-label='Preview'
                        aria-pressed={activeId===t.id && isPlaying}
                        disabled={!t.previewUrl}
                        onClick={()=>togglePreview(t)}
                        className='relative inline-grid place-items-center size-10 rounded-full bg-black/50 backdrop-blur border border-white/20 text-white disabled:opacity-50'
                      >
                        {(() => {
                          const R = 16;
                          const C = 2 * Math.PI * R;
                          const p = activeId===t.id ? progress : 0;
                          const dash = C;
                          const offset = dash * (1 - p);
                          const gid = `grad-${t.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
                          return (
                            <svg viewBox='0 0 40 40' className='absolute inset-0'>
                              <circle cx='20' cy='20' r={R} fill='none' stroke='white' strokeOpacity='0.25' strokeWidth='3' />
                              <circle cx='20' cy='20' r={R} fill='none' stroke={`url(#${gid})`} strokeWidth='3' strokeLinecap='round' strokeDasharray={dash} strokeDashoffset={offset} />
                              <defs>
                                <linearGradient id={gid} x1='0' x2='1' y1='0' y2='1'>
                                  <stop offset='0%' stopColor='#6366F1' />
                                  <stop offset='100%' stopColor='#A855F7' />
                                </linearGradient>
                              </defs>
                            </svg>
                          );
                        })()}
                        {activeId===t.id && isPlaying ? (
                          <svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                            <rect x='6' y='5' width='4' height='14' rx='1'></rect>
                            <rect x='14' y='5' width='4' height='14' rx='1'></rect>
                          </svg>
                        ) : (
                          <svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor' className='z-10'>
                            <path d='M8 5v14l11-7z'></path>
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className='relative shrink-0 size-16'>
                      {t.artworkUrl ? (
                        <Image src={t.artworkUrl} alt={t.title} fill sizes='64px' unoptimized className='rounded-md object-cover' />
                      ) : (
                        <div className='absolute inset-0 rounded-md bg-white/10' />
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <EllipsisTooltip text={t.title} as='div' className='font-medium' />
                      <EllipsisTooltip text={t.artist} as='div' className='text-sm text-white/70' />
                      <div className='text-[10px] uppercase tracking-wide text-white/40 mt-1'>{t.source}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


