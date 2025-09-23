"use client";
import { useEffect } from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import { createDefaultText, createImageLayer } from "@/types/layer-editor";

export default function AddViaToolInteractions() {
  const { dispatch } = useLayerEditor();

  // Removed global dblclick handler; handled in canvas component to avoid duplicate adds

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file') {
          const f = it.getAsFile(); if (!f) continue;
          const url = URL.createObjectURL(f);
          dispatch({ type: 'add_layer', layer: createImageLayer(url, 50, 50), atTop: true });
          break;
        }
        if (it.kind === 'string' && it.type === 'text/plain') {
          it.getAsString((txt) => {
            const layer = createDefaultText(50, 50);
            layer.text = txt.slice(0, 200);
            dispatch({ type: 'add_layer', layer, atTop: true });
          });
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [dispatch]);

  return null;
}


