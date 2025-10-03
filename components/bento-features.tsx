"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { getClientBlurDataURL } from "@/lib/blur-placeholder";
import { getViewUrls } from "@/lib/view-url-client";

interface TemplateItem {
  id?: string;
  name?: string;
  thumbnailKey?: string;
  thumbUrl?: string;
  blurhash?: string;
}

// Helper to determine if an item should load eagerly based on its index
const getLoadingPriority = (index: number) => {
  // First 4 items load eagerly (typically fills initial viewport)
  if (index < 4) return "eager";
  return "lazy";
};

// Helper to determine video preload strategy
const getVideoPreload = (index: number) => {
  if (index < 2) return "auto"; // First 2 videos load fully
  if (index < 4) return "metadata"; // Next 2 load metadata
  return "none"; // Rest don't preload
};

export default function BentoFeatures() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set([0, 1, 2, 3])); // Start with first 4 visible
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // Fetch templates
        const res = await fetch('/api/templates?limit=50', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        const all = Array.isArray(data?.templates) ? data.templates as TemplateItem[] : [];
        
        // Shuffle and pick templates
        const pool = [...all];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
        const pick = pool.slice(0, 15); // Pick more templates
        
        // Resolve thumbnail URLs
        const keysToResolve: string[] = [];
        for (const t of pick) {
          const keyRaw = t?.thumbnailKey;
          if (keyRaw && typeof keyRaw === 'string') {
            const key = keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`;
            keysToResolve.push(key);
          }
        }
        
        let urlsMap: Record<string, string> = {};
        if (keysToResolve.length > 0) {
          try {
            urlsMap = await getViewUrls(keysToResolve, 'admin');
          } catch {}
        }
        
        const resolved = pick.map((t) => {
          const keyRaw = t?.thumbnailKey;
          const key = keyRaw && typeof keyRaw === 'string' ? 
            (keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`) : 
            undefined;
          return {
            ...t,
            thumbUrl: key ? urlsMap[key] : undefined,
          };
        }).filter((t) => !!t.thumbUrl); // Only keep templates with valid thumbnails
        
        if (!cancelled) setTemplates(resolved);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Intersection observer to progressively load items as they approach viewport
  useEffect(() => {
    if (!containerRef.current || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(index)) {
              setVisibleItems((prev) => new Set([...prev, index]));
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '200px', // Start loading 200px before item enters viewport
        threshold: 0,
      }
    );

    // Observe all items
    const items = containerRef.current.querySelectorAll('[data-index]');
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [loading, templates.length]);

  // Add static videos from bento-vids folder
  const bentoVideos = [
    '/bento-vids/1.mp4',
    '/bento-vids/2.mp4',
    '/bento-vids/3.mp4',
    '/bento-vids/4.mp4',
  ];

  // Randomly intersperse videos, logos, and templates
  const gridItems: Array<{ type: 'template' | 'logo' | 'video'; data?: TemplateItem; videoSrc?: string }> = [];
  
  let videoIndex = 0;
  let logoCount = 0;
  
  templates.forEach((template, index) => {
    gridItems.push({ type: 'template', data: template });
    
    // Add video every 3-4 items (randomly distributed)
    const shouldAddVideo = videoIndex < bentoVideos.length && (index + 1) % 3 === 0;
    if (shouldAddVideo) {
      gridItems.push({ type: 'video', videoSrc: bentoVideos[videoIndex] });
      videoIndex++;
    }
    
    // Add logo squares every 5-6 items (but not right after a video)
    const shouldAddLogo = !shouldAddVideo && (index + 1) % 5 === 0 && logoCount < 2;
    if (shouldAddLogo) {
      gridItems.push({ type: 'logo' });
      logoCount++;
    }
  });

  return (
    <section className="w-full py-[3rem] md:py-[4rem] relative overflow-hidden">
      {/* Background gradient */}
      <div 
        aria-hidden 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)"
        }}
      />

      <div className="max-w-7xl mx-auto relative z-[1]">
        {/* Horizontally scrolling masonry grid - 2 rows */}
        <div 
          ref={containerRef}
          className="overflow-x-auto overflow-y-hidden pb-[1rem] px-[1rem] sm:px-[1.75rem]"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.2) transparent',
          }}
        >
          <div 
            className="grid gap-[1rem]"
            style={{
              gridTemplateRows: 'repeat(2, 11rem)',
              gridAutoFlow: 'column',
              gridAutoColumns: 'auto',
            }}
          >
            {loading ? (
              // Loading skeletons with same portrait aspect ratios
              Array.from({ length: 10 }).map((_, i) => {
                const seed = i % 7;
                const widths = ['8.25rem', '7.33rem', '8.8rem', '11rem', '9.17rem', '6.19rem', '8.25rem'];
                return (
                  <div
                    key={`skeleton-${i}`}
                    className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-gradient-to-br from-purple-500/10 to-pink-500/10 animate-pulse"
                    style={{
                      gridRow: (i % 2) + 1,
                      width: widths[seed],
                      height: '11rem',
                    }}
                  >
                    <div className="w-full h-full bg-background/20" />
                  </div>
                );
              })
            ) : (
              (() => {
                // Pre-calculate which column each item belongs to
                // Most templates are portrait, so use portrait aspect ratios (narrower widths)
                const aspectRatios = [
                  (11 * 3/4).toFixed(2),    // 8.25rem - classic portrait (most common)
                  (11 * 2/3).toFixed(2),    // ~7.33rem - taller portrait
                  (11 * 4/5).toFixed(2),    // 8.8rem - slightly wider portrait
                  (11 * 3/4).toFixed(2),    // 8.25rem - classic portrait (repeat for frequency)
                  (11 * 5/6).toFixed(2),    // ~9.17rem - wider portrait
                  (11 * 9/16).toFixed(2),   // ~6.19rem - very tall portrait
                  (11 * 3/4).toFixed(2),    // 8.25rem - classic portrait (repeat again)
                ];
                
                let currentColumn = 0;
                let itemsInCurrentColumn = 0;
                const itemColumns: number[] = [];
                
                gridItems.forEach((_item) => {
                  // All items (templates, videos, and logos) are single-row items
                  // Each column holds 2 items
                  itemColumns.push(currentColumn);
                  itemsInCurrentColumn++;
                  if (itemsInCurrentColumn === 2) {
                    currentColumn++;
                    itemsInCurrentColumn = 0;
                  }
                });
                
                return gridItems.map((item, index) => {
                  const column = itemColumns[index] || 0;
                  const isVisible = visibleItems.has(index);
                  const loadingPriority = getLoadingPriority(index);
                  
                  if (item.type === 'logo') {
                    // Logo - true 1:1 square (11rem × 11rem)
                    return (
                      <div
                        key={`logo-${index}`}
                        data-index={index}
                        className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-[1.5rem]"
                        style={{
                          width: '11rem',
                          height: '11rem',
                        }}
                      >
                        {isVisible && (
                          <Image
                            src="/carcloutfilled.webp"
                            alt="Carclout"
                            width={100}
                            height={100}
                            className="w-full h-auto object-contain opacity-50"
                            placeholder="blur"
                            blurDataURL={getClientBlurDataURL('#111a36')}
                            loading={loadingPriority}
                          />
                        )}
                      </div>
                    );
                  }

                  if (item.type === 'video') {
                    // Video - use similar sizing to templates
                    const columnWidth = aspectRatios[column % aspectRatios.length];
                    const videoPreload = getVideoPreload(index);
                    
                    return (
                      <div
                        key={`video-${index}`}
                        data-index={index}
                        className="relative overflow-hidden rounded-xl border border-[color:var(--border)] group transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30"
                        style={{
                          width: `${columnWidth}rem`,
                          height: '11rem',
                        }}
                      >
                        {isVisible ? (
                          <video
                            src={item.videoSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload={videoPreload}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 animate-pulse" />
                        )}
                      </div>
                    );
                  }

                  const template = item.data!;
                  const columnWidth = aspectRatios[column % aspectRatios.length];
                  
                  return (
                    <div
                      key={template.id || `template-${index}`}
                      data-index={index}
                      className="relative overflow-hidden rounded-xl border border-[color:var(--border)] group transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 cursor-pointer"
                      style={{
                        width: `${columnWidth}rem`,
                        height: '11rem',
                      }}
                    >
                      {isVisible && template.thumbUrl ? (
                        <Image
                          src={template.thumbUrl}
                          alt={template.name || 'Template'}
                          width={400}
                          height={300}
                          className="w-full h-full object-cover"
                          placeholder="blur"
                          blurDataURL={template.blurhash ? getClientBlurDataURL(template.blurhash) : getClientBlurDataURL('#111a36')}
                          loading={loadingPriority}
                          priority={loadingPriority === "eager"}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
                          {!isVisible ? (
                            <div className="w-full h-full animate-pulse" />
                          ) : (
                            <span className="text-muted-foreground text-sm">No preview</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

