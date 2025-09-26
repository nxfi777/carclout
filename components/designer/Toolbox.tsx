"use client";
import React from "react";
import { useDesigner } from "@/components/designer/DesignerProvider";
import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Type,
  Images,
  BoxSelect,
  Shapes,
  PaintBucket,
  Layers,
  Wand2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import LayersPanel from "@/components/designer/LayersPanel";
import MobileActions from "@/components/designer/mobile-actions";

type Item = {
  id: import("@/types/designer").ToolId;
  icon: React.ReactNode;
  label: string;
};

type ToolboxProps = {
  className?: string;
  orientation?: "vertical" | "horizontal";
  showMobileActions?: boolean;
};

// Temporarily hide specific tools from the UI without removing them
const hiddenTools: Item["id"][] = ["shape", "image"];

const items: Item[] = [
  { id: "select", icon: <MousePointer2 className="size-5" />, label: "Select" },
  { id: "text", icon: <Type className="size-5" />, label: "Text" },
  { id: "marquee", icon: <BoxSelect className="size-5" />, label: "Marquee" },
  { id: "shape", icon: <Shapes className="size-5" />, label: "Shapes" },
  { id: "image", icon: <Images className="size-5" />, label: "Image" },
  { id: "fill", icon: <PaintBucket className="size-5" />, label: "Fill" },
];

export default function Toolbox({ className, orientation = "vertical", showMobileActions }: ToolboxProps) {
  const { state, dispatch } = useDesigner();
  const isHorizontal = orientation === "horizontal";
  const tooltipSide = isHorizontal ? "top" : "right";
  const tooltipAlign: "start" | "center" | "end" = "center";
  const popoverSide = isHorizontal ? "top" : "right";
  const popoverAlign = isHorizontal ? "center" : "start";
  const popoverOffset = isHorizontal ? 10 : 8;
  return (
    <div
      className={cn(
        "flex rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm",
        isHorizontal
          ? "flex-row items-center justify-center gap-4 px-5 py-3"
          : "flex-col gap-1 p-1 w-12 sm:w-14",
        className,
      )}
    >
      {items.filter((it) => !hiddenTools.includes(it.id)).map((it) => {
        const active = state.tool === it.id;
        return (
          <Tooltip key={it.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => dispatch({ type: "set_tool", tool: it.id })}
                className={cn(
                  "flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0",
                  isHorizontal ? "h-12 w-12" : "h-10 sm:h-12 w-12",
                  active ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-white/10"
                )}
                aria-label={it.label}
                title={it.label}
              >
                {it.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} align={tooltipAlign} sideOffset={6} className="px-2 py-1 text-xs">
              {it.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <Popover>
        <Tooltip>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10",
                  isHorizontal ? "h-12 w-12" : "h-10 sm:h-12 w-12"
                )}
                aria-label="Layers"
                title="Layers"
              >
                <Layers className="size-5" />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side={tooltipSide} align={tooltipAlign} className="px-2 py-1 text-xs">Layers</TooltipContent>
        </Tooltip>
        <PopoverContent
          align={popoverAlign}
          side={popoverSide}
          sideOffset={popoverOffset}
          className="p-0 w-64"
        >
          <LayersPanel />
        </PopoverContent>
      </Popover>
      {showMobileActions ? (
        <MobileActions
          triggerIcon={<Wand2 className="size-5" />}
          tooltipSide={tooltipSide}
          tooltipAlign={tooltipAlign}
          buttonClassName={cn(
            "flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10",
            isHorizontal ? "h-12 w-12" : "h-10 sm:h-12 w-12",
          )}
          isHorizontal={isHorizontal}
          popoverSide={popoverSide}
          popoverAlign={popoverAlign}
          popoverOffset={popoverOffset}
        />
      ) : null}
    </div>
  );
}


