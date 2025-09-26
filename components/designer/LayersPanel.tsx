"use client";
import React from "react";
import { useDesigner } from "@/components/designer/DesignerProvider";
import { cn } from "@/lib/utils";
import type { MaskLayer } from "@/types/designer";
import { Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Layers } from "lucide-react";

export default function LayersPanel({ className }: { className?: string }) {
  const { state, dispatch } = useDesigner();
  const layers = state.layers;
  const active = state.activeLayerId;
  // No boundary logic in the simplified model
  return (
    <div
      className={cn(
        "w-full sm:w-48 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="px-2 py-1.5 flex items-center gap-2 text-xs font-medium border-b border-[var(--border)]">
        <Layers className="size-4" />
        <span>Layers</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {layers.slice().reverse().map((layer)=> {
          const idx = layers.findIndex(l => l.id === layer.id);
          const canBringForward = idx >= 0 && idx < (layers.length - 1);
          const canSendBackward = idx > 0;
          return (
            layer.type === 'mask' ? (
              <MaskLayerRow
                key={layer.id}
                layer={layer}
                isActive={active === layer.id}
                hidden={!!state.maskHidden}
                onSelect={()=> dispatch({ type: 'select_layer', id: layer.id })}
                onToggleHide={()=> dispatch({ type: 'toggle_mask_hide' })}
              />
            ) : (
              <LayerRow
                key={layer.id}
                layerId={layer.id}
                name={layer.name}
                isActive={active === layer.id}
                locked={!!layer.locked}
                hidden={!!layer.hidden}
                canBringForward={canBringForward}
                canSendBackward={canSendBackward}
                onSelect={() => dispatch({ type: 'select_layer', id: layer.id })}
                onToggleLock={() => dispatch({ type: 'update_layer', id: layer.id, patch: { locked: !layer.locked } })}
                onToggleHide={() => dispatch({ type: 'update_layer', id: layer.id, patch: { hidden: !layer.hidden } })}
                onBringForward={() => dispatch({ type: 'bring_forward', id: layer.id })}
                onSendBackward={() => dispatch({ type: 'send_backward', id: layer.id })}
              />
            )
          );
        })}
        {/* Background row hidden in layers panel */}
      </div>
    </div>
  );
}

function LayerRow({ layerId: _layerId, name, isActive, locked, hidden, canBringForward, canSendBackward, onSelect, onToggleLock, onToggleHide, onBringForward, onSendBackward, showChevrons }: { layerId: string; name: string; isActive: boolean; locked: boolean; hidden: boolean; canBringForward: boolean; canSendBackward: boolean; onSelect: () => void; onToggleLock: () => void; onToggleHide: () => void; onBringForward: () => void; onSendBackward: () => void; showChevrons?: boolean; }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer",
        isActive ? "bg-primary/15 text-primary-foreground/90" : "hover:bg-white/10"
      )}
      onClick={onSelect}
    >
      <div className="flex-1 truncate">{name}</div>
      {/* No above/below chip in the simplified model */}
      {(showChevrons !== false && !locked) ? (
        <>
          <button type="button" className="p-1 rounded hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!canSendBackward} onClick={(e)=>{ e.stopPropagation(); if (!canSendBackward) return; onSendBackward(); }} aria-label="Send backward"><ChevronDown className="size-4" /></button>
          <button type="button" className="p-1 rounded hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!canBringForward} onClick={(e)=>{ e.stopPropagation(); if (!canBringForward) return; onBringForward(); }} aria-label="Bring forward"><ChevronUp className="size-4" /></button>
        </>
      ) : null}
      <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onToggleLock(); }} aria-label={locked ? "Unlock" : "Lock"}>{locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button>
      {locked ? null : (
        <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onToggleHide(); }} aria-label={hidden ? "Show" : "Hide"}>{hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
      )}
    </div>
  );
}

function MaskLayerRow({ layer, isActive, hidden, onSelect, onToggleHide }: { layer: MaskLayer; isActive: boolean; hidden: boolean; onSelect: () => void; onToggleHide: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer",
        isActive ? "bg-primary/15 text-primary-foreground/90" : "hover:bg-white/10"
      )}
      onClick={onSelect}
    >
      <div className="flex-1 truncate">{layer.name || "Car cutout"}</div>
      <button
        type="button"
        className="p-1 rounded hover:bg-white/10"
        onClick={(e)=>{
          e.stopPropagation();
          onToggleHide();
        }}
        aria-label={hidden ? "Show" : "Hide"}
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// Unused legacy boundary row retained for reference; keep signature typed
function _MaskBoundaryRow({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer" onClick={(e)=>{ e.stopPropagation(); try { (window as unknown as { dispatchDesigner?: (a: unknown)=>void }).dispatchDesigner?.({ type: 'select_layer', id: '::mask::' } as unknown); } catch {} }}>
      <div className="flex-1 truncate">Car cutout</div>
      <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onUp(); }} aria-label="Move boundary up"><ChevronUp className="size-4" /></button>
      <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onDown(); }} aria-label="Move boundary down"><ChevronDown className="size-4" /></button>
      {/* Unlocked by default per request: no lock icon here */}
    </div>
  );
}


