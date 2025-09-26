"use client";
import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import ElectricBorder from "@/components/electric-border";
import carLoadAnimation from "@/public/carload.json";
import { LayerEditorProvider } from "@/components/layer-editor/LayerEditorProvider";
import LayerEditorShell from "@/components/layer-editor/LayerEditorShell";
import { DesignerActionsProvider } from "@/components/designer/DesignerActionsContext";
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

function DesignerComponent({ bgKey, rembg, defaultHeadline, onClose, onSave, saveLabel, aspectRatio, onReplaceBgKey, onTryAgain, showAnimate, onAnimate }: {
  bgKey: string;
  rembg?: RembgConfig;
  defaultHeadline?: string;
  onClose?: () => void;
  onSave?: (blob: Blob) => Promise<void> | void;
  saveLabel?: string;
  aspectRatio?: number;
  onReplaceBgKey?: (newKey: string, newUrl?: string) => void;
  onTryAgain?: () => void;
  showAnimate?: boolean;
  onAnimate?: (getBlob: () => Promise<Blob | null>) => Promise<void> | void;
}){
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

  const downloadComposite = useCallback(async () => {
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
  }, [bgUrl, downloading, fgUrl]);

  const saveComposite = useCallback(async () => {
    if (!onSave || !bgUrl) return;
    if (saving) return;
    setSaving(true);
    try {
      const getState = (window as unknown as { getLayerEditorSnapshot?: ()=>{ backgroundUrl: string; carMaskUrl?: string | null; layers: import("@/types/layer-editor").Layer[] } }).getLayerEditorSnapshot;
      const snap = getState ? getState() : { backgroundUrl: bgUrl, carMaskUrl: fgUrl || null, layers: [] as import("@/types/layer-editor").Layer[] };
      const blob = await composeLayersToBlob({ backgroundUrl: snap.backgroundUrl, carMaskUrl: snap.carMaskUrl, layers: snap.layers });
      if (!blob) return;
      try {
        const [md5Bg, md5Out] = await Promise.all([
          (async()=>{
            const r = await fetch(bgUrl, { cache:'no-store' }); const b = await r.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(b);
          })(),
          (async()=>{
            const ab = await blob.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(ab);
          })(),
        ]);
        if (md5Bg && md5Out && md5Bg === md5Out) return;
      } catch {}
      await onSave(blob);
    } finally { setSaving(false); }
  }, [bgUrl, fgUrl, onSave, saving]);

  const exportCompositeBlob = useCallback(async (): Promise<Blob | null> => {
    if (!bgUrl) return null;
    try {
      const getState = (window as unknown as { getLayerEditorSnapshot?: ()=>{ backgroundUrl: string; carMaskUrl?: string | null; layers: import("@/types/layer-editor").Layer[] } }).getLayerEditorSnapshot;
      const snap = getState ? getState() : { backgroundUrl: bgUrl, carMaskUrl: fgUrl || null, layers: [] as import("@/types/layer-editor").Layer[] };
      const blob = await composeLayersToBlob({ backgroundUrl: snap.backgroundUrl, carMaskUrl: snap.carMaskUrl, layers: snap.layers });
      return blob;
    } catch { return null; }
  }, [bgUrl, fgUrl]);

  const upscaleBackground = useCallback(async () => {
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
      if (res.status === 400 && (data?.error === 'UPSCALE_AT_MAX')) { try { (window as unknown as { toast?: { error?: (m: string)=>void } })?.toast?.error?.('Already at maximum resolution.'); } catch {} setUpscaling(false); return; }
      if (res.status === 400 && (data?.error === 'UPSCALE_DIM_OVERFLOW')) { try { (window as unknown as { toast?: { error?: (m: string)=>void } })?.toast?.error?.('Upscale would exceed the 4K limit.'); } catch {} setUpscaling(false); return; }
      if (!res.ok || !data?.key) { try { (window as unknown as { toast?: { error?: (m: string)=>void } })?.toast?.error?.(String((data as { error?: string })?.error || 'Upscale failed')); } catch {} setUpscaling(false); return; }
      if (typeof onReplaceBgKey === 'function') {
        try { onReplaceBgKey(String(data.key), typeof data?.url === 'string' ? String(data.url) : undefined); } catch {}
      }
    } catch {} finally { setUpscaling(false); }
  }, [bgKey, onReplaceBgKey, upscaling]);

  const actions = React.useMemo(() => {
    const list: import("@/components/designer/DesignerActionsContext").DesignerActionDescriptor[] = [];
    if (onTryAgain) {
      list.push({
        key: "try-again",
        label: "Try again",
        onSelect: onTryAgain,
        section: "desktop-only",
        variant: "outline",
      });
    }
    list.push({
      key: "upscale",
      label: upscaling ? "Upscaling…" : "Upscale",
      onSelect: upscaleBackground,
      disabled: upscaling,
      variant: "outline",
      electric: true,
      loading: upscaling,
      section: "primary",
    });
    if (showAnimate && onAnimate) {
      list.push({
        key: "animate",
        label: "Animate",
        onSelect: async () => {
          try {
            await onAnimate(exportCompositeBlob);
          } catch {}
        },
        variant: "secondary",
        electric: true,
      });
    }
    if (onSave) {
      list.push({
        key: "save",
        label: saving ? "Saving…" : (saveLabel || "Save"),
        onSelect: saveComposite,
        disabled: saving,
        loading: saving,
      });
    }
    list.push({
      key: "download",
      label: downloading ? "Downloading…" : "Download",
      onSelect: downloadComposite,
      disabled: downloading,
      loading: downloading,
      icon: !downloading ? <Download className="size-4" aria-hidden /> : undefined,
      srLabel: "Download design",
    });
    return list;
  }, [onTryAgain, onSave, saveLabel, showAnimate, onAnimate, downloading, saving, upscaling, downloadComposite, exportCompositeBlob, saveComposite, upscaleBackground]);

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
      <DesignerActionsProvider value={{ actions }}>
        <LayerEditorProvider
          initial={{
            backgroundUrl: bgUrl,
            carMaskUrl: fgUrl,
            layers: (typeof defaultHeadline === 'string' && defaultHeadline.trim())
              ? [{ ...createDefaultText(50, 80), text: defaultHeadline.toUpperCase() }]
              : [],
            editingLayerId: undefined,
          }}
        >
          <ExposeLayerState />
          <LayerEditorShell />
          <div className="pt-2">
            <div className={`hidden sm:flex flex-wrap items-center ${onTryAgain ? 'justify-between' : 'justify-end'} gap-2`}
              aria-label="Designer actions"
              role="toolbar"
            >
              {onTryAgain ? (
                <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={onTryAgain}>Try again</Button>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showAnimate ? (
                  <ElectricBorder color="#ff6a00" speed={1} chaos={0.6} thickness={2} className="w-full sm:w-auto rounded-md">
                    <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={async()=>{
                      try {
                        if (typeof onAnimate === 'function') {
                          await onAnimate(exportCompositeBlob);
                        }
                      } catch {}
                    }}>Animate</Button>
                  </ElectricBorder>
                ) : null}
                <ElectricBorder color="#ff6a00" speed={1} chaos={0.6} thickness={2} className="w-full sm:w-auto rounded-md">
                  <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={upscaleBackground} disabled={upscaling}>
                    {upscaling ? 'Upscaling…' : 'Upscale'}
                  </Button>
                </ElectricBorder>
                {onSave ? (
                  <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={saveComposite}>{saveLabel || 'Save'}</Button>
                ) : null}
                <Button
                  type="button"
                  className="w-full sm:w-auto flex items-center justify-center"
                  onClick={downloadComposite}
                  disabled={downloading}
                  title="Download"
                  aria-label={downloading ? 'Downloading' : 'Download'}
                >
                  {downloading ? 'Downloading…' : (
                    <>
                      <Download className="size-4" aria-hidden />
                      <span className="sr-only">Download</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </LayerEditorProvider>
      </DesignerActionsProvider>
    </div>
  );
}

export const Designer = React.memo(DesignerComponent, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when props haven't actually changed
  return (
    prevProps.bgKey === nextProps.bgKey &&
    JSON.stringify(prevProps.rembg) === JSON.stringify(nextProps.rembg) &&
    prevProps.defaultHeadline === nextProps.defaultHeadline &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.onSave === nextProps.onSave &&
    prevProps.saveLabel === nextProps.saveLabel &&
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.onReplaceBgKey === nextProps.onReplaceBgKey &&
    prevProps.onTryAgain === nextProps.onTryAgain &&
    prevProps.showAnimate === nextProps.showAnimate &&
    prevProps.onAnimate === nextProps.onAnimate
  );
});

Designer.displayName = 'Designer';

export default Designer;

// Expose a snapshot getter so the compose function can read current layers
function ExposeLayerState(){
  // The provider attaches a snapshot getter globally; nothing to do here now.
  return null;
}


