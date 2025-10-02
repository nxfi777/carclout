"use client";
import React from "react";
import Toolbox from "@/components/layer-editor/Toolbox";
import ToolOptionsBar from "@/components/layer-editor/ToolOptionsBar";
import LayerCanvas from "@/components/layer-editor/LayerCanvas";
import AddViaToolInteractions from "@/components/layer-editor/AddViaToolInteractions";
import { TooltipProvider } from "@/components/ui/tooltip";
import MobileActions from "@/components/layer-editor/mobile-actions";
import { Wand2 } from "lucide-react";

export default function LayerEditorShell({ mobileHeaderAccessory, toolbarDownloadButton }: { mobileHeaderAccessory?: React.ReactNode; toolbarDownloadButton?: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 overflow-x-hidden">
        <div className="flex-1 min-w-0 space-y-2 overflow-x-hidden">
          <ToolOptionsBar
            accessory={mobileHeaderAccessory}
          />
          <div data-designer-canvas>
            <LayerCanvas />
          </div>
          <div className="flex justify-center">
            <Toolbox orientation="horizontal"
              extraEnd={({ tooltipSide, tooltipAlign, popoverSide, popoverAlign, popoverOffset }) => (
                <>
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
                  {toolbarDownloadButton}
                </>
              )}
            />
          </div>
        </div>
        <AddViaToolInteractions />
      </div>
    </TooltipProvider>
  );
}


