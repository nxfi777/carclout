"use client";
import React from "react";
import { useLayerEditor } from "@/components/layer-editor/LayerEditorProvider";
import { cn } from "@/lib/utils";
import { MousePointer2, Type, Images, Shapes, Layers } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import LayersPanel from "@/components/layer-editor/LayersPanel";

type Item = {
  id: import("@/types/layer-editor").ToolId;
  icon: React.ReactNode;
  label: string;
};

const items: Item[] = [
  { id: "select", icon: <MousePointer2 className="size-5" />, label: "Select" },
  { id: "text", icon: <Type className="size-5" />, label: "Text" },
  { id: "shape", icon: <Shapes className="size-5" />, label: "Shapes" },
  { id: "image", icon: <Images className="size-5" />, label: "Image" },
];

export default function Toolbox({ className }: { className?: string }) {
  const { state, dispatch } = useLayerEditor();
  return (
    <div className={cn("flex flex-col gap-1 p-1 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm w-12 sm:w-14", className)}>
      {items.map((it) => {
        const active = state.tool === it.id;
        return (
          <Tooltip key={it.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => dispatch({ type: "set_tool", tool: it.id })}
                className={cn(
                  "flex items-center justify-center rounded-md h-10 sm:h-12 focus-visible:outline-hidden",
                  active ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-white/10"
                )}
                aria-label={it.label}
              >
                {it.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="px-2 py-1 text-xs">
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
                  "flex items-center justify-center rounded-md h-10 sm:h-12 focus-visible:outline-hidden bg-transparent hover:bg-white/10"
                )}
                aria-label="Layers"
                title="Layers"
              >
                <Layers className="size-5" />
              </button>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent side="right" className="px-2 py-1 text-xs">Layers</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" sideOffset={8} className="p-0 w-64">
          <LayersPanel />
        </PopoverContent>
      </Popover>
    </div>
  );
}


