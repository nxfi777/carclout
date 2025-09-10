'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type FixedAspectCropperProps = {
  open: boolean;
  imageUrl?: string | null;
  aspectRatio: number; // width / height
  title?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
};

type Rect = { x: number; y: number; width: number; height: number };

export function FixedAspectCropper({ open, imageUrl, aspectRatio, title = 'Crop image', onCancel, onCropped }: FixedAspectCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [placeholderSize, setPlaceholderSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Reset state when a new image is provided or dialog opens
  useEffect(() => {
    setImgDims(null);
    setCrop(null);
  }, [open, imageUrl]);

  // Ensure the image is same-origin for canvas by streaming it and creating an object URL
  useEffect(() => {
    let aborted = false;
    let objectUrl: string | null = null;
    async function load() {
      try {
        if (!open || !imageUrl) { setLocalUrl(null); return; }
        if (typeof imageUrl === 'string' && (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:'))) {
          setLocalUrl(imageUrl);
          return;
        }
        // Try to fetch and convert to an object URL for safe canvas usage.
        // If this fails (e.g., CORS), fall back to using the raw URL so the preview still renders.
        const res = await fetch(imageUrl, { cache: 'no-store' }).catch(() => null);
        if (!res || !res.ok) {
          if (!aborted) setLocalUrl(String(imageUrl));
          return;
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!aborted) setLocalUrl(objectUrl);
      } catch {
        // Fallback to direct URL so at least the preview shows
        if (!aborted && imageUrl) setLocalUrl(String(imageUrl));
      }
    }
    load();
    return () => {
      aborted = true;
      try { if (objectUrl) URL.revokeObjectURL(objectUrl); } catch {}
    };
  }, [open, imageUrl]);

  const onImageLoaded = useCallback(() => {
    try {
      const el = imgRef.current;
      if (!el) return;
      const w = el.naturalWidth || el.width;
      const h = el.naturalHeight || el.height;
      if (!w || !h) return;
      try { console.log('[Cropper] image loaded', { w, h, url: imageUrl }); } catch {}
      setImgDims({ w, h });
      // Determine initial crop that fits within image with given aspect ratio
      const targetWBasedOnH = h * aspectRatio;
      const targetHBasedOnW = w / aspectRatio;
      let cw: number;
      let ch: number;
      if (targetWBasedOnH <= w) {
        cw = Math.round(targetWBasedOnH);
        ch = Math.round(h);
      } else {
        cw = Math.round(w);
        ch = Math.round(targetHBasedOnW);
      }
      const cx = Math.round((w - cw) / 2);
      const cy = Math.round((h - ch) / 2);
      setCrop({ x: cx, y: cy, width: cw, height: ch });
    } catch {}
  }, [imageUrl, aspectRatio]);

  // If the image is already cached/complete, trigger layout immediately
  useEffect(()=>{
    if (!open || !imageUrl) return;
    const el = imgRef.current;
    if (el && (el.complete || (el.naturalWidth && el.naturalHeight))) {
      onImageLoaded();
    }
  }, [open, imageUrl, onImageLoaded]);

  // Compute canvas size responsive but proportional to image
  useEffect(() => {
    if (!imgDims) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const maxW = isMobile ? 360 : 560;
    const maxH = isMobile ? 260 : 420;
    const ar = imgDims.w / imgDims.h;
    let cw = maxW;
    let ch = Math.round(maxW / ar);
    if (ch > maxH) { ch = maxH; cw = Math.round(maxH * ar); }
    setCanvasSize({ width: cw, height: ch });
  }, [imgDims]);

  // Compute placeholder box using template aspect ratio so the loading state matches the final size
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const maxW = isMobile ? 360 : 560;
    const maxH = isMobile ? 260 : 420;
    const ar = typeof aspectRatio === 'number' && isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    let cw = maxW;
    let ch = Math.round(maxW / ar);
    if (ch > maxH) { ch = maxH; cw = Math.round(maxH * ar); }
    setPlaceholderSize({ width: cw, height: ch });
  }, [aspectRatio, open]);

  // Draw image + crop overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgDims || !crop) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    // Draw base image scaled to canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Draw crop overlay
    const scaleX = canvas.width / imgDims.w;
    const scaleY = canvas.height / imgDims.h;
    const rx = crop.x * scaleX;
    const ry = crop.y * scaleY;
    const rw = crop.width * scaleX;
    const rh = crop.height * scaleY;
    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Clear crop area and redraw underlying image region for clarity
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(rx, ry, rw, rh);
  }, [crop, canvasSize, imgDims]);

  const onPointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!crop || !canvasRef.current || !imgDims) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    // Convert to image coords
    const toImgX = (x * imgDims.w) / canvas.width;
    const toImgY = (y * imgDims.h) / canvas.height;
    // If inside crop rect, start dragging
    if (toImgX >= crop.x && toImgX <= crop.x + crop.width && toImgY >= crop.y && toImgY <= crop.y + crop.height) {
      setDragging(true);
      dragOffsetRef.current = { dx: toImgX - crop.x, dy: toImgY - crop.y };
    }
  };

  const onPointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragging || !crop || !canvasRef.current || !imgDims) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    // Convert to image coords
    let nx = (x * imgDims.w) / canvas.width - dragOffsetRef.current.dx;
    let ny = (y * imgDims.h) / canvas.height - dragOffsetRef.current.dy;
    // Clamp to image bounds
    nx = Math.max(0, Math.min(nx, imgDims.w - crop.width));
    ny = Math.max(0, Math.min(ny, imgDims.h - crop.height));
    setCrop({ ...crop, x: Math.round(nx), y: Math.round(ny) });
  };

  const onPointerUp = () => { setDragging(false); };

  // Zoom: adjust crop size while keeping aspect and center
  const [zoom, setZoom] = useState<number>(1); // 1 to 3
  useEffect(() => { setZoom(1); }, [open, imageUrl]);
  const onZoomChange = (val: number) => {
    if (!imgDims) return;
    setZoom(val);
    // Compute max crop size based on image and aspect
    const maxWFromH = imgDims.h * aspectRatio;
    const maxHFromW = imgDims.w / aspectRatio;
    let baseW: number; let baseH: number;
    if (maxWFromH <= imgDims.w) { baseW = maxWFromH; baseH = imgDims.h; } else { baseW = imgDims.w; baseH = maxHFromW; }
    // zoom=1 => base size; zoom=3 => 1/3 of base size
    const scale = 1 / val;
    const cw = Math.max(32, Math.round(baseW * scale));
    const ch = Math.max(32, Math.round(baseH * scale));
    // Keep centered if possible
    let cx = crop ? Math.round(crop.x + (crop.width - cw) / 2) : Math.round((imgDims.w - cw) / 2);
    let cy = crop ? Math.round(crop.y + (crop.height - ch) / 2) : Math.round((imgDims.h - ch) / 2);
    // Clamp
    cx = Math.max(0, Math.min(cx, imgDims.w - cw));
    cy = Math.max(0, Math.min(cy, imgDims.h - ch));
    setCrop({ x: cx, y: cy, width: cw, height: ch });
  };

  // Perform cropping on original image using canvas
  async function doCrop() {
    if (!imgRef.current || !crop) return;
    const img = imgRef.current;
    const out = document.createElement('canvas');
    out.width = crop.width;
    out.height = crop.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      img,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, crop.width, crop.height
    );
    return new Promise<void>((resolve) => {
      out.toBlob((blob) => {
        if (blob) onCropped(blob);
        resolve();
      }, 'image/jpeg', 0.92);
    });
  }

  const ready = !!(imgDims && crop);

  return (
    <Dialog open={open} onOpenChange={(v)=> { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-white/70">Adjust the crop to match the required aspect ratio before continuing.</div>
          <div className="w-full grid place-items-center">
            {/* Hidden loader image for sizing; we draw onto canvas after load */}
            {localUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={localUrl}
                alt="to crop"
                className="hidden"
                onLoad={onImageLoaded}
                onError={() => { try{ console.warn('[Cropper] image failed to load', imageUrl); } catch {} }}
              />
            ) : null}
            {!ready ? (
              <div className="rounded border border-[color:var(--border)] grid place-items-center" style={{ width: placeholderSize.width, height: placeholderSize.height }}>
                <svg className="animate-spin h-6 w-6 text-white/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : null}
            {ready ? (
              <canvas
                ref={canvasRef}
                className="rounded border border-[color:var(--border)]"
                style={{ maxWidth: '100%', height: 'auto', touchAction: 'none' }}
                onMouseDown={(e)=> onPointerDown(e)}
                onMouseMove={(e)=> onPointerMove(e)}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerUp}
                onTouchStart={(e)=> onPointerDown(e)}
                onTouchMove={(e)=> onPointerMove(e)}
                onTouchEnd={onPointerUp}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-white/60">Zoom</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e)=> onZoomChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={doCrop}>Crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FixedAspectCropper;


