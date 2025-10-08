'use client';

import { useState, useMemo } from 'react';
import NextImage, { ImageProps } from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { blurHashToDataURLCached, BLUR_DATA_URLS } from '@/lib/blur-placeholder';
import { cn } from '@/lib/utils';

interface BlurhashImageProps extends Omit<ImageProps, 'placeholder' | 'blurDataURL'> {
  /**
   * BlurHash string (if available)
   * If provided, shows actual blurred image preview
   * If not, falls back to color blur
   */
  blurhash?: string;
  /**
   * Show skeleton while loading (default: true)
   */
  showSkeleton?: boolean;
  /**
   * Fallback blur style if no blurhash provided
   */
  fallbackBlur?: keyof typeof BLUR_DATA_URLS;
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
 * BlurHash Image Component
 * 
 * Automatically decodes BlurHash to show actual blurred image preview.
 * Falls back to color blur if BlurHash not available.
 * 
 * @example
 * <BlurhashImage 
 *   src="/image.webp" 
 *   alt="Description"
 *   width={600}
 *   height={400}
 *   blurhash="LKO2?V%2Tw=w]~RBVZRi};RPxuwH"
 *   showSkeleton={true}
 * />
 */
export function BlurhashImage({
  blurhash,
  showSkeleton = true,
  fallbackBlur = 'cardGradient',
  skeletonClassName,
  fuseSkeleton = false,
  className,
  onLoad,
  priority,
  src,
  ...props
}: BlurhashImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Decode blurhash to data URL (memoized for performance)
  const blurDataURL = useMemo(() => {
    if (blurhash) {
      return blurHashToDataURLCached(blurhash, 32, 32);
    }
    return BLUR_DATA_URLS[fallbackBlur];
  }, [blurhash, fallbackBlur]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  // If src is empty or invalid, just show the blurhash placeholder
  const hasValidSrc = src && src !== '';

  return (
    <div className="relative w-full h-full" suppressHydrationWarning>
      {showSkeleton && !isLoaded && (
        fuseSkeleton ? (
          // Fusion mode: subtle pulsing overlay on top of blurhash
          <div className={cn('absolute inset-0 z-1 bg-white/5 animate-pulse', skeletonClassName)} />
        ) : (
          // Legacy mode: solid skeleton background
          <Skeleton className={cn('absolute inset-0', skeletonClassName)} />
        )
      )}
      {hasValidSrc ? (
        <NextImage
          {...props}
          src={src}
          className={cn(
            className,
            showSkeleton && !fuseSkeleton && 'transition-opacity duration-700',
            showSkeleton && !fuseSkeleton && !isLoaded && 'opacity-0'
          )}
          placeholder="blur"
          blurDataURL={blurDataURL}
          onLoad={handleLoad}
          loading={priority ? undefined : 'lazy'}
          priority={priority}
        />
      ) : (
        // Just show the blurhash placeholder without NextImage
        <div 
          className={cn('absolute inset-0', className)}
          style={{
            backgroundImage: `url("${blurDataURL}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
    </div>
  );
}

/**
 * BlurHash Background Image
 * For use with fill prop
 */
export function BlurhashBackgroundImage({
  blurhash,
  showSkeleton = true,
  fallbackBlur = 'cardGradient',
  skeletonClassName,
  fuseSkeleton = false,
  className,
  onLoad,
  src,
  ...props
}: BlurhashImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const blurDataURL = useMemo(() => {
    if (blurhash) {
      return blurHashToDataURLCached(blurhash, 32, 32);
    }
    return BLUR_DATA_URLS[fallbackBlur];
  }, [blurhash, fallbackBlur]);

  // If src is empty or invalid, just show the blurhash placeholder
  const hasValidSrc = src && src !== '';

  return (
    <>
      {showSkeleton && !isLoaded && (
        fuseSkeleton ? (
          // Fusion mode: subtle pulsing overlay on top of blurhash
          <div className={cn('absolute inset-0 z-1 bg-white/5 animate-pulse rounded-none', skeletonClassName)} />
        ) : (
          // Legacy mode: solid skeleton background
          <Skeleton className={cn('absolute inset-0 rounded-none', skeletonClassName)} />
        )
      )}
      {hasValidSrc ? (
        <NextImage
          {...props}
          src={src}
          className={cn(
            className,
            showSkeleton && !fuseSkeleton && 'transition-opacity duration-700',
            showSkeleton && !fuseSkeleton && !isLoaded && 'opacity-0'
          )}
          placeholder="blur"
          blurDataURL={blurDataURL}
          onLoad={(e) => {
            setIsLoaded(true);
            onLoad?.(e);
          }}
        />
      ) : (
        // Just show the blurhash placeholder without NextImage
        <div 
          className={cn('absolute inset-0', className)}
          style={{
            backgroundImage: `url("${blurDataURL}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
    </>
  );
}

