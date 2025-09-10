"use client";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function DashboardCta({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (!path) return null;
  if (path.startsWith("/dashboard")) return null;
  return <>{children}</>;
}


