'use client';

import { useState } from 'react';
import NextImage, { ImageProps } from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { getClientBlurDataURL, BLUR_DATA_URLS } from '@/lib/blur-placeholder';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends Omit<ImageProps, 'placeholder' | 'blurDataURL'> {
  /**
   * Show skeleton while loading (default: true)
   * Works seamlessly with blur placeholder
   */
  showSkeleton?: boolean;
  /**
   * Blur placeholder color (default: card background)
   */
  blurColor?: string;
  /**
   * Use predefined blur style (overrides blurColor)
   */
  blurStyle?: keyof typeof BLUR_DATA_URLS;
  /**
   * Custom skeleton class
   */
  skeletonClassName?: string;
  /**
   * Fuse skeleton with blurhash - shows blurhash with subtle pulsing overlay (default: false)
   * When true, blurhash is visible with pulse effect on top
   * When false, uses solid skeleton background (legacy behavior)
   */
  fuseSkeleton?: boolean;
}

/**
 * Optimized Image Component
 * 
 * Combines Next.js Image with:
 * - Blur placeholder for progressive loading
 * - Optional skeleton loader (shadcn compatible)
 * - Automatic lazy loading (except priority images)
 * 
 * @example
 * <OptimizedImage 
 *   src="/image.webp" 
 *   alt="Description"
 *   width={600}
 *   height={400}
 *   showSkeleton={true}
 *   blurStyle="cardGradient"
 * />
 */
export function OptimizedImage({
  showSkeleton = true,
  blurColor = '#111a36',
  blurStyle,
  skeletonClassName,
  fuseSkeleton = false,
  className,
  onLoad,
  priority,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const blurDataURL = blurStyle 
    ? BLUR_DATA_URLS[blurStyle]
    : getClientBlurDataURL(blurColor);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  return (
    <div className="relative w-full h-full">
      {showSkeleton && !isLoaded && (
        fuseSkeleton ? (
          // Fusion mode: subtle pulsing overlay on top of blurhash
          <div className={cn('absolute inset-0 z-10 bg-white/5 animate-pulse', skeletonClassName)} />
        ) : (
          // Legacy mode: solid skeleton background
          <Skeleton className={cn('absolute inset-0', skeletonClassName)} />
        )
      )}
      <NextImage
        {...props}
        className={cn(
          className,
          showSkeleton && !fuseSkeleton && 'transition-opacity duration-500',
          showSkeleton && !fuseSkeleton && !isLoaded && 'opacity-0'
        )}
        placeholder="blur"
        blurDataURL={blurDataURL}
        onLoad={handleLoad}
        loading={priority ? undefined : 'lazy'}
        priority={priority}
      />
    </div>
  );
}

/**
 * Optimized Background Image
 * 
 * For use with fill prop - automatically handles parent positioning
 */
export function OptimizedBackgroundImage({
  showSkeleton = true,
  blurColor = '#111a36',
  blurStyle,
  skeletonClassName,
  fuseSkeleton = false,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const blurDataURL = blurStyle 
    ? BLUR_DATA_URLS[blurStyle]
    : getClientBlurDataURL(blurColor);

  return (
    <>
      {showSkeleton && !isLoaded && (
        fuseSkeleton ? (
          // Fusion mode: subtle pulsing overlay on top of blurhash
          <div className={cn('absolute inset-0 z-10 bg-white/5 animate-pulse rounded-none', skeletonClassName)} />
        ) : (
          // Legacy mode: solid skeleton background
          <Skeleton className={cn('absolute inset-0 rounded-none', skeletonClassName)} />
        )
      )}
      <NextImage
        {...props}
        className={cn(
          props.className,
          showSkeleton && !fuseSkeleton && 'transition-opacity duration-500',
          showSkeleton && !fuseSkeleton && !isLoaded && 'opacity-0'
        )}
        placeholder="blur"
        blurDataURL={blurDataURL}
        onLoad={(e) => {
          setIsLoaded(true);
          props.onLoad?.(e);
        }}
      />
    </>
  );
}

