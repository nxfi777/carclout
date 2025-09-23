"use client";
import React from "react";
import { useLayerEditor, useActiveLayer } from "@/components/layer-editor/LayerEditorProvider";
import { cn } from "@/lib/utils";
import NextImage from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Bold, Italic, Underline, ChevronDown, TextAlignStart, TextAlignCenter, TextAlignEnd, TextAlignJustify, Undo2, Redo2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Square, Circle, Triangle, Wand2, AlignCenterHorizontal, AlignCenterVertical } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { Layer, TextLayer, ShapeLayer } from "@/types/layer-editor";

export default function ToolOptionsBar({ className }: { className?: string }) {
  const { state, undo, redo, canUndo, canRedo } = useLayerEditor();
  const selectedIds = state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (state.activeLayerId ? [state.activeLayerId] : []);
  const selectedLayers: Layer[] = state.layers.filter((l) => selectedIds.includes(l.id));
  const hasTextSelected = selectedLayers.some((l) => l.type === 'text');
  const hasShapeSelected = selectedLayers.some((l) => l.type === 'shape');

  return (
    <div className={cn("relative z-10 flex items-center gap-2 px-2 py-1 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm flex-wrap", className)}>
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Button size="sm" variant="outline" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="size-4 mr-1" />Undo</Button>
        <Button size="sm" variant="outline" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="size-4 mr-1" />Redo</Button>
      </div>
      {state.tool === 'text' && hasTextSelected ? <TextOptions /> : null}
      {state.tool === 'shape' ? <ShapeOptions /> : null}
      {hasShapeSelected ? <ShapeStyleOptions /> : null}
      {state.tool === 'image' ? <ImageOptions /> : null}
      <RotationOptions />
      <TiltOptions />
      {(['select','text','shape','image'] as string[]).includes(state.tool) ? <AlignControls /> : null}
      <EffectsDropdown />
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
  const { state, dispatch } = useLayerEditor();
  const selectedIds = state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (state.activeLayerId ? [state.activeLayerId] : []);
  const selectedTextLayers = state.layers.filter((l): l is TextLayer => selectedIds.includes(l.id) && l.type === 'text');
  const isText = selectedTextLayers.length > 0;
  const [open, setOpen] = React.useState(false);
  const getPx = (t: TextLayer) => Math.round(((t.fontSizeEm || Math.max(0.5, ((t.heightPct || 12) / 3))) * 16));
  const currentPx = isText ? (selectedTextLayers.length === 1 ? getPx(selectedTextLayers[0]) : NaN) : 32;
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
  const textHex = isText && selectedTextLayers.length >= 1 ? hexFromColor(selectedTextLayers[0].color) : '#ffffff';
  const textAlpha = ((): number => {
    try {
      if (!isText) return 1;
      const m = String(selectedTextLayers[0]?.color || '').match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      if (m) return Math.max(0, Math.min(1, Number(m[1] || 1)));
      return 1;
    } catch { return 1; }
  })();

  function applyDeltaPx(delta: number) {
    if (!isText) return;
    for (const t of selectedTextLayers) {
      const oldPx = getPx(t);
      const px = Math.min(160, Math.max(6, oldPx + delta));
      const em = Math.max(0.5, Math.min(10, px / 16));
      dispatch({ type: 'update_layer', id: t.id, patch: { fontSizeEm: em } });
    }
  }

  function setExactPx(px: number) {
    if (!isText) return;
    const em = Math.max(0.5, Math.min(10, px / 16));
    for (const t of selectedTextLayers) {
      dispatch({ type: 'update_layer', id: t.id, patch: { fontSizeEm: em } });
    }
  }
  return (
    <>
      <div className="flex items-center gap-1 pr-2 border-r last:border-r-0 border-[var(--border)]">
        <RichTextToggleGroup />
      </div>
      <Labeled label="Font">
        <Select value={isText && selectedTextLayers.length === 1 ? String(selectedTextLayers[0].fontFamily) : ''} onValueChange={(v)=>{ if (!isText) return; for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { fontFamily: v } }); } }}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent style={{ maxHeight: 280, overflowY: 'auto' }}>
            {[
              'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
              'Arial, Helvetica, sans-serif',
              'Helvetica, Arial, sans-serif',
              'Georgia, serif',
              '"Times New Roman", Times, serif',
              '"Courier New", Courier, monospace',
              'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
              'Poppins', 'Montserrat', 'Oswald', 'Bebas Neue', 'Lato', 'Open Sans', 'Roboto Condensed', 'Anton', 'Barlow Condensed', 'Playfair Display', 'Merriweather', 'DM Sans', 'Sora', 'Exo 2', 'Orbitron', 'Rajdhani', 'Roboto Mono', 'Source Code Pro', 'Fira Code', 'Raleway', 'Nunito', 'Ubuntu', 'Work Sans', 'PT Sans', 'PT Serif', 'Rubik', 'Manrope', 'Cabin', 'Quicksand', 'Alegreya', 'Libre Baskerville', 'Arvo', 'Noto Sans', 'Noto Serif'
            ].map((f)=> (
              <SelectItem key={f} value={f}>
                <span style={{ fontFamily: f }}>{f.split(',')[0].replace(/"/g,'')}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Labeled>
      <Labeled label="Size">
        <div className="flex items-center gap-0">
          <Button size="icon" variant="outline" className="rounded-r-none" onClick={()=> applyDeltaPx(-2)}>-</Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <div className="relative">
                <input
                  className="bg-transparent border rounded-none px-2 text-sm h-9 w-16 text-right pr-6 -ml-px"
                  value={isText ? (Number.isFinite(currentPx) ? String(currentPx) : '') : ''}
                  inputMode="numeric"
                  onFocus={()=> setOpen(true)}
                  onKeyDown={(e)=>{
                    if (!isText) return;
                    if (e.key === 'ArrowUp' || e.key === '+') {
                      e.preventDefault();
                      applyDeltaPx(2);
                    } else if (e.key === 'ArrowDown' || e.key === '-') {
                      e.preventDefault();
                      applyDeltaPx(-2);
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
                      setExactPx(px);
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
                    onClick={()=>{ if (!isText) return; setExactPx(px); setOpen(false); }}
                  >
                    {px}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="outline" className="rounded-l-none -ml-px" onClick={()=> applyDeltaPx(2)}>+</Button>
        </div>
      </Labeled>
      <Labeled label="Spacing">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-2 w-56">
              <Slider className="w-36" min={-0.1} max={1} step={0.01} value={[isText && selectedTextLayers.length === 1 ? selectedTextLayers[0].letterSpacingEm : 0]} onValueChange={(v)=>{ if (!isText) return; const next = Number(v?.[0] || 0); for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { letterSpacingEm: next } }); } }} />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={()=>{ if (!isText) return; for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { letterSpacingEm: 0 } }); } }}>Reset letter spacing</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className="flex items-center gap-2 w-56">
          <div className="text-[0.75rem] w-16 text-white/60">Line height</div>
          <Slider className="w-36" min={0.6} max={2} step={0.01} value={[isText && selectedTextLayers.length === 1 ? selectedTextLayers[0].lineHeightEm : 1.1]} onValueChange={(v)=>{ if (!isText) return; const next = Number(v?.[0] || 1.1); for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { lineHeightEm: next } }); } }} />
        </div>
      </Labeled>
      <Labeled label="Text Align">
        <ToggleGroup type="single" size="sm"
          value={(isText && selectedTextLayers.length === 1 ? (selectedTextLayers[0].textAlign || 'center') : undefined)}
          onValueChange={(v)=>{ if (!isText) return; const next = (v || 'center') as 'left'|'center'|'right'|'justify'; for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { textAlign: next } }); } }}
        >
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
            <div>
              <Slider className="w-36" min={10} max={300} step={1} value={[isText && selectedTextLayers.length === 1 ? Math.round(((selectedTextLayers[0].scaleX || 1) * 100)) : 100]} onValueChange={(v)=>{ if (!isText) return; const scaleX = Math.max(0.25, Math.min(3, (Number(v?.[0] || 100) / 100))); for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { scaleX } }); } }} />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={()=>{ if (!isText) return; for (const t of selectedTextLayers) { const sy = Number(t.scaleY || 1); dispatch({ type: 'update_layer', id: t.id, patch: { scaleX: sy } }); } }}>Reset width</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Labeled>
      <Labeled label="Color">
        <input
          type="color"
          className="h-8 w-10 rounded"
          value={textHex}
          onChange={(e)=>{
            if (!isText) return; const hex = e.target.value; const next = rgbaStringFrom(hex, textAlpha);
            for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { color: next } }); }
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Opacity</div>
          <Slider className="w-28" min={0} max={100} step={1} value={[Math.round(textAlpha*100)]}
            onValueChange={(v)=>{
              if (!isText) return; const a = Math.max(0, Math.min(100, Number(v?.[0] || 100))) / 100; const next = rgbaStringFrom(textHex, a);
              for (const t of selectedTextLayers) { dispatch({ type: 'update_layer', id: t.id, patch: { color: next } }); }
            }}
          />
        </div>
      </Labeled>
    </>
  );
}

