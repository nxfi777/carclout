"use client";
import React from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import type { Layer } from "@/types/layer-editor";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Lock, Unlock, Layers, ChevronUp, ChevronDown } from "lucide-react";

export default function LayersPanel({ className }: { className?: string }) {
  const { state, dispatch } = useLayerEditor();
  const layers = state.layers;
  const active = state.activeLayerId;
  // Boundary index between below-mask (0..b-1) and above-mask (b..n-1)
  const boundaryIndex = React.useMemo(() => {
    const idx = layers.findIndex(l => !!l.aboveMask);
    return idx < 0 ? layers.length : idx;
  }, [layers]);
  const moveBoundaryUp = React.useCallback(() => {
    if (state.maskLocked) return;
    const b = boundaryIndex;
    if (b >= layers.length) return; // no layer above boundary to move down
    const target = layers[b]; // first layer currently above the mask
    if (!target) return;
    dispatch({ type: 'update_layer', id: target.id, patch: { aboveMask: false } });
  }, [boundaryIndex, dispatch, layers, state.maskLocked]);
  const moveBoundaryDown = React.useCallback(() => {
    if (state.maskLocked) return;
    const b = boundaryIndex;
    if (b <= 0) return; // no layer below boundary to move up
    const target = layers[b - 1]; // last layer currently below the mask
    if (!target) return;
    dispatch({ type: 'update_layer', id: target.id, patch: { aboveMask: true } });
  }, [boundaryIndex, dispatch, layers, state.maskLocked]);
  return (
    <div className={cn("w-64 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm overflow-hidden", className)}>
      <div className="px-2 py-1.5 flex items-center gap-2 text-xs font-medium border-b border-[var(--border)]">
        <Layers className="size-4" />
        <span>Layers</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {/* Above car: show top-most first */}
        {layers.filter(l=> !!l.aboveMask).slice().reverse().map((layer)=> (
          <LayerRow
            key={layer.id}
            layer={layer}
            isActive={active === layer.id}
            onSelect={() => dispatch({ type: 'select_layer', id: layer.id })}
            onBringForward={() => dispatch({ type: 'bring_forward', id: layer.id })}
            onSendBackward={() => dispatch({ type: 'send_backward', id: layer.id })}
            onToggleLock={() => dispatch({ type: 'update_layer', id: layer.id, patch: { locked: !layer.locked } })}
            onToggleHide={() => dispatch({ type: 'update_layer', id: layer.id, patch: { hidden: !layer.hidden } })}
          />
        ))}

        {/* Car cutout boundary row */}
        {state.carMaskUrl ? (
          <SpecialRow
            label="Car cutout"
            active={active === '::mask::'}
            onSelect={() => dispatch({ type: 'select_layer', id: '::mask::' })}
            locked={true}
            hidden={!!state.maskHidden}
            onToggleLock={()=> {}}
            onToggleHide={()=> dispatch({ type: 'toggle_mask_hide' })}
            onBoundaryUp={moveBoundaryUp}
            onBoundaryDown={moveBoundaryDown}
          />
        ) : null}

        {/* Below car: show top-most first */}
        {layers.filter(l=> !l.aboveMask).slice().reverse().map((layer)=> (
          <LayerRow
            key={layer.id}
            layer={layer}
            isActive={active === layer.id}
            onSelect={() => dispatch({ type: 'select_layer', id: layer.id })}
            onBringForward={() => dispatch({ type: 'bring_forward', id: layer.id })}
            onSendBackward={() => dispatch({ type: 'send_backward', id: layer.id })}
            onToggleLock={() => dispatch({ type: 'update_layer', id: layer.id, patch: { locked: !layer.locked } })}
            onToggleHide={() => dispatch({ type: 'update_layer', id: layer.id, patch: { hidden: !layer.hidden } })}
          />
        ))}

        {/* Background row hidden in layers panel */}
      </div>
    </div>
  );
}

