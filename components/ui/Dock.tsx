'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence
} from 'motion/react';
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  href?: string;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  orientation?: 'horizontal' | 'vertical';
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  mouse: MotionValue;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  axis: 'x' | 'y';
};

function DockItem({
  children,
  className = '',
  onClick,
  mouse,
  spring,
  distance,
  magnification,
  baseItemSize,
  axis
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouse, val => {
    const rect = ref.current?.getBoundingClientRect() ?? ({ x: 0, y: 0, width: baseItemSize, height: baseItemSize } as DOMRect);
    const center = axis === 'x' ? (rect.x + baseItemSize / 2) : (rect.y + baseItemSize / 2);
    return val - center;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-md bg-[var(--card)] border border-[color:var(--border)] shadow-sm cursor-pointer ${className}`}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return cloneElement<{ isHovered?: MotionValue<number> }>(
          child as React.ReactElement<{ isHovered?: MotionValue<number> }>,
          { isHovered }
        );
      })}
    </motion.div>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
};

function DockLabel({ children, className = '', ...rest }: DockLabelProps) {
  const { isHovered } = rest as { isHovered: MotionValue<number> };
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = isHovered.on('change', latest => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: 8 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`${className} absolute top-full left-1/2 mt-1 w-fit whitespace-pre rounded-md border border-[color:var(--border)] bg-[var(--popover)] px-2 py-0.5 text-2xs text-[color:var(--foreground)]/90 z-5`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
};

function DockIcon({ children, className = '' }: DockIconProps) {
  return <div className={`flex items-center justify-center ${className}`}>{children}</div>;
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 52,
  distance = 200,
  panelHeight = 56,
  dockHeight = 256,
  baseItemSize = 40,
  orientation = 'horizontal'
}: DockProps) {
  const mouse = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCoarse, setIsCoarse] = useState(false);
  useEffect(() => {
    try {
      const mql = window.matchMedia('(pointer: coarse)');
      setIsCoarse(mql.matches);
      const onChange = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    } catch {}
  }, []);
  const effectiveMagnification = useMemo(() => {
    if (isCoarse) return baseItemSize; // disable magnification on touch devices
    return Math.min(magnification, panelHeight - 8);
  }, [magnification, panelHeight, isCoarse, baseItemSize]);
  // When items magnify near the edges, reserve side padding so icons don't get clipped
  const horizontalSafePadding = useMemo(() => {
    const overshoot = Math.max(0, effectiveMagnification - baseItemSize);
    // default horizontal padding inside items container is 8px (px-2)
    // add full overshoot to each side to account for edge magnification + neighbor influence
    return 8 + Math.ceil(overshoot);
  }, [effectiveMagnification, baseItemSize]);
  // For vertical docks, estimate a height that comfortably wraps all items
  // so the panel background visually contains the dock on mobile.
  const computedDockHeight = useMemo(() => {
    if (orientation !== 'vertical') return panelHeight;
    // gap-3 => 0.75rem ~= 12px. We also add vertical padding from px-2 py-1 (=> 8px total vert padding)
    const gap = 12;
    const verticalPadding = 8; // total top+bottom padding inside the dock items container
    const estimated = items.length * baseItemSize + Math.max(0, items.length - 1) * gap + verticalPadding * 2;
    return Math.max(dockHeight, estimated);
  }, [orientation, items.length, baseItemSize, dockHeight, panelHeight]);

  // For horizontal docks, estimate a width so the container has intrinsic size
  // and remains visible within fit-content wrappers (e.g. desktop header).
  const computedDockWidth = useMemo(() => {
    if (orientation !== 'horizontal') return undefined;
    const gap = 12; // gap-3
    // Account for the safe side padding we add when magnifying near edges
    const horizontalPadding = horizontalSafePadding * 2; // left + right
    const estimated = items.length * baseItemSize + Math.max(0, items.length - 1) * gap + horizontalPadding;
    return Math.max(estimated, baseItemSize + horizontalPadding);
  }, [orientation, items.length, baseItemSize, horizontalSafePadding]);

  // For vertical docks, narrow panel width on coarse pointers
  const computedVerticalWidth = useMemo(() => {
    if (orientation !== 'vertical') return undefined;
    if (!isCoarse) return panelHeight; // keep roomy width on desktop
    const horizontalPadding = 16; // px-2 on both sides
    return baseItemSize + horizontalPadding + 8; // compact fit around icons
  }, [orientation, isCoarse, baseItemSize, panelHeight]);

  // Track mouse globally so the dock can magnify without needing a full-screen overlay that intercepts clicks
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) { isHovered.set(0); mouse.set(Infinity); return; }
      const threshold = Math.max(12, Math.floor(panelHeight / 2));
      if (orientation === 'horizontal') {
        const withinY = e.clientY >= (rect.top - threshold) && e.clientY <= (rect.bottom + threshold);
        if (!withinY) { isHovered.set(0); mouse.set(Infinity); return; }
        isHovered.set(1);
        mouse.set(e.pageX);
        return;
      }
      // vertical: track X distance
      const withinX = e.clientX >= (rect.left - threshold) && e.clientX <= (rect.right + threshold);
      if (!withinX) { isHovered.set(0); mouse.set(Infinity); return; }
      isHovered.set(1);
      mouse.set(e.pageY);
    }
    function onLeave() {
      isHovered.set(0);
      mouse.set(Infinity);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [mouse, isHovered, orientation, panelHeight]);

  return (
    <motion.div
      ref={containerRef}
      style={orientation === 'horizontal' ? { height: panelHeight, width: computedDockWidth, scrollbarWidth: 'none' } : { width: computedVerticalWidth ?? panelHeight, height: computedDockHeight, scrollbarWidth: 'none' }}
      className={`relative overflow-visible mx-2 flex max-w-full items-center`}
    >
      <motion.div
        className={`${className} absolute inset-0 flex ${orientation === 'horizontal' ? 'items-center justify-center' : 'items-start justify-start'} pointer-events-none`}
        style={orientation === 'horizontal' ? { height: panelHeight, width: computedDockWidth } : { width: computedVerticalWidth ?? panelHeight, height: computedDockHeight }}
        role="toolbar"
        aria-label="Application dock"
      >
        <div
          className={`pointer-events-none flex ${orientation === 'horizontal' ? 'items-end flex-row' : 'items-end flex-col'} gap-3 rounded-xl bg-transparent`}
          style={orientation === 'horizontal' ? { paddingLeft: horizontalSafePadding, paddingRight: horizontalSafePadding, paddingTop: 4, paddingBottom: 4 } : { paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
        >
          {items.map((item, index) => (
            <ContextMenu key={index}>
              <ContextMenuTrigger asChild>
                <button type="button" className="pointer-events-auto bg-transparent p-0 border-0 overflow-visible">
                  <DockItem
                    onClick={item.onClick}
                    className={`${item.className || ''}`}
                    mouse={mouse}
                    spring={spring}
                    distance={distance}
                    magnification={effectiveMagnification}
                    baseItemSize={baseItemSize}
                    axis={orientation === 'horizontal' ? 'x' : 'y'}
                  >
                    <DockIcon>{item.icon}</DockIcon>
                    <DockLabel>{item.label}</DockLabel>
                  </DockItem>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); try { if (typeof item.onClick === 'function') { item.onClick(); } else if (item.href) { window.location.assign(item.href); } } catch {} }}>Open</ContextMenuItem>
                {item.href ? (
                  <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); try { window.open(item.href as string, '_blank', 'noopener,noreferrer'); } catch {} }}>Open in new tab</ContextMenuItem>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}


