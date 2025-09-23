"use client";
import React from "react";
import NextImage from "next/image";
import { useDesigner, useActiveLayer } from "@/components/designer/DesignerProvider";
import { cn } from "@/lib/utils";
// Removed unused DropdownMenu imports
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown } from "lucide-react";
import { Square, Circle, Triangle, Wand2, Minus, AlignCenterHorizontal, AlignCenterVertical, TextAlignStart, TextAlignCenter, TextAlignEnd, TextAlignJustify, Undo2, Redo2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

export default function ToolOptionsBar({ className }: { className?: string }) {
  const { state, undo, redo, canUndo, canRedo } = useDesigner();
  const layer = useActiveLayer();
  const isTextSelected = !!layer && layer.type === 'text';
  const isShapeSelected = !!layer && layer.type === 'shape';

  return (
    <div className={cn("flex items-center gap-2 px-2 py-1 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm flex-wrap", className)}>
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Button size="sm" variant="outline" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="size-4 mr-1" />Undo</Button>
        <Button size="sm" variant="outline" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="size-4 mr-1" />Redo</Button>
      </div>
      {(['select','text'] as string[]).includes(state.tool) && isTextSelected ? <TextOptions /> : null}
      {state.tool === 'marquee' ? <MarqueeOptions /> : null}
      {state.tool === 'shape' ? <ShapeOptions /> : null}
      {state.tool === 'shape' && !isShapeSelected ? <ShapeDefaultsOptions /> : null}
      {isShapeSelected ? <ShapeStyleOptions /> : null}
      {state.tool === 'image' ? <ImageOptions /> : null}
      {state.tool === 'fill' ? <FillOptions /> : null}
      <RotationOptions />
      {(['select','text','shape','image'] as string[]).includes(state.tool) ? <AlignControls /> : null}
      {state.tool !== 'select' ? <EffectsDropdown /> : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pr-2 border-r last:border-r-0 border-[var(--border)]">
      <div className="text-[0.8rem] text-white/70 hidden sm:block min-w-16">{label}</div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function TextOptions() {
  const { dispatch } = useDesigner();
  const layer = useActiveLayer();
  const isText = layer && layer.type === 'text';
  const [open, setOpen] = React.useState(false);
  const currentPx = isText ? Math.round((((layer as unknown as import("@/types/designer").TextLayer).fontSizeEm || Math.max(0.5, (((layer as unknown as import("@/types/designer").TextLayer).heightPct || 12) / 3))) * 16)) : 32;
  const sizes = [6,8,10,12,14,16,18,20,24,28,32,36,40,48,56,64,72,96,120,144,160];
  // Helpers to support color alpha for text (similar to shape fill handling)
  function hexFromColor(input: string | undefined): string {
    try {
      if (!input) return '#ffffff';
      if (input.startsWith('#')) {
        if (input.length === 4) {
          const r = input[1]; const g = input[2]; const b = input[3];
          return `#${r}${r}${g}${g}${b}${b}`;
        }
        return input.slice(0, 7);
      }
      const m = input.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (m) {
        const r = Math.max(0, Math.min(255, Number(m[1] || 255)))|0;
        const g = Math.max(0, Math.min(255, Number(m[2] || 255)))|0;
        const b = Math.max(0, Math.min(255, Number(m[3] || 255)))|0;
        const toHex = (n: number)=> n.toString(16).padStart(2,'0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
      return '#ffffff';
    } catch { return '#ffffff'; }
  }
  function rgbaStringFrom(hex: string, alpha: number): string {
    try {
      const h = hex.replace('#','');
      const r = parseInt(h.slice(0,2),16);
      const g = parseInt(h.slice(2,4),16);
      const b = parseInt(h.slice(4,6),16);
      const a = Math.max(0, Math.min(1, alpha));
      return `rgba(${r},${g},${b},${a})`;
    } catch { return 'rgba(255,255,255,1)'; }
  }
  const textHex = isText ? hexFromColor(((layer as import("@/types/designer").TextLayer).color)) : '#ffffff';
  const textAlpha = ((): number => {
    try {
      if (!isText) return 1;
      const colorStr = String((layer as import("@/types/designer").TextLayer)?.color || '');
      const m = colorStr.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      if (m) return Math.max(0, Math.min(1, Number(m[1] || 1)));
      return 1;
    } catch { return 1; }
  })();
  return (
    <>
      <Labeled label="Font">
        <input
          className="bg-transparent border rounded px-2 py-1 text-sm min-w-40"
          placeholder="Font family"
          value={isText ? (layer as import("@/types/designer").TextLayer).fontFamily : ''}
          onChange={(e)=>{ if (isText) dispatch({ type: 'update_layer', id: layer.id, patch: { fontFamily: e.target.value } }); }}
        />
      </Labeled>
      <Labeled label="Spacing">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Slider
                  className="w-36"
                  min={-0.1}
                  max={1}
                  step={0.01}
                  value={[isText ? (layer as import("@/types/designer").TextLayer).letterSpacingEm : 0]}
                  onValueChange={(v)=>{
                    if (!isText) return;
                    const next = Number(v?.[0] || 0);
                    dispatch({ type: 'update_layer', id: layer.id, patch: { letterSpacingEm: next } });
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={()=>{ if (!isText) return; dispatch({ type: 'update_layer', id: layer.id, patch: { letterSpacingEm: 0 } }); }}
              >
                Reset
              </Button>
            </div>
          </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={()=>{ if (!isText) return; dispatch({ type: 'update_layer', id: layer.id, patch: { letterSpacingEm: 0 } }); }}>Reset letter spacing</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Labeled>
      <Labeled label="Size">
        <div className="flex items-center gap-0">
          <Button size="icon" variant="outline" className="rounded-r-none" onClick={()=>{ if (!isText) return; const px = Math.max(6, currentPx - 2); const em = Math.max(0.5, Math.min(10, px / 16)); dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } }); }}>-</Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <div className="relative">
                <input
                  className="bg-transparent border rounded-none px-2 text-sm h-9 w-16 text-right pr-6 -ml-px"
                  value={isText ? String(currentPx) : ''}
                  inputMode="numeric"
                  onFocus={()=> setOpen(true)}
                    onKeyDown={(e)=>{
                    if (!isText) return;
                    if (e.key === 'ArrowUp' || e.key === '+') {
                      e.preventDefault();
                      const px = Math.min(160, currentPx + 2);
                      const em = Math.max(0.5, Math.min(10, px / 16));
                        dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } });
                    } else if (e.key === 'ArrowDown' || e.key === '-') {
                      e.preventDefault();
                      const px = Math.max(6, currentPx - 2);
                      const em = Math.max(0.5, Math.min(10, px / 16));
                        dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } });
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                  onChange={(e)=>{
                    if (!isText) return; 
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    const px = Number(raw || 0);
                    if (Number.isFinite(px)) {
                      const em = Math.max(0.5, Math.min(10, px / 16));
                        dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } });
                    }
                  }}
                />
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-4 text-white/70 pointer-events-none" />
              </div>
            </PopoverAnchor>
            <PopoverContent className="p-0 w-28" align="center" onOpenAutoFocus={(e)=> e.preventDefault()}>
              <div className="max-h-64 overflow-y-auto py-1">
                {sizes.map((px)=> (
                  <button
                    key={px}
                    className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-white/10", currentPx === px ? "bg-white/10" : "")}
                    onClick={()=>{ if (!isText) return; const em = Math.max(0.5, Math.min(10, px / 16)); dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } }); setOpen(false); }}
                  >
                    {px}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="outline" className="rounded-l-none -ml-px" onClick={()=>{ if (!isText) return; const px = Math.min(160, currentPx + 2); const em = Math.max(0.5, Math.min(10, px / 16)); dispatch({ type: 'update_layer', id: layer.id, patch: { fontSizeEm: em } }); }}>+</Button>
        </div>
      </Labeled>
      <Labeled label="Text Align">
        <ToggleGroup type="single" size="sm" value={(isText ? (layer as import("@/types/designer").TextLayer).textAlign || 'center' : undefined)} onValueChange={(v)=>{ if (!isText) return; const next = (v || 'center') as 'left'|'center'|'right'|'justify'; dispatch({ type: 'update_layer', id: layer.id, patch: { textAlign: next } }); }}>
          <ToggleGroupItem value="left" aria-label="Align left" className="h-8 w-8">
            <TextAlignStart className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center" className="h-8 w-8">
            <TextAlignCenter className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right" className="h-8 w-8">
            <TextAlignEnd className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify" className="h-8 w-8">
            <TextAlignJustify className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </Labeled>
      <Labeled label="Width">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-3">
              <Slider
                className="w-36"
                min={10}
                max={300}
                step={1}
                value={[isText ? Math.round((((layer as import("@/types/designer").TextLayer).scaleX || 1) * 100)) : 100]}
                onValueChange={(v)=>{
                  if (!isText) return;
                  const scaleX = Math.max(0.25, Math.min(3, (Number(v?.[0] || 100) / 100)));
                  dispatch({ type: 'update_layer', id: layer.id, patch: { scaleX } });
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={()=>{ if (!isText) return; const sy = Number((layer as import("@/types/designer").TextLayer).scaleY) || 1; dispatch({ type: 'update_layer', id: layer.id, patch: { scaleX: sy } }); }}
              >
                Reset
              </Button>
            </div>
          </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={()=>{ if (!isText) return; const sy = Number((layer as import("@/types/designer").TextLayer).scaleY) || 1; dispatch({ type: 'update_layer', id: layer.id, patch: { scaleX: sy } }); }}>Reset width</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Labeled>
      <Labeled label="Color">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={textHex}
          onChange={(e)=>{
            if (!isText) return;
            const hex = e.target.value;
            const next = rgbaStringFrom(hex, textAlpha);
            dispatch({ type: 'update_layer', id: layer.id, patch: { color: next } });
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Opacity</div>
          <Slider
            className="w-28"
            min={0}
            max={100}
            step={1}
            value={[Math.round(textAlpha*100)]}
            onValueChange={(v)=>{
              if (!isText) return;
              const a = Math.max(0, Math.min(100, Number(v?.[0] || 100))) / 100;
              const next = rgbaStringFrom(textHex, a);
              dispatch({ type: 'update_layer', id: layer.id, patch: { color: next } });
            }}
          />
        </div>
      </Labeled>
    </>
  );
}

function MarqueeOptions() {
  const { state, dispatch } = useDesigner();
  return (
    <Labeled label="Marquee">
      <button className={cn("px-2 py-1 rounded", state.marqueeMode==='rectangle' ? 'bg-white/10' : 'hover:bg-white/10')} onClick={()=> dispatch({ type: 'set_marquee_mode', mode: 'rectangle' })}><Square className="size-4" /></button>
      <button className={cn("px-2 py-1 rounded", state.marqueeMode==='ellipse' ? 'bg-white/10' : 'hover:bg-white/10')} onClick={()=> dispatch({ type: 'set_marquee_mode', mode: 'ellipse' })}><Circle className="size-4" /></button>
      {/* Lasso/polygon can be added later; keep UI placeholders minimal */}
    </Labeled>
  );
}

function ShapeOptions() {
  const { state, dispatch } = useDesigner();
  const current = state.shapeKind || 'rectangle';

  return (
    <Labeled label="Shape">
      <button
        className={cn("px-2 py-1 rounded", current==='rectangle' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> dispatch({ type: 'set_shape_kind', kind: 'rectangle' })}
        title="Rectangle"
      >
        <Square className="size-4" />
      </button>
      <button
        className={cn("px-2 py-1 rounded", current==='ellipse' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> dispatch({ type: 'set_shape_kind', kind: 'ellipse' })}
        title="Ellipse"
      >
        <Circle className="size-4" />
      </button>
      <button
        className={cn("px-2 py-1 rounded", current==='triangle' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> dispatch({ type: 'set_shape_kind', kind: 'triangle' })}
        title="Triangle"
      >
        <Triangle className="size-4" />
      </button>
      <button
        className={cn("px-2 py-1 rounded", current==='line' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> dispatch({ type: 'set_shape_kind', kind: 'line' })}
        title="Line"
      >
        <Minus className="size-4" />
      </button>
    </Labeled>
  );
}

function ShapeStyleOptions() {
  const layer = useActiveLayer();
  const { dispatch } = useDesigner();
  const isShape = !!layer && layer.type === 'shape';

  // Helpers
  function hexFromColor(input: string | undefined): string {
    try {
      if (!input) return '#ffffff';
      if (input.startsWith('#')) {
        if (input.length === 4) {
          const r = input[1]; const g = input[2]; const b = input[3];
          return `#${r}${r}${g}${g}${b}${b}`;
        }
        return input.slice(0, 7);
      }
      const m = input.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (m) {
        const r = Math.max(0, Math.min(255, Number(m[1] || 255)))|0;
        const g = Math.max(0, Math.min(255, Number(m[2] || 255)))|0;
        const b = Math.max(0, Math.min(255, Number(m[3] || 255)))|0;
        const toHex = (n: number)=> n.toString(16).padStart(2,'0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
      return '#ffffff';
    } catch { return '#ffffff'; }
  }

  function rgbaStringFrom(hex: string, alpha: number): string {
    try {
      const h = hex.replace('#','');
      const r = parseInt(h.slice(0,2),16);
      const g = parseInt(h.slice(2,4),16);
      const b = parseInt(h.slice(4,6),16);
      const a = Math.max(0, Math.min(1, alpha));
      return `rgba(${r},${g},${b},${a})`;
    } catch { return 'rgba(255,255,255,1)'; }
  }

  const fillHex = isShape ? hexFromColor(((layer as import("@/types/designer").ShapeLayer).fill)) : '#ffffff';
  const fillAlpha = ((): number => {
    try {
      const fillStr = String((layer as import("@/types/designer").ShapeLayer)?.fill || '');
      const m = fillStr.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      if (m) return Math.max(0, Math.min(1, Number(m[1] || 1)));
      return 1;
    } catch { return 1; }
  })();
  const strokeHex = isShape ? hexFromColor((layer as import("@/types/designer").ShapeLayer).stroke || '#ffffff') : '#ffffff';
  const strokeWidth = isShape ? Number((layer as import("@/types/designer").ShapeLayer).strokeWidth || 2) : 2;
  const radiusPct = isShape ? Number((layer as import("@/types/designer").ShapeLayer).radiusPct || 0) : 0;

  if (!isShape) {
    return (
      <div className="text-[0.8rem] text-white/70">
        Select a shape to edit style
      </div>
    );
  }

  return (
    <>
      <Labeled label="Fill">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={fillHex}
          onChange={(e)=>{
            const hex = e.target.value;
            const next = rgbaStringFrom(hex, fillAlpha);
            dispatch({ type: 'update_layer', id: layer!.id, patch: { fill: next } });
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Opacity</div>
          <Slider className="w-28" min={0} max={100} step={1} value={[Math.round(fillAlpha*100)]}
            onValueChange={(v)=>{
              const a = Math.max(0, Math.min(100, Number(v?.[0] || 100))) / 100;
              const next = rgbaStringFrom(fillHex, a);
              dispatch({ type: 'update_layer', id: layer!.id, patch: { fill: next } });
            }}
          />
        </div>
      </Labeled>
      <Labeled label="Border">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={strokeHex}
          onChange={(e)=>{
            const hex = e.target.value;
            dispatch({ type: 'update_layer', id: layer!.id, patch: { stroke: hex } });
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Width</div>
          <Slider className="w-28" min={0} max={40} step={1} value={[strokeWidth]}
            onValueChange={(v)=>{
              const w = Math.max(0, Math.min(200, Number(v?.[0] || 0)));
              dispatch({ type: 'update_layer', id: layer!.id, patch: { strokeWidth: w } });
            }}
          />
        </div>
      </Labeled>
      {String((layer as import("@/types/designer").ShapeLayer).shape) === 'rectangle' ? (
        <Labeled label="Radius">
          <Slider className="w-36" min={0} max={0.5} step={0.01} value={[radiusPct]}
            onValueChange={(v)=>{
              const rp = Math.max(0, Math.min(0.5, Number(v?.[0] || 0)));
              dispatch({ type: 'update_layer', id: layer!.id, patch: { radiusPct: rp } });
            }}
          />
        </Labeled>
      ) : null}
    </>
  );
}

function ShapeDefaultsOptions() {
  const { state, dispatch } = useDesigner();
  const defaults = state.shapeDefaults || { fill: 'rgba(255,255,255,0.2)', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2, radiusPct: 0.06 };

  function hexFromColor(input: string | undefined): string {
    try {
      if (!input) return '#ffffff';
      if (input.startsWith('#')) {
        if (input.length === 4) {
          const r = input[1]; const g = input[2]; const b = input[3];
          return `#${r}${r}${g}${g}${b}${b}`;
        }
        return input.slice(0, 7);
      }
      const m = input.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (m) {
        const r = Math.max(0, Math.min(255, Number(m[1] || 255)))|0;
        const g = Math.max(0, Math.min(255, Number(m[2] || 255)))|0;
        const b = Math.max(0, Math.min(255, Number(m[3] || 255)))|0;
        const toHex = (n: number)=> n.toString(16).padStart(2,'0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
      return '#ffffff';
    } catch { return '#ffffff'; }
  }

  function rgbaStringFrom(hex: string, alpha: number): string {
    try {
      const h = hex.replace('#','');
      const r = parseInt(h.slice(0,2),16);
      const g = parseInt(h.slice(2,4),16);
      const b = parseInt(h.slice(4,6),16);
      const a = Math.max(0, Math.min(1, alpha));
      return `rgba(${r},${g},${b},${a})`;
    } catch { return 'rgba(255,255,255,1)'; }
  }

  const fillHex = hexFromColor(defaults.fill);
  const fillAlpha = ((): number => {
    try {
      const m = String(defaults.fill || '').match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      if (m) return Math.max(0, Math.min(1, Number(m[1] || 1)));
      return 1;
    } catch { return 1; }
  })();
  const strokeHex = hexFromColor(defaults.stroke || '#ffffff');
  const strokeWidth = Number(defaults.strokeWidth || 2);
  const radiusPct = Number(defaults.radiusPct || 0);

  return (
    <>
      <Labeled label="Fill">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={fillHex}
          onChange={(e)=>{
            const hex = e.target.value;
            const next = rgbaStringFrom(hex, fillAlpha);
            dispatch({ type: 'update_shape_defaults', patch: { fill: next } });
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Opacity</div>
          <Slider className="w-28" min={0} max={100} step={1} value={[Math.round(fillAlpha*100)]}
            onValueChange={(v)=>{
              const a = Math.max(0, Math.min(100, Number(v?.[0] || 100))) / 100;
              const next = rgbaStringFrom(fillHex, a);
              dispatch({ type: 'update_shape_defaults', patch: { fill: next } });
            }}
          />
        </div>
      </Labeled>
      <Labeled label="Border">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={strokeHex}
          onChange={(e)=>{
            const hex = e.target.value;
            dispatch({ type: 'update_shape_defaults', patch: { stroke: hex } });
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Width</div>
          <Slider className="w-28" min={0} max={40} step={1} value={[strokeWidth]}
            onValueChange={(v)=>{
              const w = Math.max(0, Math.min(200, Number(v?.[0] || 0)));
              dispatch({ type: 'update_shape_defaults', patch: { strokeWidth: w } });
            }}
          />
        </div>
      </Labeled>
      <Labeled label="Radius">
        <Slider className="w-36" min={0} max={0.5} step={0.01} value={[radiusPct]}
          onValueChange={(v)=>{
            const rp = Math.max(0, Math.min(0.5, Number(v?.[0] || 0)));
            dispatch({ type: 'update_shape_defaults', patch: { radiusPct: rp } });
          }}
        />
      </Labeled>
    </>
  );
}
function ImageOptions() {
  const { dispatch } = useDesigner();
  const [carKeys, setCarKeys] = React.useState<string[]>([]);
  const [carUrls, setCarUrls] = React.useState<Record<string,string>>({});
  const [libraryItems, setLibraryItems] = React.useState<Array<{ key: string; url: string; name: string }>>([]);
  const [carLoading, setCarLoading] = React.useState(false);
  const [libraryLoading, setLibraryLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [canvasSize, setCanvasSize] = React.useState<{ w: number; h: number }>({ w: 800, h: 450 });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  function onPick() { inputRef.current?.click(); }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return; const url = URL.createObjectURL(f);
    // Import statically to satisfy lint rules
    import("@/types/designer").then((m)=>{
      dispatch({ type: 'add_layer', layer: m.createImageLayer(url, 50, 50), atTop: true });
    }).catch(()=>{});
    e.currentTarget.value = '';
  }
  React.useEffect(()=>{
    let aborted = false;
    (async()=>{
      try {
        const me = await fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
        if (aborted) return;
        const email: string | null = typeof me?.email === 'string' ? me.email : null;
        if (email) {
          const prof = await fetch(`/api/users/chat-profile?email=${encodeURIComponent(email)}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>null);
          if (!aborted) {
            const photos: string[] = Array.isArray(prof?.photos) ? prof.photos.filter((x: unknown)=> typeof x === 'string') as string[] : [];
            setCarKeys(photos);
            if (photos.length) {
              try {
                setCarLoading(true);
                const map = await (await import('@/lib/view-url-client')).getViewUrls(photos);
                if (!aborted) setCarUrls(map);
              } finally { if (!aborted) setCarLoading(false); }
            }
          }
        }
      } catch {}
      try {
        setLibraryLoading(true);
        const listRes = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache:'no-store' });
        const obj = await listRes.json().catch(()=>({}));
        const arr: Array<{ type?: string; name?: string; key?: string }> = Array.isArray(obj?.items) ? obj.items : [];
        const files = arr.filter((it)=> String(it?.type) === 'file');
        const keys = files.map((it)=> it.key || `library/${String(it?.name || '')}`);
        if (keys.length) {
          try {
            const urls = await (await import('@/lib/view-url-client')).getViewUrls(keys);
            const out = keys.map((k)=> ({ key:k, name: k.split('/').pop() || 'file', url: urls[k] || '' }));
            if (!aborted) setLibraryItems(out);
          } finally { if (!aborted) setLibraryLoading(false); }
        } else {
          if (!aborted) { setLibraryItems([]); setLibraryLoading(false); }
        }
      } catch {}
    })();
    return ()=>{ aborted = true };
  }, []);
  React.useEffect(()=>{
    function compute() {
      try {
        const root = document.querySelector('[data-canvas-root]') as HTMLElement | null;
        const r = root?.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) setCanvasSize({ w: Math.round(r.width), h: Math.round(r.height) });
      } catch {}
    }
    compute();
    window.addEventListener('resize', compute);
    return ()=> window.removeEventListener('resize', compute);
  }, []);
  return (
    <Labeled label="Image">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <Button size="sm" variant="outline" onClick={onPick}>Upload</Button>
      <Button size="sm" variant="outline" onClick={()=> setOpen(true)} className="ml-1">Browse</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-3" style={{ maxWidth: `${canvasSize.w}px`, maxHeight: `${canvasSize.h}px`, width: 'min(92vw, 100%)', height: 'min(92vh, 100%)' }}>
          <DialogHeader>
            <DialogTitle>Choose an image</DialogTitle>
          </DialogHeader>
          <div className="mt-2 overflow-auto" style={{ height: 'calc(100% - 2.5rem)' }}>
            <div className="text-[0.8rem] text-white/70 mb-1">Your car photos</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
              {carLoading ? (
                Array.from({ length: 10 }).map((_,i)=> (
                  <Skeleton key={i} className="h-32 rounded border border-[var(--border)]" />
                ))
              ) : carKeys.length ? carKeys.map((k)=> {
                const url = carUrls[k] || '';
                return (
                  <button key={k} className="bg-white/5 rounded overflow-hidden border border-[var(--border)] hover:ring-2 hover:ring-primary flex items-center justify-center p-1"
                    onClick={()=>{ import("@/types/designer").then((m)=>{ dispatch({ type: 'add_layer', layer: m.createImageLayer(url || k, 50, 50), atTop: true }); }).catch(()=>{}); setOpen(false); }}
                    title={k}
                  >
                    {url ? (
                      <NextImage src={url} alt="ph" width={256} height={128} className="max-w-full max-h-32 w-auto h-auto object-contain" />
                    ) : null}
                  </button>
                );
              }) : (
                <div className="col-span-full text-[0.8rem] text-white/50">No car photos found</div>
              )}
            </div>
            <div className="text-[0.8rem] text-white/70 mb-1">Library</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {libraryLoading ? (
                Array.from({ length: 12 }).map((_,i)=> (
                  <Skeleton key={i} className="h-32 rounded border border-[var(--border)]" />
                ))
              ) : libraryItems.length ? libraryItems.map((it)=> (
                <button key={it.key} className="bg-white/5 rounded overflow-hidden border border-[var(--border)] hover:ring-2 hover:ring-primary flex items-center justify-center p-1"
                  onClick={()=>{ import("@/types/designer").then((m)=>{ dispatch({ type: 'add_layer', layer: m.createImageLayer(it.url || it.key, 50, 50), atTop: true }); }).catch(()=>{}); setOpen(false); }}
                  title={it.name}
                >
                  {it.url ? (
                    <NextImage src={it.url} alt={it.name} width={256} height={128} className="max-w-full max-h-32 w-auto h-auto object-contain" />
                  ) : null}
                </button>
              )) : (
                <div className="col-span-full text-[0.8rem] text-white/50">No library images</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="text-[0.8rem] text-white/70 pl-1 hidden sm:block">or paste from clipboard</div>
    </Labeled>
  );
}

function FillOptions() {
  return (
    <Labeled label="Fill">
      <input type="color" className="h-8 w-10 rounded" defaultValue="#ff3366" onChange={()=>{ /* used at paint time */ }} />
      <div className="text-[0.8rem] text-white/70 pl-1">Tap inside a marquee</div>
    </Labeled>
  );
}

function AlignControls() {
  const layer = useActiveLayer();
  const { dispatch } = useDesigner();
  const disabled = !layer;
  return (
    <Labeled label="Canvas Align">
      <Button
        size="icon"
        variant="outline"
        title="Center Horizontally"
        disabled={disabled}
        onClick={()=>{ if (!layer) return; dispatch({ type: 'update_layer', id: layer.id, patch: { xPct: 50 } }); }}
      >
        <AlignCenterVertical className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        title="Center Vertically"
        disabled={disabled}
        onClick={()=>{ if (!layer) return; dispatch({ type: 'update_layer', id: layer.id, patch: { yPct: 50 } }); }}
      >
        <AlignCenterHorizontal className="size-4" />
      </Button>
    </Labeled>
  );
}

function RotationOptions() {
  const layer = useActiveLayer();
  const { dispatch } = useDesigner();
  if (!layer) return null;
  const deg = Math.round(Number(layer.rotationDeg || 0));
  return (
    <Labeled label="Rotate">
      <div className="flex items-center gap-3">
        <Slider
          className="w-36"
          min={-180}
          max={180}
          step={1}
          value={[deg]}
          onValueChange={(v)=>{
            const next = Math.max(-180, Math.min(180, Number(v?.[0] || 0)));
            dispatch({ type: 'update_layer', id: layer.id, patch: { rotationDeg: next } });
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={()=> dispatch({ type: 'update_layer', id: layer.id, patch: { rotationDeg: 0 } })}
        >
          Reset
        </Button>
      </div>
    </Labeled>
  );
}

function EffectsDropdown() {
  const layer = useActiveLayer();
  const { dispatch } = useDesigner();
  // Hooks must be called unconditionally in the same order on every render
  const [open, setOpen] = React.useState(false);
  if (!layer) return null;
  const shadow = layer.effects.shadow;
  const glow = layer.effects.glow;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button size="sm" variant="outline" className="ml-1"><Wand2 className="size-4 mr-1" /> Effects</Button>
      </PopoverAnchor>
      <PopoverContent className="p-2 w-64" align="start" onOpenAutoFocus={(e)=> e.preventDefault()}>
        <div className="text-xs font-medium mb-1">Glow</div>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={!!glow.enabled} onChange={(e)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, glow: { ...glow, enabled: !!e.target.checked } } } })} />
          <input type="color" className="h-8 w-10 rounded" value={glow.color} onChange={(e)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, glow: { ...glow, color: e.target.value } } } })} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <div className="flex items-center justify-between text-[0.8rem] text-white/70">
              <div>Blur</div>
              <div className="text-white">{glow.blur}px</div>
            </div>
            <Slider className="mt-1" min={0} max={64} value={[glow.blur]} onValueChange={(v)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, glow: { ...glow, blur: v?.[0] || 0 } } } })} />
          </div>
        </div>
        <div className="text-[0.8rem] text-white/70 pt-2">Offset</div>
        <GlowOffsetPad
          valueX={glow.offsetX}
          valueY={glow.offsetY}
          max={60}
          onChange={(nx, ny)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, glow: { ...glow, offsetX: nx, offsetY: ny } } } })}
        />
        <Separator className="my-3" />
        <div className="text-xs font-medium mb-1">Shadow</div>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={!!shadow.enabled} onChange={(e)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, shadow: { ...shadow, enabled: !!e.target.checked } } } })} />
          <input type="color" className="h-8 w-10 rounded" value={shadow.color} onChange={(e)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, shadow: { ...shadow, color: e.target.value } } } })} />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[0.8rem] text-white/70">
                <div>Blur</div>
                <div className="text-white">{shadow.blur}px</div>
              </div>
              <Slider min={0} max={60} value={[shadow.blur]} onValueChange={(v)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, shadow: { ...shadow, blur: v?.[0] || 0 } } } })} />
            </div>
          </div>
          <div className="text-[0.8rem] text-white/70 pt-2">Offset</div>
          <ShadowOffsetPad
            valueX={shadow.offsetX}
            valueY={shadow.offsetY}
            max={60}
            onChange={(nx, ny)=> dispatch({ type: 'update_layer', id: layer.id, patch: { effects: { ...layer.effects, shadow: { ...shadow, offsetX: nx, offsetY: ny } } } })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GlowOffsetPad({ valueX, valueY, max, onChange }: { valueX: number; valueY: number; max: number; onChange: (x: number, y: number)=> void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef(false);

  const clamp = React.useCallback((v: number, lo: number, hi: number)=> Math.min(hi, Math.max(lo, v)), []);

  const updateFromPointer = React.useCallback((clientX: number, clientY: number)=>{
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = clamp(clientX - r.left, 0, r.width);
    const cy = clamp(clientY - r.top, 0, r.height);
    const nx = Math.round(((cx / r.width) * 2 - 1) * max);
    const ny = Math.round(((cy / r.height) * 2 - 1) * max);
    onChange(nx, ny);
  }, [clamp, max, onChange]);

  React.useEffect(()=>{
    function onMove(e: PointerEvent){ if (!dragRef.current) return; updateFromPointer(e.clientX, e.clientY); }
    function onUp(){ dragRef.current = false; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return ()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp as unknown as EventListener); };
  }, [updateFromPointer]);

  const handlePointerDown = (e: React.PointerEvent)=>{ dragRef.current = true; updateFromPointer(e.clientX, e.clientY); };

  const px = (valueX / max + 1) / 2;
  const py = (valueY / max + 1) / 2;

  return (
    <div className="space-y-2 mb-2">
      <div
        ref={ref}
        onPointerDown={handlePointerDown}
        className="relative rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] cursor-crosshair select-none"
        style={{ width: '9rem', height: '9rem' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 border-l border-white/10" />
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 border-t border-white/10" />
        </div>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 border-l border-primary/50" style={{ left: `calc(${(px * 100).toFixed(2)}% )` }} />
          <div className="absolute left-0 right-0 border-t border-primary/50" style={{ top: `calc(${(py * 100).toFixed(2)}% )` }} />
        </div>
        <div
          className="absolute size-3 rounded-full bg-primary shadow ring-2 ring-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${(px * 100).toFixed(2)}%`, top: `${(py * 100).toFixed(2)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[0.8rem] text-white/70">
        <div>X: <span className="text-white">{valueX}</span></div>
        <div>Y: <span className="text-white">{valueY}</span></div>
        <button
          type="button"
          className="px-2 py-1 rounded border border-[color:var(--border)] hover:bg-white/10 text-[0.8rem]"
          onClick={()=> onChange(0, 0)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function ShadowOffsetPad({ valueX, valueY, max, onChange }: { valueX: number; valueY: number; max: number; onChange: (x: number, y: number)=> void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef(false);

  const clamp = React.useCallback((v: number, lo: number, hi: number)=> Math.min(hi, Math.max(lo, v)), []);

  const updateFromPointer = React.useCallback((clientX: number, clientY: number)=>{
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = clamp(clientX - r.left, 0, r.width);
    const cy = clamp(clientY - r.top, 0, r.height);
    const nx = Math.round(((cx / r.width) * 2 - 1) * max);
    const ny = Math.round(((cy / r.height) * 2 - 1) * max);
    onChange(nx, ny);
  }, [clamp, max, onChange]);

  React.useEffect(()=>{
    function onMove(e: PointerEvent){ if (!dragRef.current) return; updateFromPointer(e.clientX, e.clientY); }
    function onUp(){ dragRef.current = false; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return ()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp as unknown as EventListener); };
  }, [updateFromPointer]);

  const handlePointerDown = (e: React.PointerEvent)=>{ dragRef.current = true; updateFromPointer(e.clientX, e.clientY); };

  // Convert current values to position within the pad [0..1]
  const px = (valueX / max + 1) / 2; // 0..1
  const py = (valueY / max + 1) / 2; // 0..1

  return (
    <div className="space-y-2">
      <div
        ref={ref}
        onPointerDown={handlePointerDown}
        className="relative rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] cursor-crosshair select-none"
        style={{ width: '9rem', height: '9rem' }}
      >
        {/* Center grid lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 border-l border-white/10" />
          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 border-t border-white/10" />
        </div>
        {/* Current offset crosshair */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 border-l border-primary/50" style={{ left: `calc(${(px * 100).toFixed(2)}% )` }} />
          <div className="absolute left-0 right-0 border-t border-primary/50" style={{ top: `calc(${(py * 100).toFixed(2)}% )` }} />
        </div>
        {/* Thumb */}
        <div
          className="absolute size-3 rounded-full bg-primary shadow ring-2 ring-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${(px * 100).toFixed(2)}%`, top: `${(py * 100).toFixed(2)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[0.8rem] text-white/70">
        <div>X: <span className="text-white">{valueX}</span></div>
        <div>Y: <span className="text-white">{valueY}</span></div>
        <button
          type="button"
          className="px-2 py-1 rounded border border-[color:var(--border)] hover:bg-white/10 text-[0.8rem]"
          onClick={()=> onChange(0, 0)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
