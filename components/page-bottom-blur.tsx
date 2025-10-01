"use client";

import { useEffect, useState } from "react";
import GradualBlur from "@/components/gradual-blur";

export default function PageBottomBlur() {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const footer = document.querySelector("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHide(entry.isIntersecting);
      },
      { root: null, threshold: 0 }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  if (hide) return null;

  return (
    <GradualBlur
      target="page"
      position="bottom"
      height="7rem"
      strength={2.5}
      divCount={8}
      curve="bezier"
      exponential
      opacity={1}
      zIndex={9999}
      className="pointer-events-none"
    />
  );
}


