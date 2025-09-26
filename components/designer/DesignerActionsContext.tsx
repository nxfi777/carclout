"use client";

import React from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

export type DesignerActionDescriptor = {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  icon?: React.ReactNode;
  srLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  electric?: boolean;
  section?: "leading" | "primary" | "desktop-only";
};

type DesignerActionsContextValue = {
  actions: DesignerActionDescriptor[];
};

const DesignerActionsContext = React.createContext<DesignerActionsContextValue | null>(null);

export function DesignerActionsProvider({ value, children }: { value: DesignerActionsContextValue; children: React.ReactNode }) {
  return <DesignerActionsContext.Provider value={value}>{children}</DesignerActionsContext.Provider>;
}

export function useDesignerActions() {
  const ctx = React.useContext(DesignerActionsContext);
  if (!ctx) {
    throw new Error("useDesignerActions must be used within DesignerActionsProvider");
  }
  return ctx;
}


