'use client';

import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import Image from 'next/image';

//  Assets ---------------------------------------------------------------
const FALLBACK =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" ' +
  'width="160" height="220"><rect width="100%" height="100%" ' +
  'fill="%23e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle"' +
  ' text-anchor="middle" fill="%234a5568" font-size="18">Image</text></svg>';

//  Config ---------------------------------------------------------------
const CARD_W = 180;
const CARD_H = 240;
const RADIUS = 240;
const TILT_SENSITIVITY = 10;
const DRAG_SENSITIVITY = 0.5;
const INERTIA_FRICTION = 0.95;
const AUTOSPIN_SPEED = 0.08;
const IDLE_TIMEOUT = 2000;

//  Types ----------------------------------------------------------------
export interface ThreeDCarouselItem { image: string; text: string; videoUrl?: string }

interface CardProps {
  src: string;
  videoUrl?: string;
  transform: string;
  cardW: number;
  cardH: number;
  active: boolean;
  canPlayWithSound: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick?: () => void;
}

//  Card Component (Memoized for Performance) ---------------------------
const Card = React.memo(({ src, videoUrl, transform, cardW, cardH, active, canPlayWithSound, onHoverStart, onHoverEnd, onClick }: CardProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && videoUrl) {
      try { if (v.src !== videoUrl) { v.src = videoUrl; v.load(); } } catch {}
      v.loop = true; v.playsInline = true; v.preload = 'metadata';
      try { v.volume = 1; } catch {}
      if (canPlayWithSound) {
        v.muted = false;
        v.play().catch(() => {
          // Fallback for autoplay policies: retry muted
          try { v.muted = true; v.play().catch(() => {}); } catch {}
        });
      } else {
        v.muted = true;
        v.play().catch(() => {});
      }
    } else {
      try { v.pause(); } catch {}
    }
  }, [active, videoUrl, canPlayWithSound]);

  return (
    <div
      className="absolute"
      style={{ width: cardW, height: cardH, transform, transformStyle: 'preserve-3d', willChange: 'transform' }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onTouchStart={onHoverStart}
      onTouchEnd={onHoverEnd}
      onClick={onClick}
    >
      <div
        className="w-full h-full rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-gray-900/50 transition-transform duration-300 hover:scale-105 hover:shadow-2xl dark:hover:shadow-gray-900/70 hover:z-10"
        style={{ backfaceVisibility: 'hidden', position: 'relative' }}
      >
        {/* Video layer */}
        {videoUrl ? (
          <video
            ref={videoRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: active ? 1 : 0, transition: 'opacity 200ms ease' }}
            crossOrigin="anonymous"
          />
        ) : null}
        {/* Image layer */}
        <CarouselImage
          src={src}
          width={cardW}
          height={cardH}
          active={active}
        />
      </div>
    </div>
  );
});

Card.displayName = 'Card';

//  Main component -------------------------------------------------------
interface ThreeDCarouselProps {
  items: ThreeDCarouselItem[];
  radius?: number;
  cardW?: number;
  cardH?: number;
  gap?: number;
  onItemClick?: (item: ThreeDCarouselItem, index: number) => void;
}

