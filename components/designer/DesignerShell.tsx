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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="hidden sm:flex sm:flex-col sm:gap-3 sm:sticky sm:top-3 sm:self-start">
          <Toolbox />
          <LayersPanel />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <ToolOptionsBar />
          <div data-designer-canvas>
            <DesignerCanvas />
          </div>
          <div className="flex justify-center sm:hidden">
          <Toolbox orientation="horizontal" showMobileActions />
          </div>
        </div>
        <AddViaToolInteractions />
      </div>
    </TooltipProvider>
  );
}


