"use client";

import { useEffect, useRef, useState } from "react";
import {
  SiAudi, SiBmw, SiMercedes, SiVolkswagen, SiPorsche,
  SiFerrari, SiLamborghini, SiMaserati, SiAlfaromeo, SiFiat,
  SiToyota, SiHonda, SiNissan, SiMazda, SiSubaru, SiMitsubishi,
  SiHyundai, SiKia,
  SiFord, SiChevrolet, SiJeep, SiRam, SiTesla, SiCadillac,
  SiAstonmartin, SiBentley, SiRollsroyce, SiJaguar, SiLandrover, SiMclaren,
  SiPeugeot, SiRenault, SiCitroen, SiBugatti,
  SiVolvo,
  SiSkoda, SiSeat,
  SiDucati, SiYamahamotorcorporation, SiSuzuki,
  SiKtm,
} from "react-icons/si";
import { IconType } from "react-icons";

interface Brand {
  name: string;
  icon: IconType;
}

const brands: Brand[] = [
  // German Cars
  { name: "Audi", icon: SiAudi },
  { name: "BMW", icon: SiBmw },
  { name: "Mercedes-Benz", icon: SiMercedes },
  { name: "Volkswagen", icon: SiVolkswagen },
  { name: "Porsche", icon: SiPorsche },
  
  // Italian Cars
  { name: "Ferrari", icon: SiFerrari },
  { name: "Lamborghini", icon: SiLamborghini },
  { name: "Maserati", icon: SiMaserati },
  { name: "Alfa Romeo", icon: SiAlfaromeo },
  { name: "Fiat", icon: SiFiat },
  
  // Japanese Cars
  { name: "Toyota", icon: SiToyota },
  { name: "Honda", icon: SiHonda },
  { name: "Nissan", icon: SiNissan },
  { name: "Mazda", icon: SiMazda },
  { name: "Subaru", icon: SiSubaru },
  { name: "Mitsubishi", icon: SiMitsubishi },
  
  // Korean Cars
  { name: "Hyundai", icon: SiHyundai },
  { name: "Kia", icon: SiKia },
  
  // American Cars
  { name: "Ford", icon: SiFord },
  { name: "Chevrolet", icon: SiChevrolet },
  { name: "Jeep", icon: SiJeep },
  { name: "Ram", icon: SiRam },
  { name: "Tesla", icon: SiTesla },
  { name: "Cadillac", icon: SiCadillac },
  
  // British Cars
  { name: "Aston Martin", icon: SiAstonmartin },
  { name: "Bentley", icon: SiBentley },
  { name: "Rolls-Royce", icon: SiRollsroyce },
  { name: "Jaguar", icon: SiJaguar },
  { name: "Land Rover", icon: SiLandrover },
  { name: "McLaren", icon: SiMclaren },
  
  // French Cars
  { name: "Peugeot", icon: SiPeugeot },
  { name: "Renault", icon: SiRenault },
  { name: "Citroën", icon: SiCitroen },
  { name: "Bugatti", icon: SiBugatti },
  
  // Swedish Cars
  { name: "Volvo", icon: SiVolvo },
  
  // Czech/Spanish Cars
  { name: "Škoda", icon: SiSkoda },
  { name: "SEAT", icon: SiSeat },
  
  // Motorcycles
  { name: "Ducati", icon: SiDucati },
  { name: "Yamaha", icon: SiYamahamotorcorporation },
  { name: "Suzuki", icon: SiSuzuki },
  { name: "KTM", icon: SiKtm },
];

export default function BrandMarquee() {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [displayBrands, setDisplayBrands] = useState(brands);

  // Shuffle only on client after mount to avoid hydration mismatch
  useEffect(() => {
    setDisplayBrands([...brands].sort(() => Math.random() - 0.5));
  }, []);

  useEffect(() => {
    const marquee = marqueeRef.current;
    if (!marquee) return;

    // Clone items for seamless loop - clone 2 times on mobile for more logos
    const firstSet = marquee.querySelector(".marquee-content");
    if (!firstSet) return;
    
    const clone1 = firstSet.cloneNode(true);
    const clone2 = firstSet.cloneNode(true);
    marquee.appendChild(clone1);
    marquee.appendChild(clone2);
  }, []);

  return (
    <section className="w-full py-[3rem] md:py-[4rem] overflow-hidden relative">
      {/* Background gradient */}
      <div 
        aria-hidden 
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 8%, transparent), transparent 70%)"
        }}
      />

      {/* Marquee container with fade edges */}
      <div className="relative mb-[2rem]">
        {/* Left fade */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-[8rem] md:w-[12rem] z-[2] pointer-events-none"
          style={{
            background: "linear-gradient(to right, var(--background), transparent)"
          }}
        />
        
        {/* Right fade */}
        <div 
          className="absolute right-0 top-0 bottom-0 w-[8rem] md:w-[12rem] z-[2] pointer-events-none"
          style={{
            background: "linear-gradient(to left, var(--background), transparent)"
          }}
        />

        {/* Marquee */}
        <div 
          ref={marqueeRef}
          className="marquee-container flex gap-[2rem] md:gap-[4rem]"
          style={{ 
            animation: "marquee 25s linear infinite"
          }}
        >
          <div className="marquee-content flex gap-[2rem] md:gap-[4rem] shrink-0">
            {displayBrands.map((brand, index) => {
              const Icon = brand.icon;
              return (
                <div
                  key={`${brand.name}-${index}`}
                  className="flex flex-col items-center justify-center gap-[0.5rem] whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity duration-300"
                >
                  <Icon className="text-[2rem] md:text-[2.5rem] text-[color:var(--foreground)]/70" />
                  <span className="text-[0.75rem] md:text-[0.85rem] text-[color:var(--foreground)]/60 font-medium">{brand.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative z-[1] text-center mt-[2rem] px-[1rem]">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-[0.75rem] sm:gap-[1.5rem] text-[color:var(--foreground)]/70 text-[0.85rem] md:text-[0.95rem]">
          <span>🚗 Compatible With All Vehicles</span>
          <span className="hidden sm:inline text-[color:var(--border)]">•</span>
          <span>📸 Trusted by 80,000+ @nytforge followers</span>
          <span className="hidden sm:inline text-[color:var(--border)]">•</span>
          <span>🤝 25,000 Affiliates & Growing</span>
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
            animation-duration: 20s !important;
          }
        }

        /* Desktop: slower animation */
        @media (min-width: 769px) {
          .marquee-container {
            animation-duration: 35s !important;
          }
        }
      `}</style>
    </section>
  );
}
