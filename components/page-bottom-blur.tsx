"use client";

import { useEffect, useState } from "react";
import GradualBlur from "@/components/gradual-blur";

export default function PageBottomBlur() {
  const [opacity, setOpacity] = useState(1);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Wait for brand marquee to be in DOM
    const checkForMarquee = () => {
      const marquee = document.querySelector('[data-marquee-section]');
      if (!marquee) {
        setTimeout(checkForMarquee, 100);
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          // Only fade out, never fade back in
          // When intersection ratio is 0, opacity stays at current value
          // When intersection ratio reaches 0.3+, opacity becomes 0 and stays there
          if (entry.intersectionRatio > 0) {
            const newOpacity = Math.max(0, 1 - (entry.intersectionRatio / 0.3));
            setOpacity(newOpacity);
            
            // Once fully faded out, mark as dismissed
            if (newOpacity === 0) {
              setDismissed(true);
            }
          }
        },
        { 
          root: null, 
          threshold: Array.from({ length: 31 }, (_, i) => i * 0.01) // 0, 0.01, 0.02, ..., 0.3
        }
      );

      observer.observe(marquee);
      return () => observer.disconnect();
    };

    const cleanup = checkForMarquee();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  if (dismissed || opacity === 0) return null;

  return (
    <div 
      style={{ 
        opacity, 
        transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none'
      }}
    >
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
    </div>
  );
}


