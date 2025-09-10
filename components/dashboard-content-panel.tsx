"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import CircularGallery from "@/components/ui/circular-gallery";
// ffmpeg wasm is loaded lazily only when uploading in admin hooks scope

// Lazy-load placeholder removed to avoid shadowing the import and runtime nulls

type Asset = {
  _id: string;
  title: string;
  description?: string;
  category: "templates" | "hooks" | "ebook" | "videos";
  url?: string;
  fileUrl?: string;
  image?: { asset?: { url: string } };
  access?: "free" | "premium" | "ultra";
};

type StorageItem = { type: "folder" | "file"; name: string; key?: string; size?: number; lastModified?: string };

type HookPreview = { image: string; text: string; videoUrl?: string };

export function DashboardContentPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hookItems, setHookItems] = useState<HookPreview[] | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/assets", { cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        setAssets(res.assets || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load hooks bundles from admin storage: admin/hooks/*/<bundle> with thumb + video
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const list: { bundles?: { name:string; key:string; thumbKey?:string; videoKey?:string }[] } = await fetch(`/api/storage/list?path=${encodeURIComponent('hooks')}&scope=admin`, { cache: 'no-store' }).then(r=>r.json());
        const bundles = Array.isArray(list.bundles) ? list.bundles : [];
        const previews: HookPreview[] = [];
        for (const b of bundles) {
          const thumbKey = b.thumbKey || `admin/${b.key}/thumb.jpg`;
          const videoKey = b.videoKey || `admin/${b.key}/video.mp4`;
          const viewThumb = await fetch('/api/storage/view', { method: 'POST', body: JSON.stringify({ key: thumbKey.startsWith('admin/')? thumbKey : `admin/${thumbKey}`, scope: 'admin' }) }).then(r=>r.json()).catch(()=>({}));
          const viewVideo = await fetch('/api/storage/view', { method: 'POST', body: JSON.stringify({ key: videoKey.startsWith('admin/')? videoKey : `admin/${videoKey}`, scope: 'admin' }) }).then(r=>r.json()).catch(()=>({}));
          if (!viewThumb?.url || !viewVideo?.url) continue;
          previews.push({ image: viewThumb.url, text: b.name, videoUrl: viewVideo.url });
          if (aborted) return;
        }
        if (!aborted) setHookItems(previews);
      } catch {
        if (!aborted) setHookItems([]);
      }
    })();
    return () => { aborted = true; };
  }, []);

  const items = useMemo(() => {
    const categories: Asset["category"][] = ["templates", "hooks", "ebook", "videos"];
    const labels: Record<Asset["category"], string> = {
      templates: "Templates",
      hooks: "Hooks",
      ebook: "E‑book",
      videos: "Videos",
    };
    const colors: Record<Asset["category"], { bg: string; text: string }> = {
      templates: { bg: "#474747", text: "#fff" },
      hooks: { bg: "#707070", text: "#fff" },
      ebook: { bg: "#999999", text: "#000" },
      videos: { bg: "#474747", text: "#fff" },
    };
    return categories.slice(0, 3).map((c) => ({
      label: labels[c],
      bgColor: colors[c].bg,
      textColor: colors[c].text,
      links: assets
        .filter((a) => a.category === c)
        .slice(0, 5)
        .map((a) => ({
          label: a.title,
          href: (a.fileUrl || a.url || "#"),
          ariaLabel: `${labels[c]}: ${a.title}`,
        })),
    }));
  }, [assets]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => {
          const first = item.links[0];
          const handleClick = () => {
            if (first?.href) window.open(first.href, "_blank");
          };
          if (item.label === 'Hooks') {
            return (
              <div key={item.label} className="rounded-xl p-4 transition bg-[var(--card)] text-[color:var(--card-foreground)] border border-[color:var(--border)]">
                <div className="text-xl mb-2 font-semibold tracking-tight">Hooks</div>
                <div className="h-[240px] rounded overflow-hidden bg-black/20 relative">
                  {Array.isArray(hookItems) ? (
                    hookItems.length > 0 ? (
                      <HoverVideoGallery items={hookItems} />
                    ) : (
                      <div className="h-full grid place-items-center text-sm text-white/80">No hooks yet</div>
                    )
                  ) : (
                    <div className="h-full grid place-items-center text-sm text-white/80">Loading…</div>
                  )}
                </div>
                <div className="mt-3 text-xs opacity-80">Admin-managed hooks (videos) from the shared workspace</div>
              </div>
            );
          }
          return (
            <div
              key={item.label}
              className="rounded-xl p-4 cursor-pointer hover:opacity-95 transition"
              style={{ backgroundColor: item.bgColor, color: item.textColor }}
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
            >
              <div className="text-xl mb-2 font-semibold tracking-tight">{item.label}</div>
              <div className="flex flex-col gap-1">
                {item.links.map((lnk) => (
                  <a key={`${item.label}-${lnk.label}`} href={lnk.href} aria-label={lnk.ariaLabel} target="_blank" className="inline-flex items-center gap-2 opacity-90 hover:opacity-100 text-sm">
                    <ArrowUpRight aria-hidden="true" className="w-4 h-4" />
                    {lnk.label}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function extractFirstFrame(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'metadata';
      video.src = `${url}#t=0.001`;
      const onLoadedData = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no ctx');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          cleanup();
          resolve(dataUrl);
        } catch (e) { cleanup(); reject(e); }
      };
      const onError = () => { cleanup(); reject(new Error('thumb error')); };
      function cleanup() {
        try { video.removeEventListener('loadeddata', onLoadedData); } catch {}
        try { video.removeEventListener('error', onError); } catch {}
        try { video.pause(); } catch {}
      }
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('error', onError);
    } catch (e) { reject(e); }
  });
}

function HoverVideoGallery({ items }: { items: HookPreview[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="w-full h-full grid grid-flow-col auto-cols-[200px] gap-2 overflow-x-auto p-2">
      {items.map((it, idx) => (
        <div key={`${it.text}-${idx}`} className="relative h-full rounded overflow-hidden bg-black/30"
          onMouseEnter={()=>setActive(idx)} onMouseLeave={()=>setActive(v=>v===idx?null:v)}>
          {it.videoUrl ? (
            <video className="w-full h-full object-cover" src={it.videoUrl} preload="metadata" playsInline muted loop autoPlay={active===idx} style={{ opacity: active===idx ? 1 : 0, transition: 'opacity 200ms' }} />
          ) : null}
          <img src={it.image} alt={it.text} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: active===idx ? 0 : 1, transition: 'opacity 200ms' }} />
        </div>
      ))}
    </div>
  );
}