function RichTextToggleGroup(){
  // Use a local controlled value based on the current selection inside the active contenteditable, if any.
  const [value, setValue] = React.useState<string[]>([]);
  const layer = useActiveLayer();
  const isText = layer && layer.type === 'text';
  React.useEffect(()=>{
    function refreshStates(){
      try {
        const active = (window as unknown as { __activeTextEditable?: HTMLElement | null }).__activeTextEditable;
        let bold = false, italic = false, underline = false;
        if (active) {
          bold = typeof document.queryCommandState === 'function' ? document.queryCommandState('bold') : false;
          italic = typeof document.queryCommandState === 'function' ? document.queryCommandState('italic') : false;
          underline = typeof document.queryCommandState === 'function' ? document.queryCommandState('underline') : false;
        } else if (isText) {
          // When not editing, reflect whole-layer styles
          const t = layer as import("@/types/layer-editor").TextLayer;
          bold = (Number(t.fontWeight) || 0) >= 600;
          italic = !!t.italic;
          underline = !!t.underline;
        }
        const next: string[] = [];
        if (bold) next.push('b'); if (italic) next.push('i'); if (underline) next.push('u');
        setValue((prev)=> JSON.stringify(prev) !== JSON.stringify(next) ? next : prev);
      } catch { /* noop */ }
    }
    const onSel = ()=> setTimeout(refreshStates, 0);
    document.addEventListener('selectionchange', onSel);
    const id = window.setInterval(refreshStates, 500);
    return ()=> { document.removeEventListener('selectionchange', onSel); window.clearInterval(id); };
  }, [isText, layer]);

  const { dispatch } = useLayerEditor();
  function toggle(cmd: 'bold'|'italic'|'underline', key: 'b'|'i'|'u'){
    try {
      const editable = (window as unknown as { __activeTextEditable?: HTMLElement | null }).__activeTextEditable;
      if (editable) {
        // Ensure focus and preserve selection across toolbar click
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        editable.focus();
        if (range) {
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        document.execCommand(cmd, false);
        setTimeout(()=>{
          try {
            const present = value.includes(key);
            const next = present ? value.filter(v=>v!==key) : [...value, key];
            setValue(next);
          } catch {}
        }, 0);
      } else if (isText && layer) {
        // Not editing: toggle whole-layer style
        const t = layer as import("@/types/layer-editor").TextLayer;
        if (cmd === 'bold') {
          const cur = Number(t.fontWeight) || 700;
          const next = cur >= 600 ? 400 : 700;
          dispatch({ type: 'update_layer', id: layer.id, patch: { fontWeight: next } });
        } else if (cmd === 'italic') {
          dispatch({ type: 'update_layer', id: layer.id, patch: { italic: !t.italic } });
        } else if (cmd === 'underline') {
          dispatch({ type: 'update_layer', id: layer.id, patch: { underline: !t.underline } });
        }
        // Update visual state locally
        const present = value.includes(key);
        const next = present ? value.filter(v=>v!==key) : [...value, key];
        setValue(next);
      }
    } catch {}
  }

  return (
    <ToggleGroup type="multiple" variant="outline" size="sm" value={value} className="h-8"
      onValueChange={(v)=> setValue(Array.isArray(v) ? v as string[] : [])}
    >
      <ToggleGroupItem
        className={cn(
          "text-[color:var(--foreground)]/85 hover:text-[color:var(--primary)]",
          "data-[state=on]:text-[color:var(--primary)] data-[state=on]:bg-[color:var(--primary)]/10 data-[state=on]:border-[color:var(--primary)]/60",
          "data-[state=on]:ring-0"
        )}
        value="b"
        aria-label="Toggle bold"
        title="Bold (Ctrl+B)"
        onMouseDown={(e)=>{ e.preventDefault(); toggle('bold','b'); }}
      >
        <Bold className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        className={cn(
          "text-[color:var(--foreground)]/85 hover:text-[color:var(--primary)]",
          "data-[state=on]:text-[color:var(--primary)] data-[state=on]:bg-[color:var(--primary)]/10 data-[state=on]:border-[color:var(--primary)]/60",
          "data-[state=on]:ring-0"
        )}
        value="i"
        aria-label="Toggle italic"
        title="Italic (Ctrl+I)"
        onMouseDown={(e)=>{ e.preventDefault(); toggle('italic','i'); }}
      >
        <Italic className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        className={cn(
          "text-[color:var(--foreground)]/85 hover:text-[color:var(--primary)]",
          "data-[state=on]:text-[color:var(--primary)] data-[state=on]:bg-[color:var(--primary)]/10 data-[state=on]:border-[color:var(--primary)]/60",
          "data-[state=on]:ring-0"
        )}
        value="u"
        aria-label="Toggle underline"
        title="Underline (Ctrl+U)"
        onMouseDown={(e)=>{ e.preventDefault(); toggle('underline','u'); }}
      >
        <Underline className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

// Marquee tool removed (selection rectangle via cursor)

function ShapeOptions() {
  const { state, dispatch } = useLayerEditor();
  const current = state.marqueeMode === 'ellipse' ? 'ellipse' : 'rectangle';
  return (
    <Labeled label="Shape">
      <button
        className={cn("px-2 py-1 rounded", current==='rectangle' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> { dispatch({ type: 'set_tool', tool: 'shape' }); dispatch({ type: 'set_marquee_mode', mode: 'rectangle' }); }}
        title="Rectangle"
      >
        <Square className="size-4" />
      </button>
      <button
        className={cn("px-2 py-1 rounded", current==='ellipse' ? 'bg-white/10' : 'hover:bg-white/10')}
        onClick={()=> { dispatch({ type: 'set_tool', tool: 'shape' }); dispatch({ type: 'set_marquee_mode', mode: 'ellipse' }); }}
        title="Ellipse"
      >
        <Circle className="size-4" />
      </button>
      <button className="px-2 py-1 rounded opacity-50 cursor-not-allowed" disabled title="Polygon coming soon">
        <Triangle className="size-4" />
      </button>
    </Labeled>
  );
}

function ShapeStyleOptions() {
  const { state, dispatch } = useLayerEditor();
  const selectedIds = state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (state.activeLayerId ? [state.activeLayerId] : []);
  const selectedShapes = state.layers.filter((l): l is ShapeLayer => selectedIds.includes(l.id) && l.type === 'shape');
  const isShape = selectedShapes.length > 0;

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

  const fillHex = isShape ? hexFromColor((selectedShapes[0]).fill) : '#ffffff';
  const fillAlpha = ((): number => {
    try {
      const m = String((selectedShapes[0])?.fill || '').match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
      if (m) return Math.max(0, Math.min(1, Number(m[1] || 1)));
      return 1;
    } catch { return 1; }
  })();
  const strokeHex = isShape ? hexFromColor((selectedShapes[0]).stroke || '#ffffff') : '#ffffff';
  const strokeWidth = isShape ? Number((selectedShapes[0]).strokeWidth || 2) : 2;
  const radiusPct = isShape ? Number((selectedShapes[0]).radiusPct || 0) : 0;

  if (!isShape) {
    return null;
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
            for (const s of selectedShapes) {
              dispatch({ type: 'update_layer', id: s.id, patch: { fill: next } });
            }
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Opacity</div>
          <Slider className="w-28" min={0} max={100} step={1} value={[Math.round(fillAlpha*100)]}
            onValueChange={(v)=>{
              const a = Math.max(0, Math.min(100, Number(v?.[0] || 100))) / 100;
              const next = rgbaStringFrom(fillHex, a);
              for (const s of selectedShapes) {
                dispatch({ type: 'update_layer', id: s.id, patch: { fill: next } });
              }
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
            for (const s of selectedShapes) {
              dispatch({ type: 'update_layer', id: s.id, patch: { stroke: hex } });
            }
          }}
        />
        <div className="flex items-center gap-2 pl-1">
          <div className="text-[0.8rem] text-white/70">Width</div>
          <Slider className="w-28" min={0} max={40} step={1} value={[strokeWidth]}
            onValueChange={(v)=>{
              const w = Math.max(0, Math.min(200, Number(v?.[0] || 0)));
              for (const s of selectedShapes) {
                dispatch({ type: 'update_layer', id: s.id, patch: { strokeWidth: w } });
              }
            }}
          />
        </div>
      </Labeled>
      {String((selectedShapes[0]).shape) === 'rectangle' ? (
        <Labeled label="Radius">
          <Slider className="w-36" min={0} max={0.5} step={0.01} value={[radiusPct]}
            onValueChange={(v)=>{
              const rp = Math.max(0, Math.min(0.5, Number(v?.[0] || 0)));
              for (const s of selectedShapes) {
                dispatch({ type: 'update_layer', id: s.id, patch: { radiusPct: rp } });
              }
            }}
          />
        </Labeled>
      ) : null}
    </>
  );
}

function ImageOptions() {
  const { dispatch } = useLayerEditor();
  // removed unused meEmail state
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
    import("@/types/layer-editor").then((m)=>{
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
        const email = me?.email || null;
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
          } catch {
                // ignore
              } finally {
                if (!aborted) setCarLoading(false);
              }
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
          } catch {} finally {
            if (!aborted) setLibraryLoading(false);
          }
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
                    onClick={()=>{ import("@/types/layer-editor").then((m)=>{ dispatch({ type: 'add_layer', layer: m.createImageLayer(url || k, 50, 50), atTop: true }); }).catch(()=>{}); setOpen(false); }}
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
                  onClick={()=>{ import("@/types/layer-editor").then((m)=>{ dispatch({ type: 'add_layer', layer: m.createImageLayer(it.url || it.key, 50, 50), atTop: true }); }).catch(()=>{}); setOpen(false); }}
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

function AlignControls() {
  const layer = useActiveLayer();
  const { dispatch } = useLayerEditor();
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
  // Removed UI per request; retain component for layout consistency if needed later
  return null;
}

// Depth tilt bidirectional slider (rotateY)
function TiltOptions() {
  const { state, dispatch } = useLayerEditor();
  const selectedIds = state.selectedLayerIds && state.selectedLayerIds.length > 0 ? state.selectedLayerIds : (state.activeLayerId ? [state.activeLayerId] : []);
  const selectedLayers = state.layers.filter((l) => selectedIds.includes(l.id));
  if (selectedLayers.length === 0) return null;
  const single = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const tilt = Math.round(Number(single ? (single.tiltYDeg || 0) : 0));
  return (
    <Labeled label="Depth">
      <div className="flex items-center gap-2">
        <div className="text-[0.8rem] text-white/70 w-5 text-right">-</div>
        <div className="relative w-36">
          <Slider
            className="w-full"
            min={-45}
            max={45}
            step={1}
            value={[tilt]}
            onValueChange={(v)=>{
              const raw = Number(v?.[0] || 0);
              let next = Math.max(-45, Math.min(45, raw));
              // gentle snap to center
              if (Math.abs(next) <= 2) next = 0;
              for (const l of selectedLayers) {
                dispatch({ type: 'update_layer', id: l.id, patch: { tiltYDeg: next } });
              }
            }}
          />
          {/* Center tick indicating 0 */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 border-l border-white/40" />
        </div>
        <div className="text-[0.8rem] text-white/70 w-5">+</div>
        <Button size="sm" variant="outline" onClick={()=>{
          for (const l of selectedLayers) {
            dispatch({ type: 'update_layer', id: l.id, patch: { tiltYDeg: 0 } });
          }
        }}>Reset</Button>
      </div>
    </Labeled>
  );
}

// Fill tool removed

function EffectsDropdown() {
  const layer = useActiveLayer();
  const { dispatch } = useLayerEditor();
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


