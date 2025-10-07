"use client";
import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
  LayerEditorAction,
  LayerEditorState,
  Layer,
  ToolId,
} from "@/types/layer-editor";

const initialState: LayerEditorState = {
  tool: "select",
  marqueeMode: "rectangle",
  activeLayerId: null,
  layers: [],
  selectedLayerIds: [],
  backgroundUrl: null,
  backgroundBlurhash: undefined,
  carMaskUrl: null,
  maskHidden: false,
  maskLocked: false,
  maskTranslateXPct: 0,
  maskTranslateYPct: 0,
  canvasAspectRatio: 16 / 9,
  editingLayerId: null,
};

function normalizeEffects(effects: Layer["effects"]) {
  return {
    shadow: {
      enabled: !!effects.shadow.enabled,
      color: effects.shadow.color,
      blur: Number(effects.shadow.blur || 0),
      size: Number((effects.shadow as { size?: number }).size || 0),
      offsetX: Number(effects.shadow.offsetX || 0),
      offsetY: Number(effects.shadow.offsetY || 0),
    },
    glow: {
      enabled: !!effects.glow.enabled,
      color: effects.glow.color,
      blur: Number(effects.glow.blur || 0),
      size: Number((effects.glow as { size?: number }).size || 0),
      offsetX: Number(effects.glow.offsetX || 0),
      offsetY: Number(effects.glow.offsetY || 0),
    },
  } as const;
}

function serializeLayer(layer: Layer) {
  const base = {
    type: layer.type,
    id: layer.id,
    name: layer.name,
    xPct: Number(layer.xPct),
    yPct: Number(layer.yPct),
    widthPct: Number(layer.widthPct),
    heightPct: Number(layer.heightPct),
    rotationDeg: Number(layer.rotationDeg || 0),
    tiltXDeg: Number((layer as { tiltXDeg?: number }).tiltXDeg || 0),
    tiltYDeg: Number((layer as { tiltYDeg?: number }).tiltYDeg || 0),
    scaleX: Number(layer.scaleX || 1),
    scaleY: Number(layer.scaleY || 1),
    locked: !!layer.locked,
    hidden: !!layer.hidden,
    aboveMask: !!layer.aboveMask,
    effects: normalizeEffects(layer.effects),
  } as const;

  if (layer.type === 'text') {
    const textLayer = layer as import("@/types/layer-editor").TextLayer;
    return {
      ...base,
      text: textLayer.text,
      html: textLayer.html ?? null,
      italic: !!textLayer.italic,
      underline: !!textLayer.underline,
      textAlign: textLayer.textAlign || 'center',
      color: textLayer.color,
      fontFamily: textLayer.fontFamily,
      fontWeight: Number(textLayer.fontWeight || 400),
      fontSizeEm: textLayer.fontSizeEm ?? null,
      letterSpacingEm: Number(textLayer.letterSpacingEm || 0),
      lineHeightEm: Number(textLayer.lineHeightEm || 1),
      strokeEnabled: !!textLayer.strokeEnabled,
      strokeColor: textLayer.strokeColor ?? null,
      strokeWidth: Number(textLayer.strokeWidth ?? 0),
      highlightEnabled: !!textLayer.highlightEnabled,
      highlightColor: textLayer.highlightColor ?? null,
      borderRadiusEm: Number(textLayer.borderRadiusEm ?? 0),
    } as const;
  }
  if (layer.type === 'shape') {
    const shapeLayer = layer as import("@/types/layer-editor").ShapeLayer;
    return {
      ...base,
      shape: shapeLayer.shape,
      fill: shapeLayer.fill,
      stroke: shapeLayer.stroke ?? null,
      strokeWidth: Number(shapeLayer.strokeWidth ?? 0),
      radiusPct: Number(shapeLayer.radiusPct ?? 0),
    } as const;
  }
  if (layer.type === 'image') {
    const imageLayer = layer as import("@/types/layer-editor").ImageLayer;
    return {
      ...base,
      src: imageLayer.src,
      naturalWidth: Number(imageLayer.naturalWidth ?? 0),
      naturalHeight: Number(imageLayer.naturalHeight ?? 0),
    } as const;
  }
  const maskLayer = layer as import("@/types/layer-editor").MaskLayer;
  return {
    ...base,
    src: maskLayer.src,
  } as const;
}

