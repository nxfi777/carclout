"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDesignerActions } from "@/components/layer-editor/DesignerActionsContext";
import ElectricBorder from "@/components/electric-border";
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
}: {
  triggerIcon: React.ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipAlign?: "start" | "center" | "end";
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  popoverOffset?: number;
  buttonClassName?: string;
  isHorizontal: boolean;
}) {
  const { actions } = useDesignerActions();
  const mobileActions = actions.filter((it) => it.section !== "desktop-only");
  if (!mobileActions.length) return null;

  const primary = mobileActions.filter((it) => (it.section ?? "primary") === "primary");
  const leading = mobileActions.filter((it) => (it.section ?? "primary") === "leading");

  return (
    <Popover>
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
    return (
      <ElectricBorder key={action.key} color="#ff6a00" speed={1} chaos={0.6} thickness={2} className={wide ? "rounded-md" : "rounded-full"}>
        {content}
      </ElectricBorder>
    );
  }

  return content;
}


