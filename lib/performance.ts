/**
 * Performance optimization utilities
 */

/**
 * Debounce function for performance-critical event handlers
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for limiting execution frequency
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lazy load component with error boundary
 */
export function lazyWithPreload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  const Component = React.lazy(factory);
  return Object.assign(Component, {
    preload: factory
  });
}

/**
 * Get optimal image quality based on device pixel ratio
 */
export function getOptimalImageQuality(): number {
  if (typeof window === 'undefined') return 85;
  
  const dpr = window.devicePixelRatio || 1;
  
  // Lower quality for high DPI displays (still looks good, saves bandwidth)
  if (dpr >= 3) return 70;
  if (dpr >= 2) return 80;
  return 85;
}

/**
 * Check if browser supports WebP
 */
export function supportsWebP(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
}

/**
 * Get connection type for adaptive loading
 */
export function getConnectionType(): 'slow' | 'medium' | 'fast' {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return 'medium';
  }
  
  const connection = (navigator as Navigator & { 
    connection?: { effectiveType?: string; saveData?: boolean } 
  }).connection;
  
  if (connection?.saveData) return 'slow';
  
  const effectiveType = connection?.effectiveType;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'slow';
  if (effectiveType === '3g') return 'medium';
  return 'fast';
}

/**
 * Preload critical assets
 */
export function preloadAssets(assets: { href: string; as: string; type?: string }[]): void {
  if (typeof document === 'undefined') return;
  
  assets.forEach(({ href, as, type }) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    if (type) link.type = type;
    document.head.appendChild(link);
  });
}

/**
 * Report Web Vitals to analytics
 */
export function reportWebVitals(metric: {
  id: string;
  name: string;
  value: number;
  label: 'web-vital' | 'custom';
}): void {
  if (typeof window === 'undefined') return;
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Web Vital:', metric);
  }
  
  // Send to analytics in production
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to Google Analytics
    if ('gtag' in window) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', metric.name, {
        value: Math.round(metric.value),
        event_label: metric.id,
        non_interaction: true,
      });
    }
  }
}

// Re-export React for lazyWithPreload
import React from 'react';

