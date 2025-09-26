"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesigner, useActiveLayer } from "@/components/designer/DesignerProvider";

export default function TransformControls() {
  const layer = useActiveLayer();
  const { dispatch } = useDesigner();
  const ref = useRef<HTMLDivElement | null>(null);
  const lastShiftRef = useRef(false);
  const lockAspectRef = useRef(1);
  const lockScaleRef = useRef(1);
  const shiftDownRef = useRef(false);
  const SNAP_RATIOS = useMemo(()=> [1, 4/3, 3/4, 16/9, 9/16, 3/2, 2/3, 5/4, 4/5, 2, 1/2] as const, []);
  const SNAP_THRESHOLD = 0.03; // ~3%
  const snapAspectRatio = useCallback((r: number): number => {
    let best = r;
    let minErr = SNAP_THRESHOLD;
    for (const target of SNAP_RATIOS) {
      const err = Math.abs(r / target - 1);
      if (err < minErr) { best = target; minErr = err; }
    }
    return best;
  }, [SNAP_RATIOS]);
  const snapScaleRatio = useCallback((r: number): number => {
    return Math.abs(r - 1) <= SNAP_THRESHOLD ? 1 : r;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        shiftDownRef.current = true;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        shiftDownRef.current = false;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
  const [drag, setDrag] = useState<
    | null
    | ({
        type: 'resize';
        x: number;
        y: number;
        w: number;
        h: number;
        sx: number;
        sy: number;
        handle: 'br' | 'tr' | 'bl' | 'tl' | 'ml' | 'mr';
      })
    | ({
        type: 'rotate';
        cx: number; // center x (client)
        cy: number; // center y (client)
        startAngle: number; // degrees
        startRotation: number; // degrees
      })
  >(null);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!drag || !layer) return;
      // Rotation mode
      if (drag.type === 'rotate') {
        const d = drag;
        const angleNow = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * (180 / Math.PI);
        let next = d.startRotation + (angleNow - d.startAngle);
        // Normalize to [-180, 180]
        next = ((next + 180) % 360 + 360) % 360 - 180;
        if (shiftDownRef.current) {
          next = Math.round(next / 15) * 15;
        }
        dispatch({ type: 'update_layer', id: layer.id, patch: { rotationDeg: next } });
        return;
      }

      // Resize mode
      const d = drag;
      const el = ref.current?.parentElement as HTMLElement | null; // layer wrapper
      const canvas = el?.parentElement as HTMLElement | null; // layer container with percentage sizing
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dwPct = (dx / rect.width) * 100 * (d.handle.includes('r') ? 1 : -1);
      const dhPct = (dy / rect.height) * 100 * (d.handle.includes('b') ? 1 : -1);
      let nextW = Math.max(2, d.w + dwPct);
      let nextH = Math.max(2, d.h + dhPct);
      const shift = shiftDownRef.current;
      // If Shift just transitioned from down->up, update lock ratio
      if (!shift && lastShiftRef.current) {
        const isImage = layer.type === 'image';
        if (isImage) {
          // Re-lock to original image aspect ratio (not current)
          const nw = Number((layer as { naturalWidth?: number }).naturalWidth || 0);
          const nh = Number((layer as { naturalHeight?: number }).naturalHeight || 0);
          if (nw > 0 && nh > 0) {
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
      // When Shift is not held, enforce aspect ratio using the lock ratio
      if (!shift) {
        const ratio = lockAspectRef.current || 1;
        // Choose the least-change option to avoid snapping: derive H from W or W from H
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

      // For text layers: corner handles scale the text; mid left/right adjust textbox width
      if (layer.type === 'text') {
        if (d.handle === 'ml' || d.handle === 'mr') {
          dispatch({ type: 'update_layer', id: layer.id, patch: { widthPct: nextW } });
        } else {
          // Compute unconstrained scale from pointer deltas
          let scaleX = Math.max(0.1, Math.min(10, (nextW / Math.max(2, d.w)) * d.sx));
          let scaleY = Math.max(0.1, Math.min(10, (nextH / Math.max(2, d.h)) * d.sy));
          // While Shift is held (unconstrained), add a gentle snap to 1:1 scale
          if (shift) {
            const sr = Math.max(0.1, scaleX) / Math.max(0.1, scaleY);
            const snapped = snapScaleRatio(sr);
            if (snapped !== sr) {
              // Choose the closer adjustment
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
          // If Shift was just released, capture the current scale ratio to avoid snapping
          if (!shift && lastShiftRef.current) {
            const sYSafe = Math.max(0.1, scaleY);
            const r = sYSafe > 0 ? (Math.max(0.1, scaleX) / sYSafe) : 1;
            lockScaleRef.current = snapScaleRatio(r);
          }
          // When Shift is not held, enforce locked scale ratio (may be 1 or custom)
          if (!shift) {
            const sRatio = lockScaleRef.current || 1;
            // Choose the closest pair to avoid snapping
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
        // Update last Shift state before returning to avoid stale transitions
        lastShiftRef.current = shift;
        return;
      }

      // Non-text layers resize box; maintain proportion by default
      // When Shift is held (unconstrained), gently snap to common aspect ratios (skip for images)
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
      // Update last Shift state at the end of handling
      lastShiftRef.current = shift;
    }
    function up() { setDrag(null); }
    window.addEventListener('pointermove', move as unknown as EventListener);
    window.addEventListener('pointerup', up as unknown as EventListener, { once: true } as AddEventListenerOptions);
    return () => { window.removeEventListener('pointermove', move as unknown as EventListener); window.removeEventListener('pointerup', up as unknown as EventListener); };
  }, [drag, layer, dispatch, snapAspectRatio, snapScaleRatio]);

  const handleRotatePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
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
    <div ref={ref} className="pointer-events-none absolute inset-0 z-[30]">
      {/* Rotate handle antenna at top-center */}
      <div className="absolute left-1/2 -top-7 -translate-x-1/2 pointer-events-none select-none">
        <div className="absolute left-1/2 top-2 -translate-x-1/2 h-5 w-px bg-white/60" />
        <div
          title="Rotate"
          onPointerDown={handleRotatePointerDown}
          className="relative z-10 size-4 rounded-full bg-white border border-white/50 shadow pointer-events-auto cursor-grab"
        />
      </div>
      {/* Rotate handle antenna at bottom-center */}
      <div className="absolute left-1/2 -bottom-7 -translate-x-1/2 pointer-events-none select-none">
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 h-5 w-px bg-white/60" />
        <div
          title="Rotate"
          onPointerDown={handleRotatePointerDown}
          className="relative z-10 size-4 rounded-full bg-white border border-white/50 shadow pointer-events-auto cursor-grab"
        />
      </div>
      {(['tl','tr','bl','br'] as const).map((h)=> (
        <div
          key={h}
          onPointerDown={(e)=>{ e.stopPropagation(); try { const canvas = ref.current?.parentElement?.parentElement as HTMLElement | null; const rect = canvas?.getBoundingClientRect(); const isImage = layer.type === 'image'; const nw = Number((layer as { naturalWidth?: number }).naturalWidth || 0); const nh = Number((layer as { naturalHeight?: number }).naturalHeight || 0); if (isImage && nw > 0 && nh > 0 && rect && rect.width > 0 && rect.height > 0) { const pixelR = nw / nh; const percentR = pixelR * (rect.height / rect.width); lockAspectRef.current = percentR || 1; } else { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } } catch { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } { const sx = (layer.scaleX || 1); const sy = (layer.scaleY || 1); lockScaleRef.current = sy !== 0 ? (sx / sy) : 1; } lastShiftRef.current = e.shiftKey; setDrag({ type: 'resize', x: e.clientX, y: e.clientY, w: layer.widthPct, h: layer.heightPct, sx: (layer.scaleX || 1), sy: (layer.scaleY || 1), handle: h }); }}
          className={
            h==='tl' ? 'absolute -left-1.5 -top-1.5 size-3 rounded-full bg-white border pointer-events-auto' :
            h==='tr' ? 'absolute -right-1.5 -top-1.5 size-3 rounded-full bg-white border pointer-events-auto' :
            h==='bl' ? 'absolute -left-1.5 -bottom-1.5 size-3 rounded-full bg-white border pointer-events-auto' :
                       'absolute -right-1.5 -bottom-1.5 size-3 rounded-full bg-white border pointer-events-auto'
          }
        />
      ))}
      {/* Mid-side handles for textbox width control (left/right), only for text */}
      {layer.type === 'text' ? (
        (['ml','mr'] as const).map((h)=> (
          <div
            key={h}
            onPointerDown={(e)=>{ e.stopPropagation(); try { const canvas = ref.current?.parentElement?.parentElement as HTMLElement | null; void canvas; // For text layers, prefer current box ratio
              lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } catch { lockAspectRef.current = (layer.heightPct > 0 ? (layer.widthPct / layer.heightPct) : 1) || 1; } { const sx = (layer.scaleX || 1); const sy = (layer.scaleY || 1); lockScaleRef.current = sy !== 0 ? (sx / sy) : 1; } lastShiftRef.current = e.shiftKey; setDrag({ type: 'resize', x: e.clientX, y: e.clientY, w: layer.widthPct, h: layer.heightPct, sx: (layer.scaleX || 1), sy: (layer.scaleY || 1), handle: h }); }}
            className={
              h==='ml'
                ? 'absolute -left-1.5 top-1/2 -translate-y-1/2 size-3 rounded-full bg-white border pointer-events-auto'
                : 'absolute -right-1.5 top-1/2 -translate-y-1/2 size-3 rounded-full bg-white border pointer-events-auto'
            }
          />
        ))
      ) : null}
    </div>
  );
}


