"use client";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import { getColorAlpha, multiplyColorAlpha } from "@/lib/color";
import type { Layer } from "@/types/layer-editor";
import { cn } from "@/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import TransformControls from "@/components/layer-editor/TransformControls";
// import MarqueeOverlay from "@/components/layer-editor/MarqueeOverlay";
import { createDefaultRect, createDefaultText } from "@/types/layer-editor";
import { blurHashToDataURLCached, BLUR_DATA_URLS } from "@/lib/blur-placeholder";
import DrawToEditOverlay from "@/components/layer-editor/DrawToEditOverlay";

export default function LayerCanvas({ className }: { className?: string }) {
  const { state, dispatch } = useLayerEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerBoundsRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; lx: number; ly: number; id: string; boundsWidth: number; boundsHeight: number } | null>(null);
  const [selectRect, setSelectRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [maskDrag, setMaskDrag] = useState<null | { x: number; y: number; tx: number; ty: number }>(null);
  const [canvasHeight, setCanvasHeight] = useState(600); // Track canvas height for font sizing
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [imageBounds, setImageBounds] = useState<{ width: string; height: string; left: string; top: string } | null>(null);
  const [maskNaturalDimensions, setMaskNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  
  // Track when we just exited editing mode to prevent immediate new text creation
  const justExitedEditingRef = useRef(false);
  const stateRef = useRef({ activeLayerId: state.activeLayerId, editingLayerId: state.editingLayerId });
  
  // Keep ref synchronized with current state
  useEffect(() => {
    stateRef.current = { activeLayerId: state.activeLayerId, editingLayerId: state.editingLayerId };
  }, [state.activeLayerId, state.editingLayerId]);
  
  // Reset loaded state when background URL changes
  useEffect(() => {
    setBackgroundLoaded(false);
  }, [state.backgroundUrl]);
  
  // Load mask dimensions when mask URL changes
  useEffect(() => {
    if (!state.carMaskUrl) {
      setMaskNaturalDimensions(null);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      setMaskNaturalDimensions({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      });
    };
    img.onerror = () => {
      setMaskNaturalDimensions(null);
    };
    img.src = state.carMaskUrl;
  }, [state.carMaskUrl]);
  
  // Calculate correct mask transform accounting for coordinate space
  // The issue: maskTranslateXPct is percentage of container, but CSS translate(%) is percentage of element
  const maskTransform = useMemo(() => {
    if (!imageBounds || !maskNaturalDimensions) {
      // Fallback to old behavior if we don't have dimensions yet
      return `translate(${state.maskTranslateXPct || 0}%, ${state.maskTranslateYPct || 0}%)`;
    }
    
    // Parse container dimensions
    const containerWidth = parseFloat(imageBounds.width);
    const containerHeight = parseFloat(imageBounds.height);
    
    if (!containerWidth || !containerHeight) {
      return `translate(${state.maskTranslateXPct || 0}%, ${state.maskTranslateYPct || 0}%)`;
    }
    
    // Calculate mask display size with object-contain behavior
    const maskAspect = maskNaturalDimensions.width / maskNaturalDimensions.height;
    const containerAspect = containerWidth / containerHeight;
    
    let maskDisplayWidth: number;
    let maskDisplayHeight: number;
    
    if (maskAspect > containerAspect) {
      // Mask is wider - constrained by container width
      maskDisplayWidth = containerWidth;
      maskDisplayHeight = containerWidth / maskAspect;
    } else {
      // Mask is taller - constrained by container height
      maskDisplayHeight = containerHeight;
      maskDisplayWidth = containerHeight * maskAspect;
    }
    
    // Convert container-based percentage to element-based percentage
    // containerOffsetPx = (maskTranslateXPct / 100) * containerWidth
    // We want: (translateX / 100) * maskDisplayWidth = containerOffsetPx
    // So: translateX = (maskTranslateXPct * containerWidth / maskDisplayWidth)
    const translateX = maskDisplayWidth > 0 ? (state.maskTranslateXPct || 0) * containerWidth / maskDisplayWidth : 0;
    const translateY = maskDisplayHeight > 0 ? (state.maskTranslateYPct || 0) * containerHeight / maskDisplayHeight : 0;
    
    return `translate(${translateX}%, ${translateY}%)`;
  }, [imageBounds, maskNaturalDimensions, state.maskTranslateXPct, state.maskTranslateYPct]);
  
  // Decode blurhash to data URL (memoized for performance)
  const blurDataURL = useMemo(() => {
    if (state.backgroundBlurhash) {
      return blurHashToDataURLCached(state.backgroundBlurhash, 32, 32);
    }
    return BLUR_DATA_URLS.black;
  }, [state.backgroundBlurhash]);
  
  // Reset justExitedEditing flag when switching to text tool
  useEffect(() => {
    if (state.tool === 'text') {
      justExitedEditingRef.current = false;
    }
  }, [state.tool]);

  // Calculate image bounds to constrain canvas to actual image area
  useEffect(() => {
    const updateImageBounds = () => {
      const bgImg = document.querySelector('[data-canvas-root] img[alt="bg"]') as HTMLImageElement | null;
      const container = containerRef.current;
      
      if (!bgImg || !container || !state.backgroundUrl) {
        setImageBounds(null);
        return;
      }
      
      const containerRect = container.getBoundingClientRect();
      const imgWidth = bgImg.naturalWidth || bgImg.width;
      const imgHeight = bgImg.naturalHeight || bgImg.height;
      
      if (!imgWidth || !imgHeight) {
        setImageBounds(null);
        return;
      }
      
      const containerAspect = containerRect.width / containerRect.height;
      const imageAspect = imgWidth / imgHeight;
      
      let displayWidth, displayHeight, offsetX, offsetY;
      if (imageAspect > containerAspect) {
        // Image is wider - constrained by width
        displayWidth = containerRect.width;
        displayHeight = containerRect.width / imageAspect;
        offsetX = 0;
        offsetY = (containerRect.height - displayHeight) / 2;
      } else {
        // Image is taller - constrained by height
        displayHeight = containerRect.height;
        displayWidth = containerRect.height * imageAspect;
        offsetX = (containerRect.width - displayWidth) / 2;
        offsetY = 0;
      }
      
      setImageBounds({
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        left: `${offsetX}px`,
        top: `${offsetY}px`
      });
      
      // Also update canvas height for font sizing
      setCanvasHeight(displayHeight);
    };
    
    // Update on background load
    const bgImg = document.querySelector('[data-canvas-root] img[alt="bg"]') as HTMLImageElement | null;
    if (bgImg && bgImg.complete) {
      updateImageBounds();
    }
    
    window.addEventListener('resize', updateImageBounds);
    return () => window.removeEventListener('resize', updateImageBounds);
  }, [state.backgroundUrl, backgroundLoaded]);

  const onPointerDownLayer = useCallback((e: React.PointerEvent, layer: Layer) => {
    e.stopPropagation();
    if (layer.locked) return;
    
    // Reset exit editing flag when interacting with a layer
    justExitedEditingRef.current = false;
    
    // Allow additive selection with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      dispatch({ type: 'toggle_select_layer', id: layer.id });
      return;
    }
    dispatch({ type: 'select_layer', id: layer.id });
    // single click selects; drag only when cursor moves
    const x = e.clientX; const y = e.clientY;
    const boundsRect = layerBoundsRef.current?.getBoundingClientRect() ?? containerRef.current?.getBoundingClientRect() ?? null;
    const boundsWidth = boundsRect?.width && Number.isFinite(boundsRect.width) ? boundsRect.width : 1;
    const boundsHeight = boundsRect?.height && Number.isFinite(boundsRect.height) ? boundsRect.height : 1;
    setDragStart({ x, y, lx: layer.xPct, ly: layer.yPct, id: layer.id, boundsWidth, boundsHeight });
  }, [dispatch]);

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      if (!dragStart) return;
      const rect = layerBoundsRef.current?.getBoundingClientRect() ?? containerRef.current?.getBoundingClientRect() ?? null;
      if (!rect) { setDragStart(null); return; }
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      const boundsWidth = dragStart.boundsWidth || rect.width;
      const boundsHeight = dragStart.boundsHeight || rect.height;
      const nx = Math.min(100, Math.max(0, dragStart.lx + (dx / boundsWidth) * 100));
      const ny = Math.min(100, Math.max(0, dragStart.ly + (dy / boundsHeight) * 100));
      dispatch({ type: 'update_layer', id: dragStart.id, patch: { xPct: nx, yPct: ny } });
    }
    function onUp() { setDragStart(null); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [dragStart, dispatch]);

  // Drag handler for car cutout (mask)
  useEffect(() => {
    function onMove(ev: PointerEvent) {
      if (!maskDrag) return;
      const rect = layerBoundsRef.current?.getBoundingClientRect() ?? containerRef.current?.getBoundingClientRect();
      if (!rect) { setMaskDrag(null); return; }
      const dx = ev.clientX - maskDrag.x;
      const dy = ev.clientY - maskDrag.y;
      const nx = maskDrag.tx + (dx / rect.width) * 100;
      const ny = maskDrag.ty + (dy / rect.height) * 100;
      dispatch({ type: 'set_mask_offset', xPct: nx, yPct: ny });
    }
    function onUp() { setMaskDrag(null); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [maskDrag, dispatch]);

  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only handle clicks on the canvas background itself
    if (e.target !== e.currentTarget) return;
    
    // Don't deselect if we just finished a transform operation (scaling, rotating, etc.)
    try {
      if ((window as unknown as { __justFinishedTransform?: boolean }).__justFinishedTransform) {
        return;
      }
    } catch {}
    
    if (state.tool === 'select') {
      dispatch({ type: 'select_layer', id: null });
      return;
    }
    
    if (state.tool === 'text') {
      // Synchronously update stateRef to ensure we have current values
      stateRef.current = { activeLayerId: state.activeLayerId, editingLayerId: state.editingLayerId };
      
      // Use !! to properly handle both null and undefined
      const hasSelection = !!state.activeLayerId;
      const isEditing = !!state.editingLayerId;
      
      // If we just exited editing mode (via blur), don't create new text yet
      if (justExitedEditingRef.current) {
        justExitedEditingRef.current = false;
        // Also deselect if something is still selected
        if (hasSelection || isEditing) {
          if (isEditing) {
            dispatch({ type: 'stop_edit_text' });
          }
          dispatch({ type: 'select_layer', id: null });
        }
        return;
      }
      
      // If something is selected or editing, deselect only
      if (hasSelection || isEditing) {
        if (isEditing) {
          dispatch({ type: 'stop_edit_text' });
        }
        dispatch({ type: 'select_layer', id: null });
        return;
      }
      
      // Nothing selected - create new text box and enter edit mode immediately
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      const newLayer = createDefaultText(xPct, yPct);
      
      // add_layer already sets activeLayerId and editingLayerId for text layers
      // when tool is 'text', so we don't need additional dispatches
      dispatch({ type: 'add_layer', layer: newLayer, atTop: true });
    }
  }, [dispatch, state.tool, state.activeLayerId, state.editingLayerId]);

  const onCanvasDblClick = useCallback((e: React.MouseEvent) => {
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    
    const target = e.target as HTMLElement | null;
    const layerEl = target?.closest('[data-layer-id]') as HTMLElement | null;
    const layerId = layerEl?.dataset.layerId;
    
    if (state.tool === 'select') {
      // Double-click on a text layer in select mode: switch to text tool and start editing
      if (layerId) {
        const layer = state.layers.find(l => l.id === layerId);
        if (layer && layer.type === 'text') {
          dispatch({ type: 'set_tool', tool: 'text' });
          dispatch({ type: 'start_edit_text', id: layerId });
          return;
        }
      }
    } else if (state.tool === 'text') {
      if (layerId) {
        dispatch({ type: 'start_edit_text', id: layerId });
        return;
      }
      // Single click already handles text creation
    } else if (state.tool === 'shape') {
      dispatch({ type: 'add_layer', layer: createDefaultRect(xPct, yPct), atTop: true });
    }
  }, [dispatch, state.tool, state.layers]);

  // File input ref for image tool
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle drag and drop for images
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (state.tool !== 'image') return;
    e.preventDefault();
    e.stopPropagation();
  }, [state.tool]);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (state.tool !== 'image') return;
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      
      import("@/types/layer-editor").then((m) => {
        dispatch({ type: 'add_layer', layer: m.createImageLayer(url, xPct, yPct), atTop: true });
      }).catch(() => {});
    }
  }, [dispatch, state.tool]);

  // Handle click to upload when image tool is active
  const onCanvasClickForImage = useCallback((e: React.MouseEvent) => {
    // Only handle if image tool is active and clicking on canvas background
    if (state.tool !== 'image' || e.target !== e.currentTarget) return;
    
    // Trigger file input
    fileInputRef.current?.click();
  }, [state.tool]);

  const selectionId = state.activeLayerId;
  const selectedIdsSet = new Set(state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (selectionId ? [selectionId] : []));

  return (
    <>
      {/* Hidden file input for image tool */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            import("@/types/layer-editor").then((m) => {
              dispatch({ type: 'add_layer', layer: m.createImageLayer(url, 50, 50), atTop: true });
            }).catch(() => {});
          }
          e.target.value = ''; // Reset input
        }}
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={containerRef}
            data-canvas-root
            onMouseDown={(e)=>{
              if (state.tool !== 'select') return;
              const target = e.target as HTMLElement | null;
              if (target && target.closest('[data-layer-id]')) return; // only start marquee when clicking outside objects
              const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
              const startX = e.clientX - rect.left; const startY = e.clientY - rect.top;
              setSelectRect({ x: startX, y: startY, w: 0, h: 0 });
              const move = (ev: MouseEvent)=>{
                const cx = Math.min(Math.max(0, ev.clientX - rect.left), rect.width);
                const cy = Math.min(Math.max(0, ev.clientY - rect.top), rect.height);
                const left = Math.min(startX, cx);
                const top = Math.min(startY, cy);
                const w = Math.abs(cx - startX);
                const h = Math.abs(cy - startY);
                setSelectRect({ x: left, y: top, w, h });
              };
              const up = ()=>{
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                // Compute which layers fall in rect and select them
                try {
                  const ids: string[] = [];
                  const left = Math.min(startX, (selectRect?.x || startX));
                  const top = Math.min(startY, (selectRect?.y || startY));
                  const w = Math.abs((selectRect?.w || 0));
                  const h = Math.abs((selectRect?.h || 0));
                  const sel = { x: left, y: top, w, h };
                  const r = (containerRef.current as HTMLDivElement).getBoundingClientRect();
                  for (const l of state.layers) {
                    const cx = (l.xPct / 100) * r.width;
                    const cy = (l.yPct / 100) * r.height;
                    const lw = (l.widthPct / 100) * r.width;
                    const lh = (l.heightPct / 100) * r.height;
                    const lx = cx - lw / 2;
                    const ly = cy - lh / 2;
                    const intersects = !(lx + lw < sel.x || ly + lh < sel.y || lx > sel.x + sel.w || ly > sel.y + sel.h);
                    if (intersects) ids.push(l.id);
                  }
                  dispatch({ type: 'select_layers', ids });
                } catch {}
                setSelectRect(null);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up, { once: true } as AddEventListenerOptions);
            }}
            onClick={(e) => {
              onCanvasClick(e);
              onCanvasClickForImage(e);
            }}
            onDoubleClick={onCanvasDblClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={cn("relative w-full h-[45vh] sm:h-[55vh] rounded-xl border border-[var(--border)] bg-[var(--muted)] overflow-hidden select-none touch-none", className)}
          >
          {state.backgroundUrl ? (
            <>
              {/* Blurhash placeholder - shows while loading */}
              {!backgroundLoaded && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  alt="bg-blur" 
                  src={blurDataURL} 
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" 
                  draggable={false}
                  aria-hidden="true"
                />
              )}
              {/* Actual background image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                alt="bg" 
                src={state.backgroundUrl} 
                className={cn(
                  "absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-700",
                  backgroundLoaded ? "opacity-100" : "opacity-0"
                )}
                draggable={false}
                onLoad={() => setBackgroundLoaded(true)}
              />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/50">Tap to add content</div>
          )}

          {/* Constrained layer container - matches actual image bounds */}
          <div 
            className="absolute pointer-events-none"
            style={imageBounds || { inset: 0 }}
            ref={layerBoundsRef}
            data-layer-bounds
          >
            {state.layers.filter(l=> !l.aboveMask).map((layer)=> {
              const tiltKey = layer.type === 'text' 
                ? `${layer.id}-${(layer as import("@/types/layer-editor").TextLayer).tiltXDeg || 0}-${(layer as import("@/types/layer-editor").TextLayer).tiltYDeg || 0}`
                : layer.id;
              return <LayerView key={tiltKey} layer={layer} selected={selectedIdsSet.has(layer.id)} onPointerDown={onPointerDownLayer} justExitedEditingRef={justExitedEditingRef} canvasHeight={canvasHeight} />;
            })}

            {state.carMaskUrl && !state.maskHidden ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="mask"
                src={state.carMaskUrl}
                onPointerDown={(e)=>{
                  if (state.tool !== 'select' || state.maskLocked) return;
                  e.stopPropagation();
                  const _rect = containerRef.current?.getBoundingClientRect();
                  const tx = state.maskTranslateXPct || 0;
                  const ty = state.maskTranslateYPct || 0;
                  setMaskDrag({ x: e.clientX, y: e.clientY, tx, ty });
                  // do not auto-select unless explicitly clicking the cutout
                  dispatch({ type: 'select_layer', id: '::mask::' });
                }}
                className={cn("absolute inset-0 w-full h-full object-contain select-none", (state.activeLayerId === '::mask::' && state.tool === 'select' && !state.maskLocked) ? 'cursor-move' : 'cursor-auto')}
                draggable={false}
                style={{ transform: maskTransform, pointerEvents: (state.activeLayerId === '::mask::' && state.tool === 'select') ? 'auto' as const : 'none' as const }}
              />
            ) : null}

            {state.layers.filter(l=> !!l.aboveMask).map((layer)=> {
              const tiltKey = layer.type === 'text' 
                ? `${layer.id}-${(layer as import("@/types/layer-editor").TextLayer).tiltXDeg || 0}-${(layer as import("@/types/layer-editor").TextLayer).tiltYDeg || 0}`
                : layer.id;
              return <LayerView key={tiltKey} layer={layer} selected={selectedIdsSet.has(layer.id)} onPointerDown={onPointerDownLayer} justExitedEditingRef={justExitedEditingRef} canvasHeight={canvasHeight} />;
            })}

            {state.activeLayerId === '::mask::' ? (
              <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-[var(--primary)]/70" />
            ) : null}
          </div>{/* End of layer bounds container */}

          {(state.maskTranslateXPct || 0) !== 0 || (state.maskTranslateYPct || 0) !== 0 ? (
            <button
              type="button"
              className="absolute top-2 right-2 z-3 text-[0.8rem] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-white/10"
              onClick={(e)=>{ e.stopPropagation(); dispatch({ type: 'reset_mask' }); }}
            >
              Reset cutout
            </button>
          ) : null}
          {selectRect ? (
            <div className="pointer-events-none absolute inset-0 z-1">
              <div className="absolute border-2 border-primary/70 bg-primary/10" style={{ left: selectRect.x, top: selectRect.y, width: selectRect.w, height: selectRect.h }} />
            </div>
          ) : null}
          
          {/* Draw-to-edit overlay */}
          <DrawToEditOverlay />
        </div>
      </ContextMenuTrigger>
      <CanvasMenu />
    </ContextMenu>
    </>
  );
}

