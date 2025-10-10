"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDesignerActions } from "@/components/layer-editor/DesignerActionsContext";
import { cn } from "@/lib/utils";

export default function MobileActions({
  triggerIcon,
  tooltipSide,
  tooltipAlign = "center",
  popoverSide,
  popoverAlign = "center",
  popoverOffset = 10,
  buttonClassName,
  isHorizontal,
  onOpenChange,
  onFirstClick,
}: {
  triggerIcon: React.ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipAlign?: "start" | "center" | "end";
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  popoverOffset?: number;
  buttonClassName?: string;
  isHorizontal: boolean;
  onOpenChange?: (open: boolean) => void;
  onFirstClick?: () => void;
}) {
  const { actions } = useDesignerActions();
  const mobileActions = actions.filter((it) => it.section !== "desktop-only");
  if (!mobileActions.length) return null;

  const primary = mobileActions.filter((it) => (it.section ?? "primary") === "primary");
  const leading = mobileActions.filter((it) => (it.section ?? "primary") === "leading");

  return (
    <Popover onOpenChange={(open) => {
      if (open && onFirstClick) {
        onFirstClick();
      }
      onOpenChange?.(open);
    }}>
      <Tooltip>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(buttonClassName, !buttonClassName && "flex items-center justify-center rounded-md focus-visible:outline-hidden shrink-0 bg-transparent hover:bg-white/10", isHorizontal ? "h-12 w-12" : "h-10 sm:h-12 w-12")}
              aria-label="Actions"
            >
              {triggerIcon}
            </button>
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent side={tooltipSide} align={tooltipAlign} className="px-2 py-1 text-xs">
          Actions
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align={popoverAlign}
        side={popoverSide}
        sideOffset={popoverOffset}
        className="w-[18rem] max-w-[80vw] p-0 border border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur"
      >
        <div className="p-3 space-y-3">
          {leading.length ? (
            <div className="flex flex-wrap gap-2">
              {leading.map((action) => (
                <ActionButton key={action.key} action={action} />
              ))}
            </div>
          ) : null}
          {primary.length ? (
            <div className="grid gap-2">
              {primary.map((action) => (
                <ActionButton key={action.key} action={action} wide />
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionButton({ action, wide }: { action: import("@/components/layer-editor/DesignerActionsContext").DesignerActionDescriptor; wide?: boolean }) {
  const content = (
    <Button
      type="button"
      variant={action.variant ?? "secondary"}
      onClick={async () => {
        try {
          await action.onSelect();
        } catch {}
      }}
      disabled={action.disabled || action.loading}
      className={cn("justify-center", wide ? "w-full" : "h-10")}
    >
      {action.loading ? (action.loadingLabel || "Working…") : (
        <>
          {action.icon ? <span className="mr-2 inline-flex">{action.icon}</span> : null}
          <span>{action.label}</span>
          {action.srLabel ? <span className="sr-only">{action.srLabel}</span> : null}
        </>
      )}
    </Button>
  );

  if (action.electric) {
    const color = "#8b5cf6"; // indigo/purple
    const thickness = 2;
    const borderRadius = wide ? "rounded-md" : "rounded-full";
    
    return (
      <div key={action.key} className={cn("relative isolate overflow-visible z-0", borderRadius)}>
        <div className={cn("absolute inset-0 pointer-events-none rounded-[inherit] z-[2]")}>
          <div className="absolute inset-0 rounded-[inherit]">
            {/* Main stroke */}
            <div 
              className="absolute inset-0 box-border rounded-[inherit]"
              style={{
                borderWidth: thickness,
                borderStyle: "solid",
                borderColor: color,
              }}
            />
            {/* Clipped glows */}
            <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
              {/* Glow 1 */}
              <div 
                className="absolute inset-0 box-border rounded-[inherit]"
                style={{
                  borderWidth: thickness,
                  borderStyle: "solid",
                  borderColor: `rgba(139, 92, 246, 0.6)`,
                  filter: `blur(${0.5 + thickness * 0.25}px)`,
                  opacity: 0.5,
                }}
              />
              {/* Glow 2 */}
              <div 
                className="absolute inset-0 box-border rounded-[inherit]"
                style={{
                  borderWidth: thickness,
                  borderStyle: "solid",
                  borderColor: color,
                  filter: `blur(${2 + thickness * 0.5}px)`,
                  opacity: 0.5,
                }}
              />
              {/* Background glow */}
              <div 
                className="absolute inset-0 rounded-[inherit]"
                style={{
                  transform: "scale(1.08)",
                  filter: "blur(32px)",
                  opacity: 0.3,
                  zIndex: -1,
                  background: `linear-gradient(-30deg, rgba(139, 92, 246, 0.8), transparent, ${color})`,
                }}
              />
            </div>
          </div>
        </div>
        <div className="relative h-full rounded-[inherit] z-[1]">
          {content}
        </div>
      </div>
    );
  }

  return content;
}


