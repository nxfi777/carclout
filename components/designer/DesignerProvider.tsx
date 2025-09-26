"use client";
import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
  DesignerAction,
  DesignerState,
  Layer,
  ToolId,
} from "@/types/designer";
import { generateId } from "@/types/designer";
import { defaultShapeDefaults } from "@/types/designer";
import { toast } from "sonner";

const initialState: DesignerState = {
  tool: "select",
  marqueeMode: "rectangle",
  shapeKind: 'rectangle',
  shapeDefaults: defaultShapeDefaults,
  activeLayerId: null,
  layers: [],
  backgroundUrl: null,
  carMaskUrl: null,
  maskTranslateXPct: 0,
  maskTranslateYPct: 0,
  maskHidden: false,
  canvasAspectRatio: 16 / 9,
  editingLayerId: null,
};

function reducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case "replace_state":
      // Replace entire state (used by undo/redo). Trust caller to provide a valid snapshot.
      return { ...action.next };
    case "set_tool":
      return { ...state, tool: action.tool, editingLayerId: action.tool === 'text' ? state.editingLayerId : null };
    case "set_marquee_mode":
      return { ...state, marqueeMode: action.mode };
    case "set_shape_kind":
      return { ...state, shapeKind: action.kind };
    case "update_shape_defaults":
      return { ...state, shapeDefaults: { ...state.shapeDefaults, ...(action.patch || {}) } };
    case "add_layer": {
      // Add layers normally, no special handling for mask layer
      const layers = action.atTop ? [...state.layers, action.layer] : [action.layer, ...state.layers];
      return { ...state, layers, activeLayerId: action.layer.id, editingLayerId: action.layer.type === 'text' ? action.layer.id : state.editingLayerId };
    }
    case "update_layer": {
      const layers = state.layers.map((l) => (l.id === action.id ? ({ ...l, ...action.patch } as Layer) : l));
      return { ...state, layers };
    }
    case "remove_layer": {
      // Prevent deleting the mask layer with toast notification
      const target = state.layers.find(l => l.id === action.id);
      if (target && target.type === 'mask') {
        toast.info('The car cutout layer cannot be deleted, but you can hide it in the layers panel');
        return state;
      }
      const layers = state.layers.filter((l) => l.id !== action.id);
      const activeLayerId = state.activeLayerId === action.id ? null : state.activeLayerId;
      return { ...state, layers, activeLayerId };
    }
    case "select_layer":
      return { ...state, activeLayerId: action.id, editingLayerId: null };
    case "bring_forward": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0 || idx >= state.layers.length - 1) return state;
      const layers = [...state.layers];
      const tmp = layers[idx + 1];
      layers[idx + 1] = layers[idx];
      layers[idx] = tmp;
      return { ...state, layers };
    }
    case "send_backward": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx <= 0) return state;
      const layers = [...state.layers];
      const tmp = layers[idx - 1];
      layers[idx - 1] = layers[idx];
      layers[idx] = tmp;
      return { ...state, layers };
    }
    case "send_to_front": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0 || idx === state.layers.length - 1) return state;
      const layers = [...state.layers];
      const [item] = layers.splice(idx, 1);
      layers.push(item);
      return { ...state, layers };
    }
    case "send_to_back": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx <= 0) return state;
      const target = state.layers[idx];
      if (target.type === 'mask') return state;
      const layers = state.layers.filter(l => l.id !== action.id);
      layers.unshift(target);
      return { ...state, layers };
    }
    case "toggle_above_mask": {
      // No-op: aboveMask is no longer used in the Designer
      return state;
    }
    case 'toggle_mask_hide':
      return { ...state, maskHidden: !state.maskHidden };
    case "set_bg":
      return { ...state, backgroundUrl: action.url };
    case "set_mask": {
      // Ensure a single mask layer exists at the top by default
      const existingIdx = state.layers.findIndex(l => l.type === 'mask');
      const maskLayer: Layer = {
        id: existingIdx>=0 ? state.layers[existingIdx].id : generateId('mask'),
        type: 'mask',
        name: 'Car cutout',
        src: action.url || '',
        xPct: 50,
        yPct: 50,
        widthPct: 100,
        heightPct: 100,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        effects: {
          shadow: { enabled: false, color: '#000000', blur: 8, size: 0, offsetX: 0, offsetY: 6 },
          glow: { enabled: false, color: '#ffffff', blur: 16, size: 0, offsetX: 0, offsetY: 0 }
        }
      };
      let layers = [...state.layers];
      if (existingIdx >= 0) {
        layers[existingIdx] = maskLayer;
      } else {
        layers = [...layers, maskLayer];
      }
      return { ...state, carMaskUrl: action.url, layers };
    }
    case 'set_mask_offset':
      return { ...state, maskTranslateXPct: action.xPct, maskTranslateYPct: action.yPct };
    case 'start_edit_text':
      return { ...state, editingLayerId: action.id };
    case 'stop_edit_text':
      return { ...state, editingLayerId: null };
    default:
      return state;
  }
}

