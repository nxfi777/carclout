"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import carLoadAnimation from "@/public/carload.json";
import { LayerEditorProvider } from "@/components/layer-editor/LayerEditorProvider";
import LayerEditorShell from "@/components/layer-editor/LayerEditorShell";
import { composeLayersToBlob } from "@/lib/layer-export";
import { createDefaultText } from "@/types/layer-editor";
import { getViewUrl } from "@/lib/view-url-client";

type RembgConfig = {
  enabled?: boolean;
  model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
  operating_resolution?: '1024x1024' | '2048x2048';
  output_format?: 'png' | 'webp';
  refine_foreground?: boolean;
  output_mask?: boolean;
} | null | undefined;

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export function Designer({ bgKey, rembg, defaultHeadline, onClose, onSave, saveLabel, aspectRatio, onReplaceBgKey, onTryAgain, showAnimate, onAnimate }: { bgKey: string; rembg?: RembgConfig; defaultHeadline?: string; onClose?: () => void; onSave?: (blob: Blob) => Promise<void> | void; saveLabel?: string; aspectRatio?: number; onReplaceBgKey?: (newKey: string, newUrl?: string) => void; onTryAgain?: () => void; showAnimate?: boolean; onAnimate?: (blob: Blob) => Promise<void> | void; }){
  const [busy, setBusy] = useState(true);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [fgUrl, setFgUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  void aspectRatio; void onClose; // accepted for API compatibility

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      try {
        setBusy(true);
        const url = `/api/storage/file?key=${encodeURIComponent(bgKey)}`;
        if (cancelled) return; setBgUrl(url);
        const input = {
          r2_key: bgKey,
          model: ((): 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait' => {
            const allowed = new Set(['General Use (Light)','General Use (Light 2K)','General Use (Heavy)','Matting','Portrait'] as const);
            return rembg && rembg.model && allowed.has(rembg.model) ? rembg.model : 'General Use (Heavy)';
          })(),
          operating_resolution: ((): '1024x1024' | '2048x2048' => {
            const allowed = new Set(['1024x1024','2048x2048'] as const);
            return rembg && rembg.operating_resolution && allowed.has(rembg.operating_resolution) ? rembg.operating_resolution : '2048x2048';
          })(),
          output_format: ((): 'png' | 'webp' => (rembg?.output_format === 'webp' ? 'webp' : 'png'))(),
          refine_foreground: typeof rembg?.refine_foreground === 'boolean' ? !!rembg?.refine_foreground : true,
          output_mask: !!rembg?.output_mask,
        };
        const res = await fetch('/api/tools/rembg', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(input) }).then(r=>r.json()).catch(()=>({}));
        const fg = res?.image?.url || null;
        if (!fg) throw new Error('fg');
        setFgUrl(fg);
      } catch {
      } finally { if (!cancelled) { setBusy(false); } }
    })();
    return ()=>{ cancelled = true; };
  }, [bgKey, rembg]);

  async function downloadComposite(){
    if (downloading || !bgUrl) return;
    setDownloading(true);
    try {
      const getState = (window as unknown as { getLayerEditorSnapshot?: ()=>{ backgroundUrl: string; carMaskUrl?: string | null; layers: import("@/types/layer-editor").Layer[] } }).getLayerEditorSnapshot;
      const snap = getState ? getState() : { backgroundUrl: bgUrl, carMaskUrl: fgUrl || null, layers: [] as import("@/types/layer-editor").Layer[] };
      const blob = await composeLayersToBlob({ backgroundUrl: snap.backgroundUrl, carMaskUrl: snap.carMaskUrl, layers: snap.layers });
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `design-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
    } finally { setDownloading(false); }
  }

  async function saveComposite(){
    if (!onSave || !bgUrl) return;
    if (saving) return;
    setSaving(true);
    try {
      const getState = (window as unknown as { getLayerEditorSnapshot?: ()=>{ backgroundUrl: string; carMaskUrl?: string | null; layers: import("@/types/layer-editor").Layer[] } }).getLayerEditorSnapshot;
      const snap = getState ? getState() : { backgroundUrl: bgUrl, carMaskUrl: fgUrl || null, layers: [] as import("@/types/layer-editor").Layer[] };
      const blob = await composeLayersToBlob({ backgroundUrl: snap.backgroundUrl, carMaskUrl: snap.carMaskUrl, layers: snap.layers });
      if (!blob) return;
      // Compare md5 of composed vs background; skip save if same
      try {
        const [md5Bg, md5Out] = await Promise.all([
          (async()=>{
            const r = await fetch(bgUrl, { cache:'no-store' }); const b = await r.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(b);
          })(),
          (async()=>{
            const ab = await blob.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(ab);
          })(),
        ]);
        if (md5Bg && md5Out && md5Bg === md5Out) return; // no changes
      } catch {}
      await onSave(blob);
    } finally { setSaving(false); }
  }

  async function exportCompositeBlob(): Promise<Blob | null> {
    try {
      const getState = (window as unknown as { getLayerEditorSnapshot?: ()=>{ backgroundUrl: string; carMaskUrl?: string | null; layers: import("@/types/layer-editor").Layer[] } }).getLayerEditorSnapshot;
      const snap = getState ? getState() : { backgroundUrl: bgUrl!, carMaskUrl: fgUrl || null, layers: [] as import("@/types/layer-editor").Layer[] };
      const blob = await composeLayersToBlob({ backgroundUrl: snap.backgroundUrl, carMaskUrl: snap.carMaskUrl, layers: snap.layers });
      return blob;
    } catch { return null; }
  }

  async function upscaleBackground(){
    if (upscaling) return;
    setUpscaling(true);
    try {
      let payload: { r2_key: string; original_width?: number; original_height?: number } = { r2_key: bgKey };
      try {
        const url: string | null = await getViewUrl(bgKey);
        if (url) {
          const dims = await new Promise<{ w: number; h: number } | null>((resolve)=>{ try{ const img=new Image(); img.onload=()=> resolve({ w: img.naturalWidth||img.width, h: img.naturalHeight||img.height }); img.onerror=()=> resolve(null); img.src=url; } catch { resolve(null); } });
          if (dims && dims.w>0 && dims.h>0) { payload = { r2_key: bgKey, original_width: dims.w, original_height: dims.h }; }
        }
      } catch {}
      const res = await fetch('/api/tools/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(()=>({}));
      if (res.status === 402) { try { (window as unknown as { toast?: { error?: (m: string)=>void } })?.toast?.error?.('Not enough credits.'); } catch {} setUpscaling(false); return; }
      if (!res.ok || !data?.key) { try { (window as unknown as { toast?: { error?: (m: string)=>void } })?.toast?.error?.(String((data as { error?: string })?.error || 'Upscale failed')); } catch {} setUpscaling(false); return; }
      if (typeof onReplaceBgKey === 'function') {
        try { onReplaceBgKey(String(data.key), typeof data?.url === 'string' ? String(data.url) : undefined); } catch {}
      }
    } catch {} finally { setUpscaling(false); }
  }

  if (busy) {
    return (
      <div className="p-6 sm:p-10 min-h-[12rem] grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[14rem] h-[8rem] sm:w-[17.5rem] sm:h-[10.5rem]">
            <Lottie animationData={carLoadAnimation as unknown as object} loop style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="text-sm text-white/80 text-center px-2">Cutting out your car — this may take a moment</div>
        </div>
      </div>
    );
  }
  if (!bgUrl || !fgUrl) {
    return <div className="p-6 text-sm text-white/70">Failed to prepare editor. Please try again.</div>;
  }

  return (
    <div className="space-y-3">
      <LayerEditorProvider initial={{ backgroundUrl: bgUrl, carMaskUrl: fgUrl, layers: (typeof defaultHeadline === 'string' && defaultHeadline.trim()) ? [{ ...createDefaultText(50, 80), text: defaultHeadline.toUpperCase() }] : [] }}>
        <ExposeLayerState />
        <LayerEditorShell />
          <div className={`pt-2 flex flex-wrap items-center ${onTryAgain ? 'justify-between' : 'justify-end'} gap-2`}>
            {onTryAgain ? (
              <Button className="w-full sm:w-auto" variant="outline" onClick={onTryAgain}>Try again</Button>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button className="w-full sm:w-auto" variant="outline" onClick={upscaleBackground} disabled={upscaling}>
                {upscaling ? 'Upscaling…' : 'Upscale background'}
              </Button>
              {showAnimate ? (
                <Button className="w-full sm:w-auto" variant="secondary" onClick={async()=>{
                  try {
                    const blob = await exportCompositeBlob();
                    if (!blob) return;
                    if (typeof onAnimate === 'function') await onAnimate(blob);
                  } catch {}
                }}>Animate</Button>
              ) : null}
              {onSave ? (
                <Button className="w-full sm:w-auto" disabled={saving} onClick={saveComposite}>{saveLabel || 'Save'}</Button>
              ) : null}
              <Button className="w-full sm:w-auto" onClick={downloadComposite} disabled={downloading}>
                {downloading ? 'Downloading…' : 'Download'}
              </Button>
            </div>
          </div>
      </LayerEditorProvider>
    </div>
  );
}

export default Designer;

// Expose a snapshot getter so the compose function can read current layers
function ExposeLayerState(){
  // The provider attaches a snapshot getter globally; nothing to do here now.
  return null;
}


