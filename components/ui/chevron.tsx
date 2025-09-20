"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type ChevronProps = React.SVGProps<SVGSVGElement> & {
  direction?: "left" | "right";
};

export function Chevron({ direction = "left", className, ...props }: ChevronProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", direction === "right" ? "rotate-180" : "", className)}
      aria-hidden
      {...props}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default Chevron;