function LayerView({ layer, selected, onPointerDown, justExitedEditingRef, canvasHeight: _canvasHeight }: { layer: Layer; selected: boolean; onPointerDown: (e: React.PointerEvent, layer: Layer)=> void; justExitedEditingRef: React.MutableRefObject<boolean>; canvasHeight: number }){
  const { state, dispatch } = useLayerEditor();
  const editableRef = React.useRef<HTMLDivElement | null>(null);
  const seededRef = React.useRef<string | null>(null);
  const nextHeightPctRef = React.useRef<number | null>(null);
  const isEditing = state.editingLayerId === layer.id;
  useLayoutEffect(()=>{
    if (!isEditing) return;
    if (layer.type !== 'text') return;
    const el = editableRef.current;
    if (!el) return;
    const t = layer as import("@/types/layer-editor").TextLayer;
    const seedHtml = (typeof t.html === 'string' && t.html)
      ? String(t.html)
      : String(t.text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');
    if (seededRef.current !== layer.id) {
      el.innerHTML = seedHtml;
      seededRef.current = layer.id;
    }
    requestAnimationFrame(() => {
      try {
        // Use layer bounds container if available, fallback to canvas root
        const layerBounds = el.closest('[data-layer-bounds]') as HTMLElement | null;
        const root = layerBounds || el.closest('[data-canvas-root]') as HTMLElement | null;
        const canvasHeight = root?.getBoundingClientRect().height || 0;
        const contentHeight = Math.max(el.scrollHeight, 0);
        const computed = window.getComputedStyle(el);
        const lineHeight = Number.parseFloat(computed.lineHeight || '') || Number.parseFloat(computed.fontSize || '') || 0;
        const targetHeight = Math.max(contentHeight, lineHeight || 0);
        if (canvasHeight > 0) {
          const nextPctRaw = (targetHeight / canvasHeight) * 100;
          const nextPct = Math.max(2, Math.min(100, Number.isFinite(nextPctRaw) ? nextPctRaw : 2));
          nextHeightPctRef.current = Number(nextPct.toFixed(3));
        } else {
          nextHeightPctRef.current = null;
        }
      } catch {}
    });
  }, [isEditing, layer, layer.id]);
  useEffect(()=>{
    if (isEditing) return;
    if (seededRef.current === layer.id) {
      seededRef.current = null;
    }
    nextHeightPctRef.current = null;
  }, [isEditing, layer.id]);
  useEffect(() => {
    if (!isEditing) return;
    if (layer.type !== 'text') return;
    const el = editableRef.current;
    if (!el) return;
    const resize = () => {
      try {
        // Use layer bounds container if available, fallback to canvas root
        const layerBounds = el.closest('[data-layer-bounds]') as HTMLElement | null;
        const root = layerBounds || el.closest('[data-canvas-root]') as HTMLElement | null;
        const canvasHeight = root?.getBoundingClientRect().height || 0;
        const contentHeight = Math.max(el.scrollHeight, 0);
        const computed = window.getComputedStyle(el);
        const lineHeight = Number.parseFloat(computed.lineHeight || '') || Number.parseFloat(computed.fontSize || '') || 0;
        const targetHeight = Math.max(contentHeight, lineHeight || 0);
        el.style.height = `${targetHeight}px`;
        if (canvasHeight > 0) {
          const nextPctRaw = (targetHeight / canvasHeight) * 100;
          const nextPct = Math.max(2, Math.min(100, Number.isFinite(nextPctRaw) ? nextPctRaw : 2));
          nextHeightPctRef.current = Number(nextPct.toFixed(3));
        } else {
          nextHeightPctRef.current = null;
        }
      } catch {}
    };
    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(el);
    return () => {
      try { observer.disconnect(); } catch {}
    };
  }, [dispatch, isEditing, layer]);
  const baseAlpha = (()=>{
    if (layer.type === 'text') {
      return getColorAlpha((layer as import("@/types/layer-editor").TextLayer).color);
    }
    if (layer.type === 'shape') {
      return getColorAlpha((layer as import("@/types/layer-editor").ShapeLayer).fill);
    }
    return 1;
  })();
  const resolvedGlowColor = layer.effects.glow.enabled ? multiplyColorAlpha(layer.effects.glow.color, baseAlpha || 0, '#ffffff') : '';
  const resolvedShadowColor = layer.effects.shadow.enabled ? multiplyColorAlpha(layer.effects.shadow.color, baseAlpha || 0, '#000000') : '';
  const tiltXDeg = (layer as import("@/types/layer-editor").TextLayer).tiltXDeg || 0;
  const tiltYDeg = (layer as import("@/types/layer-editor").TextLayer).tiltYDeg || 0;
  
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${layer.xPct}%`,
    top: `${layer.yPct}%`,
    transform: `translate(-50%, -50%) perspective(1200px) rotateX(${tiltXDeg}deg) rotateY(${tiltYDeg}deg) rotate(${layer.rotationDeg}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
    transformOrigin: 'center',
    transformStyle: 'preserve-3d',
    width: `${layer.widthPct}%`,
    height: `${layer.heightPct}%`,
    pointerEvents: layer.locked ? 'none' : 'auto',
    filter: `${(layer.type !== 'text' && layer.effects.glow.enabled) ? `drop-shadow(${layer.effects.glow.offsetX || 0}px ${layer.effects.glow.offsetY || 0}px ${((layer.effects.glow.blur || 0) + (layer.effects.glow.size || 0))}px ${resolvedGlowColor || layer.effects.glow.color || '#ffffff'})` : ''}`,
  };
  // Wrapper no longer needs perspective since it's in main transform
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
  };
  const inner3DStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
  };
  let rendered: React.ReactNode = null;
  if (layer.type === 'text') {
    const t = layer as import("@/types/layer-editor").TextLayer;
    // Calculate font size based on canvas height to ensure viewport-independent sizing
    // fontSizeEm represents the desired size in ems (1em = 16px)
    // For editing mode, use a fixed calculation to prevent font from shrinking as user types
    const fontSizePx = t.fontSizeEm ? t.fontSizeEm * 16 : 57.6; // 3.6em * 16px = 57.6px default
    const textStyle: React.CSSProperties = {
      color: t.color,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      fontStyle: t.italic ? 'italic' : undefined,
      textDecoration: t.underline ? 'underline' : undefined,
      fontSize: isEditing ? `${fontSizePx}px` : `${fontSizePx}px`, // Use absolute px size to prevent shrinking
      letterSpacing: `${t.letterSpacingEm}em`,
      lineHeight: t.lineHeightEm,
      textShadow: [
        layer.effects.glow.enabled ? `${(layer.effects.glow.offsetX || 0)}px ${(layer.effects.glow.offsetY || 0)}px ${((layer.effects.glow.blur || 0) + (layer.effects.glow.size || 0))}px ${resolvedGlowColor || layer.effects.glow.color || '#ffffff'}` : '',
        layer.effects.shadow.enabled ? `${(layer.effects.shadow.offsetX || 0)}px ${(layer.effects.shadow.offsetY || 0)}px ${((layer.effects.shadow.blur || 0) + (layer.effects.shadow.size || 0))}px ${resolvedShadowColor || layer.effects.shadow.color || '#000000'}` : ''
      ].filter(Boolean).join(', ').trim(),
      WebkitTextStroke: t.strokeEnabled && t.strokeWidth ? `${t.strokeWidth}px ${t.strokeColor || '#000000'}` : undefined,
      paintOrder: t.strokeEnabled && t.strokeWidth ? 'stroke fill' : undefined,
      backgroundColor: t.highlightEnabled ? t.highlightColor || 'rgba(255,255,0,0.3)' : undefined,
      borderRadius: t.borderRadiusEm ? `${t.borderRadiusEm}em` : undefined,
      display: 'grid', alignItems: 'center', textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'], width: '100%', height: '100%'
    };
    if (isEditing) {
      rendered = (
        <div
          ref={(node) => {
            editableRef.current = node;
            // Immediate focus without delay
            if (node) {
              node.focus();
              // Move cursor to end
              const range = document.createRange();
              const sel = window.getSelection();
              if (sel && node.childNodes.length > 0) {
                range.selectNodeContents(node);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          }}
          contentEditable
          suppressContentEditableWarning
          autoFocus
          onPointerDown={(e)=> e.stopPropagation()}
          onFocus={(e)=>{
            try {
              (window as unknown as { __activeTextEditable?: HTMLElement | null }).__activeTextEditable = e.currentTarget as HTMLDivElement;
            } catch {}
            try {
              const el = e.currentTarget as HTMLDivElement;
              requestAnimationFrame(() => {
                try {
                  // Use layer bounds container if available, fallback to canvas root
                  const layerBounds = el.closest('[data-layer-bounds]') as HTMLElement | null;
                  const root = layerBounds || el.closest('[data-canvas-root]') as HTMLElement | null;
                  const ch = root?.getBoundingClientRect().height || 0;
                  if (ch > 0) {
                    const contentPx = el.scrollHeight;
                    const nextPct = Math.max(2, Math.min(100, (contentPx / ch) * 100));
                    dispatch({ type: 'update_layer', id: layer.id, patch: { heightPct: nextPct } });
                  }
                } catch {}
              });
            } catch {}
          }}
          onInput={(e)=>{
            try {
              const el = e.currentTarget as HTMLDivElement;
              requestAnimationFrame(() => {
                try {
                  // Use layer bounds container if available, fallback to canvas root
                  const layerBounds = el.closest('[data-layer-bounds]') as HTMLElement | null;
                  const root = layerBounds || el.closest('[data-canvas-root]') as HTMLElement | null;
                  const ch = root?.getBoundingClientRect().height || 0;
                  if (ch > 0) {
                    const contentPx = el.scrollHeight;
                    const nextPct = Math.max(2, Math.min(100, (contentPx / ch) * 100));
                    dispatch({ type: 'update_layer', id: layer.id, patch: { heightPct: nextPct } });
                  }
                } catch {}
              });
            } catch {}
          }}
          onKeyDown={(e)=>{ if (e.key === 'Escape') { e.preventDefault(); (e.currentTarget as HTMLDivElement).blur(); } }}
          onBlur={(e)=>{
            try { (window as unknown as { __activeTextEditable?: HTMLElement | null }).__activeTextEditable = null; } catch {}
            const el = e.currentTarget as HTMLDivElement;
            const pendingPct = nextHeightPctRef.current;
            if (typeof pendingPct === 'number') {
              nextHeightPctRef.current = null;
              const currentPct = typeof layer.heightPct === 'number' ? layer.heightPct : pendingPct;
              if (Math.abs(pendingPct - currentPct) > 0.5) {
                dispatch({ type: 'update_layer', id: layer.id, patch: { heightPct: pendingPct } });
              }
            }
            const nextHtml = el.innerHTML;
            const nextText = (el.innerText || el.textContent || '').replace(/\r\n|\r/g, '\n');
            // If the text is empty, remove the layer
            if (!nextText.trim()) {
              dispatch({ type: 'remove_layer', id: layer.id });
            } else {
              const patch: { html: string; text: string } = { html: nextHtml, text: nextText };
              if (nextText !== t.text || nextHtml !== t.html) {
                dispatch({ type: 'update_layer', id: layer.id, patch });
              }
            }
            dispatch({ type: 'stop_edit_text' });
            // Mark that we just exited editing to prevent immediate new text box creation
            justExitedEditingRef.current = true;
          }}
        style={{
            ...textStyle,
          display: 'block',
          textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'],
            padding: '0.25em 0.5em',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            overflow: 'visible',
            backgroundColor: t.highlightEnabled ? (t.highlightColor || 'rgba(255,255,0,0.3)') : 'transparent',
            border: '1px dashed rgba(255,255,255,0.5)',
            outline: 'none',
            width: '100%',
            minHeight: 'fit-content',
          }}
        />
      );
    } else {
      rendered = t.html ? (
        <div style={textStyle as React.CSSProperties} dangerouslySetInnerHTML={{ __html: String(t.html) }} />
      ) : (
        <div style={textStyle as React.CSSProperties}>{t.text}</div>
      );
    }
  } else if (layer.type === 'shape') {
    const s = layer as import("@/types/layer-editor").ShapeLayer;
    if (s.shape === 'rectangle') {
      rendered = <div style={{ width: '100%', height: '100%', background: s.fill, border: s.stroke ? `${s.strokeWidth || 2}px solid ${s.stroke}` : undefined, borderRadius: `${Math.max(0, Math.min(50, (s.radiusPct || 0) * 100))}%` }} />;
    } else if (s.shape === 'ellipse') {
      rendered = <div style={{ width: '100%', height: '100%', background: s.fill, border: s.stroke ? `${s.strokeWidth || 2}px solid ${s.stroke}` : undefined, borderRadius: '9999px' }} />;
    } else if (s.shape === 'triangle') {
      rendered = (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <polygon points="50,0 0,100 100,100" fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth || 2} />
        </svg>
      );
    } else if (s.shape === 'line') {
      rendered = (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <line x1="0" y1="50" x2="100" y2="50" stroke={s.stroke || '#fff'} strokeWidth={s.strokeWidth || 4} />
        </svg>
      );
    } else if (s.shape === 'arrow') {
      const curvature = s.curvature || 0;
      const arrowHeadSize = s.arrowHeadSize || 0.15;
      const strokeWidth = s.strokeWidth || 4;
      
      // Calculate curved path
      let pathD: string;
      if (Math.abs(curvature) < 0.01) {
        // Straight arrow
        pathD = 'M 0 50 L 100 50';
      } else {
        // Curved arrow using quadratic Bezier
        const controlY = 50 - curvature * 50;
        pathD = `M 0 50 Q 50 ${controlY} 100 50`;
      }
      
      // Calculate arrow head position and angle
      const headLength = 100 * arrowHeadSize;
      const headWidth = headLength * 0.6;
      
      const endX = 100;
      const endY = 50;
      let angle = 0;
      
      if (Math.abs(curvature) < 0.01) {
        angle = 0;
      } else {
        // Tangent angle at end of quadratic curve
        const controlY = 50 - curvature * 50;
        const dx = endX - 50;
        const dy = endY - controlY;
        angle = Math.atan2(dy, dx);
      }
      
      // Arrow head points
      const headPoint1X = endX - headLength * Math.cos(angle) + headWidth * Math.sin(angle);
      const headPoint1Y = endY - headLength * Math.sin(angle) - headWidth * Math.cos(angle);
      const headPoint2X = endX - headLength * Math.cos(angle) - headWidth * Math.sin(angle);
      const headPoint2Y = endY - headLength * Math.sin(angle) + headWidth * Math.cos(angle);
      
      rendered = (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <marker
              id={`arrowhead-${layer.id}`}
              markerWidth={headWidth * 2}
              markerHeight={headWidth * 2}
              refX="0"
              refY="0"
              orient="auto"
            >
              <polygon
                points={`${endX},${endY} ${headPoint1X},${headPoint1Y} ${headPoint2X},${headPoint2Y}`}
                fill={s.stroke || '#fff'}
              />
            </marker>
          </defs>
          <path
            d={pathD}
            stroke={s.stroke || '#fff'}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon
            points={`${endX},${endY} ${headPoint1X},${headPoint1Y} ${headPoint2X},${headPoint2Y}`}
            fill={s.stroke || '#fff'}
          />
        </svg>
      );
    }
  } else if (layer.type === 'image') {
    const i = layer as import("@/types/layer-editor").ImageLayer;
    rendered = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={i.src}
        alt="img"
        className="w-full h-full object-contain"
        onLoad={(e)=>{
          try {
            const img = e.currentTarget as HTMLImageElement;
            const nw = Number(img.naturalWidth || 0);
            const nh = Number(img.naturalHeight || 0);
            if (nw > 0 && nh > 0 && (i.naturalWidth !== nw || i.naturalHeight !== nh)) {
              dispatch({ type: 'update_layer', id: layer.id, patch: { naturalWidth: nw, naturalHeight: nh } });
            }
          } catch {}
        }}
      />
    );
  }
  return (
    <div data-layer-id={layer.id} style={style} onPointerDown={(e)=> onPointerDown(e, layer)} onContextMenu={()=>{ (window as unknown as { dispatchLayerEditor?: (a: unknown)=>void }).dispatchLayerEditor?.({ type: 'select_layer', id: layer.id }); }} className="group">
      <div style={wrapperStyle}>
        <div style={inner3DStyle}>
          {rendered}
        </div>
      </div>
      {selected ? (
        <>
          <div className="absolute inset-0 border-2 border-dashed border-[var(--primary)]/70 pointer-events-none" />
          <TransformControls />
        </>
      ) : null}
    </div>
  );
}

