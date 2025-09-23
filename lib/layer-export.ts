import type { Layer, TextLayer, ShapeLayer, ImageLayer } from '@/types/layer-editor';

async function loadImageSafe(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('img'));
      img.src = url;
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, cw: number, ch: number) {
  const widthPx = (layer.widthPct / 100) * cw;
  const heightPx = (layer.heightPct / 100) * ch;
  const xCenter = (layer.xPct / 100) * cw;
  const yCenter = (layer.yPct / 100) * ch;
  const rotationRad = (layer.rotationDeg * Math.PI) / 180;
  const fontSize = Math.max(8, Math.round(heightPx * 0.8));

  ctx.save();
  try {
    ctx.translate(xCenter, yCenter);
    if (rotationRad) ctx.rotate(rotationRad);
    ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
    ctx.textBaseline = 'middle';
    // We'll position text manually for alignment; keep canvas textAlign default
    ctx.font = `${layer.fontWeight || 700} ${fontSize}px ${layer.fontFamily || 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'}`;
    // Draw plain text only for export. If rich HTML exists, use its textContent fallback.
    const plain = ((): string => {
      try {
        if (typeof (layer as unknown as { html?: string }).html === 'string' && (layer as unknown as { html?: string }).html) {
          const el = document.createElement('div');
          el.innerHTML = String((layer as unknown as { html?: string }).html);
          const txt = (el.textContent || '').replace(/\r\n|\r/g, '\n');
          return txt || String(layer.text || '');
        }
      } catch {}
      return String(layer.text || '');
    })();
    const lines = plain.split(/\n+/g);
    const lineHeight = fontSize * (layer.lineHeightEm || 1.1);
    const totalH = (lines.length - 1) * lineHeight;
    const letterSpacingPx = (layer.letterSpacingEm || 0) * fontSize;

    const drawOnce = () => {
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const chars = Array.from(ln);
        let lineW = 0;
        for (const ch of chars) lineW += ctx.measureText(ch).width;
        if (chars.length > 1) lineW += letterSpacingPx * (chars.length - 1);
        const align: 'left'|'center'|'right'|'justify' = (layer as unknown as TextLayer).textAlign || 'center';
        let cx: number;
        if (align === 'left' || align === 'justify') {
          cx = -widthPx / 2;
        } else if (align === 'right') {
          cx = widthPx / 2 - lineW;
        } else {
          cx = -lineW / 2; // center
        }
        const y = i * lineHeight - totalH / 2;
        // Compute justify spacing (between words) for non-last line when requested
        let justifyExtra = 0;
        if (((layer as unknown as TextLayer).textAlign === 'justify') && i < lines.length - 1) {
          const gaps = (ln.match(/\s+/g) || []).length;
          const available = Math.max(0, widthPx - lineW);
          justifyExtra = gaps > 0 ? available / gaps : 0;
        }
        for (let idx = 0; idx < chars.length; idx++) {
          const ch = chars[idx];
          ctx.fillText(ch, cx, y);
          cx += ctx.measureText(ch).width + (idx < chars.length - 1 ? letterSpacingPx : 0);
          if (justifyExtra > 0 && ch === ' ') {
            cx += justifyExtra;
          }
        }
      }
    };

    // Glow first
    if (layer.effects?.glow?.enabled) {
      ctx.save();
      ctx.shadowColor = layer.effects.glow.color || '#ffffff';
      ctx.shadowBlur = ((layer.effects.glow.blur || 0) + ((layer.effects.glow as unknown as { size?: number }).size || 0)) || 0;
      ctx.shadowOffsetX = layer.effects.glow.offsetX || 0;
      ctx.shadowOffsetY = layer.effects.glow.offsetY || 0;
      ctx.fillStyle = layer.color || '#ffffff';
      drawOnce();
      ctx.restore();
    }
    // Shadow second
    if (layer.effects?.shadow?.enabled) {
      ctx.save();
      ctx.shadowColor = layer.effects.shadow.color || '#000000';
      ctx.shadowBlur = ((layer.effects.shadow.blur || 0) + ((layer.effects.shadow as unknown as { size?: number }).size || 0)) || 0;
      ctx.shadowOffsetX = layer.effects.shadow.offsetX || 0;
      ctx.shadowOffsetY = layer.effects.shadow.offsetY || 8;
      ctx.fillStyle = layer.color || '#ffffff';
      drawOnce();
      ctx.restore();
    }
    // Actual text
    ctx.fillStyle = layer.color || '#ffffff';
    drawOnce();
  } finally {
    ctx.restore();
  }
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer, cw: number, ch: number) {
  const widthPx = (layer.widthPct / 100) * cw;
  const heightPx = (layer.heightPct / 100) * ch;
  const xCenter = (layer.xPct / 100) * cw;
  const yCenter = (layer.yPct / 100) * ch;
  const rotationRad = (layer.rotationDeg * Math.PI) / 180;

  ctx.save();
  try {
    ctx.translate(xCenter, yCenter);
    if (rotationRad) ctx.rotate(rotationRad);
    ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
    const w = widthPx;
    const h = heightPx;
    const x = -w / 2;
    const y = -h / 2;
    ctx.fillStyle = layer.fill || 'rgba(255,255,255,0.2)';
    if (layer.stroke && (layer.strokeWidth || 0) > 0) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth || 2;
    }
    if (layer.shape === 'rectangle') {
      const r = Math.min(w, h) * (layer.radiusPct || 0);
      if (r > 0) {
        const rr = r;
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
        ctx.fill();
        if (layer.stroke) ctx.stroke();
      } else {
        ctx.fillRect(x, y, w, h);
        if (layer.stroke) ctx.strokeRect(x, y, w, h);
      }
    } else if (layer.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      if (layer.stroke) ctx.stroke();
    } else if (layer.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      if (layer.stroke) ctx.stroke();
    } else if (layer.shape === 'line') {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.strokeStyle = layer.stroke || '#ffffff';
      ctx.lineWidth = layer.strokeWidth || 4;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, cw: number, ch: number, image: HTMLImageElement) {
  const widthPx = (layer.widthPct / 100) * cw;
  const heightPx = (layer.heightPct / 100) * ch;
  const xCenter = (layer.xPct / 100) * cw;
  const yCenter = (layer.yPct / 100) * ch;
  const rotationRad = (layer.rotationDeg * Math.PI) / 180;
  ctx.save();
  try {
    ctx.translate(xCenter, yCenter);
    if (rotationRad) ctx.rotate(rotationRad);
    ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
    ctx.drawImage(image, -widthPx / 2, -heightPx / 2, widthPx, heightPx);
  } finally {
    ctx.restore();
  }
}

export async function composeLayersToBlob({
  backgroundUrl,
  carMaskUrl,
  layers,
}: {
  backgroundUrl: string;
  carMaskUrl?: string | null;
  layers: Layer[];
}): Promise<Blob | null> {
  try {
    const bgImg = await loadImageSafe(backgroundUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    canvas.width = bgImg.naturalWidth || bgImg.width || 0;
    canvas.height = bgImg.naturalHeight || bgImg.height || 0;
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    for (const layer of layers.filter(l => !l.aboveMask)) {
      if (layer.hidden) continue;
      if (layer.type === 'text') drawTextLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'shape') drawShapeLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'image') {
        try { const img = await loadImageSafe((layer as ImageLayer).src); drawImageLayer(ctx, layer, canvas.width, canvas.height, img); } catch {}
      }
    }

    if (carMaskUrl) {
      try { const fgImg = await loadImageSafe(carMaskUrl); ctx.drawImage(fgImg, 0, 0, canvas.width, canvas.height); } catch {}
    }

    for (const layer of layers.filter(l => !!l.aboveMask)) {
      if (layer.hidden) continue;
      if (layer.type === 'text') drawTextLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'shape') drawShapeLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'image') {
        try { const img = await loadImageSafe((layer as ImageLayer).src); drawImageLayer(ctx, layer, canvas.width, canvas.height, img); } catch {}
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob;
  } catch {
    return null;
  }
}


