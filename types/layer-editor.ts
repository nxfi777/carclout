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
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  rotationDeg: number;
  // Depth tilt (3D-like). rotateX for vertical, rotateY for horizontal perspective.
  tiltXDeg?: number;
  tiltYDeg?: number;
  scaleX: number;
  scaleY: number;
  locked?: boolean;
  hidden?: boolean;
  aboveMask?: boolean;
  effects: {
    shadow: EffectShadow;
    glow: EffectGlow;
  };
};

export type TextLayer = LayerBase & {
  type: 'text';
  text: string;
  // Optional rich text HTML used for character-level formatting when editing.
  // When present, the renderer will display this HTML; the plain `text` field
  // is kept in sync for export and fallbacks.
  html?: string;
  italic?: boolean;
  underline?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color: string;
  fontFamily: string;
  fontWeight: number;
  fontSizeEm?: number;
  letterSpacingEm: number;
  lineHeightEm: number;
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
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radiusPct?: number;
  // Arrow-specific properties
  arrowHeadSize?: number; // 0..1, relative to arrow length
  curvature?: number; // -1..1, negative curves left, positive curves right
};

export type ImageLayer = LayerBase & {
  type: 'image';
  src: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type MaskLayer = LayerBase & {
  type: 'mask';
  src: string;
};

export type Layer = TextLayer | ShapeLayer | ImageLayer | MaskLayer;

export type LayerEditorState = {
  tool: ToolId;
  marqueeMode: MarqueeMode;
  activeLayerId: string | null;
  layers: Layer[];
  // Multi-selection support: when empty, falls back to [activeLayerId] if set
  selectedLayerIds?: string[];
  backgroundUrl?: string | null;
  backgroundBlurhash?: string; // Optional blurhash for background image
  carMaskUrl?: string | null;
  // Car cutout visibility/lock state
  maskHidden?: boolean;
  maskLocked?: boolean;
  // Cutout (mask) interactive transform
  maskTranslateXPct?: number; // translation relative to canvas width
  maskTranslateYPct?: number; // translation relative to canvas height
  canvasAspectRatio?: number | null;
  editingLayerId?: string | null;
};

export type LayerEditorAction =
  | { type: 'set_tool'; tool: ToolId }
  | { type: 'set_marquee_mode'; mode: MarqueeMode }
  | { type: 'add_layer'; layer: Layer; atTop?: boolean }
  | { type: 'update_layer'; id: string; patch: Partial<Layer> }
  | { type: 'reorder_layer'; id: string; toIndex: number }
  | { type: 'remove_layer'; id: string }
  | { type: 'select_layer'; id: string | null }
  | { type: 'toggle_select_layer'; id: string }
  | { type: 'select_layers'; ids: string[] }
  | { type: 'bring_forward'; id: string }
  | { type: 'send_backward'; id: string }
  | { type: 'send_to_front'; id: string }
  | { type: 'send_to_back'; id: string }
  | { type: 'toggle_above_mask'; id: string }
  | { type: 'set_bg'; url: string | null }
  | { type: 'set_mask'; url: string | null }
  | { type: 'set_mask_offset'; xPct: number; yPct: number }
  | { type: 'reset_mask' }
  | { type: 'toggle_mask_lock' }
  | { type: 'toggle_mask_hide' }
  | { type: 'start_edit_text'; id: string }
  | { type: 'stop_edit_text' }
  // Internal: used to restore snapshots during undo/redo in provider
  | { type: 'replace_state'; next: LayerEditorState };

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
    heightPct: 16, // Increased from 12 for better spacing and larger default text
    rotationDeg: 0,
    tiltXDeg: 0,
    tiltYDeg: 0,
    scaleX: 1,
    scaleY: 1,
    aboveMask: false, // Explicitly render text below car cutout by default
    effects: {
      shadow: { ...defaultShadow, enabled: true, blur: 10, offsetX: 0, offsetY: 6, color: '#000000' },
      glow: { ...defaultGlow, enabled: true, blur: 18, color: '#ffffff', offsetX: 0, offsetY: 0 }
    },
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
    tiltXDeg: 0,
    tiltYDeg: 0,
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
    tiltXDeg: 0,
    tiltYDeg: 0,
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
    tiltXDeg: 0,
    tiltYDeg: 0,
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
    tiltXDeg: 0,
    tiltYDeg: 0,
    scaleX: 1,
    scaleY: 1,
    effects: { shadow: { ...defaultShadow }, glow: { ...defaultGlow } },
  };
}


