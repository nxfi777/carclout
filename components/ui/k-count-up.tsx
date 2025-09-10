"use client";

import { useEffect, useState } from "react";
import CountUp from "@/components/ui/count-up";

interface KCountUpProps {
  toK: number; // e.g. 77 for 77k
  durationTo999?: number; // seconds for first leg
  durationToK?: number; // seconds for second leg
  className?: string;
}

export default function KCountUp({ toK, durationTo999 = 0.8, durationToK = 0.8, className = "" }: KCountUpProps) {
  const [phase, setPhase] = useState<"first" | "second">("first");

  // When first phase ends, trigger second after a tiny delay
  useEffect(() => {
    if (phase === "first") {
      const id = setTimeout(() => setPhase("second"), (durationTo999 + 0.05) * 1000);
      return () => clearTimeout(id);
    }
  }, [phase, durationTo999]);

  if (phase === "first") {
    return <CountUp to={999} duration={durationTo999} className={className} />;
  }

  return (
    <span className="inline-flex items-center">
      <CountUp from={1} to={toK} duration={durationToK} className={className} />
      <span className={className}>k</span>
    </span>
  );
}


