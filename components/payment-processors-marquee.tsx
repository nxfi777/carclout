"use client";

import { useEffect, useRef, useState } from "react";
import {
  SiStripe,
  SiPaypal,
  SiApplepay,
  SiGooglepay,
  SiAmazonpay,
  SiRevolut,
  SiVisa,
  SiMastercard,
  SiAmericanexpress,
  SiDiscover,
} from "react-icons/si";
import { IconType } from "react-icons";

interface Processor {
  name: string;
  icon: IconType;
}

const processors: Processor[] = [
  { name: "Stripe", icon: SiStripe },
  { name: "PayPal", icon: SiPaypal },
  { name: "Apple Pay", icon: SiApplepay },
  { name: "Google Pay", icon: SiGooglepay },
  { name: "Amazon Pay", icon: SiAmazonpay },
  { name: "Revolut", icon: SiRevolut },
  { name: "Visa", icon: SiVisa },
  { name: "Mastercard", icon: SiMastercard },
  { name: "American Express", icon: SiAmericanexpress },
  { name: "Discover", icon: SiDiscover },
];

export default function PaymentProcessorsMarquee() {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [displayProcessors, setDisplayProcessors] = useState(processors);

  // Shuffle only on client after mount to avoid hydration mismatch
  useEffect(() => {
    setDisplayProcessors([...processors].sort(() => Math.random() - 0.5));
  }, []);

  useEffect(() => {
    const marquee = marqueeRef.current;
    if (!marquee) return;

    // Clone items for seamless loop
    const firstSet = marquee.querySelector(".marquee-content");
    if (!firstSet) return;
    
    const clone1 = firstSet.cloneNode(true);
    const clone2 = firstSet.cloneNode(true);
    marquee.appendChild(clone1);
    marquee.appendChild(clone2);
  }, []);

  return (
    <section className="w-full py-[2.5rem] md:py-[3rem] overflow-hidden relative">
      {/* Background gradient */}
      <div 
        aria-hidden 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 6%, transparent), transparent 70%)"
        }}
      />

      <div className="relative z-1 text-center mb-[2rem] px-[1rem]">
        <h3 className="text-[1.2rem] md:text-[1.4rem] font-semibold text-[color:var(--foreground)]/90">
          🔒 Secured by trusted processors
        </h3>
      </div>

      {/* Marquee container with fade edges */}
      <div className="relative">
        {/* Left fade */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-[8rem] md:w-[12rem] z-2 pointer-events-none"
          style={{
            background: "linear-gradient(to right, var(--background), transparent)"
          }}
        />
        
        {/* Right fade */}
        <div 
          className="absolute right-0 top-0 bottom-0 w-[8rem] md:w-[12rem] z-2 pointer-events-none"
          style={{
            background: "linear-gradient(to left, var(--background), transparent)"
          }}
        />

        {/* Marquee */}
        <div 
          ref={marqueeRef}
          className="marquee-container flex gap-[2.5rem] md:gap-[4rem]"
          style={{ 
            animation: "marquee 20s linear infinite"
          }}
        >
          <div className="marquee-content flex gap-[2.5rem] md:gap-[4rem] shrink-0">
            {displayProcessors.map((processor, index) => {
              const Icon = processor.icon;
              return (
                <div
                  key={`${processor.name}-${index}`}
                  className="flex flex-col items-center justify-center gap-[0.5rem] whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity duration-300"
                >
                  <Icon className="text-[2rem] md:text-[2.5rem] text-[color:var(--foreground)]/70" />
                  <span className="text-[0.75rem] md:text-[0.85rem] text-[color:var(--foreground)]/60 font-medium">{processor.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-100% / 3));
          }
        }

        /* Mobile: faster animation */
        @media (max-width: 768px) {
          .marquee-container {
            animation-duration: 15s !important;
          }
        }

        /* Desktop: slower animation */
        @media (min-width: 769px) {
          .marquee-container {
            animation-duration: 25s !important;
          }
        }
      `}</style>
    </section>
  );
}

