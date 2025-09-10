"use client";

import { usePathname } from "next/navigation";
import React from "react";

type FooterGateProps = {
  children: React.ReactNode;
};

export default function FooterGate({ children }: FooterGateProps) {
  const pathname = usePathname();
  const shouldHideFooter = pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin");

  if (shouldHideFooter) return null;
  return <>{children}</>;
}


