"use client";

import { useEffect, useState, memo } from "react";
import Image from "next/image";
import InstagramPhone from "@/components/instagram-phone";

function PhoneWithCarParallax() {
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // Detect if device is mobile/touch-enabled
  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 1024; // lg breakpoint
      setIsMobile(isTouchDevice || isSmallScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Throttle mouse movement for better performance (desktop only)
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return; // Disable on mobile
    
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width; // 0..1
    const ny = (e.clientY - rect.top) / rect.height; // 0..1
    // normalize to -1..1
    const x = nx * 2 - 1;
    const y = ny * 2 - 1;
    setCursor({ x, y });
  };

  function handleLeave() {
    if (isMobile) return; // Disable on mobile
    setCursor({ x: 0, y: 0 });
  }

  const phoneTranslate = `translate3d(${(cursor.x * 0.7).toFixed(3)}rem, ${(cursor.y * 0.7).toFixed(3)}rem, 0)`;
  const carTranslate = `translate3d(${(cursor.x * -0.4).toFixed(3)}rem, ${(cursor.y * -0.2).toFixed(3)}rem, 0)`;

  // Device orientation parallax disabled to prevent unwanted movement on mobile
  // Users can interact with the phone carousel without triggering parallax effects

  return (
    <div
      className="relative mx-auto flex items-center justify-center min-h-[22rem] sm:min-h-[26rem] md:min-h-[28rem] select-none w-full"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {/* Car underneath with drop shadow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[58%] sm:top-1/2 -translate-y-1/2 z-0 flex justify-center"
      >
        <div
          className="relative w-full max-w-[min(50rem,96vw)] aspect-[21/9]"
          style={{ transform: carTranslate, transition: "transform 200ms ease-out" }}
        >
          <Image
            src="/car_full.webp"
            alt="Car"
            fill
            sizes="(max-width: 768px) 95vw, 36rem"
            className="object-contain [filter:drop-shadow(0_1.2rem_2.2rem_rgba(0,0,0,0.55))]"
            priority
            fetchPriority="high"
            quality={90}
          />
        </div>
      </div>

      {/* Phone on top */}
      <div
        className="relative z-2 pointer-events-none max-w-[84vw] [--igp-w:12rem] sm:[--igp-w:16rem] md:[--igp-w:19rem]"
        style={{
          transform: phoneTranslate,
          transition: "transform 200ms ease-out",
        }}
      >
        <div className="w-[var(--igp-w)]">
          <InstagramPhone />
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(PhoneWithCarParallax);
