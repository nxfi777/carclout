"use client";
import React from "react";
import Toolbox from "@/components/layer-editor/Toolbox";
import ToolOptionsBar from "@/components/layer-editor/ToolOptionsBar";
import LayerCanvas from "@/components/layer-editor/LayerCanvas";
import AddViaToolInteractions from "@/components/layer-editor/AddViaToolInteractions";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function LayerEditorShell() {
  return (
    <TooltipProvider>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="sticky top-2 sm:top-3 self-start">
          <Toolbox />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <ToolOptionsBar />
          <div data-designer-canvas>
            <LayerCanvas />
          </div>
        </div>
        <AddViaToolInteractions />
      </div>
    </TooltipProvider>
  );
}


