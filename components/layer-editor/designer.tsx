"use client";
import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import carLoadAnimation from "@/public/carload.json";
import downloadAnimation from "@/public/download.json";
import { LayerEditorProvider, useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import LayerEditorShell from "@/components/layer-editor/LayerEditorShell";
import { DesignerActionsProvider } from "@/components/layer-editor/DesignerActionsContext";
import { composeLayersToBlob, exportDesignerState } from "@/lib/layer-export";
import { getViewUrl } from "@/lib/view-url-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type RembgConfig = {
  enabled?: boolean;
  model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
  operating_resolution?: '1024x1024' | '2048x2048';
  output_format?: 'png' | 'webp';
  refine_foreground?: boolean;
  output_mask?: boolean;
} | null | undefined;

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

function DesignerComponent({ bgKey, rembg, onClose, onSave, saveLabel, aspectRatio, onReplaceBgKey, onTryAgain, showAnimate, onAnimate, projectState, sourceImageKey, closeOnDownload }: {
  bgKey: string;
  rembg?: RembgConfig;
  onClose?: () => void;
  onSave?: (blob: Blob, projectState?: string) => Promise<void> | void;
  saveLabel?: string;
  aspectRatio?: number;
  onReplaceBgKey?: (newKey: string, newUrl?: string) => void;
  onTryAgain?: () => void;
  showAnimate?: boolean;
  onAnimate?: (getBlob: () => Promise<Blob | null>) => Promise<void> | void;
  projectState?: import("@/lib/layer-export").DesignerProjectState | null;
  sourceImageKey?: string | null; // Original source image (for templates), used as backgroundKey when saving
  closeOnDownload?: boolean; // If true, close designer after download completes
}){
  console.log('[Designer] Initialized with:', {
    bgKey,
    sourceImageKey,
    hasProjectState: !!projectState,
    projectStateBackgroundKey: projectState?.backgroundKey
  });
  
  const [busy, setBusy] = useState(!projectState); // Skip loading if we have project state
  const [bgUrl, setBgUrl] = useState<string | null>(projectState?.backgroundUrl || null);
  const [fgUrl, setFgUrl] = useState<string | null>(projectState?.carMaskUrl || null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [_dirty, setDirty] = useState(false);
  const dirtyCommitRef = React.useRef<(() => void) | null>(null);
  const stateRef = React.useRef<import("@/types/layer-editor").LayerEditorState | null>(null);
  void aspectRatio; void onClose; void saveLabel; // accepted for API compatibility

  const initializedRef = React.useRef(!!projectState); // Already initialized if we have project state
  const initialBgKeyRef = React.useRef(bgKey);
  
  useEffect(()=>{
    // If projectState was provided, we already have everything - skip rembg
    if (projectState) {
      initializedRef.current = true;
      initialBgKeyRef.current = bgKey;
      // Ensure we're not stuck in busy state
      setBusy(false);
      return;
    }
    
    // Only initialize once to prevent canvas reset
    // Don't reinitialize when bgKey changes from upscale - that's handled separately
    if (initializedRef.current && bgKey !== initialBgKeyRef.current) {
      // bgKey changed (e.g., from upscale) - just update the URL without reinitializing
      setBgUrl(`/api/storage/file?key=${encodeURIComponent(bgKey)}`);
      initialBgKeyRef.current = bgKey;
      return;
    }
    
    if (initializedRef.current) return;
    
    // Skip rembg if it's disabled (e.g., when loading project state)
    if (rembg && rembg.enabled === false) {
      // Just set URLs and mark as initialized
      const url = `/api/storage/file?key=${encodeURIComponent(bgKey)}`;
      setBgUrl(url);
      initializedRef.current = true;
      initialBgKeyRef.current = bgKey;
      setBusy(false);
      return;
    }
    
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
        initializedRef.current = true;
        initialBgKeyRef.current = bgKey;
      } catch {
      } finally { if (!cancelled) { setBusy(false); } }
    })();
    return ()=>{ cancelled = true; };
  }, [bgKey, rembg, projectState]);

  const exportCompositeBlob = useCallback(async (): Promise<Blob | null> => {
    if (!bgUrl) return null;
    try {
      // Try ref first (more reliable), fall back to window global
      const snap = stateRef.current || (window as unknown as { getLayerEditorSnapshot?: ()=> import("@/types/layer-editor").LayerEditorState }).getLayerEditorSnapshot?.();
      if (!snap) {
        console.error('[Designer] Layer editor state not available');
        return null;
      }
      console.log('[Designer] Exporting with state:', {
        layerCount: snap.layers?.length || 0,
        maskOffset: { x: snap.maskTranslateXPct, y: snap.maskTranslateYPct },
        backgroundUrl: snap.backgroundUrl?.substring(0, 50),
        carMaskUrl: snap.carMaskUrl?.substring(0, 50),
        layers: snap.layers?.map(l => ({
          type: l.type,
          tiltX: l.tiltXDeg,
          tiltY: l.tiltYDeg,
          rotation: l.rotationDeg,
          aboveMask: l.aboveMask
        }))
      });
      const blob = await composeLayersToBlob({ 
        backgroundUrl: snap.backgroundUrl || bgUrl, 
        carMaskUrl: snap.carMaskUrl || fgUrl || null, 
        layers: snap.layers || [],
        maskTranslateXPct: snap.maskTranslateXPct || 0,
        maskTranslateYPct: snap.maskTranslateYPct || 0
      });
      return blob;
    } catch (err) { 
      console.error('[Designer] Export error:', err);
      return null; 
    }
  }, [bgUrl, fgUrl]);

  const _saveComposite = useCallback(async (): Promise<boolean> => {
    if (!onSave || !bgUrl) return false;
    if (saving) return false;
    setSaving(true);
    try {
      const blob = await exportCompositeBlob();
      if (!blob) return false;
      try {
        const [md5Bg, md5Out] = await Promise.all([
          (async()=>{
            const r = await fetch(bgUrl, { cache:'no-store' }); const b = await r.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(b);
          })(),
          (async()=>{
            const ab = await blob.arrayBuffer(); const { default: SparkMD5 } = await import('spark-md5'); return SparkMD5.ArrayBuffer.hash(ab);
          })(),
        ]);
        if (md5Bg && md5Out && md5Bg === md5Out) return false;
      } catch {}
      
      // Export project state to save alongside the image
      const snap = stateRef.current;
      // Use sourceImageKey if provided (for templates), otherwise use bgKey
      const keyToSave = sourceImageKey || bgKey;
      const projectJson = snap ? exportDesignerState({
        backgroundUrl: snap.backgroundUrl || bgUrl || '',
        carMaskUrl: snap.carMaskUrl || fgUrl,
        layers: snap.layers || [],
        maskTranslateXPct: snap.maskTranslateXPct,
        maskTranslateYPct: snap.maskTranslateYPct,
        backgroundKey: keyToSave, // Save the original source key for re-opening (vehicle photo for templates)
      }) : undefined;
      
      console.log('[Designer] Saving with backgroundKey:', keyToSave, '(sourceImageKey:', sourceImageKey, ', bgKey:', bgKey, ')');
      
      await onSave(blob, projectJson);
      return true;
    } finally { setSaving(false); }
  }, [bgKey, bgUrl, exportCompositeBlob, fgUrl, onSave, saving, sourceImageKey]);

  const downloadComposite = useCallback(async () => {
    if (downloading || saving || !bgUrl) return;
    setDownloading(true);
    try {
      // Download directly without saving to workspace library
      const blob = await exportCompositeBlob();
      if (!blob) {
        console.warn('[Designer] Failed to export composite blob');
        return;
      }
      const a = document.createElement('a');
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.download = `design-${Date.now()}.png`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Clean up after download
      setTimeout(()=>{ 
        try { 
          URL.revokeObjectURL(blobUrl); 
          document.body.removeChild(a);
        } catch {}
      }, 1000);
      
      // Close designer if requested (e.g., for template-generated images)
      if (closeOnDownload && onClose) {
        // Small delay to ensure download starts before closing
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err) {
      console.error('[Designer] Download error:', err);
    } finally { 
      setDownloading(false); 
    }
  }, [bgUrl, downloading, saving, exportCompositeBlob, closeOnDownload, onClose]);

  const downloadProject = useCallback(async () => {
    try {
      const snap = stateRef.current;
      if (!snap) return;
      
      const projectJson = exportDesignerState({
        backgroundUrl: snap.backgroundUrl || bgUrl || '',
        carMaskUrl: snap.carMaskUrl || fgUrl,
        layers: snap.layers || [],
        maskTranslateXPct: snap.maskTranslateXPct,
        maskTranslateYPct: snap.maskTranslateYPct,
        backgroundKey: bgKey,
      });
      
      const blob = new Blob([projectJson], { type: 'application/json' });
      const a = document.createElement('a');
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.download = `project-${Date.now()}.carclout`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ 
        try { 
          URL.revokeObjectURL(blobUrl); 
          document.body.removeChild(a);
        } catch {}
      }, 1000);
    } catch (err) {
      console.error('[Designer] Project download error:', err);
    }
  }, [bgKey, bgUrl, fgUrl]);

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
    const list: import("@/components/layer-editor/DesignerActionsContext").DesignerActionDescriptor[] = [];
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
    list.push({
      key: "save-project",
      label: "Save Project",
      onSelect: downloadProject,
      variant: "outline",
      srLabel: "Save project file",
      section: "desktop-only",
    });
    list.push({
      key: "download",
      label: downloading || saving ? "Downloading…" : "Download",
      onSelect: downloadComposite,
      disabled: downloading || saving,
      loading: downloading || saving,
      icon: !(downloading || saving) ? <Download className="size-4" aria-hidden /> : undefined,
      srLabel: "Download design",
      section: "desktop-only",
    });
    return list;
  }, [onTryAgain, showAnimate, onAnimate, downloading, saving, upscaling, downloadComposite, downloadProject, upscaleBackground, exportCompositeBlob]);

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
    <div className="space-y-3 relative">
      {/* Loading overlay during download */}
      {(downloading || saving) && (
        <div 
          className="fixed inset-0 z-50 bg-[var(--background)]/95 flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-32 h-32">
              <Lottie animationData={downloadAnimation as unknown as object} loop style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="text-white text-sm font-medium">
              {downloading ? "Preparing your download..." : "Saving..."}
            </div>
          </div>
        </div>
      )}
      
      <DesignerActionsProvider value={{ actions }}>
        <LayerEditorProvider
          initial={{
            backgroundUrl: bgUrl,
            carMaskUrl: fgUrl,
            layers: projectState?.layers || [],
            maskTranslateXPct: projectState?.maskTranslateXPct,
            maskTranslateYPct: projectState?.maskTranslateYPct,
            editingLayerId: undefined,
          }}
          onDirtyChange={(next, commit) => {
            dirtyCommitRef.current = commit;
            setDirty(next);
          }}
        >
          <ExposeLayerState stateRef={stateRef} />
          <LayerEditorShell
            mobileHeaderAccessory={(
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-md border border-[color:var(--border)] bg-[color:var(--popover)]/80 text-white shadow-lg backdrop-blur transition hover:bg-[color:var(--popover)]"
                onClick={downloadComposite}
                disabled={downloading || saving}
                title="Download"
                aria-label={downloading || saving ? "Downloading" : "Download"}
              >
                <Download className="size-4" aria-hidden />
                <span className="sr-only">{downloading || saving ? "Downloading" : "Download"}</span>
              </Button>
            )}
            toolbarDownloadButton={(
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={downloadComposite}
                    disabled={downloading || saving}
                    className="flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10 h-12 w-12"
                    aria-label={downloading || saving ? "Downloading" : "Download"}
                  >
                    <Download className="size-5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-2 py-1 text-xs">
                  Download
                </TooltipContent>
              </Tooltip>
            )}
          />
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
    prevProps.onClose === nextProps.onClose &&
    prevProps.onSave === nextProps.onSave &&
    prevProps.saveLabel === nextProps.saveLabel &&
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.onReplaceBgKey === nextProps.onReplaceBgKey &&
    prevProps.onTryAgain === nextProps.onTryAgain &&
    prevProps.showAnimate === nextProps.showAnimate &&
    prevProps.onAnimate === nextProps.onAnimate &&
    JSON.stringify(prevProps.projectState) === JSON.stringify(nextProps.projectState) &&
    prevProps.closeOnDownload === nextProps.closeOnDownload
  );
});

Designer.displayName = 'Designer';

export default Designer;

// Expose a snapshot getter so the compose function can read current layers
function ExposeLayerState({ stateRef }: { stateRef: React.MutableRefObject<import("@/types/layer-editor").LayerEditorState | null> }){
  const { state } = useLayerEditor();
  React.useEffect(() => {
    stateRef.current = state;
  }, [state, stateRef]);
  return null;
}


