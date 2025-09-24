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
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Item = {
  id: import("@/types/designer").ToolId;
  icon: React.ReactNode;
  label: string;
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

export default function Toolbox({ className }: { className?: string }) {
  const { state, dispatch } = useDesigner();
  return (
    <div className={cn("flex flex-col gap-1 p-1 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-sm w-12 sm:w-14", className)}>
      {items.filter((it) => !hiddenTools.includes(it.id)).map((it) => {
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
                title={it.label}
              >
                {it.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6}>{it.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}