function createDocSignature(state: LayerEditorState): string {
  const doc = {
    backgroundUrl: state.backgroundUrl ?? null,
    carMaskUrl: state.carMaskUrl ?? null,
    maskTranslateXPct: Number(state.maskTranslateXPct ?? 0),
    maskTranslateYPct: Number(state.maskTranslateYPct ?? 0),
    maskHidden: !!state.maskHidden,
    layers: state.layers.map(serializeLayer),
  };
  return JSON.stringify(doc);
}

function reducer(state: LayerEditorState, action: LayerEditorAction): LayerEditorState {
  switch (action.type) {
    case "replace_state":
      return { ...action.next };
    case "set_tool":
      return { 
        ...state, 
        tool: action.tool, 
        editingLayerId: action.tool === 'text' ? state.editingLayerId : null,
        // Clear selection when switching to text tool so first click creates text immediately
        activeLayerId: action.tool === 'text' ? null : state.activeLayerId,
        selectedLayerIds: action.tool === 'text' ? [] : state.selectedLayerIds,
        // Clear draw-to-edit annotation when switching away from brush tool
        drawToEditAnnotation: action.tool === 'brush' ? state.drawToEditAnnotation : null,
      };
    case "set_marquee_mode":
      return { ...state, marqueeMode: action.mode };
    case "start_draw_to_edit":
      return { 
        ...state, 
        drawToEditAnnotation: { 
          id: `draw_${Date.now()}`, 
          strokes: [] 
        } 
      };
    case "add_brush_stroke":
      if (!state.drawToEditAnnotation) return state;
      return {
        ...state,
        drawToEditAnnotation: {
          ...state.drawToEditAnnotation,
          strokes: [...state.drawToEditAnnotation.strokes, action.stroke],
        },
      };
    case "clear_draw_to_edit":
      return { ...state, drawToEditAnnotation: null };
    case "finalize_draw_to_edit":
      if (!state.drawToEditAnnotation) return state;
      return {
        ...state,
        drawToEditAnnotation: {
          ...state.drawToEditAnnotation,
          boundingBox: action.boundingBox,
        },
      };
    case "apply_draw_to_edit_result":
      return {
        ...state,
        backgroundUrl: action.newBackgroundUrl,
        drawToEditAnnotation: null,
      };
    case "add_layer": {
      const layers = action.atTop ? [...state.layers, action.layer] : [action.layer, ...state.layers];
      return { ...state, layers, activeLayerId: action.layer.id, selectedLayerIds: [action.layer.id], editingLayerId: action.layer.type === 'text' ? action.layer.id : state.editingLayerId };
    }
    case "update_layer": {
      const layers = state.layers.map((l) => (l.id === action.id ? ({ ...l, ...action.patch } as Layer) : l));
      return { ...state, layers };
    }
    case "remove_layer": {
      const layers = state.layers.filter((l) => l.id !== action.id);
      const activeLayerId = state.activeLayerId === action.id ? null : state.activeLayerId;
      const selectedLayerIds = (state.selectedLayerIds || []).filter(id => id !== action.id);
      return { ...state, layers, activeLayerId, selectedLayerIds };
    }
    case "reorder_layer": {
      const from = state.layers.findIndex(l=> l.id === action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(state.layers.length - 1, action.toIndex));
      if (from === to) return state;
      const layers = [...state.layers];
      const [item] = layers.splice(from, 1);
      layers.splice(to, 0, item);
      return { ...state, layers };
    }
    case "select_layer":
      return { ...state, activeLayerId: action.id, selectedLayerIds: action.id ? [action.id] : [], editingLayerId: null };
    case "toggle_select_layer": {
      const ids = new Set(state.selectedLayerIds || []);
      if (ids.has(action.id)) { ids.delete(action.id); } else { ids.add(action.id); }
      const selectedLayerIds = Array.from(ids);
      // Keep active on last interacted id if it remains selected; otherwise leave as-is or clear if none selected
      const activeLayerId = selectedLayerIds.length === 0 ? null : action.id;
      return { ...state, selectedLayerIds, activeLayerId, editingLayerId: null };
    }
    case "select_layers": {
      const unique = Array.from(new Set(action.ids));
      // Prefer keeping current active if it's in the set, else pick the first id
      const activeLayerId = unique.includes(state.activeLayerId || "") ? state.activeLayerId : (unique[0] || null);
      return { ...state, selectedLayerIds: unique, activeLayerId, editingLayerId: null };
    }
    case "bring_forward": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0) return state;
      const current = state.layers[idx];
      const group = !!current.aboveMask;
      // Find the next layer in the same group moving forward (toward front of stack)
      let j = idx + 1;
      while (j < state.layers.length && !!state.layers[j].aboveMask !== group) j++;
      if (j >= state.layers.length) return state; // already at front of its group
      const layers = [...state.layers];
      const tmp = layers[j];
      layers[j] = layers[idx];
      layers[idx] = tmp;
      return { ...state, layers };
    }
    case "send_backward": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0) return state;
      const current = state.layers[idx];
      const group = !!current.aboveMask;
      // Find the previous layer in the same group moving backward (toward back of stack)
      let j = idx - 1;
      while (j >= 0 && !!state.layers[j].aboveMask !== group) j--;
      if (j < 0) return state; // already at back of its group
      const layers = [...state.layers];
      const tmp = layers[j];
      layers[j] = layers[idx];
      layers[idx] = tmp;
      return { ...state, layers };
    }
    case "send_to_front": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0) return state;
      const current = state.layers[idx];
      const group = !!current.aboveMask;
      // Find last index within the same group
      let last = -1;
      for (let i = 0; i < state.layers.length; i++) {
        if (!!state.layers[i].aboveMask === group) last = i;
      }
      if (last <= idx) return state;
      const layers = [...state.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(last, 0, item);
      return { ...state, layers };
    }
    case "send_to_back": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0) return state;
      const current = state.layers[idx];
      const group = !!current.aboveMask;
      // Find first index within the same group
      let first = -1;
      for (let i = 0; i < state.layers.length; i++) {
        if (!!state.layers[i].aboveMask === group) { first = i; break; }
      }
      if (first < 0 || first >= idx) return state;
      const layers = [...state.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(first, 0, item);
      return { ...state, layers };
    }
    case "toggle_above_mask": {
      const layers = state.layers.map((l) => (l.id === action.id ? ({ ...l, aboveMask: !l.aboveMask } as Layer) : l));
      return { ...state, layers };
    }
    case "set_bg":
      return { ...state, backgroundUrl: action.url };
    case "set_mask":
      return { ...state, carMaskUrl: action.url };
    case 'set_mask_offset':
      return { ...state, maskTranslateXPct: action.xPct, maskTranslateYPct: action.yPct };
    case 'reset_mask':
      return { ...state, maskTranslateXPct: 0, maskTranslateYPct: 0 };
    case 'toggle_mask_lock':
      return { ...state, maskLocked: !state.maskLocked };
    case 'toggle_mask_hide':
      return { ...state, maskHidden: !state.maskHidden };
    case 'start_edit_text':
      return { ...state, editingLayerId: action.id };
    case 'stop_edit_text':
      return { ...state, editingLayerId: null };
    default:
      return state;
  }
}

