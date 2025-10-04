"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { Card } from "@/components/ui/card";
import { blurHashToDataURLCached } from "@/lib/blur-placeholder";
import videoMetadata from "@/public/how-it-works/video-blurhash.json";

const videos = [
  {
    title: "Pick a Template",
    description: "Choose from viral templates that actually work",
    mp4: videoMetadata[0]!.mp4,
    blurhash: videoMetadata[0]!.blurhash,
  },
  {
    title: "Upload Your Car",
    description: "Drop any photo of your car - no perfect shots needed",
    mp4: videoMetadata[1]!.mp4,
    blurhash: videoMetadata[1]!.blurhash,
  },
  {
    title: "Post & Go Viral",
    description: "Get your viral-ready edit in seconds - just post it",
    mp4: videoMetadata[2]!.mp4,
    blurhash: videoMetadata[2]!.blurhash,
  },
];

function VideoCard({ 
  video, 
  index, 
  videoRef, 
  currentIndex 
}: { 
  video: typeof videos[0]; 
  index: number; 
  videoRef: (el: HTMLVideoElement | null) => void;
  currentIndex: number;
}) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Avoid hydration mismatch by only showing blurhash after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Calculate preload strategy based on proximity to current slide
  // Current video: "auto" (full preload)
  // Adjacent videos (next/prev): "auto" (prefetch for smooth navigation)
  // Other videos: "metadata" (minimal preload)
  const getPreloadStrategy = () => {
    const distance = Math.abs(index - currentIndex);
    if (distance === 0) return "auto"; // Current video
    if (distance === 1) return "auto"; // Adjacent videos (next/prev)
    // For looping carousel with 3 items, check wraparound distance
    const loopDistance = Math.min(
      Math.abs(index - currentIndex),
      Math.abs(index - currentIndex + videos.length),
      Math.abs(index - currentIndex - videos.length)
    );
    if (loopDistance === 1) return "auto"; // Adjacent when wrapping
    return "metadata"; // Far videos
  };

  // Convert blurhash to data URL for background (memoized for performance)
  const blurhashDataURL = useMemo(() => {
    if (video.blurhash) {
      return blurHashToDataURLCached(video.blurhash, 32, 24);
    }
    return undefined;
  }, [video.blurhash]);

  return (
    <Card className="border-[color:var(--border)] bg-[var(--card)] overflow-hidden h-full">
      {/* Video Container */}
      <div className="relative aspect-[4/3] bg-black/20 overflow-hidden" suppressHydrationWarning>
        {/* BlurHash background (shown while video loads) - client-only to avoid hydration mismatch */}
        {isMounted && !isVideoLoaded && blurhashDataURL && (
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundImage: `url(${blurhashDataURL})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        
        <video
          ref={videoRef}
          className="w-full h-full object-cover transition-opacity duration-500 opacity-0"
          style={{ opacity: isVideoLoaded ? 1 : 0 }}
          loop
          muted
          playsInline
          autoPlay
          preload={getPreloadStrategy()}
          onLoadedData={() => setIsVideoLoaded(true)}
          suppressHydrationWarning
        >
          <source src={video.mp4} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        {/* Step indicator overlay - always visible */}
        <div className="absolute top-[0.75rem] left-[0.75rem] md:top-[1rem] md:left-[1rem] bg-[color:var(--primary)] text-white text-[0.75rem] md:text-[0.8rem] font-bold px-[0.75rem] py-[0.35rem] rounded-full z-10 shadow-lg">
          Step {index + 1}
        </div>
      </div>

      {/* Content */}
      <div className="p-[1.25rem] md:p-[1.5rem] space-y-[0.5rem]">
        <h3 className="text-[1.1rem] md:text-[1.2rem] font-semibold">
          {video.title}
        </h3>
        <p className="text-[color:var(--foreground)]/70 text-[0.9rem] md:text-[0.95rem]">
          {video.description}
        </p>
      </div>
    </Card>
  );
}

export default function HowItWorksCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    if (!api) return;

    api.on("select", () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      
      // Pause all videos
      videoRefs.current.forEach((video) => {
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });
      
      // Play the selected video
      playVideo(index);
      
      // Prefetch adjacent videos for smooth navigation
      prefetchAdjacentVideos(index);
    });
  }, [api]);

  const playVideo = (index: number) => {
    const video = videoRefs.current[index];
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {
        // Autoplay might be blocked, that's ok
      });
    }
  };

  // Prefetch adjacent videos when current video changes
  const prefetchAdjacentVideos = (currentIndex: number) => {
    const totalVideos = videos.length;
    
    // Calculate next and previous indices (with looping)
    const nextIndex = (currentIndex + 1) % totalVideos;
    const prevIndex = (currentIndex - 1 + totalVideos) % totalVideos;
    
    // Trigger load on adjacent videos
    [nextIndex, prevIndex].forEach((idx) => {
      const video = videoRefs.current[idx];
      if (video && video.readyState < 2) {
        // If video hasn't loaded enough data, trigger load
        video.load();
      }
    });
  };

  // Play initial video when component mounts
  useEffect(() => {
    // Small delay to ensure ref is set
    const timer = setTimeout(() => {
      playVideo(0);
      // Prefetch adjacent videos on mount
      prefetchAdjacentVideos(0);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="w-full py-[3rem] md:py-[4rem] px-[1rem]">
      <div className="max-w-[30rem] mx-auto">
        {/* Header */}
        <div className="text-center space-y-[0.6rem] mb-[2.5rem]">
          <h2 className="text-[1.6rem] md:text-[2rem] font-semibold">How It Works</h2>
          <p className="text-[color:var(--foreground)]/80 text-[0.95rem] md:text-[1.05rem]">
            From car pic to viral post in 3 simple steps
          </p>
        </div>

        {/* Carousel - Desktop and Mobile (1 video at a time) */}
        <Carousel
          setApi={setApi}
          opts={{
            align: "center",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {videos.map((video, index) => (
              <CarouselItem key={index} className="basis-full">
                <VideoCard
                  video={video}
                  index={index}
                  currentIndex={current}
                  videoRef={(el) => {
                    videoRefs.current[index] = el;
                  }}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* Navigation chevrons - Desktop only */}
          <div className="hidden md:block">
            <CarouselPrevious />
            <CarouselNext />
          </div>
        </Carousel>

        {/* Dots indicator */}
        <div className="flex justify-center gap-[0.5rem] mt-[1.5rem]">
          {videos.map((_, index) => (
            <button
              key={index}
              onClick={() => api?.scrollTo(index)}
              className={`h-[0.5rem] rounded-full transition-all duration-300 ${
                current === index
                  ? "w-[2rem] bg-[color:var(--primary)]"
                  : "w-[0.5rem] bg-[color:var(--foreground)]/30"
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

