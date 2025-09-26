"use client";
import React from "react";
import Toolbox from "@/components/layer-editor/Toolbox";
import ToolOptionsBar from "@/components/layer-editor/ToolOptionsBar";
import LayerCanvas from "@/components/layer-editor/LayerCanvas";
import AddViaToolInteractions from "@/components/layer-editor/AddViaToolInteractions";
import { TooltipProvider } from "@/components/ui/tooltip";
import MobileActions from "@/components/designer/mobile-actions";
import { Wand2 } from "lucide-react";

export default function LayerEditorShell() {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="hidden sm:block sticky top-2 sm:top-3 self-start">
          <Toolbox />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <ToolOptionsBar />
          <div data-designer-canvas>
            <LayerCanvas />
          </div>
          <div className="flex justify-center sm:hidden">
            <Toolbox orientation="horizontal"
              extraEnd={({ tooltipSide, tooltipAlign, popoverSide, popoverAlign, popoverOffset }) => (
                <MobileActions
                  triggerIcon={<Wand2 className="size-5" />}
                  tooltipSide={tooltipSide}
                  tooltipAlign={tooltipAlign}
                  popoverSide={popoverSide}
                  popoverAlign={popoverAlign}
                  popoverOffset={popoverOffset}
                  buttonClassName="flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10 h-10 sm:h-12 w-12"
                  isHorizontal
                />
              )}
            />
          </div>
        </div>
        <AddViaToolInteractions />
      </div>
    </TooltipProvider>
  );
}


