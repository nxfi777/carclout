"use client";

import { Heart } from "lucide-react";
import * as React from "react";
import { BlurhashImage } from "@/components/ui/blurhash-image";

export type TemplateCardData = {
  id?: string;
  name: string;
  description?: string;
  slug?: string;
  thumbUrl?: string;
  blurhash?: string;
  // Optional video preview url for hover (desktop)
  videoUrl?: string;
  createdAt?: string | Date;
  favoriteCount?: number;
  isFavorited?: boolean;
  proOnly?: boolean;
};

type TemplateCardProps = {
  data: TemplateCardData;
  className?: string;
  showNewBadge?: boolean;
  showLike?: boolean;
  showFavoriteCount?: boolean;
  onLikeToggle?: () => void;
  onClick?: () => void;
};

export function TemplateCard(props: TemplateCardProps) {
  const { data, className, showNewBadge = true, showLike = false, showFavoriteCount = false, onLikeToggle, onClick } = props;
  const [hover, setHover] = React.useState(false);
  const isNew = React.useMemo(() => {
    if (!showNewBadge) return false;
    const raw = data?.createdAt;
    if (!raw) return false;
    try {
      const ts = typeof raw === "string" ? new Date(raw).getTime() : (raw as Date).getTime();
      if (!Number.isFinite(ts)) return false;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return Date.now() - ts < sevenDaysMs;
    } catch {
      return false;
    }
  }, [data?.createdAt, showNewBadge]);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={()=> setHover(true)}
      onMouseLeave={()=> setHover(false)}
      className={`relative text-left w-full h-full rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer flex flex-col justify-between ${className || ""}`}
    >
      {data?.proOnly ? (
        <span className="absolute top-[0.5rem] right-[0.5rem] z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-[0.6rem] py-[0.35rem] text-[0.625rem] uppercase tracking-wide text-[#ff6a00] border border-[#ff6a00]/40">
          <span className="text-[0.75rem]">🔒</span>
          <span>Pro</span>
        </span>
      ) : null}

      {isNew ? (
        <span className="absolute top-[0.5rem] left-[0.5rem] z-10 text-[0.625rem] px-[0.5em] py-[0.25em] rounded-full border shadow badge-new">
          <span className="shiny-text">NEW</span>
        </span>
      ) : null}

      {showLike ? (
        <button
          className="absolute top-[0.5rem] right-[0.5rem] z-10 rounded-full cursor-pointer bg-black/60 hover:bg-black/70 text-white px-[0.6rem] py-[0.4rem] focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={data?.isFavorited ? "Remove from favourites" : "Add to favourites"}
          onClick={(e) => { e.stopPropagation(); if (onLikeToggle) onLikeToggle(); }}
          type="button"
        >
          <Heart className={`w-[1rem] h-[1rem] ${data?.isFavorited ? "text-red-500 fill-red-500" : ""}`} />
        </button>
      ) : null}

      {data?.videoUrl ? (
        <div className="relative" style={{ aspectRatio: "16 / 10" }}>
          {data.thumbUrl ? (
            <BlurhashImage 
              src={data.thumbUrl} 
              alt={data?.name || "Template"} 
              width={640} 
              height={360} 
              className="absolute inset-0 w-full h-full object-cover" 
              blurhash={data.blurhash}
              fallbackBlur="cardGradient"
              showSkeleton={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/60">No preview</div>
          )}
          <video
            className={`absolute inset-0 w-full h-full object-cover ${hover ? 'opacity-100' : 'opacity-0'}`}
            src={data.videoUrl}
            muted
            playsInline
            preload="metadata"
            onCanPlay={(e)=>{ try { if (hover) (e.currentTarget as HTMLVideoElement).play(); } catch {} }}
            onMouseEnter={(e)=>{ try { (e.currentTarget as HTMLVideoElement).currentTime = 0; (e.currentTarget as HTMLVideoElement).play(); } catch {} }}
            onMouseLeave={(e)=>{ try { (e.currentTarget as HTMLVideoElement).pause(); } catch {} }}
          />
        </div>
      ) : (
        data?.thumbUrl ? (
          <BlurhashImage 
            src={data.thumbUrl} 
            alt={data?.name || "Template"} 
            width={640} 
            height={360} 
            className="w-full h-auto" 
            blurhash={data.blurhash}
            fallbackBlur="cardGradient"
            showSkeleton={false}
          />
        ) : (
          <div className="w-full grid place-items-center text-white/60" style={{ aspectRatio: "16 / 10" }}>No preview</div>
        )
      )}

      <div className="p-2 mt-auto">
        <div className="text-sm font-medium truncate">{data?.name || "Template"}</div>
        {data?.description ? (
          <div className="text-xs text-white/60 line-clamp-2">{data.description}</div>
        ) : null}
        {showFavoriteCount ? (
          <div className="mt-[0.25rem] text-[0.75rem] text-white/70">
            {Number(data?.favoriteCount || 0)} favourite{Number(data?.favoriteCount || 0) === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </div>
  );
}