type Ctx = {
  state: LayerEditorState;
  dispatch: React.Dispatch<LayerEditorAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  commitBaseline: () => void;
};

const CtxObj = createContext<Ctx | null>(null);

type LayerEditorProviderProps = {
  children: React.ReactNode;
  initial?: Partial<LayerEditorState>;
  onDirtyChange?: (dirty: boolean, commit: () => void) => void;
};

export function LayerEditorProvider({ children, initial, onDirtyChange }: LayerEditorProviderProps) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...(initial || {}) });

  const historyRef = React.useRef<{ past: LayerEditorState[]; future: LayerEditorState[] }>({ past: [], future: [] });
  const MAX_HISTORY = 200;

  const initialSignatureRef = React.useRef<string | null>(null);
  const currentSignature = React.useMemo(() => createDocSignature(state), [state]);
  if (initialSignatureRef.current === null) {
    initialSignatureRef.current = currentSignature;
  }
  const isDirty = React.useMemo(() => {
    if (initialSignatureRef.current === null) return false;
    return currentSignature !== initialSignatureRef.current;
  }, [currentSignature]);

  const commitBaseline = React.useCallback(() => {
    initialSignatureRef.current = currentSignature;
  }, [currentSignature]);

  const recordSnapshot = React.useCallback((current: LayerEditorState) => {
    const { past } = historyRef.current;
    const nextPast = past.length >= MAX_HISTORY ? past.slice(1) : past.slice();
    nextPast.push({ ...current, layers: current.layers.map(l => ({ ...l })), selectedLayerIds: Array.isArray(current.selectedLayerIds) ? [...current.selectedLayerIds] : [] });
    historyRef.current = { past: nextPast, future: [] };
  }, []);

  const isDocMutation = (action: LayerEditorAction): boolean => {
    switch (action.type) {
      case 'add_layer':
      case 'update_layer':
      case 'remove_layer':
      case 'reorder_layer':
      case 'bring_forward':
      case 'send_backward':
      case 'send_to_front':
      case 'send_to_back':
      case 'toggle_above_mask':
      case 'set_bg':
      case 'set_mask':
      case 'set_mask_offset':
      case 'reset_mask':
      case 'apply_draw_to_edit_result':
        return true;
      default:
        return false;
    }
  };

  const dispatchWithHistory = React.useCallback((action: LayerEditorAction) => {
    if (isDocMutation(action)) {
      recordSnapshot(state);
    }
    dispatch(action);
  }, [state, recordSnapshot]);

  const undo = React.useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    const snapshot: LayerEditorState = { ...state, layers: state.layers.map(l => ({ ...l })), selectedLayerIds: Array.isArray(state.selectedLayerIds) ? [...state.selectedLayerIds] : [] };
    historyRef.current = { past: newPast, future: [...future, snapshot] };
    dispatch({ type: 'replace_state', next: prev });
  }, [state]);

  const redo = React.useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future[future.length - 1];
    const newFuture = future.slice(0, future.length - 1);
    const snapshot: LayerEditorState = { ...state, layers: state.layers.map(l => ({ ...l })), selectedLayerIds: Array.isArray(state.selectedLayerIds) ? [...state.selectedLayerIds] : [] };
    historyRef.current = { past: [...past, snapshot], future: newFuture };
    dispatch({ type: 'replace_state', next });
  }, [state]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const value = useMemo(() => ({ state, dispatch: dispatchWithHistory, undo, redo, canUndo, canRedo, isDirty, commitBaseline }), [state, dispatchWithHistory, undo, redo, canUndo, canRedo, isDirty, commitBaseline]);
  React.useEffect(()=>{
    try { (window as unknown as { dispatchLayerEditor?: React.Dispatch<LayerEditorAction> }).dispatchLayerEditor = dispatchWithHistory; } catch {}
    return ()=>{ try { (window as unknown as { dispatchLayerEditor?: React.Dispatch<LayerEditorAction> }).dispatchLayerEditor = undefined; } catch {} };
  }, [dispatchWithHistory]);
  React.useEffect(()=>{
    try { (window as unknown as { getLayerEditorSnapshot?: ()=>LayerEditorState }).getLayerEditorSnapshot = () => state; } catch {}
    return ()=>{ try { (window as unknown as { getLayerEditorSnapshot?: ()=>LayerEditorState }).getLayerEditorSnapshot = undefined as unknown as (()=>LayerEditorState); } catch {} };
  }, [state]);
  React.useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const t = (e.target as HTMLElement | null) || (document.activeElement as HTMLElement | null);
      const isEditingField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || !!t.closest('input, textarea, [contenteditable="true"]'));
      const isEditingTextLayer = !!state.editingLayerId;
      if (isEditingField || isEditingTextLayer) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      } else if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = state.activeLayerId; if (!id) return; e.preventDefault(); dispatchWithHistory({ type: 'remove_layer', id });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        const id = state.activeLayerId; if (!id) return; e.preventDefault();
        const src = state.layers.find(l=> l.id===id); if (!src) return;
        const copy = { ...src, id: `${src.id}-copy-${Math.random().toString(36).slice(2,6)}`, xPct: Math.min(100, src.xPct + 4), yPct: Math.min(100, src.yPct + 4) } as unknown as Layer;
        dispatchWithHistory({ type: 'add_layer', layer: copy, atTop: true });
      }
    }
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [dispatchWithHistory, state.activeLayerId, state.layers, state.editingLayerId, undo, redo]);

  React.useEffect(() => {
    if (typeof onDirtyChange === 'function') {
      onDirtyChange(isDirty, commitBaseline);
    }
  }, [isDirty, onDirtyChange, commitBaseline]);
  return <CtxObj.Provider value={value}>{children}</CtxObj.Provider>;
}

export function useLayerEditor() {
  const ctx = useContext(CtxObj);
  if (!ctx) throw new Error("useLayerEditor must be used within LayerEditorProvider");
  return ctx;
}

export function useActiveLayer(): Layer | null {
  const { state } = useLayerEditor();
  return useMemo(() => state.layers.find((l) => l.id === state.activeLayerId) || null, [state.layers, state.activeLayerId]);
}

export function useIsTool(tool: ToolId): boolean {
  const { state } = useLayerEditor();
  return state.tool === tool;
}


