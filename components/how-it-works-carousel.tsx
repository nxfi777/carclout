"use client";

import { useEffect, useRef, useState } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const videos = [
  {
    title: "Pick a Template",
    description: "Choose from viral templates that actually work",
    mp4: "/how-it-works/part1.mp4",
  },
  {
    title: "Upload Your Car",
    description: "Drop any photo of your car - no perfect shots needed",
    mp4: "/how-it-works/part2.mp4",
  },
  {
    title: "Post & Go Viral",
    description: "Get your viral-ready edit in seconds - just post it",
    mp4: "/how-it-works/part3.mp4",
  },
];

function VideoCard({ video, index, videoRef }: { video: typeof videos[0]; index: number; videoRef: (el: HTMLVideoElement | null) => void }) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  return (
    <Card className="border-[color:var(--border)] bg-[var(--card)] overflow-hidden h-full">
      {/* Video Container */}
      <div className="relative aspect-[4/3] bg-black/20 overflow-hidden" suppressHydrationWarning>
        {/* Skeleton placeholder (shown while video loads) */}
        {!isVideoLoaded && (
          <Skeleton className="absolute inset-0 w-full h-full" />
        )}
        
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          loop
          muted
          playsInline
          autoPlay
          preload="auto"
          onLoadedData={() => setIsVideoLoaded(true)}
          suppressHydrationWarning
        >
          <source src={video.mp4} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        {/* Step indicator overlay */}
        {isVideoLoaded && (
          <div className="absolute top-[1rem] left-[1rem] bg-[color:var(--primary)] text-white text-[0.75rem] font-bold px-[0.75rem] py-[0.35rem] rounded-full z-10">
            Step {index + 1}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-[1.25rem] md:p-[1.5rem] space-y-[0.5rem]">
        {isVideoLoaded ? (
          <>
            <h3 className="text-[1.1rem] md:text-[1.2rem] font-semibold">
              {video.title}
            </h3>
            <p className="text-[color:var(--foreground)]/70 text-[0.9rem] md:text-[0.95rem]">
              {video.description}
            </p>
          </>
        ) : (
          <>
            <Skeleton className="h-[1.2rem] w-[60%] mb-[0.5rem]" />
            <Skeleton className="h-[0.95rem] w-full" />
            <Skeleton className="h-[0.95rem] w-[80%]" />
          </>
        )}
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

  // Play initial video when component mounts (mobile only)
  useEffect(() => {
    // Small delay to ensure ref is set
    const timer = setTimeout(() => {
      playVideo(0);
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

