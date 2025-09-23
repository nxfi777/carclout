"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDesigner } from "@/components/designer/DesignerProvider";
import type { Layer, TextLayer, ShapeLayer, ImageLayer } from "@/types/designer";
import { createDefaultRect, createDefaultText, createDefaultEllipse, createDefaultTriangle, createDefaultLine } from "@/types/designer";
import { cn } from "@/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import TransformControls from "@/components/designer/TransformControls";
import MarqueeOverlay from "@/components/designer/MarqueeOverlay";
import type { DesignerAction } from "@/types/designer";

declare global {
  interface Window {
    dispatchDesigner?: React.Dispatch<DesignerAction>;
  }
}

export default function DesignerCanvas({ className }: { className?: string }) {
  const { state, dispatch } = useDesigner();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; lx: number; ly: number; id: string } | null>(null);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const [maskDrag, setMaskDrag] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const onPointerDownLayer = useCallback((e: React.PointerEvent, layer: Layer) => {
    e.stopPropagation();
    if (layer.locked) return;
    // Manual double-click detection as a fallback (some environments may not fire dblclick reliably)
    const now = Date.now();
    const prev = lastClickRef.current;
    if (prev && prev.id === layer.id && (now - prev.at) < 400) {
      if (state.tool === 'select' && layer.type === 'text') {
        e.preventDefault();
        dispatch({ type: 'set_tool', tool: 'text' });
        dispatch({ type: 'start_edit_text', id: layer.id });
        lastClickRef.current = null;
        return;
      }
    }
    lastClickRef.current = { id: layer.id, at: now };
    const x = e.clientX; const y = e.clientY;
    setDragStart({ x, y, lx: layer.xPct, ly: layer.yPct, id: layer.id });
    dispatch({ type: 'select_layer', id: layer.id });
  }, [dispatch, state.tool]);

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) { setDragStart(null); setMaskDrag(null); return; }
      if (dragStart) {
        const dx = ev.clientX - dragStart.x;
        const dy = ev.clientY - dragStart.y;
        const nx = Math.min(100, Math.max(0, dragStart.lx + (dx / rect.width) * 100));
        const ny = Math.min(100, Math.max(0, dragStart.ly + (dy / rect.height) * 100));
        dispatch({ type: 'update_layer', id: dragStart.id, patch: { xPct: nx, yPct: ny } });
      } else if (maskDrag) {
        const dx = ev.clientX - maskDrag.x;
        const dy = ev.clientY - maskDrag.y;
        const nx = (maskDrag.tx || 0) + (dx / rect.width) * 100;
        const ny = (maskDrag.ty || 0) + (dy / rect.height) * 100;
        dispatch({ type: 'set_mask_offset', xPct: nx, yPct: ny });
      }
    }
    function onUp() { setDragStart(null); setMaskDrag(null); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp as unknown as EventListener); };
  }, [dragStart, maskDrag, dispatch]);

  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    // Clear selection only when the background itself is clicked (not a child)
    if (e.target !== e.currentTarget) return;
    if (state.tool === 'select') {
      dispatch({ type: 'select_layer', id: null });
    }
  }, [dispatch, state.tool]);

  // Simple tap to add content based on tool
  const onCanvasDblClick = useCallback((e: React.MouseEvent) => {
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (state.tool === 'text') {
      // If clicking over existing text, enter edit mode instead of creating new
      const target = e.target as HTMLElement | null;
      const layerEl = target?.closest('[data-layer-id]') as HTMLElement | null;
      if (layerEl?.dataset.layerId) {
        dispatch({ type: 'start_edit_text', id: layerEl.dataset.layerId });
        return;
      }
      dispatch({ type: 'add_layer', layer: createDefaultText(xPct, yPct), atTop: true });
    } else if (state.tool === 'shape') {
      const kind = state.shapeKind || 'rectangle';
      const layer = kind === 'ellipse'
        ? createDefaultEllipse(xPct, yPct)
        : kind === 'triangle'
        ? createDefaultTriangle(xPct, yPct)
        : kind === 'line'
        ? createDefaultLine(xPct, yPct)
        : createDefaultRect(xPct, yPct);
      // Apply shape defaults from tool state
      try {
        const d = state.shapeDefaults;
        if (d) {
          layer.fill = d.fill ?? layer.fill;
          layer.stroke = d.stroke ?? layer.stroke;
          if (typeof d.strokeWidth === 'number') layer.strokeWidth = d.strokeWidth;
          if (kind === 'rectangle' && typeof d.radiusPct === 'number') {
            layer.radiusPct = d.radiusPct;
          }
        }
      } catch {}
      dispatch({ type: 'add_layer', layer, atTop: true });
    } else if (state.tool === 'select') {
      // With select tool active, double-click a text layer to switch to text tool and edit
      const target = e.target as HTMLElement | null;
      const layerEl = target?.closest('[data-layer-id]') as HTMLElement | null;
      const id = layerEl?.dataset.layerId;
      if (id) {
        const layer = state.layers.find(l => l.id === id);
        if (layer && layer.type === 'mask') {
          // Mask is not editable via text tool
          return;
        }
        if (layer && layer.type === 'text') {
          dispatch({ type: 'set_tool', tool: 'text' });
          dispatch({ type: 'start_edit_text', id });
          return;
        }
      }
      // If nothing under cursor, but a text layer is selected, edit it
      const selectedId = state.activeLayerId;
      if (selectedId) {
        const selected = state.layers.find(l => l.id === selectedId);
        if (selected && selected.type === 'text') {
          dispatch({ type: 'set_tool', tool: 'text' });
          dispatch({ type: 'start_edit_text', id: selectedId });
        }
      }
    }
  }, [dispatch, state.tool, state.layers, state.shapeDefaults, state.shapeKind, state.activeLayerId]);

  const selectionId = state.activeLayerId;
  const editingId = state.editingLayerId ?? null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={containerRef} data-canvas-root onClick={onCanvasClick} onDoubleClick={onCanvasDblClick} className={cn("relative w-full h-[60vh] sm:h-[65vh] rounded-xl border border-[var(--border)] bg-[var(--muted)] overflow-hidden select-none touch-none", className)}>
          {/* Background */}
          {state.backgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="bg" src={state.backgroundUrl || ''} className="absolute inset-0 w-full h-full object-contain" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/50">Tap to add content</div>
          )}

          {/* Unified layer stack: render in order; special-case mask layer */}
          {state.layers.filter(l=> !l.hidden).map((layer)=> (
            layer.type === 'mask' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={layer.id}
                alt="mask"
                src={layer.src || state.carMaskUrl || ''}
                onPointerDown={(e)=>{
                  if (state.tool !== 'select') return;
                  e.stopPropagation();
                  const tx = state.maskTranslateXPct || 0;
                  const ty = state.maskTranslateYPct || 0;
                  setMaskDrag({ x: e.clientX, y: e.clientY, tx, ty });
                  dispatch({ type: 'select_layer', id: layer.id });
                }}
                className={cn("absolute inset-0 w-full h-full object-contain select-none", state.tool === 'select' ? 'cursor-move' : 'cursor-auto')}
                draggable={false}
                style={{ transform: `translate(${state.maskTranslateXPct || 0}%, ${state.maskTranslateYPct || 0}%)`, pointerEvents: state.tool === 'select' ? 'auto' : 'none' }}
              />
            ) : (
              <LayerView key={layer.id} layer={layer} selected={selectionId===layer.id} editingId={editingId} onPointerDown={onPointerDownLayer} />
            )
          ))}
          <MarqueeOverlay />
        </div>
      </ContextMenuTrigger>
      <CanvasMenu />
    </ContextMenu>
  );
}

