"use client";

import { useEffect, useState, memo } from "react";
import Image from "next/image";
import InstagramPhone from "@/components/instagram-phone";

function PhoneWithCarParallax() {
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Throttle mouse movement for better performance
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width; // 0..1
    const ny = (e.clientY - rect.top) / rect.height; // 0..1
    // normalize to -1..1
    const x = nx * 2 - 1;
    const y = ny * 2 - 1;
    setCursor({ x, y });
  };

  function handleLeave() {
    setCursor({ x: 0, y: 0 });
  }

  const phoneTranslate = `translate3d(${(cursor.x * 0.7).toFixed(3)}rem, ${(cursor.y * 0.7).toFixed(3)}rem, 0)`;
  const carTranslate = `translate3d(${(cursor.x * -0.4).toFixed(3)}rem, ${(cursor.y * -0.2).toFixed(3)}rem, 0)`;

  // Light device-orientation parallax on supported mobile devices
  useEffect(() => {
    let active = false;
    function handleOrientation(e: DeviceOrientationEvent) {
      // Prefer small ranges so the motion feels subtle
      const gamma = typeof e.gamma === "number" ? e.gamma : 0; // left-right
      const beta = typeof e.beta === "number" ? e.beta : 0; // front-back
      const maxGamma = 25; // degrees
      const maxBeta = 20; // degrees
      const nx = Math.max(-1, Math.min(1, gamma / maxGamma));
      const ny = Math.max(-1, Math.min(1, beta / maxBeta));
      setCursor({ x: nx, y: ny });
      active = true;
    }

    // Attempt to subscribe immediately where permission isn't required
    if (typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined") {
      try {
        window.addEventListener("deviceorientation", handleOrientation, true);
      } catch {}
    }

    // iOS requires a user gesture to grant permission; expose a helper on first touch
    function requestPermissionOnce() {
      // iOS Safari exposes DeviceOrientationEvent.requestPermission()
      const DOE = (DeviceOrientationEvent as unknown) as { requestPermission?: () => Promise<string> };
      if (DOE && typeof DOE.requestPermission === "function") {
        try {
          DOE.requestPermission()
            .then((res) => {
              if (res === "granted") {
                window.addEventListener("deviceorientation", handleOrientation, true);
              }
            })
            .catch(() => {});
        } catch {}
      }
      // Remove after first attempt
      window.removeEventListener("touchstart", requestPermissionOnce);
    }
    try {
      window.addEventListener("touchstart", requestPermissionOnce, { passive: true });
    } catch {}

    return () => {
      try { window.removeEventListener("deviceorientation", handleOrientation, true); } catch {}
      try { window.removeEventListener("touchstart", requestPermissionOnce); } catch {}
      if (!active) setCursor({ x: 0, y: 0 });
    };
  }, []);

  return (
    <div
      className="relative mx-auto flex items-center justify-center min-h-[22rem] sm:min-h-[26rem] md:min-h-[28rem] select-none w-full"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      // Try to request motion permission on first tap for iOS
      onTouchStart={() => { /* handled via global listener in effect */ }}
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
        className="relative z-[2] pointer-events-none max-w-[84vw] [--igp-w:12rem] sm:[--igp-w:16rem] md:[--igp-w:19rem]"
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
