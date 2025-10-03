"use client";
import React, { useEffect, useState } from "react";
import Toolbox from "@/components/layer-editor/Toolbox";
import ToolOptionsBar from "@/components/layer-editor/ToolOptionsBar";
import LayerCanvas from "@/components/layer-editor/LayerCanvas";
import AddViaToolInteractions from "@/components/layer-editor/AddViaToolInteractions";
import { TooltipProvider } from "@/components/ui/tooltip";
import MobileActions from "@/components/layer-editor/mobile-actions";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

function AnimatedWand({ hasBeenClicked, isPopoverOpen }: { hasBeenClicked: boolean; isPopoverOpen: boolean }) {
  const [isAnimatingOrange, setIsAnimatingOrange] = useState(false);

  useEffect(() => {
    if (hasBeenClicked) {
      setIsAnimatingOrange(false);
      return;
    }

    let mainTimeout: NodeJS.Timeout;
    let glowTimeout: NodeJS.Timeout;

    const scheduleNext = () => {
      // Random delay between 3-8 seconds before next glow
      const delay = Math.random() * 5000 + 3000;
      
      mainTimeout = setTimeout(() => {
        setIsAnimatingOrange(true);
        // Glow lasts 2 seconds
        glowTimeout = setTimeout(() => {
          setIsAnimatingOrange(false);
          scheduleNext();
        }, 2000);
      }, delay);
    };

    scheduleNext();

    return () => {
      clearTimeout(mainTimeout);
      clearTimeout(glowTimeout);
    };
  }, [hasBeenClicked]);

  const shouldBeOrange = isPopoverOpen || (isAnimatingOrange && !hasBeenClicked);
  const shouldJiggle = isAnimatingOrange && !hasBeenClicked;

  return (
    <Wand2 
      className={cn(
        "size-5 transition-colors duration-1000 ease-in-out",
        shouldBeOrange ? "text-orange-500" : "text-current"
      )} 
      style={{
        animation: shouldJiggle ? "jiggle 0.5s ease-in-out infinite" : "none"
      }}
    />
  );
}

export default function LayerEditorShell({ mobileHeaderAccessory, toolbarDownloadButton }: { mobileHeaderAccessory?: React.ReactNode; toolbarDownloadButton?: React.ReactNode }) {
  const [hasBeenClicked, setHasBeenClicked] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <TooltipProvider>
      <style jsx global>{`
        @keyframes jiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
      `}</style>
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
                    triggerIcon={<AnimatedWand hasBeenClicked={hasBeenClicked} isPopoverOpen={isPopoverOpen} />}
                    tooltipSide={tooltipSide}
                    tooltipAlign={tooltipAlign}
                    popoverSide={popoverSide}
                    popoverAlign={popoverAlign}
                    popoverOffset={popoverOffset}
                    buttonClassName="flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10 h-10 sm:h-12 w-12"
                    isHorizontal
                    onOpenChange={setIsPopoverOpen}
                    onFirstClick={() => setHasBeenClicked(true)}
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


