"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLayerEditor, useActiveLayer } from "@/components/layer-editor/LayerEditorProvider";
import type { ImageLayer } from "@/types/layer-editor";

export default function TransformControls() {
  const layer = useActiveLayer();
  const { dispatch } = useLayerEditor();
  const ref = useRef<HTMLDivElement | null>(null);
  const lastShiftRef = useRef(false);
  const lockAspectRef = useRef(1);
  const lockScaleRef = useRef(1);
  const shiftDownRef = useRef(false);
  const justFinishedTransformRef = useRef(false);
  const SNAP_RATIOS = useMemo(()=> [1, 4/3, 3/4, 16/9, 9/16, 3/2, 2/3, 5/4, 4/5, 2, 1/2] as const, []);
  const SNAP_THRESHOLD = 0.03;
  const snapAspectRatio = useCallback((r: number): number => {
    let best = r;
    let minErr = SNAP_THRESHOLD;
    for (const target of SNAP_RATIOS) {
      const err = Math.abs(r / target - 1);
      if (err < minErr) { best = target; minErr = err; }
    }
    return best;
  }, [SNAP_RATIOS]);
  const snapScaleRatio = (r: number): number => {
    return Math.abs(r - 1) <= SNAP_THRESHOLD ? 1 : r;
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') shiftDownRef.current = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') shiftDownRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
  type DragResize = { type: 'resize'; x: number; y: number; w: number; h: number; sx: number; sy: number; handle: 'br'|'tr'|'bl'|'tl'|'ml'|'mr' };
  type DragRotate = { type: 'rotate'; cx: number; cy: number; startAngle: number; startRotation: number };
  const [drag, setDrag] = useState<DragResize | DragRotate | null>(null);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!drag || !layer) return;
      // Rotation mode
      if (drag.type === 'rotate') {
        const d = drag as DragRotate;
        const angleNow = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * (180 / Math.PI);
        let next = d.startRotation + (angleNow - d.startAngle);
        next = ((next + 180) % 360 + 360) % 360 - 180;
        // Angle snapping
        const SHIFT_SNAP = 15; // coarse snap increment when Shift held
        const GENTLE_SNAP = 15; // base increments to gently snap to
        const GENTLE_THRESHOLD = 3; // degrees within which to snap
        const STRONG_ANCHORS = [ -180, -135, -90, -45, 0, 45, 90, 135, 180 ];
        const STRONG_THRESHOLD = 4; // stronger snap near cardinal angles
        if (shiftDownRef.current) {
          next = Math.round(next / SHIFT_SNAP) * SHIFT_SNAP;
        } else {
          // Gentle snap to multiples of 15°
          const near = Math.round(next / GENTLE_SNAP) * GENTLE_SNAP;
          if (Math.abs(near - next) <= GENTLE_THRESHOLD) next = near;
          // Stronger snap to cardinal angles
          for (const a of STRONG_ANCHORS) {
            if (Math.abs(a - next) <= STRONG_THRESHOLD) { next = a; break; }
          }
        }
        dispatch({ type: 'update_layer', id: layer.id, patch: { rotationDeg: next } });
        return;
      }
      // Resize mode
      const d = drag as DragResize;
      const el = ref.current?.parentElement as HTMLElement | null;
      const canvas = el?.parentElement as HTMLElement | null;
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dwPct = (dx / rect.width) * 100 * (d.handle.includes('r') ? 1 : -1);
      const dhPct = (dy / rect.height) * 100 * (d.handle.includes('b') ? 1 : -1);
      let nextW = Math.max(2, d.w + dwPct);
      let nextH = Math.max(2, d.h + dhPct);
      const shift = shiftDownRef.current;
      if (!shift && lastShiftRef.current) {
        const isImage = layer.type === 'image';
        if (isImage) {
          const img = layer as ImageLayer;
          const nw = Number(img.naturalWidth || 0);
          const nh = Number(img.naturalHeight || 0);
          if (nw > 0 && nh > 0 && rect && rect.width > 0 && rect.height > 0) {
            const pixelR = nw / nh;
            const percentR = pixelR * (rect.height / rect.width);
            lockAspectRef.current = percentR || 1;
          } else {
            const wSafe = Math.max(2, nextW);
            const hSafe = Math.max(2, nextH);
            lockAspectRef.current = hSafe > 0 ? (wSafe / hSafe) : 1;
          }
        } else {
          const wSafe = Math.max(2, nextW);
          const hSafe = Math.max(2, nextH);
          const r = hSafe > 0 ? (wSafe / hSafe) : 1;
          lockAspectRef.current = snapAspectRatio(r);
        }
      }
      if (!shift) {
        const ratio = lockAspectRef.current || 1;
        const optionH = Math.max(2, nextW / (ratio || 1));
        const optionW = Math.max(2, nextH * ratio);
        const deltaH = Math.abs(optionH - nextH);
        const deltaW = Math.abs(optionW - nextW);
        if (deltaH <= deltaW) {
          nextH = optionH;
        } else {
          nextW = optionW;
        }
      }

      if (layer.type === 'text') {
        if (d.handle === 'ml' || d.handle === 'mr') {
          dispatch({ type: 'update_layer', id: layer.id, patch: { widthPct: nextW } });
        } else {
          let scaleX = Math.max(0.1, Math.min(10, (nextW / Math.max(2, drag.w)) * drag.sx));
          let scaleY = Math.max(0.1, Math.min(10, (nextH / Math.max(2, drag.h)) * drag.sy));
          if (shift) {
            const sr = Math.max(0.1, scaleX) / Math.max(0.1, scaleY);
            const snapped = snapScaleRatio(sr);
            if (snapped !== sr) {
              const yFromX = Math.max(0.1, Math.min(10, Math.max(0.1, scaleX) / (snapped || 1)));
              const xFromY = Math.max(0.1, Math.min(10, Math.max(0.1, scaleY) * snapped));
              const deltaY = Math.abs(yFromX - scaleY);
              const deltaX = Math.abs(xFromY - scaleX);
              if (deltaY <= deltaX) {
                scaleY = yFromX;
              } else {
                scaleX = xFromY;
              }
            }
          }
          if (!shift && lastShiftRef.current) {
            const sYSafe = Math.max(0.1, scaleY);
            const r = sYSafe > 0 ? (Math.max(0.1, scaleX) / sYSafe) : 1;
            lockScaleRef.current = snapScaleRatio(r);
          }
          if (!shift) {
            const sRatio = lockScaleRef.current || 1;
            const yFromX = Math.max(0.1, Math.min(10, scaleX / (sRatio || 1)));
            const xFromY = Math.max(0.1, Math.min(10, scaleY * sRatio));
            const deltaY = Math.abs(yFromX - scaleY);
            const deltaX = Math.abs(xFromY - scaleX);
            if (deltaY <= deltaX) {
              scaleY = yFromX;
            } else {
              scaleX = xFromY;
            }
          }
          dispatch({ type: 'update_layer', id: layer.id, patch: { scaleX, scaleY } });
        }
        lastShiftRef.current = shift;
        return;
      }

      if (shift && layer.type !== 'image') {
        const r = Math.max(0.02, nextW) / Math.max(0.02, nextH);
        const snapped = snapAspectRatio(r);
        if (snapped !== r) {
          const optionH = Math.max(2, nextW / (snapped || 1));
          const optionW = Math.max(2, nextH * snapped);
          const deltaH = Math.abs(optionH - nextH);
          const deltaW = Math.abs(optionW - nextW);
          if (deltaH <= deltaW) {
            nextH = optionH;
          } else {
            nextW = optionW;
          }
        }
      }
      dispatch({ type: 'update_layer', id: layer.id, patch: { widthPct: nextW, heightPct: nextH } });
      lastShiftRef.current = shift;
    }
    function up() { 
      setDrag(null);
      // Set flag to prevent immediate deselection
      justFinishedTransformRef.current = true;
      // Expose to window for canvas click handler
      try {
        (window as unknown as { __justFinishedTransform?: boolean }).__justFinishedTransform = true;
      } catch {}
      // Clear the flag after a short delay
      setTimeout(() => {
        justFinishedTransformRef.current = false;
        try {
          (window as unknown as { __justFinishedTransform?: boolean }).__justFinishedTransform = false;
        } catch {}
      }, 100);
    }
    window.addEventListener('pointermove', move as unknown as EventListener);
    window.addEventListener('pointerup', up as unknown as EventListener, { once: true } as AddEventListenerOptions);
    return () => { window.removeEventListener('pointermove', move as unknown as EventListener); window.removeEventListener('pointerup', up as unknown as EventListener); };
  }, [drag, layer, dispatch, snapAspectRatio]);

  const handleRotatePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!layer) return;
    const el = ref.current?.parentElement as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const startRotation = layer.rotationDeg || 0;
    setDrag({ type: 'rotate', cx, cy, startAngle, startRotation });
  }, [layer]);

  if (!layer) return null;
  return (
    <div ref={ref} className="pointer-events-none">
      {/* Rotate handle antenna at top-center */}
      <div className="absolute left-1/2 -top-7 -translate-x-1/2 pointer-events-none select-none">
        <div className="absolute left-1/2 top-2 -translate-x-1/2 h-5 w-px bg-white/60" />
        <div
          title="Rotate"
          onPointerDown={handleRotatePointerDown}
          style={{ touchAction: 'none' }}
          className="relative z-10 size-4 md:size-4 rounded-full bg-white border border-white/50 shadow pointer-events-auto cursor-grab"
        />
      </div>
      {/* Rotate handle antenna at bottom-center */}
      <div className="absolute left-1/2 -bottom-7 -translate-x-1/2 pointer-events-none select-none">
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 h-5 w-px bg-white/60" />
        <div
          title="Rotate"
          onPointerDown={handleRotatePointerDown}
          style={{ touchAction: 'none' }}
          className="relative z-10 size-4 md:size-4 rounded-full bg-white border border-white/50 shadow pointer-events-auto cursor-grab"
        />
      </div>
      {(['tl','tr','bl','br'] as const).map((h)=> (
        <div
          key={h}
          onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); try { const canvas = ref.current?.parentElement?.parentElement as HTMLElement | null; const rect = canvas?.getBoundingClientRect(); const isImage = layer.type === 'image'; if (isImage && rect && rect.width > 0 && rect.height > 0) { const img = layer as ImageLayer; const nw = Number(img.naturalWidth || 0); const nh = Number(img.naturalHeight || 0); if (nw > 0 && nh > 0) { const pixelR = nw / nh; const percentR = pixelR * (rect.height / rect.width); lockAspectRef.current = percentR || 1; } else { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } } else { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } } catch { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } { const sx = layer.scaleX || 1; const sy = layer.scaleY || 1; lockScaleRef.current = sy !== 0 ? (sx / sy) : 1; } lastShiftRef.current = e.shiftKey; setDrag({ type: 'resize', x: e.clientX, y: e.clientY, w: layer.widthPct, h: layer.heightPct, sx: layer.scaleX || 1, sy: layer.scaleY || 1, handle: h }); }}
          style={{ touchAction: 'none' }}
          className={
            h==='tl' ? 'absolute -left-0.5 -top-0.5 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-nwse-resize' :
            h==='tr' ? 'absolute -right-0.5 -top-0.5 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-nesw-resize' :
            h==='bl' ? 'absolute -left-0.5 -bottom-0.5 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-nesw-resize' :
                       'absolute -right-0.5 -bottom-0.5 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-nwse-resize'
          }
        />
      ))}
      {layer.type === 'text' ? (
        (['ml','mr'] as const).map((h)=> (
          <div
            key={h}
            onPointerDown={(e)=>{ e.preventDefault(); e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); try { const canvas = ref.current?.parentElement?.parentElement as HTMLElement | null; canvas?.getBoundingClientRect(); lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } catch { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } { const sx = layer.scaleX || 1; const sy = layer.scaleY || 1; lockScaleRef.current = sy !== 0 ? (sx / sy) : 1; } lastShiftRef.current = e.shiftKey; setDrag({ type: 'resize', x: e.clientX, y: e.clientY, w: layer.widthPct, h: layer.heightPct, sx: layer.scaleX || 1, sy: layer.scaleY || 1, handle: h }); }}
            style={{ touchAction: 'none' }}
            className={
              h==='ml'
                ? 'absolute -left-0.5 top-1/2 -translate-y-1/2 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-ew-resize'
                : 'absolute -right-0.5 top-1/2 -translate-y-1/2 size-3 md:size-2.5 rounded-sm bg-white border pointer-events-auto cursor-ew-resize'
            }
          />
        ))
      ) : null}
    </div>
  );
}


