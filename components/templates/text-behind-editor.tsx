"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplet, Pipette, AlignCenterHorizontal, AlignCenterVertical, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import carLoadAnimation from "@/public/carload.json";
import { cn } from "@/lib/utils";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type RembgConfig = {
  enabled?: boolean;
  model?: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait';
  operating_resolution?: '1024x1024' | '2048x2048';
  output_format?: 'png' | 'webp';
  refine_foreground?: boolean;
  output_mask?: boolean;
} | null | undefined;

function ValueSlider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const values = useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  const formatSliderValue = useCallback((val: number) => {
    const decimals = step && step < 1 ? 2 : 0;
    return String(Number(val.toFixed(decimals)));
  }, [step]);

  const [show, setShow] = useState(false);
  const percent = useMemo(() => {
    const v = Number(values?.[0] ?? min);
    if (!isFinite(v) || max === min) return 0;
    const p = ((v - min) / (max - min)) * 100;
    return Math.min(100, Math.max(0, p));
  }, [values, min, max]);

  return (
    <div className="relative w-full">
      {show ? (
        <div
          className="pointer-events-none absolute -top-6 z-[9999] -translate-x-1/2 select-none rounded border border-[color:var(--border)] bg-[color:var(--popover)] px-2 py-0.5 text-[0.75rem] leading-none text-[color:var(--popover-foreground)] shadow"
          style={{ left: `calc(${percent}% )` }}
        >
          {formatSliderValue(Number(values?.[0] ?? 0))}
        </div>
      ) : null}
      <SliderPrimitive.Root
        data-slot="slider"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        className={cn(
          "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
          className
        )}
        onPointerLeave={() => setShow(false)}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
          )}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            onPointerEnter={() => setShow(true)}
            onFocus={() => setShow(true)}
            onPointerLeave={() => setShow(false)}
            onBlur={() => setShow(false)}
            onPointerDown={() => {
              setShow(true);
              const handleUp = () => setShow(false);
              window.addEventListener("pointerup", handleUp, { once: true });
            }}
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}

