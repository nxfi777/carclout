/**
 * Blur placeholder utilities for images
 * Provides progressive loading with blur effect
 * 
 * Pre-generated base64 SVG blur placeholders for use in both
 * server and client components without runtime generation
 */

import { decode, isBlurhashValid } from 'blurhash';
import { useState, useEffect } from 'react';

/**
 * Pre-generated blur data URLs
 * These are base64-encoded SVG images with blur filters
 * Safe to use in both server and client components
 */
export const BLUR_DATA_URLS = {
  // Card background (default) - #111a36
  card: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PGZpbHRlciBpZD0iYiIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMTExYTM2IiBmaWx0ZXI9InVybCgjYikiLz48L3N2Zz4=',
  
  // Gradient from card to border color - #111a36 to #263166
  cardGradient: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMTExYTM2Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMjYzMTY2Ii8+PC9saW5lYXJHcmFkaWVudD48ZmlsdGVyIGlkPSJiIiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjEiLz48L2ZpbHRlcj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJ1cmwoI2cpIiBmaWx0ZXI9InVybCgjYikiLz48L3N2Zz4=',
  
  // Primary color - #5b6cff
  primary: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PGZpbHRlciBpZD0iYiIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjNWI2Y2ZmIiBmaWx0ZXI9InVybCgjYikiLz48L3N2Zz4=',
  
  // Black for photos - #000000
  black: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PGZpbHRlciBpZD0iYiIgY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzPSJzUkdCIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMDAwMDAwIiBmaWx0ZXI9InVybCgjYikiLz48L3N2Zz4=',
  
  // Shimmer effect
  shimmer: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgMjAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InNoaW1tZXIiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMTExYTM2Ii8+PHN0b3Agb2Zmc2V0PSI1MCUiIHN0b3AtY29sb3I9IiMxYTI1NDciLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMxMTFhMzYiLz48YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSJ4MSIgdmFsdWVzPSIwJTsxMDAlIiBkdXI9IjEuNXMiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+PGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ieDIiIHZhbHVlcz0iMTAwJTsyMDAlIiBkdXI9IjEuNXMiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+PC9saW5lYXJHcmFkaWVudD48ZmlsdGVyIGlkPSJibHVyIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxMCIvPjwvZmlsdGVyPjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0idXJsKCNzaGltbWVyKSIgZmlsdGVyPSJ1cmwoI2JsdXIpIi8+PC9zdmc+',
} as const;

/**
 * Generate a custom blur placeholder data URL
 * Works in both server and client components
 */
export function getClientBlurDataURL(color = '#111a36'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1"/></filter><rect width="10" height="10" fill="${color}" filter="url(#b)"/></svg>`;
  
  // Use btoa for client-side, works in browsers
  if (typeof window !== 'undefined') {
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
  
  // Server-side: encode as base64
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Generate a gradient blur placeholder
 * Works in both server and client components
 */
export function getGradientBlurDataURL(
  color1 = '#111a36',
  color2 = '#263166'
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1"/></filter></defs><rect width="10" height="10" fill="url(#g)" filter="url(#b)"/></svg>`;
  
  if (typeof window !== 'undefined') {
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Decode BlurHash to base64 data URL (client-side)
 * This creates an actual blurred preview of the image
 */
export function blurHashToDataURL(
  blurHash: string,
  width = 32,
  height = 32
): string {
  if (!blurHash || typeof window === 'undefined') {
    return BLUR_DATA_URLS.cardGradient;
  }

  try {
    const pixels = decode(blurHash, width, height);
    
    // Create canvas and draw pixels
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return BLUR_DATA_URLS.cardGradient;
    
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.toDataURL('image/webp', 0.1); // Low quality for smaller size
  } catch (error) {
    console.error('Error decoding blurhash:', error);
    return BLUR_DATA_URLS.cardGradient;
  }
}

/**
 * Decode BlurHash with caching (SSR-safe)
 * Returns a consistent SVG-based blur on server, then upgrades to full blurhash on client
 * Caches decoded blurhash in sessionStorage for performance
 */
export function blurHashToDataURLCached(
  blurHash: string,
  width = 32,
  height = 32
): string {
  if (!blurHash) return BLUR_DATA_URLS.cardGradient;
  
  // On server, return a static fallback to prevent hydration mismatches
  if (typeof window === 'undefined') {
    return BLUR_DATA_URLS.cardGradient;
  }
  
  const cacheKey = `blurhash:${blurHash}:${width}x${height}`;
  
  // Check cache
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch {}
  
  // Generate and cache
  const dataURL = blurHashToDataURL(blurHash, width, height);
  
  if (dataURL !== BLUR_DATA_URLS.cardGradient) {
    try {
      sessionStorage.setItem(cacheKey, dataURL);
    } catch {}
  }
  
  return dataURL;
}

/**
 * Check if string is a valid BlurHash
 */
export function isValidBlurHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  
  try {
    return isBlurhashValid(hash).result;
  } catch {
    return false;
  }
}

/**
 * Hook to get blurhash data URL in an SSR-safe way
 * Returns fallback during SSR/hydration, then upgrades to full blurhash on client
 * This prevents hydration mismatches
 */
export function useBlurHashDataURL(
  blurHash: string | undefined,
  width = 32,
  height = 32
): string {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Always use fallback during SSR and initial render
  if (!mounted || !blurHash) {
    return BLUR_DATA_URLS.cardGradient;
  }
  
  // After mount, use cached blurhash
  return blurHashToDataURLCached(blurHash, width, height);
}

