export type ToolId =
  | 'select'
  | 'text'
  | 'marquee'
  | 'shape'
  | 'image'
  | 'fill';

export type MarqueeMode = 'rectangle' | 'ellipse' | 'lasso' | 'polygon';
export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'arrow';

export type EffectShadow = {
  enabled: boolean;
  color: string; // hex
  blur: number; // px
  size: number; // px - additional radius/extent
  offsetX: number; // px
  offsetY: number; // px
};

export type EffectGlow = {
  enabled: boolean;
  color: string; // hex
  blur: number; // px
  size: number; // px - additional radius/extent
  offsetX: number; // px
  offsetY: number; // px
};

export type LayerBase = {
  id: string;
  name: string;
  xPct: number; // 0..100 center position x
  yPct: number; // 0..100 center position y
  widthPct: number; // 0..100 relative to canvas width
  heightPct: number; // 0..100 relative to canvas height
  rotationDeg: number; // -180..180
  tiltXDeg?: number;
  scaleX: number;
  scaleY: number;
  locked?: boolean;
  hidden?: boolean;
  aboveMask?: boolean; // when true, render above car mask
  effects: {
    shadow: EffectShadow;
    glow: EffectGlow;
  };
};

export type TextLayer = LayerBase & {
  type: 'text';
  text: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color: string; // hex
  fontFamily: string;
  fontWeight: number; // 300..900
  fontSizeEm?: number; // relative font size used for rendering
  letterSpacingEm: number;
  lineHeightEm: number;
  tiltYDeg?: number;
  // Text stroke properties
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  // Text highlight (background) properties
  highlightEnabled?: boolean;
  highlightColor?: string;
  // Text box corner radius
  borderRadiusEm?: number;
};

export type ShapeLayer = LayerBase & {
  type: 'shape';
  shape: ShapeKind;
  fill: string; // hex or rgba
  stroke?: string;
  strokeWidth?: number; // px
  radiusPct?: number; // for rectangle corner radius / ellipse extra factor
  // Arrow-specific properties
  arrowHeadSize?: number; // 0..1, relative to arrow length
  curvature?: number; // -1..1, negative curves left, positive curves right
};

export type ImageLayer = LayerBase & {
  type: 'image';
  src: string; // object URL or remote
  naturalWidth?: number;
  naturalHeight?: number;
};

export type MaskLayer = LayerBase & {
  type: 'mask';
  src: string; // object URL or remote
};

export type Layer = TextLayer | ShapeLayer | ImageLayer | MaskLayer;

export type DesignerState = {
  tool: ToolId;
  marqueeMode: MarqueeMode;
  // Selected shape kind when using the 'shape' tool
  shapeKind?: ShapeKind;
  // Default style settings for newly created shapes while the Shape tool is active
  shapeDefaults: ShapeStyleDefaults;
  activeLayerId: string | null;
  layers: Layer[];
  backgroundUrl?: string | null;
  carMaskUrl?: string | null; // foreground mask image overlay
  // Cutout (mask) interactive transform
  maskTranslateXPct?: number; // translation relative to canvas width
  maskTranslateYPct?: number; // translation relative to canvas height
  maskHidden?: boolean;
  canvasAspectRatio?: number | null; // width / height when known
  editingLayerId?: string | null;
};

export type DesignerAction =
  | { type: 'set_tool'; tool: ToolId }
  | { type: 'set_marquee_mode'; mode: MarqueeMode }
  | { type: 'set_shape_kind'; kind: ShapeKind }
  | { type: 'update_shape_defaults'; patch: Partial<ShapeStyleDefaults> }
  | { type: 'add_layer'; layer: Layer; atTop?: boolean }
  | { type: 'update_layer'; id: string; patch: Partial<Layer> }
  | { type: 'remove_layer'; id: string }
  | { type: 'select_layer'; id: string | null }
  | { type: 'bring_forward'; id: string }
  | { type: 'send_backward'; id: string }
  | { type: 'send_to_front'; id: string }
  | { type: 'send_to_back'; id: string }
  | { type: 'toggle_above_mask'; id: string }
  | { type: 'set_bg'; url: string | null }
  | { type: 'set_mask'; url: string | null }
  | { type: 'set_mask_offset'; xPct: number; yPct: number }
  | { type: 'toggle_mask_hide' }
  | { type: 'start_edit_text'; id: string }
  | { type: 'stop_edit_text' }
  // Internal action used by providers to restore a previous snapshot for undo/redo.
  | { type: 'replace_state'; next: DesignerState };