function LayerRow({ layer, isActive, onSelect, onToggleLock, onToggleHide, onBringForward, onSendBackward }: { layer: Layer; isActive: boolean; onSelect: () => void; onToggleLock: () => void; onToggleHide: () => void; onBringForward: ()=>void; onSendBackward: ()=>void; }) {
  const isImage = layer.type === 'image';
  const isText = layer.type === 'text';
  const label = isText ? String(((layer as import("@/types/layer-editor").TextLayer).text) || layer.name) : layer.name;
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer",
        isActive ? "bg-primary/15 text-primary-foreground/90" : "hover:bg-white/10"
      )}
      onClick={onSelect}
    >
      {layer.locked ? <div className="shrink-0 w-6 h-6" /> : (
        <div className="shrink-0 flex items-center gap-0.5">
          <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onSendBackward(); }} aria-label="Send backward"><ChevronDown className="size-4 opacity-90" /></button>
          <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onBringForward(); }} aria-label="Bring forward"><ChevronUp className="size-4 opacity-90" /></button>
        </div>
      )}
      <div className="shrink-0 grid place-items-center w-6 h-6 rounded-sm overflow-hidden bg-black/20">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(layer as import("@/types/layer-editor").ImageLayer).src} alt="thumb" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full grid place-items-center text-[0.7rem] uppercase opacity-80">
            {layer.type === 'shape' ? 'shp' : 'txt'}
          </div>
        )}
      </div>
      <div className={cn("flex-1 truncate", isActive ? 'font-semibold text-white' : 'text-white/85')} title={label}>{isText ? String(label) : layer.name}</div>
      <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onToggleLock(); }} aria-label={layer.locked ? "Unlock" : "Lock"}>{layer.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button>
      {layer.locked ? null : (
      <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); onToggleHide(); }} aria-label={layer.hidden ? "Show" : "Hide"}>{layer.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
      )}
    </div>
  );
}

function SpecialRow({ label, active, onSelect, locked, hidden, onToggleLock, onToggleHide, onBoundaryUp, onBoundaryDown }: { label: string; active: boolean; onSelect: ()=>void; locked: boolean; hidden?: boolean; onToggleLock?: ()=>void; onToggleHide?: ()=>void; onBoundaryUp?: ()=>void; onBoundaryDown?: ()=>void; }) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer",
        active ? "bg-primary/15 text-primary-foreground/90" : "hover:bg-white/10"
      )}
      onClick={onSelect}
    >
      {label === 'Car cutout' ? (
        locked ? <div className="shrink-0 w-6 h-6" /> : (
          <div className="shrink-0 flex items-center gap-0.5">
            <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); if (onBoundaryUp) { onBoundaryUp(); } }} aria-label="Move boundary up"><ChevronUp className="size-4 opacity-90" /></button>
            <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); if (onBoundaryDown) { onBoundaryDown(); } }} aria-label="Move boundary down"><ChevronDown className="size-4 opacity-90" /></button>
          </div>
        )
      ) : (
        <div className={cn("shrink-0 grid place-items-center w-6 h-6 rounded-sm overflow-hidden bg-black/20", locked ? 'opacity-50' : '')}
          title={label === 'Car cutout' ? 'Car cutout boundary' : 'Locked background'}
        />
      )}
      <div className="shrink-0 grid place-items-center w-6 h-6 rounded-sm overflow-hidden bg-black/20 text-[0.7rem] uppercase opacity-80">
        {label === 'Car cutout' ? 'car' : 'bg'}
      </div>
      <div className="flex-1 truncate" title={label}>{label}</div>
      {label === 'Car cutout' ? (
        <>
          <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); if (onToggleLock) onToggleLock(); }} aria-label={locked ? "Unlock" : "Lock"}>{locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button>
          {locked ? null : (
          <button type="button" className="p-1 rounded hover:bg-white/10" onClick={(e)=>{ e.stopPropagation(); if (onToggleHide) onToggleHide(); }} aria-label={hidden ? "Show" : "Hide"}>{hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          )}
        </>
      ) : (
        <Lock className="size-4 opacity-80" />
      )}
    </div>
  );
}

 


