"use client";
import React, { useEffect, useState } from "react";
import { useDesigner } from "@/components/designer/DesignerProvider";
import { createDefaultRect, createDefaultEllipse, createDefaultTriangle, createDefaultLine } from "@/types/designer";

export default function MarqueeOverlay() {
	const { state, dispatch } = useDesigner();
	const [drag, setDrag] = useState<null | { x: number; y: number }>(null);
	const [rect, setRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);

	useEffect(() => {
		function down(e: MouseEvent) {
			const el = document.querySelector('[data-designer-canvas]') as HTMLElement | null;
			if (!el) return;
			if (state.tool !== 'marquee' && state.tool !== 'shape' && state.tool !== 'fill') return;
			// Only start marquee when clicking outside of an existing object
			const target = e.target as HTMLElement | null;
			if (target && target.closest('[data-layer-id]')) return;
			const r = el.getBoundingClientRect();
			setDrag({ x: e.clientX - r.left, y: e.clientY - r.top });
			setRect(null);
		}
		function move(e: MouseEvent) {
			const el = document.querySelector('[data-designer-canvas]') as HTMLElement | null;
			if (!el || !drag) return;
			const r = el.getBoundingClientRect();
			const x = Math.min(Math.max(0, drag.x), r.width);
			const y = Math.min(Math.max(0, drag.y), r.height);
			const cx = Math.min(Math.max(0, e.clientX - r.left), r.width);
			const cy = Math.min(Math.max(0, e.clientY - r.top), r.height);
			const left = Math.min(x, cx);
			const top = Math.min(y, cy);
			const w = Math.abs(cx - x);
			const h = Math.abs(cy - y);
			setRect({ x: left, y: top, w, h });
		}
		function up() {
			const el = document.querySelector('[data-designer-canvas]') as HTMLElement | null;
			if (!el) { setDrag(null); setRect(null); return; }
            if (rect && (rect.w > 4 && rect.h > 4)) {
				const r = el.getBoundingClientRect();
				const xPct = ((rect.x + rect.w / 2) / r.width) * 100;
				const yPct = ((rect.y + rect.h / 2) / r.height) * 100;
				const wPct = (rect.w / r.width) * 100;
				const hPct = (rect.h / r.height) * 100;
                if (state.tool === 'shape') {
                    const kind = state.shapeKind || (state.marqueeMode === 'ellipse' ? 'ellipse' : 'rectangle');
                    const layer = kind === 'ellipse' ? createDefaultEllipse(xPct, yPct)
                      : kind === 'triangle' ? createDefaultTriangle(xPct, yPct)
                      : kind === 'line' ? createDefaultLine(xPct, yPct)
                      : createDefaultRect(xPct, yPct);
					layer.widthPct = wPct; layer.heightPct = hPct;
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
				} else if (state.tool === 'fill') {
                    const layer = createDefaultRect(xPct, yPct);
                    layer.fill = 'rgba(255,255,255,0.3)';
					layer.widthPct = wPct; layer.heightPct = hPct;
					layer.name = 'Fill';
					dispatch({ type: 'add_layer', layer, atTop: true });
				}
			}
			setDrag(null); setRect(null);
		}
		const el = document.querySelector('[data-designer-canvas]') as HTMLElement | null;
		if (!el) return;
		el.addEventListener('mousedown', down as unknown as EventListener, { capture: true } as unknown as AddEventListenerOptions);
		window.addEventListener('mousemove', move as unknown as EventListener);
		window.addEventListener('mouseup', up as unknown as EventListener);
		return () => { el.removeEventListener('mousedown', down as unknown as EventListener); window.removeEventListener('mousemove', move as unknown as EventListener); window.removeEventListener('mouseup', up as unknown as EventListener); };
  }, [state.tool, state.marqueeMode, state.shapeKind, state.shapeDefaults, dispatch, drag, rect]);

    if (!rect) return null;
	return (
		<div className="pointer-events-none absolute inset-0 z-[10]">
            <div className="absolute border-2 border-primary/70 bg-primary/10" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: (state.shapeKind||state.marqueeMode)==='ellipse' ? '9999px' : 6 }} />
		</div>
	);
}


