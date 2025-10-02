import type { Layer, TextLayer, ShapeLayer, ImageLayer } from '@/types/layer-editor';

async function loadImageSafe(url: string): Promise<HTMLImageElement> {
  try {
    console.log('[loadImageSafe] Fetching image as blob:', url.substring(0, 100));
    
    // Fetch as blob to avoid CORS tainting the canvas
    // All URLs should now be same-origin proxy URLs through /api/storage/file
    const response = await fetch(url, { 
      cache: 'no-store',
      credentials: 'include' // Include cookies for authentication
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText} for URL: ${url.substring(0, 100)}`);
    }
    
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    // Load the image from the object URL
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        console.log('[loadImageSafe] Image loaded successfully from blob');
        // Clean up the object URL after a delay to ensure image is fully processed
        setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image from blob'));
      };
      img.src = objectUrl;
    });
  } catch (e) {
    console.error('[loadImageSafe] Exception loading image:', e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, cw: number, ch: number) {
  const widthPx = (layer.widthPct / 100) * cw;
  const heightPx = (layer.heightPct / 100) * ch;
  const xCenter = (layer.xPct / 100) * cw;
  const yCenter = (layer.yPct / 100) * ch;
  const rotationRad = (layer.rotationDeg * Math.PI) / 180;
  // Use fontSizeEm if available (more accurate), otherwise calculate from heightPct
  const fontSize = layer.fontSizeEm ? Math.max(8, Math.round(layer.fontSizeEm * 16)) : Math.max(8, Math.round(heightPx * 0.8));

  // Debug logging for text transforms
  const tiltXDeg = layer.tiltXDeg || 0;
  const tiltYDeg = layer.tiltYDeg || 0;
  
  // Extract alpha from color (supports rgba format)
  let globalAlpha = 1;
  try {
    const colorMatch = (layer.color || '').match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/i);
    if (colorMatch && colorMatch[1] !== undefined) {
      globalAlpha = Math.max(0, Math.min(1, parseFloat(colorMatch[1])));
    }
  } catch {}
  
  console.log('[drawTextLayer] Drawing text with transforms:', {
    text: layer.text?.substring(0, 20),
    position: { xCenter, yCenter },
    fontSize,
    fontSizeEm: layer.fontSizeEm,
    heightPx,
    rotation: layer.rotationDeg,
    tilt: { x: tiltXDeg, y: tiltYDeg },
    scale: { x: layer.scaleX, y: layer.scaleY },
    aboveMask: layer.aboveMask,
    opacity: globalAlpha
  });

  ctx.save();
  try {
    ctx.translate(xCenter, yCenter);
    
    // Apply 3D tilt transformations to match CSS perspective(1200px) rotateX() rotateY()
    // CSS order: translate(-50%, -50%) perspective(1200px) rotateX() rotateY() rotate() scale()
    if (tiltXDeg !== 0 || tiltYDeg !== 0) {
      const tiltXRad = (tiltXDeg * Math.PI) / 180;
      const tiltYRad = (tiltYDeg * Math.PI) / 180;
      
      // CSS 3D transforms: perspective(1200px) rotateX() rotateY()
      // Properly compute perspective projection to 2D
      const perspective = 1200; // Match CSS perspective value
      const cosX = Math.cos(tiltXRad);
      const sinX = Math.sin(tiltXRad);
      const cosY = Math.cos(tiltYRad);
      const sinY = Math.sin(tiltYRad);
      
      // Combined rotation matrix for rotateY then rotateX
      // The z-component after rotation determines perspective scaling
      // For point at origin, z = 0, after rotateY: z = 0, after rotateX: z = 0
      // We need to consider how the element's corners would transform
      
      // Simplified perspective projection that maintains text readability:
      // Scale factor based on perspective depth
      const z = 0; // Element is at z=0 initially
      const scale = perspective / (perspective - z);
      
      // Apply the 2D projection of the 3D rotation with perspective
      // This creates the correct foreshortening effect without distortion
      const m11 = cosY * scale;
      const m12 = sinX * sinY * scale;
      const m21 = -sinY;
      const m22 = cosX;
      
      ctx.transform(m11, m12, m21, m22, 0, 0);
    }
    
    // Apply rotation AFTER tilt to match CSS order
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

    // Apply text color opacity separately from shadow effects
    ctx.globalAlpha = globalAlpha;
    ctx.fillStyle = layer.color || '#ffffff';
    
    // Glow first (with full opacity for the effect)
    if (layer.effects?.glow?.enabled) {
      ctx.save();
      ctx.globalAlpha = 1; // Glow at full opacity regardless of text opacity
      ctx.shadowColor = layer.effects.glow.color || '#ffffff';
      ctx.shadowBlur = ((layer.effects.glow.blur || 0) + ((layer.effects.glow as unknown as { size?: number }).size || 0)) || 0;
      ctx.shadowOffsetX = layer.effects.glow.offsetX || 0;
      ctx.shadowOffsetY = layer.effects.glow.offsetY || 0;
      ctx.fillStyle = 'transparent'; // Don't draw the text itself, just the shadow
      drawOnce();
      ctx.restore();
    }
    // Shadow second (with full opacity for the effect)
    if (layer.effects?.shadow?.enabled) {
      ctx.save();
      ctx.globalAlpha = 1; // Shadow at full opacity regardless of text opacity
      ctx.shadowColor = layer.effects.shadow.color || '#000000';
      ctx.shadowBlur = ((layer.effects.shadow.blur || 0) + ((layer.effects.shadow as unknown as { size?: number }).size || 0)) || 0;
      ctx.shadowOffsetX = layer.effects.shadow.offsetX || 0;
      ctx.shadowOffsetY = layer.effects.shadow.offsetY || 8;
      ctx.fillStyle = 'transparent'; // Don't draw the text itself, just the shadow
      drawOnce();
      ctx.restore();
    }
    // Actual text with its proper opacity
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

  // Extract alpha from fill color (supports rgba format)
  let globalAlpha = 1;
  try {
    const colorMatch = (layer.fill || '').match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/i);
    if (colorMatch && colorMatch[1] !== undefined) {
      globalAlpha = Math.max(0, Math.min(1, parseFloat(colorMatch[1])));
    }
  } catch {}

  ctx.save();
  try {
    // Apply global alpha for opacity
    ctx.globalAlpha = globalAlpha;
    
    ctx.translate(xCenter, yCenter);
    
    // Apply 3D tilt transformations to match CSS perspective(1200px) rotateX() rotateY()
    const tiltXDeg = layer.tiltXDeg || 0;
    const tiltYDeg = layer.tiltYDeg || 0;
    if (tiltXDeg !== 0 || tiltYDeg !== 0) {
      const tiltXRad = (tiltXDeg * Math.PI) / 180;
      const tiltYRad = (tiltYDeg * Math.PI) / 180;
      
      const perspective = 1200; // Match CSS perspective value
      const cosX = Math.cos(tiltXRad);
      const sinX = Math.sin(tiltXRad);
      const cosY = Math.cos(tiltYRad);
      const sinY = Math.sin(tiltYRad);
      
      const z = 0;
      const scale = perspective / (perspective - z);
      
      const m11 = cosY * scale;
      const m12 = sinX * sinY * scale;
      const m21 = -sinY;
      const m22 = cosX;
      
      ctx.transform(m11, m12, m21, m22, 0, 0);
    }
    
    // Apply rotation AFTER tilt to match CSS order
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
  
  // Images don't have built-in opacity in the layer type, but we can check if it's added later
  // For now, images render at full opacity unless the type is extended
  
  ctx.save();
  try {
    ctx.translate(xCenter, yCenter);
    
    // Apply 3D tilt transformations to match CSS perspective(1200px) rotateX() rotateY()
    const tiltXDeg = layer.tiltXDeg || 0;
    const tiltYDeg = layer.tiltYDeg || 0;
    if (tiltXDeg !== 0 || tiltYDeg !== 0) {
      const tiltXRad = (tiltXDeg * Math.PI) / 180;
      const tiltYRad = (tiltYDeg * Math.PI) / 180;
      
      const perspective = 1200; // Match CSS perspective value
      const cosX = Math.cos(tiltXRad);
      const sinX = Math.sin(tiltXRad);
      const cosY = Math.cos(tiltYRad);
      const sinY = Math.sin(tiltYRad);
      
      const z = 0;
      const scale = perspective / (perspective - z);
      
      const m11 = cosY * scale;
      const m12 = sinX * sinY * scale;
      const m21 = -sinY;
      const m22 = cosX;
      
      ctx.transform(m11, m12, m21, m22, 0, 0);
    }
    
    // Apply rotation AFTER tilt to match CSS order
    if (rotationRad) ctx.rotate(rotationRad);
    
    ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
    ctx.drawImage(image, -widthPx / 2, -heightPx / 2, widthPx, heightPx);
  } finally {
    ctx.restore();
  }
}

export interface DesignerProjectState {
  version: number;
  backgroundUrl: string;
  carMaskUrl?: string | null;
  layers: Layer[];
  maskTranslateXPct?: number;
  maskTranslateYPct?: number;
  backgroundKey?: string; // Store the R2 key for re-opening
  createdAt?: string;
}

export function exportDesignerState(state: {
  backgroundUrl: string;
  carMaskUrl?: string | null;
  layers: Layer[];
  maskTranslateXPct?: number;
  maskTranslateYPct?: number;
  backgroundKey?: string;
}): string {
  const projectState: DesignerProjectState = {
    version: 1,
    backgroundUrl: state.backgroundUrl,
    carMaskUrl: state.carMaskUrl,
    layers: state.layers,
    maskTranslateXPct: state.maskTranslateXPct || 0,
    maskTranslateYPct: state.maskTranslateYPct || 0,
    backgroundKey: state.backgroundKey,
    createdAt: new Date().toISOString(),
  };
  return JSON.stringify(projectState, null, 2);
}

export function importDesignerState(json: string): DesignerProjectState | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.version || !parsed.backgroundUrl || !Array.isArray(parsed.layers)) return null;
    return parsed as DesignerProjectState;
  } catch {
    return null;
  }
}

export async function composeLayersToBlob({
  backgroundUrl,
  carMaskUrl,
  layers,
  maskTranslateXPct,
  maskTranslateYPct,
}: {
  backgroundUrl: string;
  carMaskUrl?: string | null;
  layers: Layer[];
  maskTranslateXPct?: number;
  maskTranslateYPct?: number;
}): Promise<Blob | null> {
  try {
    console.log('[composeLayersToBlob] Starting composition:', {
      layerCount: layers.length,
      layersBelowMask: layers.filter(l => !l.aboveMask).length,
      layersAboveMask: layers.filter(l => l.aboveMask).length,
      hasMask: !!carMaskUrl,
      maskOffset: { x: maskTranslateXPct, y: maskTranslateYPct }
    });
    
    const bgImg = await loadImageSafe(backgroundUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    canvas.width = bgImg.naturalWidth || bgImg.width || 0;
    canvas.height = bgImg.naturalHeight || bgImg.height || 0;
    
    console.log('[composeLayersToBlob] Canvas size:', canvas.width, 'x', canvas.height);
    
    // Draw background
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // Draw layers below mask
    const belowLayers = layers.filter(l => !l.aboveMask);
    console.log('[composeLayersToBlob] Drawing', belowLayers.length, 'layers below mask');
    console.log('[composeLayersToBlob] Below layers details:', belowLayers.map(l => ({
      type: l.type,
      text: l.type === 'text' ? (l as import("@/types/layer-editor").TextLayer).text : undefined,
      aboveMask: l.aboveMask,
      hidden: l.hidden
    })));
    for (const layer of belowLayers) {
      if (layer.hidden) {
        console.log('[composeLayersToBlob] Skipping hidden layer:', layer.type);
        continue;
      }
      if (layer.type === 'text') {
        console.log('[composeLayersToBlob] Drawing text layer below mask:', (layer as import("@/types/layer-editor").TextLayer).text);
        drawTextLayer(ctx, layer, canvas.width, canvas.height);
      }
      else if (layer.type === 'shape') drawShapeLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'image') {
        try { const img = await loadImageSafe((layer as ImageLayer).src); drawImageLayer(ctx, layer, canvas.width, canvas.height, img); } catch {}
      }
    }

    // Draw car mask
    if (carMaskUrl) {
      try {
        const fgImg = await loadImageSafe(carMaskUrl);
        // Apply mask offset - CSS translate uses % of element's own size
        // Since we're drawing at canvas size, the offset is % of canvas size
        const offsetX = ((maskTranslateXPct || 0) / 100) * canvas.width;
        const offsetY = ((maskTranslateYPct || 0) / 100) * canvas.height;
        console.log('[composeLayersToBlob] Drawing mask with offset:', offsetX, offsetY);
        ctx.drawImage(fgImg, offsetX, offsetY, canvas.width, canvas.height);
      } catch (err) {
        console.error('[composeLayersToBlob] Failed to draw mask:', err);
      }
    }

    // Draw layers above mask
    const aboveLayers = layers.filter(l => !!l.aboveMask);
    console.log('[composeLayersToBlob] Drawing', aboveLayers.length, 'layers above mask');
    console.log('[composeLayersToBlob] Above layers details:', aboveLayers.map(l => ({
      type: l.type,
      text: l.type === 'text' ? (l as import("@/types/layer-editor").TextLayer).text : undefined,
      aboveMask: l.aboveMask,
      hidden: l.hidden
    })));
    for (const layer of aboveLayers) {
      if (layer.hidden) {
        console.log('[composeLayersToBlob] Skipping hidden layer:', layer.type);
        continue;
      }
      if (layer.type === 'text') {
        console.log('[composeLayersToBlob] Drawing text layer above mask:', (layer as import("@/types/layer-editor").TextLayer).text);
        drawTextLayer(ctx, layer, canvas.width, canvas.height);
      }
      else if (layer.type === 'shape') drawShapeLayer(ctx, layer, canvas.width, canvas.height);
      else if (layer.type === 'image') {
        try { const img = await loadImageSafe((layer as ImageLayer).src); drawImageLayer(ctx, layer, canvas.width, canvas.height, img); } catch {}
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    console.log('[composeLayersToBlob] Blob created:', blob?.size, 'bytes');
    return blob;
  } catch (err) {
    console.error('[composeLayersToBlob] Error:', err);
    return null;
  }
}