export default function TextBehindEditor({ bgKey, rembg, defaultHeadline, onSave, saveLabel, aspectRatio }: { bgKey: string; rembg?: RembgConfig; defaultHeadline?: string; onClose?: ()=>void; onSave?: (blob: Blob) => Promise<void> | void; saveLabel?: string; aspectRatio?: number; }){
  const [busy, setBusy] = useState(true);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [fgUrl, setFgUrl] = useState<string | null>(null);
  
  const [text, setText] = useState<string>(String(defaultHeadline || '').toUpperCase());
  const [fontSize, setFontSize] = useState<number>(64);
  const [fontWeight, setFontWeight] = useState<number>(800);
  const [fontFamily, setFontFamily] = useState<string>('system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  const [letterSpacing, setLetterSpacing] = useState<number>(0);
  const [squish, setSquish] = useState<number>(1);
  const [color, setColor] = useState<string>("#ffffff");
  const [x, setX] = useState<number>(50);
  const [y, setY] = useState<number>(80);
  const [glow, setGlow] = useState<boolean>(true);
  const [glowColor, setGlowColor] = useState<string>("#ffffff");
  const [glowBlur, setGlowBlur] = useState<number>(18);
  const [shadow, setShadow] = useState<boolean>(true);
  const [shadowColor, setShadowColor] = useState<string>("#000000");
  const [shadowBlur, setShadowBlur] = useState<number>(10);
  const [shadowX, setShadowX] = useState<number>(0);
  const [shadowY, setShadowY] = useState<number>(8);
  const [pickMode, setPickMode] = useState<boolean>(false);
  const [pickTarget, setPickTarget] = useState<'text'|'glow'|'shadow'|null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  void aspectRatio;

  useEffect(()=>{
    let cancelled = false;
    let createdFgObjUrl: string | null = null;
    (async()=>{
      try {
        setBusy(true);
        // Resolve background URL
        const url = `/api/storage/file?key=${encodeURIComponent(bgKey)}`;
        if (cancelled) return; setBgUrl(url);
        // Call rembg
        const input = {
          r2_key: bgKey,
          model: ((): 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)' | 'Matting' | 'Portrait' => {
            const allowed = new Set(['General Use (Light)','General Use (Light 2K)','General Use (Heavy)','Matting','Portrait'] as const);
            return rembg && rembg.model && allowed.has(rembg.model) ? rembg.model : 'General Use (Heavy)';
          })(),
          operating_resolution: ((): '1024x1024' | '2048x2048' => {
            const allowed = new Set(['1024x1024','2048x2048'] as const);
            return rembg && rembg.operating_resolution && allowed.has(rembg.operating_resolution) ? rembg.operating_resolution : '2048x2048';
          })(),
          output_format: ((): 'png' | 'webp' => (rembg?.output_format === 'webp' ? 'webp' : 'png'))(),
          refine_foreground: typeof rembg?.refine_foreground === 'boolean' ? !!rembg?.refine_foreground : true,
          output_mask: !!rembg?.output_mask,
        };
        const res = await fetch('/api/tools/rembg', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(input) }).then(r=>r.json()).catch(()=>({}));
        const fg = res?.image?.url || null; const _mk = res?.mask_image?.url || null;
        if (!fg) throw new Error('fg');
        // Fetch foreground to blob URL to avoid cross-origin taint
        let localFg: string | null = null;
        try { const b = await fetch(fg, { cache: 'no-store' }).then(r=>r.blob()); localFg = URL.createObjectURL(b); createdFgObjUrl = localFg; } catch {}
        if (cancelled) return;
        setFgUrl(localFg || fg);
      } catch {
      } finally { if (!cancelled) { setBusy(false); } }
    })();
    return ()=>{ cancelled = true; try { if (createdFgObjUrl) URL.revokeObjectURL(createdFgObjUrl); } catch {} };
  }, [bgKey, rembg]);

  function drawHeadline(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    px: number,
    py: number,
    textValue: string,
    colorValue: string,
    sizePx: number,
    weight: number,
    fontFamilyValue: string,
    letterSpacingEm: number,
    squishFactor: number
  ){
    ctx.fillStyle = colorValue;
    ctx.textBaseline = 'middle';
    ctx.font = `${weight} ${sizePx}px ${fontFamilyValue}`;
    const xCenter = (px / 100) * cw;
    const yCenter = (py / 100) * ch;
    const lines = String(textValue || '').split(/\n+/g);
    const lineHeight = sizePx * 1.1;
    const totalH = (lines.length - 1) * lineHeight;
    const letterSpacingPx = letterSpacingEm * sizePx;

    ctx.save();
    try {
      // Apply horizontal squish
      const s = Math.max(0.05, squishFactor || 1);
      ctx.scale(s, 1);
      lines.forEach((ln, i)=>{
        const yPos = yCenter + (i*lineHeight) - (totalH/2);
        // Measure total width with letter spacing
        const chars = Array.from(ln);
        let lineW = 0;
        for (const ch of chars) { lineW += ctx.measureText(ch).width; }
        if (chars.length > 1) lineW += letterSpacingPx * (chars.length - 1);
        // Compute starting X (convert target center into unscaled space)
        const xStart = (xCenter / s) - (lineW / 2);
        let cursorX = xStart;
        ctx.textAlign = 'left';
        for (let idx = 0; idx < chars.length; idx++){
          const chStr = chars[idx];
          ctx.fillText(chStr, cursorX, yPos);
          cursorX += ctx.measureText(chStr).width + (idx < chars.length - 1 ? letterSpacingPx : 0);
        }
      });
    } finally {
      ctx.restore();
    }
  }

  async function loadImageSafe(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject)=>{
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = ()=> resolve(img);
        img.onerror = ()=> reject(new Error('img'));
        img.src = url;
      } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
    });
  }

  async function composeToBlob(): Promise<Blob | null> {
    try {
      const bgImg = await loadImageSafe(bgUrl!);
      const fgImg = await loadImageSafe(fgUrl!);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no ctx');
      const dimBg = bgImg as HTMLImageElement & { width?: number; height?: number };
      canvas.width = bgImg.naturalWidth || dimBg.width || 0;
      canvas.height = bgImg.naturalHeight || dimBg.height || 0;
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      if (glow) {
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        drawHeadline(ctx, canvas.width, canvas.height, x, y, text, color, fontSize, fontWeight, fontFamily, letterSpacing, squish);
        ctx.restore();
      }
      if (shadow) {
        ctx.save();
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = shadowX;
        ctx.shadowOffsetY = shadowY;
        drawHeadline(ctx, canvas.width, canvas.height, x, y, text, color, fontSize, fontWeight, fontFamily, letterSpacing, squish);
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      drawHeadline(ctx, canvas.width, canvas.height, x, y, text, color, fontSize, fontWeight, fontFamily, letterSpacing, squish);
      ctx.restore();
      ctx.drawImage(fgImg, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve)=> canvas.toBlob(resolve, 'image/png'));
      return blob;
    } catch {}
    return null;
  }

  async function downloadComposite(){
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await composeToBlob();
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `design-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); document.body.removeChild(a);}catch{} }, 1000);
    } catch {}
    finally { setDownloading(false); }
  }

  async function saveComposite(){
    if (!onSave) return;
    if (saving) return;
    setSaving(true);
    try {
      const blob = await composeToBlob();
      if (!blob) return;
      await onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  if (busy) {
    return (
      <div className="p-10 min-h-[16rem] grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Lottie animationData={carLoadAnimation as unknown as object} loop style={{ width: 280, height: 170 }} />
          <div className="text-sm text-white/80">Cutting out your car — this may take a moment</div>
        </div>
      </div>
    );
  }
  if (!bgUrl || !fgUrl) {
    return (
      <div className="p-6 text-sm text-white/70">Failed to prepare editor. Please try again.</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col xl:flex-row items-start gap-2">
        <div className="min-w-0 flex-shrink-0 w-full xl:w-auto">
          <div
            ref={containerRef}
            className={`relative w-full max-w-[30rem] overflow-hidden rounded border border-[color:var(--border)] select-none ${pickMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
            onMouseDown={(e)=>{
              try {
                if (pickMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Sample color under cursor using offscreen canvas
                  const cont = containerRef.current; const imgEl = bgImgRef.current;
                  if (!cont || !imgEl) return;
                  const rect = imgEl.getBoundingClientRect();
                  const cx = e.clientX - rect.left;
                  const cy = e.clientY - rect.top;
                  const scaleW = rect.width;
                  const scaleH = rect.height;
                  const cvs = sampleCanvasRef.current || document.createElement('canvas');
                  sampleCanvasRef.current = cvs;
                  const ctx = cvs.getContext('2d'); if (!ctx) return;
                  cvs.width = Math.max(1, Math.round(scaleW));
                  cvs.height = Math.max(1, Math.round(scaleH));
                  // Draw background and foreground at display size
                  const draw = async()=>{
                    const bgImg = await loadImageSafe(bgUrl!);
                    const fgImg = await loadImageSafe(fgUrl!);
                    ctx.clearRect(0,0,cvs.width,cvs.height);
                    ctx.drawImage(bgImg, 0, 0, cvs.width, cvs.height);
                    ctx.drawImage(fgImg, 0, 0, cvs.width, cvs.height);
                    const pxData = ctx.getImageData(Math.min(cvs.width-1, Math.max(0, Math.round(cx))), Math.min(cvs.height-1, Math.max(0, Math.round(cy))), 1, 1).data;
                    const hex = `#${[pxData[0],pxData[1],pxData[2]].map(n=> n.toString(16).padStart(2,'0')).join('')}`.toUpperCase();
                    if (pickTarget === 'glow') setGlowColor(hex); else if (pickTarget === 'shadow') setShadowColor(hex); else setColor(hex);
                    setPickMode(false); setPickTarget(null);
                  };
                  draw();
                  return;
                }
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const startX = e.clientX; const startY = e.clientY;
                const startPX = x; const startPY = y;
                const move = (ev: MouseEvent)=>{
                  const dx = ev.clientX - startX; const dy = ev.clientY - startY;
                  const w = rect.width; const h = rect.height;
                  const nx = Math.min(100, Math.max(0, startPX + (dx / w) * 100));
                  const ny = Math.min(100, Math.max(0, startPY + (dy / h) * 100));
                  setX(nx); setY(ny);
                };
                const onMoveListener = (ev2: Event) => move(ev2 as unknown as MouseEvent);
                const onUpListener = () => up();
                const up = ()=>{ try{ window.removeEventListener('mousemove', onMoveListener); window.removeEventListener('mouseup', onUpListener);}catch{} };
                window.addEventListener('mousemove', onMoveListener);
                window.addEventListener('mouseup', onUpListener);
              } catch {}
            }}
          >
            {/* background */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={bgImgRef} src={bgUrl} alt="bg" className="w-full h-auto block select-none max-h-[56vh] object-contain" />
            {/* text layer */}
            <div className="absolute left-0 top-0 w-full h-full select-none">
              <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scaleX(${squish})`, transformOrigin: 'center', color, fontSize: `${fontSize}px`, fontWeight: fontWeight, fontFamily, lineHeight: 1.1, letterSpacing: `${letterSpacing}em`, textShadow: [glow ? `0 0 ${glowBlur}px ${glowColor}` : '', shadow ? `${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowColor}` : ''].filter(Boolean).join(', '), whiteSpace: 'pre-wrap', textAlign: 'center', userSelect: 'none' }}>{text}</div>
            </div>
            {/* foreground */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fgUrl} alt="fg" className="absolute inset-0 w-full h-full select-none pointer-events-none max-h-[56vh] object-contain" />
          </div>
        </div>
        <div className="space-y-2 min-w-[18rem] xl:pl-2 flex-1">
          <div className="space-y-1">
            <div className="text-xs text-white/70">Text</div>
            <textarea rows={3} value={text} onChange={(e)=> setText(e.target.value.toUpperCase())} placeholder="Type your headline" className="w-full rounded bg-white/5 border border-[color:var(--border)] p-2 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-white/70">Font</div>
              <Select value={fontFamily} onValueChange={(v)=> setFontFamily(v)}>
                <SelectTrigger className="h-9 min-w-[8rem]"><SelectValue placeholder="Font" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'}>System UI</SelectItem>
                  <SelectItem value={'Arial, Helvetica, sans-serif'}>Arial</SelectItem>
                  <SelectItem value={'Helvetica, Arial, sans-serif'}>Helvetica</SelectItem>
                  <SelectItem value={'Georgia, serif'}>Georgia</SelectItem>
                  <SelectItem value={'"Times New Roman", Times, serif'}>Times New Roman</SelectItem>
                  <SelectItem value={'"Courier New", Courier, monospace'}>Courier New</SelectItem>
                  <SelectItem value={'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'}>Impact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-white/70">Weight</div>
              <Select value={String(fontWeight)} onValueChange={(v)=> setFontWeight(parseInt(v))}>
                <SelectTrigger className="h-9 min-w-[8rem]"><SelectValue placeholder="Weight" /></SelectTrigger>
                <SelectContent>
                  {[300,400,500,600,700,800,900].map((w)=> (
                    <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-white/70">Font size</div>
            <ValueSlider min={18} max={200} step={1} value={[fontSize]} onValueChange={(vals: number[])=> setFontSize(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-white/70">Letter spacing (em)</div>
              <ValueSlider min={-0.1} max={1} step={0.01} value={[letterSpacing]} onValueChange={(vals: number[])=> setLetterSpacing(parseFloat(String(vals?.[0] ?? 0)))} className="w-full" />
            </div>
            <div className="space-y-1 col-span-2">
              <div className="text-xs text-white/70">Width scale (%)</div>
              <ValueSlider min={50} max={150} step={1} value={[Math.round(squish * 100)]} onValueChange={(vals: number[])=> setSquish(parseFloat(String(vals?.[0] ?? 100)) / 100)} className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-white/70">Position Y (%)</div>
              <ValueSlider min={0} max={100} step={1} value={[y]} onValueChange={(vals: number[])=> setY(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-white/70">Position X (%)</div>
              <ValueSlider min={0} max={100} step={1} value={[x]} onValueChange={(vals: number[])=> setX(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
            </div>
            <div className="space-y-1 col-span-2">
              <div className="text-xs text-white/70">Align</div>
              <div className="flex items-center gap-2">
                <button className={`px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15`} onClick={()=> setX(50)} title="Center horizontally">
                  <AlignCenterHorizontal className="h-4 w-4" />
                </button>
                <button className={`px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15`} onClick={()=> setY(50)} title="Center vertically">
                  <AlignCenterVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1 col-span-2">
              <div className="text-xs text-white/70">Text color</div>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e)=> setColor(e.target.value)} className="h-10 w-16 rounded bg-transparent border border-[color:var(--border)]" />
                <button className={`px-2 py-1 text-xs rounded ${pickMode && pickTarget==='text' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'}`} onClick={()=>{ setPickTarget('text'); setPickMode((v)=> !v); }} title="Pick text color from image">{pickMode && pickTarget==='text' ? <Droplet /> : <Pipette />}</button>
              </div>
            </div>
          </div>
          <div className="rounded border border-[color:var(--border)] p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/70">Glow</div>
              <input type="checkbox" checked={glow} onChange={(e)=> setGlow(!!e.target.checked)} />
            </div>
            {glow ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Glow color</div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={glowColor} onChange={(e)=> setGlowColor(e.target.value)} className="h-10 w-16 rounded bg-transparent border border-[color:var(--border)]" />
                    <button className={`px-2 py-1 text-xs rounded ${pickMode && pickTarget==='glow' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'}`} onClick={()=>{ setPickTarget('glow'); setPickMode((v)=> !v); }} title="Pick glow color from image">{pickMode && pickTarget==='glow' ? <Droplet /> : <Pipette />}</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Glow blur</div>
                  <ValueSlider min={0} max={60} step={1} value={[glowBlur]} onValueChange={(vals: number[])=> setGlowBlur(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
                </div>
              </div>
            ) : null}
          </div>
          <div className="rounded border border-[color:var(--border)] p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/70">Drop shadow</div>
              <input type="checkbox" checked={shadow} onChange={(e)=> setShadow(!!e.target.checked)} />
            </div>
            {shadow ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Shadow color</div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={shadowColor} onChange={(e)=> setShadowColor(e.target.value)} className="h-10 w-16 rounded bg-transparent border border-[color:var(--border)]" />
                    <button className={`px-2 py-1 text-xs rounded ${pickMode && pickTarget==='shadow' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'}`} onClick={()=>{ setPickTarget('shadow'); setPickMode((v)=> !v); }} title="Pick shadow color from image">{pickMode && pickTarget==='shadow' ? <Droplet /> : <Pipette />}</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Blur</div>
                  <ValueSlider min={0} max={40} step={1} value={[shadowBlur]} onValueChange={(vals: number[])=> setShadowBlur(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Offset X</div>
                  <ValueSlider min={-60} max={60} step={1} value={[shadowX]} onValueChange={(vals: number[])=> setShadowX(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-white/70">Offset Y</div>
                  <ValueSlider min={-60} max={60} step={1} value={[shadowY]} onValueChange={(vals: number[])=> setShadowY(parseInt(String(vals?.[0] ?? 0)))} className="w-full" />
                </div>
              </div>
            ) : null}
          </div>
          <div className="pt-2 flex items-center justify-end gap-2">
            {onSave ? (
              <Button disabled={saving} onClick={saveComposite}>{saveLabel || 'Save'}</Button>
            ) : null}
            <Button onClick={downloadComposite} disabled={downloading}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : null}
              {downloading ? 'Downloading…' : 'Download'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


