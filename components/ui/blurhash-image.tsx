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
  className,
  onLoad,
  priority,
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

  return (
    <div className="relative w-full h-full">
      {showSkeleton && !isLoaded && (
        <Skeleton className={cn('absolute inset-0', skeletonClassName)} />
      )}
      <NextImage
        {...props}
        className={cn(
          className,
          showSkeleton && 'transition-opacity duration-700',
          showSkeleton && !isLoaded && 'opacity-0'
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
 * BlurHash Background Image
 * For use with fill prop
 */
export function BlurhashBackgroundImage({
  blurhash,
  showSkeleton = true,
  fallbackBlur = 'cardGradient',
  skeletonClassName,
  className,
  onLoad,
  ...props
}: BlurhashImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const blurDataURL = useMemo(() => {
    if (blurhash) {
      return blurHashToDataURLCached(blurhash, 32, 32);
    }
    return BLUR_DATA_URLS[fallbackBlur];
  }, [blurhash, fallbackBlur]);

  return (
    <>
      {showSkeleton && !isLoaded && (
        <Skeleton className={cn('absolute inset-0 rounded-none', skeletonClassName)} />
      )}
      <NextImage
        {...props}
        className={cn(
          className,
          showSkeleton && 'transition-opacity duration-700',
          showSkeleton && !isLoaded && 'opacity-0'
        )}
        placeholder="blur"
        blurDataURL={blurDataURL}
        onLoad={(e) => {
          setIsLoaded(true);
          onLoad?.(e);
        }}
      />
    </>
  );
}