function LayerView({ layer, selected, editingId, onPointerDown }: { layer: Layer; selected: boolean; editingId: string | null | undefined; onPointerDown: (e: React.PointerEvent, layer: Layer)=> void }){
  const { state, dispatch } = useDesigner();
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${layer.xPct}%`,
    top: `${layer.yPct}%`,
    transform: `translate(-50%, -50%) rotate(${layer.rotationDeg}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
    transformOrigin: 'center',
    width: `${layer.widthPct}%`,
    height: `${layer.heightPct}%`,
    pointerEvents: layer.locked ? 'none' : 'auto',
    filter: `${(layer.type !== 'text' && layer.effects.glow.enabled) ? `drop-shadow(${layer.effects.glow.offsetX || 0}px ${layer.effects.glow.offsetY || 0}px ${((layer.effects.glow.blur || 0) + (layer.effects.glow.size || 0))}px ${layer.effects.glow.color || '#ffffff'})` : ''}`,
  };
  let rendered: React.ReactNode = null;
  if (layer.type === 'text') {
    const t = layer as TextLayer;
    const textStyle: React.CSSProperties = {
      color: t.color,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      fontSize: `${(t.fontSizeEm || Math.max(0.5, (layer.heightPct / 3)))}em`,
      letterSpacing: `${t.letterSpacingEm}em`,
      lineHeight: t.lineHeightEm,
      textShadow: [
        layer.effects.glow.enabled ? `${(layer.effects.glow.offsetX || 0)}px ${(layer.effects.glow.offsetY || 0)}px ${((layer.effects.glow.blur || 0) + (layer.effects.glow.size || 0))}px ${layer.effects.glow.color || '#ffffff'}` : '',
        layer.effects.shadow.enabled ? `${(layer.effects.shadow.offsetX || 0)}px ${(layer.effects.shadow.offsetY || 0)}px ${((layer.effects.shadow.blur || 0) + (layer.effects.shadow.size || 0))}px ${layer.effects.shadow.color || '#000000'}` : ''
      ].filter(Boolean).join(', ').trim(),
      display: 'grid', alignItems: 'center', textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'], width: '100%', height: '100%'
    };
    const isEditing = (editingId === layer.id);
    rendered = isEditing ? (
      <textarea
        defaultValue={t.text}
        autoFocus
        rows={1}
        onPointerDown={(e)=> e.stopPropagation()}
        onFocus={(e)=>{
          try {
            const el = e.currentTarget as HTMLTextAreaElement;
            requestAnimationFrame(() => {
              try {
                const root = el.closest('[data-canvas-root]') as HTMLElement | null;
                const ch = root?.getBoundingClientRect().height || 0;
                if (ch > 0) {
                  const prev = el.style.height;
                  el.style.height = 'auto';
                  const contentPx = el.scrollHeight;
                  el.style.height = prev || '100%';
                  const nextPct = Math.max(2, Math.min(100, (contentPx / ch) * 100));
                  window.dispatchDesigner?.({ type: 'update_layer', id: layer.id, patch: { heightPct: nextPct } });
                }
              } catch {}
            });
          } catch {}
        }}
        onInput={(e)=>{
          try {
            const el = e.currentTarget as HTMLTextAreaElement;
            requestAnimationFrame(() => {
              try {
                const root = el.closest('[data-canvas-root]') as HTMLElement | null;
                const ch = root?.getBoundingClientRect().height || 0;
                if (ch > 0) {
                  const prev = el.style.height;
                  el.style.height = 'auto';
                  const contentPx = el.scrollHeight;
                  el.style.height = prev || '100%';
                  const nextPct = Math.max(2, Math.min(100, (contentPx / ch) * 100));
                  window.dispatchDesigner?.({ type: 'update_layer', id: layer.id, patch: { heightPct: nextPct } });
                }
              } catch {}
            });
          } catch {}
        }}
        onKeyDown={(e)=>{ if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).blur(); } }}
        onBlur={(e)=>{
          const next = e.currentTarget.value;
          if (next !== t.text) {
            window.dispatchDesigner?.({ type: 'update_layer', id: layer.id, patch: { text: next } });
          }
          window.dispatchDesigner?.({ type: 'stop_edit_text' });
        }}
        style={{
          ...textStyle,
          display: 'block',
          textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'],
          padding: 0,
          whiteSpace: 'pre-wrap',
          resize: 'none',
          overflow: 'hidden',
          background: 'transparent',
          border: '1px dashed rgba(255,255,255,0.5)',
          outline: 'none',
          width: '100%',
          height: '100%',
        }}
      />
    ) : (
      <div
        style={textStyle}
        onDoubleClick={(e)=>{
          if (state.tool === 'select') {
            e.stopPropagation();
            dispatch({ type: 'select_layer', id: layer.id });
            dispatch({ type: 'set_tool', tool: 'text' });
            dispatch({ type: 'start_edit_text', id: layer.id });
          }
        }}
      >
        {t.text}
      </div>
    );
  } else if (layer.type === 'shape') {
    const s = layer as ShapeLayer;
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
    }
  } else if (layer.type === 'image') {
    rendered = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={(layer as ImageLayer).src}
        alt="img"
        className="w-full h-full object-contain"
        onLoad={(e)=>{
          try {
            const img = e.currentTarget as HTMLImageElement;
            const nw = Number(img.naturalWidth || 0);
            const nh = Number(img.naturalHeight || 0);
            const il = layer as ImageLayer;
            if (nw > 0 && nh > 0 && ((il.naturalWidth !== nw) || (il.naturalHeight !== nh))) {
              dispatch({ type: 'update_layer', id: layer.id, patch: { naturalWidth: nw, naturalHeight: nh } });
            }
          } catch {}
        }}
      />
    );
  }
  return (
    <div
      data-layer-id={layer.id}
      style={style}
      onPointerDown={(e)=> onPointerDown(e, layer)}
      onDoubleClick={(e)=>{
        if (state.tool === 'select' && layer.type === 'text') {
          e.stopPropagation();
          dispatch({ type: 'set_tool', tool: 'text' });
          dispatch({ type: 'start_edit_text', id: layer.id });
        }
      }}
      onContextMenu={() => { window.dispatchDesigner?.({ type: 'select_layer', id: layer.id }); }}
      className="group"
    >
      {rendered}
      {selected ? <TransformControls /> : null}
    </div>
  );
}

