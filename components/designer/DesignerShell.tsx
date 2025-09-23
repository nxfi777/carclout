"use client";
import React from "react";
import Toolbox from "@/components/designer/Toolbox";
import LayersPanel from "@/components/designer/LayersPanel";
import ToolOptionsBar from "@/components/designer/ToolOptionsBar";
import DesignerCanvas from "@/components/designer/DesignerCanvas";
import AddViaToolInteractions from "@/components/designer/AddViaToolInteractions";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DesignerShell() {
  return (
    <TooltipProvider>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="sticky top-2 sm:top-3 self-start">
          <Toolbox />
          <div className="mt-2">
            <LayersPanel />
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <ToolOptionsBar />
          <div data-designer-canvas>
            <DesignerCanvas />
          </div>
        </div>
        <AddViaToolInteractions />
      </div>
    </TooltipProvider>
  );
}


