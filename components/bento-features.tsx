"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { getClientBlurDataURL, blurHashToDataURLCached } from "@/lib/blur-placeholder";

export interface TemplateItem {
  id?: string;
  name?: string;
  thumbnailKey?: string;
  thumbUrl?: string;
  blurhash?: string;
}

interface BentoFeaturesProps {
  initialTemplates?: TemplateItem[];
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

export default function BentoFeatures({ initialTemplates = [] }: BentoFeaturesProps) {
  const [templates] = useState<TemplateItem[]>(initialTemplates);
  const [loading] = useState(false); // No loading state needed with SSR
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set([0, 1, 2, 3])); // Start with first 4 visible
  const containerRef = useRef<HTMLDivElement>(null);
  const [supportsGrid, setSupportsGrid] = useState(true);

  // Debug: log templates on mount
  useEffect(() => {
    console.log('[BentoFeatures] Received templates:', templates.length);
    console.log('[BentoFeatures] Templates with blurhash:', templates.filter(t => t?.blurhash).length);
    console.log('[BentoFeatures] Sample template:', templates[0]);
  }, [templates]);

  // Check for CSS Grid support
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof CSS !== 'undefined') {
      const hasGridSupport = CSS.supports('display', 'grid') && CSS.supports('grid-auto-flow', 'column');
      setSupportsGrid(hasGridSupport);
      
      // Additional check for Instagram browser quirks
      const ua = navigator.userAgent || '';
      const isInstagram = ua.includes('Instagram');
      if (isInstagram) {
        console.log('[BentoFeatures] Instagram browser detected, grid support:', hasGridSupport);
      }
    }
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

  // Add static videos from bento-vids folder with actual blurhashes
  const bentoVideos = [
    { src: '/bento-vids/1.mp4', blurhash: 'LjFPy[o#M|t8yGkCjta#RPaeoKWB' },
    { src: '/bento-vids/2.mp4', blurhash: 'L66H+jxtMwM]W{ofoaRhI8agozfm' },
    { src: '/bento-vids/3.mp4', blurhash: 'LC6k|w_N?v-;xutRt7j[8wDiD%Mx' },
    { src: '/bento-vids/4.mp4', blurhash: 'L39Pl}03}?Sc0N=;xIENEf-PJCwH' },
  ];

  // Randomly intersperse videos, logos, and templates
  const gridItems: Array<{ type: 'template' | 'logo' | 'video'; data?: TemplateItem; videoSrc?: string; videoBlurhash?: string }> = [];
  
  let videoIndex = 0;
  let logoCount = 0;
  
  templates.forEach((template, index) => {
    gridItems.push({ type: 'template', data: template });
    
    // Add video every 3-4 items (randomly distributed)
    const shouldAddVideo = videoIndex < bentoVideos.length && (index + 1) % 3 === 0;
    if (shouldAddVideo) {
      const video = bentoVideos[videoIndex];
      gridItems.push({ type: 'video', videoSrc: video!.src, videoBlurhash: video!.blurhash });
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
    <section className="w-full py-[3rem] md:py-[4rem] relative overflow-hidden" style={{ minHeight: '30rem' }}>
      {/* Background gradient */}
      <div 
        aria-hidden 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(ellipse at center, rgba(91, 108, 255, 0.12), transparent 60%)"
        }}
      />

      <div className="max-w-7xl mx-auto relative z-[1] h-full">
        {/* Horizontally scrolling masonry grid - 2 rows */}
        <div 
          ref={containerRef}
          className="overflow-x-auto overflow-y-hidden pb-[1rem] px-[1rem] sm:px-[1.75rem] webkit-overflow-scrolling-touch h-full"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.2) transparent',
            minHeight: '24rem', // Ensure minimum height for 2 rows + gap + padding
            height: 'auto',
          }}
        >
          <div 
            className="inline-grid gap-[1rem]"
            style={{
              display: supportsGrid ? 'inline-grid' : 'flex',
              gridTemplateRows: supportsGrid ? 'repeat(2, 11rem)' : undefined,
              gridAutoFlow: supportsGrid ? 'column' : undefined,
              gridAutoColumns: supportsGrid ? 'auto' : undefined,
              minWidth: 'min-content',
              // Fallback for non-grid browsers
              flexWrap: !supportsGrid ? 'nowrap' : undefined,
              alignItems: !supportsGrid ? 'flex-start' : undefined,
              gap: !supportsGrid ? '1rem' : undefined,
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
                    className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--card)] animate-pulse flex-shrink-0"
                    style={{
                      gridRow: supportsGrid ? (i % 2) + 1 : undefined,
                      width: widths[seed],
                      height: '11rem',
                      minWidth: widths[seed],
                      minHeight: '11rem',
                    }}
                  >
                    <div className="w-full h-full bg-[var(--border)]/30" />
                  </div>
                );
              })
            ) : templates.length === 0 ? (
              // Show message if no templates loaded
              <div className="text-center py-8 text-white/60">
                No templates available
              </div>
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
                        className="relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center flex-shrink-0"
                        style={{
                          width: '11rem',
                          height: '11rem',
                          minWidth: '11rem',
                          minHeight: '11rem',
                        }}
                      >
                        {isVisible && (
                          <Image
                            src="/carcloutfilled.webp"
                            alt="Carclout"
                            width={176}
                            height={176}
                            className="w-full h-full object-cover opacity-50"
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
                        className="relative overflow-hidden rounded-xl border border-[color:var(--border)] group transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 flex-shrink-0"
                        style={{
                          width: `${columnWidth}rem`,
                          height: '11rem',
                          minWidth: `${columnWidth}rem`,
                          minHeight: '11rem',
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
                            poster={item.videoBlurhash ? blurHashToDataURLCached(item.videoBlurhash) : undefined}
                          />
                        ) : (
                          <div 
                            className="w-full h-full animate-pulse"
                            style={{
                              backgroundColor: item.videoBlurhash ? undefined : 'var(--card)',
                              backgroundImage: item.videoBlurhash ? `url(${blurHashToDataURLCached(item.videoBlurhash)})` : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          />
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
                      className="relative overflow-hidden rounded-xl border border-[color:var(--border)] group transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 cursor-pointer flex-shrink-0"
                      style={{
                        width: `${columnWidth}rem`,
                        height: '11rem',
                        minWidth: `${columnWidth}rem`,
                        minHeight: '11rem',
                      }}
                    >
                      {isVisible ? (
                        template.thumbUrl ? (
                          <Image
                            src={template.thumbUrl}
                            alt={template.name || 'Template'}
                            width={400}
                            height={300}
                            className="w-full h-full object-cover"
                            placeholder={template.blurhash ? "blur" : "empty"}
                            blurDataURL={template.blurhash ? blurHashToDataURLCached(template.blurhash) : undefined}
                            loading={loadingPriority}
                            priority={loadingPriority === "eager"}
                          />
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center"
                            style={{
                              backgroundImage: template.blurhash ? `url(${blurHashToDataURLCached(template.blurhash)})` : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundColor: template.blurhash ? undefined : 'var(--card)',
                            }}
                          >
                            {!template.blurhash && (
                              <div className="text-center px-2">
                                <div className="text-white/30 text-xs font-medium">
                                  {template.name || 'Template'}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <div 
                          className="w-full h-full animate-pulse"
                          style={{
                            backgroundImage: template.blurhash ? `url(${blurHashToDataURLCached(template.blurhash)})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundColor: 'var(--card)',
                          }}
                        />
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