export function generateId(prefix: string = 'layer'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${rnd}`;
}

export const defaultShadow: EffectShadow = {
  enabled: false,
  color: '#000000',
  blur: 8,
  size: 0,
  offsetX: 0,
  offsetY: 6,
};

export const defaultGlow: EffectGlow = {
  enabled: false,
  color: '#ffffff',
  blur: 16,
  size: 0,
  offsetX: 0,
  offsetY: 0,
};

export function createDefaultText(xPct = 50, yPct = 50): TextLayer {
  // Use wider width on mobile (70% of viewport) to prevent text from wrapping too early
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const widthPct = isMobile ? 70 : 28;
  
  return {
    id: generateId('text'),
    type: 'text',
    name: 'Text',
    text: '',
    textAlign: 'center',
    color: '#ffffff',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    fontWeight: 700,
    fontSizeEm: 3.6,
    letterSpacingEm: 0,
    lineHeightEm: 1.1,
    xPct,
    yPct,
    widthPct,
    heightPct: 12,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    aboveMask: false, // Explicitly render text below car cutout by default
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createDefaultRect(xPct = 50, yPct = 50): ShapeLayer {
  return {
    id: generateId('shape'),
    type: 'shape',
    name: 'Rectangle',
    shape: 'rectangle',
    fill: 'rgba(255,255,255,0.2)',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 2,
    radiusPct: 0.06,
    xPct,
    yPct,
    widthPct: 40,
    heightPct: 20,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createDefaultEllipse(xPct = 50, yPct = 50): ShapeLayer {
  return {
    id: generateId('shape'),
    type: 'shape',
    name: 'Ellipse',
    shape: 'ellipse',
    fill: 'rgba(255,255,255,0.2)',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 2,
    xPct,
    yPct,
    widthPct: 36,
    heightPct: 20,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createDefaultTriangle(xPct = 50, yPct = 50): ShapeLayer {
  return {
    id: generateId('shape'),
    type: 'shape',
    name: 'Triangle',
    shape: 'triangle',
    fill: 'rgba(255,255,255,0.2)',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 2,
    xPct,
    yPct,
    widthPct: 36,
    heightPct: 28,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createDefaultLine(xPct = 50, yPct = 50): ShapeLayer {
  return {
    id: generateId('shape'),
    type: 'shape',
    name: 'Line',
    shape: 'line',
    fill: 'transparent',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 4,
    xPct,
    yPct,
    widthPct: 40,
    heightPct: 6,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createDefaultArrow(xPct = 50, yPct = 50): ShapeLayer {
  return {
    id: generateId('shape'),
    type: 'shape',
    name: 'Arrow',
    shape: 'arrow',
    fill: 'transparent',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 4,
    arrowHeadSize: 0.15,
    curvature: 0,
    xPct,
    yPct,
    widthPct: 40,
    heightPct: 10,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}

export function createImageLayer(src: string, xPct = 50, yPct = 50): ImageLayer {
  return {
    id: generateId('image'),
    type: 'image',
    name: 'Image',
    src,
    xPct,
    yPct,
    widthPct: 40,
    heightPct: 30,
    rotationDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}


// Style defaults for Shape tool
export type ShapeStyleDefaults = {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radiusPct?: number;
};

export const defaultShapeDefaults: ShapeStyleDefaults = {
  fill: 'rgba(255,255,255,0.2)',
  stroke: 'rgba(255,255,255,0.9)',
  strokeWidth: 2,
  radiusPct: 0.06,
};
