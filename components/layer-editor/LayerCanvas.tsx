"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import type { Layer } from "@/types/layer-editor";
import { cn } from "@/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import TransformControls from "@/components/layer-editor/TransformControls";
// import MarqueeOverlay from "@/components/layer-editor/MarqueeOverlay";
import { createDefaultRect, createDefaultText } from "@/types/layer-editor";

export default function LayerCanvas({ className }: { className?: string }) {
  const { state, dispatch } = useLayerEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; lx: number; ly: number; id: string } | null>(null);
  const [selectRect, setSelectRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [maskDrag, setMaskDrag] = useState<null | { x: number; y: number; tx: number; ty: number }>(null);

  const onPointerDownLayer = useCallback((e: React.PointerEvent, layer: Layer) => {
    e.stopPropagation();
    if (layer.locked) return;
    // Allow additive selection with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      dispatch({ type: 'toggle_select_layer', id: layer.id });
      return;
    }
    dispatch({ type: 'select_layer', id: layer.id });
    // single click selects; drag only when cursor moves
    const x = e.clientX; const y = e.clientY;
    setDragStart({ x, y, lx: layer.xPct, ly: layer.yPct, id: layer.id });
  }, [dispatch]);

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      if (!dragStart) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) { setDragStart(null); return; }
      const dx = ev.clientX - dragStart.x;
      const dy = ev.clientY - dragStart.y;
      const nx = Math.min(100, Math.max(0, dragStart.lx + (dx / rect.width) * 100));
      const ny = Math.min(100, Math.max(0, dragStart.ly + (dy / rect.height) * 100));
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
      const rect = containerRef.current?.getBoundingClientRect();
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
    // Only clear selection if background itself is clicked
    if (e.target !== e.currentTarget) return;
    if (state.tool === 'select') {
      dispatch({ type: 'select_layer', id: null });
    }
  }, [dispatch, state.tool]);

  const onCanvasDblClick = useCallback((e: React.MouseEvent) => {
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (state.tool === 'text') {
      const target = e.target as HTMLElement | null;
      const layerEl = target?.closest('[data-layer-id]') as HTMLElement | null;
      if (layerEl?.dataset.layerId) {
        dispatch({ type: 'start_edit_text', id: layerEl.dataset.layerId });
        return;
      }
      dispatch({ type: 'add_layer', layer: createDefaultText(xPct, yPct), atTop: true });
    } else if (state.tool === 'shape') {
      dispatch({ type: 'add_layer', layer: createDefaultRect(xPct, yPct), atTop: true });
    }
  }, [dispatch, state.tool]);

  const selectionId = state.activeLayerId;
  const selectedIdsSet = new Set(state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (selectionId ? [selectionId] : []));

  return (
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
          onClick={onCanvasClick}
          onDoubleClick={onCanvasDblClick}
          className={cn("relative w-full h-[60vh] sm:h-[65vh] rounded-xl border border-[var(--border)] bg-[var(--muted)] overflow-hidden select-none touch-none", className)}
        >
          {state.backgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="bg" src={state.backgroundUrl} className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" draggable={false} />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/50">Tap to add content</div>
          )}

          {state.layers.filter(l=> !l.aboveMask).map((layer)=> (
            <LayerView key={layer.id} layer={layer} selected={selectedIdsSet.has(layer.id)} onPointerDown={onPointerDownLayer} />
          ))}

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
              style={{ transform: `translate(${state.maskTranslateXPct || 0}%, ${state.maskTranslateYPct || 0}%)`, pointerEvents: (state.activeLayerId === '::mask::' && state.tool === 'select') ? 'auto' as const : 'none' as const }}
            />
          ) : null}

          {state.layers.filter(l=> !!l.aboveMask).map((layer)=> (
            <LayerView key={layer.id} layer={layer} selected={selectedIdsSet.has(layer.id)} onPointerDown={onPointerDownLayer} />
          ))}

          {state.activeLayerId === '::mask::' ? (
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-[var(--primary)]/70" />
          ) : null}

          {(state.maskTranslateXPct || 0) !== 0 || (state.maskTranslateYPct || 0) !== 0 ? (
            <button
              type="button"
              className="absolute top-2 right-2 z-[11] text-[0.8rem] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-white/10"
              onClick={(e)=>{ e.stopPropagation(); dispatch({ type: 'reset_mask' }); }}
            >
              Reset cutout
            </button>
          ) : null}
          {selectRect ? (
            <div className="pointer-events-none absolute inset-0 z-[10]">
              <div className="absolute border-2 border-primary/70 bg-primary/10" style={{ left: selectRect.x, top: selectRect.y, width: selectRect.w, height: selectRect.h }} />
            </div>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <CanvasMenu />
    </ContextMenu>
  );
}