function CanvasMenu() {
  const { state, dispatch } = useDesigner();
  const id = state.activeLayerId;
  return (
    <ContextMenuContent className="w-56">
      {id ? (
        <>
          {(() => {
            const layer = state.layers.find(l => l.id === id);
            if (layer && layer.type === 'text') {
              const t = layer;
              const sx = Number(t.scaleX) || 1;
              const sy = Number(t.scaleY) || 1;
              const ls = Number(t.letterSpacingEm) || 0;
              const canResetWidth = Math.abs(sx - sy) > 1e-4;
              const canResetLetter = Math.abs(ls) > 1e-4;
              if (!canResetWidth && !canResetLetter) return null;
              return (
                <>
                  {canResetWidth ? (
                    <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); const syCur = Number(t.scaleY) || 1; dispatch({ type: 'update_layer', id, patch: { scaleX: syCur } }); }}>Reset width</ContextMenuItem>
                  ) : null}
                  {canResetLetter ? (
                    <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'update_layer', id, patch: { letterSpacingEm: 0 } }); }}>Reset letter spacing</ContextMenuItem>
                  ) : null}
                  <ContextMenuSeparator />
                </>
              );
            }
            return null;
          })()}
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'bring_forward', id }); }}>Bring forward</ContextMenuItem>
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_backward', id }); }}>Send backward</ContextMenuItem>
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_to_front', id }); }}>Bring to front</ContextMenuItem>
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'send_to_back', id }); }}>Send to back</ContextMenuItem>
          {/* aboveMask is no longer used in Designer */}
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'update_layer', id, patch: { locked: !(state.layers.find(l=> l.id===id)?.locked) } }); }}>{(state.layers.find(l=> l.id===id)?.locked ? 'Unlock' : 'Lock')}</ContextMenuItem>
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'update_layer', id, patch: { hidden: !(state.layers.find(l=> l.id===id)?.hidden) } }); }}>{(state.layers.find(l=> l.id===id)?.hidden ? 'Show' : 'Hide')}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); dispatch({ type: 'remove_layer', id }); }}>Delete</ContextMenuItem>
        </>
      ) : (
        <ContextMenuItem disabled>No selection</ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}


