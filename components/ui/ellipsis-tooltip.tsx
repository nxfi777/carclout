"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type EllipsisTooltipProps = {
  text: string;
  as?: "div" | "span" | "p";
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  /**
   * When true, on touch devices tapping the text toggles the tooltip.
   */
  mobileTap?: boolean;
};

export function EllipsisTooltip({
  text,
  as = "div",
  className,
  side = "top",
  mobileTap = true,
}: EllipsisTooltipProps) {
  const components = { div: "div", span: "span", p: "p" } as const;
  const Comp = components[as];
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [isCoarse, setIsCoarse] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    try {
      setIsCoarse(window.matchMedia("(pointer: coarse)").matches);
    } catch {}
  }, []);

  React.useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    const check = () => {
      try {
        const truncated = el.scrollWidth > el.clientWidth + 1; // small epsilon for rounding
        setIsTruncated(truncated);
      } catch {}
    };
    check();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => check());
      ro.observe(el);
    } catch {}
    window.addEventListener("resize", check);
    return () => {
      if (ro) try { ro.disconnect(); } catch {}
      window.removeEventListener("resize", check);
    };
  }, [text]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const triggerProps: React.HTMLAttributes<HTMLSpanElement> = {};
  if (isCoarse && mobileTap) {
    triggerProps.onClick = (e) => {
      e.stopPropagation();
      setOpen((v) => !v);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setOpen(false), 2000);
    };
  }

  return (
    <Comp>
      {isTruncated ? (
        <Tooltip open={isCoarse ? open : undefined} onOpenChange={isCoarse ? setOpen : undefined}>
          <TooltipTrigger asChild>
            <span
              ref={ref}
              className={cn("truncate cursor-help", className)}
              title={isCoarse ? undefined : text}
              {...triggerProps}
            >
              {text}
            </span>
          </TooltipTrigger>
          <TooltipContent side={side}>{text}</TooltipContent>
        </Tooltip>
      ) : (
        <span ref={ref} className={cn("truncate", className)} title={text}>{text}</span>
      )}
    </Comp>
  );
}

export default EllipsisTooltip;