function CanvasMenu() {
  const { state, dispatch } = useLayerEditor();
  const id = state.activeLayerId;
  return (
    <ContextMenuContent className="w-56">
      {id ? (
        <>
          {id === '::mask::' ? null : (
            <>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'bring_forward', id }); }}>Bring forward</ContextMenuItem>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_backward', id }); }}>Send backward</ContextMenuItem>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_to_front', id }); }}>Bring to front</ContextMenuItem>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_to_back', id }); }}>Send to back</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {id !== '::mask::' ? (() => {
            const layer = state.layers.find(l => l.id === id);
            if (layer && layer.type === 'text') {
              const t = layer as import("@/types/layer-editor").TextLayer;
              const sx = Number(t.scaleX) || 1;
              const sy = Number(t.scaleY) || 1;
              const ls = Number(t.letterSpacingEm) || 0;
              const canResetWidth = Math.abs(sx - sy) > 1e-4;
              const canResetLetter = Math.abs(ls) > 1e-4;
              if (!canResetWidth && !canResetLetter) return null;
              return (
                <>
                  {canResetWidth ? (
                    <ContextMenuItem onSelect={(e: Event)=>{ e.preventDefault(); const syCur = Number(t.scaleY || 1); dispatch({ type: 'update_layer', id, patch: { scaleX: syCur } }); }}>Reset width</ContextMenuItem>
                  ) : null}
                  {canResetLetter ? (
                    <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'update_layer', id, patch: { letterSpacingEm: 0 } }); }}>Reset letter spacing</ContextMenuItem>
                  ) : null}
                  <ContextMenuSeparator />
                </>
              );
            }
            return null;
          })() : null}
          {id === '::mask::' ? (
            <>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'toggle_mask_lock' }); }}>{state.maskLocked ? 'Unlock cutout' : 'Lock cutout'}</ContextMenuItem>
              <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'toggle_mask_hide' }); }}>{state.maskHidden ? 'Show cutout' : 'Hide cutout'}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem disabled>Delete</ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'remove_layer', id }); }}>Delete</ContextMenuItem>
          )}
        </>
      ) : (
        <ContextMenuItem disabled>No selection</ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}


