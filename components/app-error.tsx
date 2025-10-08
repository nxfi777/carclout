"use client";
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ElectricBorder from "@/components/electric-border";
import { cn } from "@/lib/utils";

type AppErrorProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  details?: string | React.ReactNode;
  className?: string;
};

export default function AppError({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
  details,
  className,
}: AppErrorProps) {
  return (
    <div className={cn("w-full flex items-center justify-center py-[6rem] px-3", className)}>
      <div className="relative max-w-2xl w-full">
        <ElectricBorder color="#5b6cff" thickness={2} className="rounded-2xl">
          <div className="rounded-2xl bg-[color:var(--popover)]/70 border border-[color:var(--border)] backdrop-blur p-6 md:p-8 text-center">
            <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)]/80">
              {/* spark icon style via CSS only */}
              <span aria-hidden className="block h-[0.55rem] w-[0.55rem] rotate-45 bg-[color:var(--primary)] shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_70%,transparent)]" />
            </div>
            <h2 className="text-lg md:text-xl font-semibold tracking-wide mb-2">{title}</h2>
            <p className="text-sm md:text-base text-[color:var(--foreground)]/80 mb-5 leading-relaxed">
              {description}
            </p>
            {details ? (
              <div className="text-xs md:text-sm text-[color:var(--foreground)]/60 mb-5 max-h-[12rem] overflow-auto text-left whitespace-pre-wrap">
                {details}
              </div>
            ) : null}
            <div className="flex items-center justify-center gap-2 md:gap-3">
              {onRetry ? (
                <Button onClick={onRetry} className="h-9 px-5">
                  Try again
                </Button>
              ) : null}
              <Button asChild variant="outline" className="h-9 px-5">
                <Link href="/">Go home</Link>
              </Button>
            </div>
          </div>
        </ElectricBorder>
        {/* ambient hero-like glow */}
        <div aria-hidden className="pointer-events-none absolute -z-1 inset-x-0 -top-24 h-[18rem]">
          <div className="mx-auto max-w-xl h-full rounded-[2.5rem] opacity-60" style={{
            background:
              "radial-gradient(60% 60% at 50% 30%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 65%)",
            filter: "blur(60px)",
          }} />
        </div>
      </div>
    </div>
  );
}


