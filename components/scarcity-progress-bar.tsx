"use client";

import { useEffect, useState } from "react";

export default function ScarcityProgressBar() {
  const [userCount, setUserCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/count")
      .then((res) => res.json())
      .then((data) => {
        setUserCount(data.count || 0);
        setLoading(false);
      })
      .catch(() => {
        setUserCount(0);
        setLoading(false);
      });
  }, []);

  // Calculate the next milestone (1000, 2000, 3000, etc.)
  const nextMilestone = Math.ceil(userCount / 1000) * 1000 || 1000;
  const percentage = Math.min(100, (userCount / nextMilestone) * 100);
  const spotsRemaining = Math.max(0, nextMilestone - userCount);

  if (loading) {
    return null; // Don't show until loaded
  }

  return (
    <div className="mt-[1.5rem] max-w-[28rem] mx-auto lg:mx-0">
      <div className="space-y-[0.75rem]">
        {/* Custom progress bar with gradient and glow */}
        <div className="relative w-full h-[0.625rem] rounded-full bg-[color:var(--card)] border border-[color:var(--border)] overflow-hidden shadow-[0_0_8px_rgba(91,108,255,0.15)]">
          {/* Gradient fill with glow */}
          <div 
            className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-[#5b6cff] via-[#7c4dff] to-[#15c0f6] shadow-[0_0_15px_rgba(91,108,255,0.7),0_0_25px_rgba(124,77,255,0.5)] transition-all duration-700 ease-out"
            style={{ 
              width: `${percentage}%`,
            }}
          >
            {/* Inner highlight for extra depth */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
          </div>
        </div>

        {/* Text labels */}
        <div className="flex items-center justify-between text-[0.85rem]">
          <div className="flex items-center gap-[0.4rem]">
            <span className="inline-block w-[0.5rem] h-[0.5rem] rounded-full bg-gradient-to-r from-[#5b6cff] to-[#15c0f6] shadow-[0_0_8px_rgba(91,108,255,0.8)] animate-pulse" />
            <span className="text-[color:var(--foreground)]/90 font-medium">
              {userCount.toLocaleString()} joined
            </span>
          </div>
          <div className="text-[color:var(--foreground)]/70">
            <span className="font-semibold text-[color:var(--primary)]">
              {spotsRemaining.toLocaleString()}
            </span>{" "}
            spots left at $1
          </div>
        </div>

        {/* Scarcity message */}
        <p className="text-[0.8rem] text-[color:var(--foreground)]/65 text-center lg:text-left leading-relaxed">
          ⚡ The $1 trial is only available for the first{" "}
          <span className="text-[color:var(--primary)] font-semibold">
            {nextMilestone.toLocaleString()}
          </span>{" "}
          members. Once filled, pricing increases.{" "}
          <span className="text-[color:var(--foreground)]/80 font-medium">
            Secure your spot now.
          </span>
        </p>
      </div>
    </div>
  );
}