const ThreeDCarousel = React.memo(({ items, radius = RADIUS, cardW = CARD_W, cardH = CARD_H, gap = 16, onItemClick }: ThreeDCarouselProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const rotationRef = useRef(0);
  const tiltRef = useRef(0);
  const targetTiltRef = useRef(0);
  const velocityRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(0);
  const initialRotationRef = useRef(0);
  const lastInteractionRef = useRef(Date.now());
  const animationFrameRef = useRef<number | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastHoverIdxRef = useRef<number | null>(null);
  const [canPlaySound, setCanPlaySound] = useState(false);

  // Initialize or resume AudioContext on first user gesture
  useEffect(() => {
    function tryInit() {
      try {
        if (audioCtxRef.current) return;
        const Ctor = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
        audioCtxRef.current = new Ctor();
      } catch {}
    }
    const onAny = () => {
      tryInit();
      try { audioCtxRef.current?.resume().catch(() => {}); } catch {}
      try { setCanPlaySound(true); } catch {}
    };
    window.addEventListener('pointerdown', onAny, { once: true });
    window.addEventListener('keydown', onAny, { once: true });
    return () => {
      try { window.removeEventListener('pointerdown', onAny); } catch {}
      try { window.removeEventListener('keydown', onAny); } catch {}
    };
  }, []);

  const playHoverTone = useCallback((index: number) => {
    try {
      const ctx = audioCtxRef.current || new (AudioContext as unknown as { new(): AudioContext })();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') { try { ctx.resume().catch(() => {}); } catch {} }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Map index to a pleasant short blip frequency
      const base = 520;
      const freq = base + ((index % 12) * 28);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
    } catch {}
  }, []);

  // Play subtle hover tone when active card changes
  useEffect(() => {
    if (hoverIdx === null) return;
    if (hoverIdx === lastHoverIdxRef.current) return;
    lastHoverIdxRef.current = hoverIdx;
    playHoverTone(hoverIdx);
  }, [hoverIdx, playHoverTone]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!parentRef.current || isDraggingRef.current) return;
      lastInteractionRef.current = Date.now();
      const parentRect = parentRef.current.getBoundingClientRect();
      const mouseY = e.clientY - parentRect.top;
      const normalizedY = (mouseY / parentRect.height - 0.5) * 2;
      targetTiltRef.current = -normalizedY * TILT_SENSITIVITY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => { window.removeEventListener('mousemove', handleMouseMove); };
  }, []);

  useEffect(() => {
    const animate = () => {
      if (!isDraggingRef.current) {
        if (Math.abs(velocityRef.current) > 0.01) {
          rotationRef.current += velocityRef.current;
          velocityRef.current *= INERTIA_FRICTION;
        } else if (Date.now() - lastInteractionRef.current > IDLE_TIMEOUT) {
          rotationRef.current += AUTOSPIN_SPEED;
        }
      }
      tiltRef.current += (targetTiltRef.current - tiltRef.current) * 0.1;
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotateX(${tiltRef.current}deg) rotateY(${rotationRef.current}deg)`;
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, []);

  const handleDragStart = useCallback((clientX: number) => {
    lastInteractionRef.current = Date.now();
    isDraggingRef.current = true;
    velocityRef.current = 0;
    dragStartRef.current = clientX;
    initialRotationRef.current = rotationRef.current;
  }, []);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDraggingRef.current) return;
    lastInteractionRef.current = Date.now();
    const deltaX = clientX - dragStartRef.current;
    const newRotation = initialRotationRef.current + deltaX * DRAG_SENSITIVITY;
    velocityRef.current = newRotation - rotationRef.current;
    rotationRef.current = newRotation;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    lastInteractionRef.current = Date.now();
  }, []);

  const onMouseDown = (e: React.MouseEvent) => handleDragStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => handleDragMove(e.clientX);
  const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => handleDragMove(e.touches[0].clientX);

  // Compute effective radius to avoid overlap based on count and width (+gap)
  const effectiveRadius = useMemo(() => {
    const count = Math.max(1, items.length);
    const minCircumference = count * (cardW + gap);
    const minRadius = minCircumference / (2 * Math.PI);
    return Math.max(radius, minRadius);
  }, [items.length, cardW, gap, radius]);

  // Pre-compute card transforms (only re-computes if items/radius change)
  const cards = useMemo(() => items.map((it, idx) => {
    const angle = (idx * 360) / Math.max(1, items.length);
    return { key: idx, src: it.image, videoUrl: it.videoUrl, transform: `rotateY(${angle}deg) translateZ(${effectiveRadius}px)` };
  }), [items, effectiveRadius]);

  return (
    <div
      ref={parentRef}
      className="w-full h-full flex items-center justify-center overflow-hidden font-sans cursor-grab active:cursor-grabbing"
      style={{ userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleDragEnd}
    >
      <div
        className="relative"
        style={{ perspective: 1500, perspectiveOrigin: 'center', width: Math.max(cardW * 1.5, effectiveRadius * 2.2), height: Math.max(cardH * 1.8, effectiveRadius * 1.5) }}
      >
        <div
          ref={wheelRef}
          className="relative"
          style={{ width: cardW, height: cardH, transformStyle: 'preserve-3d', willChange: 'transform', position: 'absolute', left: '50%', top: '50%', marginLeft: -cardW / 2, marginTop: -cardH / 2 }}
        >
          {cards.map((card, idx) => (
            <Card
              key={card.key}
              src={card.src}
              videoUrl={card.videoUrl}
              transform={card.transform}
              cardW={cardW}
              cardH={cardH}
              active={hoverIdx === idx}
              canPlayWithSound={canPlaySound}
              onHoverStart={() => setHoverIdx(idx)}
              onHoverEnd={() => setHoverIdx(v => v === idx ? null : v)}
              onClick={() => {
                try {
                  const it = items[idx];
                  if (onItemClick) { onItemClick(it, idx); return; }
                } catch {}
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

ThreeDCarousel.displayName = 'ThreeDCarousel';

export default ThreeDCarousel;

// separate component to handle next/image error fallback cleanly
function CarouselImage({ src, width, height, active }: { src: string; width: number; height: number; active: boolean }) {
  const [imgError, setImgError] = useState(false);
  const renderedSrc = imgError ? FALLBACK : src;
  return (
    <Image
      src={renderedSrc}
      alt="Carousel item"
      width={width}
      height={height}
      className="w-full h-full object-cover"
      loading="lazy"
      draggable={false}
      onError={() => setImgError(true)}
      style={{ opacity: active ? 0 : 1, transition: 'opacity 200ms ease' }}
      unoptimized
    />
  );
}


