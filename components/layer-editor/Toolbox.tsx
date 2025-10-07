"use client";
import React from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import { cn } from "@/lib/utils";
import { MousePointer2, Type, Images, Shapes, Layers, Paintbrush } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import LayersPanel from "@/components/layer-editor/LayersPanel";
import { SHOW_IMAGE_TOOL } from "@/components/layer-editor/config";

type Item = {
  id: import("@/types/layer-editor").ToolId;
  icon: React.ReactNode;
  label: string;
};

type ToolboxExtrasArgs = {
  isHorizontal: boolean;
  tooltipSide: "top" | "right" | "bottom" | "left";
  tooltipAlign: "start" | "center" | "end";
  popoverSide: "top" | "right" | "bottom" | "left";
  popoverAlign: "start" | "center" | "end";
  popoverOffset: number;
};

type ToolboxProps = {
  className?: string;
  orientation?: "vertical" | "horizontal";
  extraEnd?: React.ReactNode | ((args: ToolboxExtrasArgs) => React.ReactNode);
};

// Temporarily hide specific tools from the UI without removing them
const hiddenTools: Item["id"][] = ["shape", ...(SHOW_IMAGE_TOOL ? [] : ["image"])] as Item["id"][];

const items: Item[] = [
  { id: "select", icon: <MousePointer2 className="size-5" />, label: "Select" },
  { id: "text", icon: <Type className="size-5" />, label: "Text" },
  { id: "brush", icon: <Paintbrush className="size-5" />, label: "Draw to Edit" },
  { id: "shape", icon: <Shapes className="size-5" />, label: "Shapes" },
  { id: "image", icon: <Images className="size-5" />, label: "Image" },
];

export default function Toolbox({ className, orientation = "vertical", extraEnd }: ToolboxProps) {
  const { state, dispatch } = useLayerEditor();
  const isHorizontal = orientation === "horizontal";
  const tooltipSide = isHorizontal ? "top" : "right";
  const tooltipAlign: ToolboxExtrasArgs["tooltipAlign"] = "center";
  const popoverSide = isHorizontal ? "top" : "right";
  const popoverAlign = isHorizontal ? "center" : "start";
  const popoverOffset = isHorizontal ? 10 : 8;
  const extras = typeof extraEnd === "function"
    ? extraEnd({ isHorizontal, tooltipSide, tooltipAlign, popoverSide, popoverAlign, popoverOffset })
    : extraEnd;
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
              >
                {it.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} className="px-2 py-1 text-xs">
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
                  "flex items-center justify-center rounded-md focus-visible:outline-hidden bg-transparent hover:bg-white/10 shrink-0",
                  isHorizontal ? "h-12 w-12" : "h-10 sm:h-12 w-12"
                )}
                aria-label="Layers"
              >
                <Layers className="size-5" />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side={tooltipSide} className="px-2 py-1 text-xs">Layers</TooltipContent>
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
      {extras}
    </div>
  );
}


