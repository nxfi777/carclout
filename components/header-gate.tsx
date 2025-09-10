"use client";

import { usePathname } from "next/navigation";
import React from "react";

type HeaderGateProps = {
  children: React.ReactNode;
};

export default function HeaderGate({ children }: HeaderGateProps) {
  const pathname = usePathname();
  const shouldHideHeader = pathname?.startsWith("/studio");

  if (shouldHideHeader) return null;
  return <>{children}</>;
}