function LayerView({ layer, selected, onPointerDown }: { layer: Layer; selected: boolean; onPointerDown: (e: React.PointerEvent, layer: Layer)=> void }){
  const { state, dispatch } = useLayerEditor();
  const editableRef = React.useRef<HTMLDivElement | null>(null);
  const seededRef = React.useRef<string | null>(null);
  const isEditing = state.editingLayerId === layer.id;
  React.useEffect(()=>{
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
  }, [isEditing, layer]);
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
  // Add 3D perspective and rotateY tilt using a wrapper, so scale/rotateZ remain separate
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    perspective: '1200px',
    transformStyle: 'preserve-3d',
  };
  const inner3DStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    transform: `rotateY(${(layer as import("@/types/layer-editor").TextLayer).tiltYDeg || 0}deg)`,
    transformStyle: 'preserve-3d',
  };
  let rendered: React.ReactNode = null;
  if (layer.type === 'text') {
    const t = layer as import("@/types/layer-editor").TextLayer;
    const textStyle: React.CSSProperties = {
      color: t.color,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      fontStyle: t.italic ? 'italic' : undefined,
      textDecoration: t.underline ? 'underline' : undefined,
      fontSize: `${(t.fontSizeEm || Math.max(0.5, (layer.heightPct / 3)))}em`,
      letterSpacing: `${t.letterSpacingEm}em`,
      lineHeight: t.lineHeightEm,
      textShadow: [
        layer.effects.glow.enabled ? `${(layer.effects.glow.offsetX || 0)}px ${(layer.effects.glow.offsetY || 0)}px ${((layer.effects.glow.blur || 0) + (layer.effects.glow.size || 0))}px ${layer.effects.glow.color || '#ffffff'}` : '',
        layer.effects.shadow.enabled ? `${(layer.effects.shadow.offsetX || 0)}px ${(layer.effects.shadow.offsetY || 0)}px ${((layer.effects.shadow.blur || 0) + (layer.effects.shadow.size || 0))}px ${layer.effects.shadow.color || '#000000'}` : ''
      ].filter(Boolean).join(', ').trim(),
      display: 'grid', alignItems: 'center', textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'], width: '100%', height: '100%'
    };
    if (isEditing) {
      rendered = (
        <div
          ref={editableRef}
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
                  const root = el.closest('[data-canvas-root]') as HTMLElement | null;
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
                  const root = el.closest('[data-canvas-root]') as HTMLElement | null;
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
            const nextHtml = el.innerHTML;
            const nextText = (el.innerText || el.textContent || '').replace(/\r\n|\r/g, '\n');
            const patch: { html: string; text: string } = { html: nextHtml, text: nextText };
            if (nextText !== t.text || nextHtml !== t.html) {
              dispatch({ type: 'update_layer', id: layer.id, patch });
            }
            dispatch({ type: 'stop_edit_text' });
          }}
        style={{
            ...textStyle,
          display: 'block',
          textAlign: (t.textAlign || 'center') as React.CSSProperties['textAlign'],
            padding: 0,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.5)',
            outline: 'none',
            width: '100%',
            height: '100%',
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