type Ctx = {
  state: DesignerState;
  dispatch: React.Dispatch<DesignerAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const DesignerCtx = createContext<Ctx | null>(null);

export function DesignerProvider({ children, initial }: { children: React.ReactNode; initial?: Partial<DesignerState> }) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...(initial || {}) });

  // Simple in-memory history stack. We only store snapshots for actions that
  // mutate the design document (layers, bg/mask, z-order, shape kind, etc.).
  const historyRef = React.useRef<{ past: DesignerState[]; future: DesignerState[] }>({ past: [], future: [] });
  const MAX_HISTORY = 200;

  const recordSnapshot = React.useCallback((current: DesignerState) => {
    const { past } = historyRef.current;
    const nextPast = past.length >= MAX_HISTORY ? past.slice(1) : past.slice();
    nextPast.push({ ...current, layers: current.layers.map(l => ({ ...l })) });
    historyRef.current = { past: nextPast, future: [] };
  }, []);

  const isDocMutation = (action: DesignerAction): boolean => {
    switch (action.type) {
      case 'add_layer':
      case 'update_layer':
      case 'remove_layer':
      case 'bring_forward':
      case 'send_backward':
      case 'send_to_front':
      case 'send_to_back':
      case 'toggle_above_mask':
      case 'toggle_mask_hide':
      case 'set_bg':
      case 'set_mask':
      case 'set_shape_kind':
        return true;
      default:
        return false;
    }
  };

  const dispatchWithHistory = React.useCallback((action: DesignerAction) => {
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
    const snapshot: DesignerState = { ...state, layers: state.layers.map(l => ({ ...l })) };
    historyRef.current = { past: newPast, future: [...future, snapshot] };
    dispatch({ type: 'replace_state', next: prev });
  }, [state]);

  const redo = React.useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future[future.length - 1];
    const newFuture = future.slice(0, future.length - 1);
    const snapshot: DesignerState = { ...state, layers: state.layers.map(l => ({ ...l })) };
    historyRef.current = { past: [...past, snapshot], future: newFuture };
    dispatch({ type: 'replace_state', next });
  }, [state]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const value = useMemo(() => ({ state, dispatch: dispatchWithHistory, undo, redo, canUndo, canRedo }), [state, dispatchWithHistory, undo, redo, canUndo, canRedo]);
  React.useEffect(()=>{
    try { (window as unknown as { dispatchDesigner?: React.Dispatch<DesignerAction> }).dispatchDesigner = dispatchWithHistory; } catch {}
    return ()=>{ try { (window as unknown as { dispatchDesigner?: React.Dispatch<DesignerAction> }).dispatchDesigner = undefined; } catch {} };
  }, [dispatchWithHistory]);
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = state.activeLayerId; 
        if (!id) return; 
        e.preventDefault(); 
        // Check if it's a mask layer before attempting deletion
        const layer = state.layers.find(l => l.id === id);
        if (layer && layer.type === 'mask') {
          toast.info('The car cutout layer cannot be deleted, but you can hide it in the layers panel');
          return;
        }
        dispatchWithHistory({ type: 'remove_layer', id });
      } else if (e.key === 'h' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatchWithHistory({ type: 'toggle_mask_hide' });
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
  return <DesignerCtx.Provider value={value}>{children}</DesignerCtx.Provider>;
}

export function useDesigner() {
  const ctx = useContext(DesignerCtx);
  if (!ctx) throw new Error("useDesigner must be used within DesignerProvider");
  return ctx;
}

export function useActiveLayer(): Layer | null {
  const { state } = useDesigner();
  return useMemo(() => state.layers.find((l) => l.id === state.activeLayerId) || null, [state.layers, state.activeLayerId]);
}

export function useIsTool(tool: ToolId): boolean {
  const { state } = useDesigner();
  return state.tool === tool;
}

export function useMaskVisibility(){
  const { state, dispatch } = useDesigner();
  return React.useMemo(() => ({ hidden: !!state.maskHidden, toggle: () => dispatch({ type: 'toggle_mask_hide' }) }), [state.maskHidden, dispatch]);
}


