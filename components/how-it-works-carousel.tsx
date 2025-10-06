"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
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
  isActive
}: { 
  video: typeof videos[0]; 
  index: number; 
  videoRef: (el: HTMLVideoElement | null) => void;
  isActive: boolean;
}) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoElementRef2 = useRef<HTMLVideoElement | null>(null); // Second video for seamless looping
  const [activeVideo, setActiveVideo] = useState<1 | 2>(1); // Track which video is active
  const hasTriggeredTransition = useRef(false); // Track if transition was triggered for current video
  const wasActive = useRef(isActive); // Track previous active state

  // Avoid hydration mismatch by only showing blurhash after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track when video loaded state changes
  useEffect(() => {
    console.log(`[HowItWorks] Video ${index} isVideoLoaded changed to: ${isVideoLoaded}`);
  }, [isVideoLoaded, index]);

  // iOS Safari fix: check readyState directly after mount
  // iOS Safari sometimes doesn't fire onLoadedData reliably
  useEffect(() => {
    if (!isMounted || isVideoLoaded) return;

    const checkVideo = () => {
      const video = videoElementRef.current;
      const video2 = videoElementRef2.current;
      console.log(`[HowItWorks] Video ${index} readyState check - video1: ${video?.readyState || 'null'}, video2: ${video2?.readyState || 'null'}`);
      if (video && video.readyState >= 2) {
        console.log(`[HowItWorks] Video ${index} instance 1 ready via readyState check`);
        setIsVideoLoaded(true);
      }
      // Also ensure second video is loaded
      if (video2 && video2.readyState < 2) {
        console.log(`[HowItWorks] Video ${index} instance 2 loading triggered`);
        video2.load();
      }
    };

    // Check immediately
    checkVideo();

    // Check again after short delays (iOS can be slow)
    const timer1 = setTimeout(checkVideo, 300);
    const timer2 = setTimeout(checkVideo, 1000);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isMounted, isVideoLoaded, index]);

  // Reset transition trigger when active video changes
  useEffect(() => {
    console.log(`[HowItWorks] Video ${index} active video changed to: ${activeVideo}, resetting transition trigger`);
    hasTriggeredTransition.current = false;
  }, [activeVideo, index]);

  // Reset to first video when this card becomes active (only on transition from inactive to active)
  useEffect(() => {
    const justBecameActive = isActive && !wasActive.current;
    
    if (justBecameActive) {
      console.log(`[HowItWorks] Video ${index} becoming active, resetting state`);
      // Reset to video 1 when becoming active
      setActiveVideo(1);
      hasTriggeredTransition.current = false;
      
      // Ensure video 1 starts from beginning
      if (videoElementRef.current) {
        videoElementRef.current.currentTime = 0;
      }
      // Pause video 2 if it was playing
      if (videoElementRef2.current) {
        videoElementRef2.current.pause();
        videoElementRef2.current.currentTime = 0;
      }
    }
    
    // Update the previous active state
    wasActive.current = isActive;
  }, [isActive, index]);

  // Ensure second video is loaded and ready
  useEffect(() => {
    if (isVideoLoaded && videoElementRef2.current) {
      const video2 = videoElementRef2.current;
      if (video2.readyState < 2) {
        console.log(`[HowItWorks] Video ${index} loading second instance`);
        video2.load();
      }
    }
  }, [isVideoLoaded, index]);

  // Seamless loop handler: start the other video before current one ends
  const handleTimeUpdate = useCallback((videoNum: 1 | 2) => {
    const currentVid = videoNum === 1 ? videoElementRef.current : videoElementRef2.current;
    const otherVid = videoNum === 1 ? videoElementRef2.current : videoElementRef.current;
    
    if (!currentVid || !otherVid || !currentVid.duration || !isActive) {
      if (!currentVid || !otherVid) {
        console.log(`[HowItWorks] Video ${index} timeUpdate - missing video refs`);
      }
      return;
    }
    
    // Only trigger if this is the active video and we haven't triggered yet
    if (activeVideo !== videoNum || hasTriggeredTransition.current) return;
    
    // When we're very close to the end, start crossfade (increase window to 0.5s for better reliability)
    const timeRemaining = currentVid.duration - currentVid.currentTime;
    
    // Log state periodically (every second)
    if (Math.abs(currentVid.currentTime % 1) < 0.1) {
      console.log(`[HowItWorks] Video ${index} video${videoNum} playing - time: ${currentVid.currentTime.toFixed(2)}/${currentVid.duration.toFixed(2)}, readyState: ${currentVid.readyState}, otherVideo readyState: ${otherVid.readyState}, paused: ${currentVid.paused}, activeVideo: ${activeVideo}`);
    }
    
    if (timeRemaining < 0.5 && timeRemaining > 0 && !currentVid.paused) {
      console.log(`[HowItWorks] Video ${index} triggering crossfade from video ${videoNum} to ${videoNum === 1 ? 2 : 1}, timeRemaining: ${timeRemaining.toFixed(3)}, otherVideo readyState: ${otherVid.readyState}`);
      hasTriggeredTransition.current = true;
      
      // Ensure the other video is loaded and ready
      if (otherVid.readyState < 2) {
        console.warn(`[HowItWorks] Video ${index} WARNING: other video not ready (readyState: ${otherVid.readyState}), loading now`);
        otherVid.load();
      }
      
      // CRITICAL: Use flushSync to force synchronous state update BEFORE starting playback
      // This ensures React re-renders with correct opacity before onPlay fires
      const nextVideoNum = videoNum === 1 ? 2 : 1;
      console.log(`[HowItWorks] Video ${index} switching activeVideo from ${videoNum} to ${nextVideoNum} with flushSync`);
      flushSync(() => {
        setActiveVideo(nextVideoNum);
      });
      console.log(`[HowItWorks] Video ${index} flushSync complete, activeVideo should now be ${nextVideoNum}`);
      
      // Start the other video from beginning (now state is updated synchronously)
      otherVid.currentTime = 0;
      console.log(`[HowItWorks] Video ${index} starting video ${nextVideoNum} from beginning`);
      const playPromise = otherVid.play();
      if (playPromise) {
        playPromise.then(() => {
          console.log(`[HowItWorks] Video ${index} video ${nextVideoNum} play promise resolved`);
        }).catch((err) => {
          console.error(`[HowItWorks] Video ${index} video ${nextVideoNum} play error:`, err);
        });
      }
    }
  }, [activeVideo, index, isActive]);
  
  // With only 3 videos, preload all of them immediately for instant navigation
  const getPreloadStrategy = () => {
    return "auto"; // Always preload all videos since there are only 3
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
        {/* BlurHash background (always visible as fallback during transitions) - client-only to avoid hydration mismatch */}
        {isMounted && blurhashDataURL && (
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundImage: `url(${blurhashDataURL})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        
        {/* First video instance */}
        <video
          ref={(el) => {
            videoElementRef.current = el;
            videoRef(el);
          }}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-150"
          style={{ 
            opacity: (isVideoLoaded && activeVideo === 1) ? 1 : 0,
            transform: 'translate3d(0, 0, 0)', // Force hardware acceleration on iOS
            WebkitTransform: 'translate3d(0, 0, 0)',
          }}
          autoPlay
          muted
          playsInline
          preload={getPreloadStrategy()}
          onLoadedData={() => {
            console.log(`[HowItWorks] Video ${index} instance 1 onLoadedData fired, readyState: ${videoElementRef.current?.readyState}`);
            setIsVideoLoaded(true);
          }}
          onCanPlay={() => {
            console.log(`[HowItWorks] Video ${index} instance 1 onCanPlay fired, readyState: ${videoElementRef.current?.readyState}`);
          }}
          onPlay={() => {
            console.log(`[HowItWorks] Video ${index} instance 1 onPlay fired, currentTime: ${videoElementRef.current?.currentTime}, opacity should be: ${(isVideoLoaded && activeVideo === 1) ? 1 : 0}`);
          }}
          onPause={() => {
            console.log(`[HowItWorks] Video ${index} instance 1 onPause fired, currentTime: ${videoElementRef.current?.currentTime}`);
          }}
          onTimeUpdate={() => handleTimeUpdate(1)}
          onEnded={() => {
            // Fallback: if crossfade didn't trigger, manually switch to other video
            console.log(`[HowItWorks] Video ${index} instance 1 ended - fallback triggering, activeVideo: ${activeVideo}, isActive: ${isActive}`);
            if (activeVideo === 1 && isActive) {
              const otherVid = videoElementRef2.current;
              if (otherVid) {
                console.log(`[HowItWorks] Video ${index} fallback: starting instance 2, readyState: ${otherVid.readyState}`);
                // Use flushSync to ensure synchronous state update
                flushSync(() => {
                  setActiveVideo(2);
                });
                otherVid.currentTime = 0;
                otherVid.play().catch(() => {});
                hasTriggeredTransition.current = false;
              }
            }
          }}
          suppressHydrationWarning
        >
          <source src={video.mp4} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {/* Second video instance for seamless looping */}
        <video
          ref={videoElementRef2}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-150"
          style={{ 
            opacity: (isVideoLoaded && activeVideo === 2) ? 1 : 0,
            transform: 'translate3d(0, 0, 0)', // Force hardware acceleration on iOS
            WebkitTransform: 'translate3d(0, 0, 0)',
          }}
          muted
          playsInline
          preload={getPreloadStrategy()}
          onLoadedData={() => {
            console.log(`[HowItWorks] Video ${index} instance 2 onLoadedData fired, readyState: ${videoElementRef2.current?.readyState}`);
          }}
          onCanPlay={() => {
            console.log(`[HowItWorks] Video ${index} instance 2 onCanPlay fired, readyState: ${videoElementRef2.current?.readyState}`);
          }}
          onPlay={() => {
            console.log(`[HowItWorks] Video ${index} instance 2 onPlay fired, currentTime: ${videoElementRef2.current?.currentTime}, opacity should be: ${(isVideoLoaded && activeVideo === 2) ? 1 : 0}`);
          }}
          onPause={() => {
            console.log(`[HowItWorks] Video ${index} instance 2 onPause fired, currentTime: ${videoElementRef2.current?.currentTime}`);
          }}
          onTimeUpdate={() => handleTimeUpdate(2)}
          onEnded={() => {
            // Fallback: if crossfade didn't trigger, manually switch to other video
            console.log(`[HowItWorks] Video ${index} instance 2 ended - fallback triggering, activeVideo: ${activeVideo}, isActive: ${isActive}`);
            if (activeVideo === 2 && isActive) {
              const otherVid = videoElementRef.current;
              if (otherVid) {
                console.log(`[HowItWorks] Video ${index} fallback: starting instance 1, readyState: ${otherVid.readyState}`);
                // Use flushSync to ensure synchronous state update
                flushSync(() => {
                  setActiveVideo(1);
                });
                otherVid.currentTime = 0;
                otherVid.play().catch(() => {});
                hasTriggeredTransition.current = false;
              }
            }
          }}
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
  const [current, setCurrent] = useState(0); // Track current slide for dot indicator
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const sectionRef = useRef<HTMLElement>(null);

  // Preload all videos when section enters viewport (before user scrolls to it)
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Section is approaching viewport - add preload hints immediately
            const links: HTMLLinkElement[] = [];
            videos.forEach((video) => {
              const link = document.createElement('link');
              link.rel = 'preload';
              link.as = 'video';
              link.href = video.mp4;
              link.type = 'video/mp4';
              document.head.appendChild(link);
              links.push(link);
            });
            
            // Disconnect observer - we only need to do this once
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '400px', // Start preloading 400px before section enters viewport
        threshold: 0,
      }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!api) return;

    api.on("select", () => {
      const index = api.selectedScrollSnap();
      console.log(`[HowItWorks Carousel] Slide changed to index: ${index}`);
      setCurrent(index);
      
      // Pause all non-current videos (both instances if dual-video)
      videoRefs.current.forEach((video, idx) => {
        if (video && idx !== index) {
          console.log(`[HowItWorks Carousel] Pausing video ${idx}`);
          video.pause();
          video.currentTime = 0;
        }
      });
      
      // Play the selected video (only if not already playing)
      playVideo(index);
    });
  }, [api]);

  const playVideo = (index: number) => {
    const video = videoRefs.current[index];
    console.log(`[HowItWorks Carousel] playVideo called for index: ${index}, video exists: ${!!video}, paused: ${video?.paused}`);
    if (video && video.paused) {
      video.currentTime = 0;
      console.log(`[HowItWorks Carousel] Starting video ${index} from beginning`);
      video.play().then(() => {
        console.log(`[HowItWorks Carousel] Video ${index} play promise resolved`);
      }).catch(() => {});
    }
  };

  // Trigger load on all videos immediately for instant navigation
  const preloadAllVideos = () => {
    videoRefs.current.forEach((video) => {
      if (video && video.readyState < 2) {
        // If video hasn't loaded enough data, trigger load
        video.load();
      }
    });
  };

  // Play initial video and preload all videos when component mounts
  useEffect(() => {
    // Small delay to ensure refs are set
    const timer = setTimeout(() => {
      playVideo(0);
      // Preload all videos immediately for instant navigation
      preloadAllVideos();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section ref={sectionRef} className="w-full py-[3rem] md:py-[4rem] px-[1rem]">
      {/* Hidden preload videos - start loading immediately */}
      <div className="hidden">
        {videos.map((video, index) => (
          <video
            key={`preload-${index}`}
            src={video.mp4}
            preload="auto"
            muted
            playsInline
          />
        ))}
      </div>

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
                  isActive={current === index}
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

