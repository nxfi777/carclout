"use client";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { BadgeCheck, Bookmark, Heart, MessageCircle, Send } from "lucide-react";
import KCountUp from "@/components/ui/k-count-up";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBlurHashDataURL, BLUR_DATA_URLS } from "@/lib/blur-placeholder";

interface InstagramPhoneProps {
  likes?: number;
  comments?: number;
  shares?: number;
}

const carouselImages = [
  { src: "/car_post_before.webp", label: "BEFORE", blurHash: "LcEfi|WUadt7.AoLRkof.7kCj]a|" },
  { src: "/car_post_after.webp", label: "AFTER", blurHash: "LVDS?pt8odt6~pofWBoexvj=Rkay" }
];

export default function InstagramPhone({ likes = 77, comments = 12, shares = 30 }: InstagramPhoneProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [lastInteraction, setLastInteraction] = useState<number>(Date.now());
  const carouselRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useRef<boolean>(false);
  const lastTouchTime = useRef<number>(0);
  
  // Use SSR-safe blur data URLs to prevent hydration mismatch
  const blurDataURL0 = useBlurHashDataURL(carouselImages[0].blurHash);
  const blurDataURL1 = useBlurHashDataURL(carouselImages[1].blurHash);

  // Minimum swipe distance (in px) to trigger a slide change
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    isTouchDevice.current = true;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    
    if (!touchStart || touchEnd === null) return;
    
    const distance = touchStart - touchEnd;
    const absoluteDistance = Math.abs(distance);
    
    // Only register as a swipe if the distance is significant
    // This prevents taps from being interpreted as swipes
    if (absoluteDistance < minSwipeDistance) return;
    
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      e.preventDefault();
      setCurrentSlide(prev => prev >= carouselImages.length - 1 ? 0 : prev + 1);
      setLastInteraction(Date.now());
    } else if (isRightSwipe) {
      e.preventDefault();
      setCurrentSlide(prev => prev <= 0 ? carouselImages.length - 1 : prev - 1);
      setLastInteraction(Date.now());
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't handle clicks on touch devices or shortly after touch events
    const timeSinceTouch = Date.now() - lastTouchTime.current;
    if (isTouchDevice.current || timeSinceTouch < 500 || !carouselRef.current) return;
    
    const rect = carouselRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    
    // Click on left half = previous, right half = next
    if (clickX < width / 2) {
      setCurrentSlide(prev => prev <= 0 ? carouselImages.length - 1 : prev - 1);
    } else {
      setCurrentSlide(prev => prev >= carouselImages.length - 1 ? 0 : prev + 1);
    }
    setLastInteraction(Date.now());
  };

  // Autoplay carousel with loop
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceInteraction = Date.now() - lastInteraction;
      // Only auto-advance if it's been at least 3 seconds since last manual interaction
      if (timeSinceInteraction >= 3000) {
        setCurrentSlide((prev) => {
          // Loop back to first slide when reaching the end
          if (prev >= carouselImages.length - 1) {
            return 0;
          }
          return prev + 1;
        });
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [lastInteraction]);

  async function submitContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const emailRegex = /.+@.+\..+/;
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill out all fields.");
      return;
    }
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && (data.error as string)) || "Failed to send message");
      toast.success("Message sent! We'll get back to you soon.");
      setName("");
      setEmail("");
      setMessage("");
      setOpen(false);
    } catch (err: unknown) {
      try { console.error("IG phone contact error", err); } catch {}
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <div
        className="relative w-full mx-auto overflow-hidden aspect-[71.5/149.6]"
        suppressHydrationWarning
        style={{ 
          ['--igp-scale' as unknown as string]: 'calc(var(--igp-w, 12rem) / 19rem)',
          fontFamily: 'var(--font-roboto)'
        }}
      >
      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{ width: "19rem", transform: `scale(var(--igp-scale))`, transformOrigin: "top left" }}
      >
      <div
        className="relative aspect-[71.5/149.6] w-[19rem] rounded-[2rem] border-[0.3rem] border-black bg-black"
      >

        {/* Screen base (full white background inside the phone) */}
        <div className="absolute inset-[0.24rem] z-10 rounded-[1.9rem] bg-white" />

        {/* Status bar (time + indicators) aligned to sides of the notch */}
        <div
          className="absolute z-40 grid items-center pointer-events-none select-none text-black"
          style={{
            left: "1.2rem",
            right: "1.2rem",
            top: "0.85rem",
            gridTemplateColumns: "1fr 8rem 1fr",
          }}
        >
          <div className="font-semibold text-[0.9rem] justify-self-start pl-[0.5rem]">17:38</div>
          <div />
          <div className="justify-self-end flex items-center gap-[0.5rem] pr-[0.5rem]">
            {/* Signal bars */}
            <div className="flex items-end gap-[0.12rem]">
              <span className="block w-[0.18rem] h-[0.22rem] rounded-[0.06rem] bg-black/80" />
              <span className="block w-[0.18rem] h-[0.34rem] rounded-[0.06rem] bg-black/80" />
              <span className="block w-[0.18rem] h-[0.48rem] rounded-[0.06rem] bg-black/80" />
              <span className="block w-[0.18rem] h-[0.62rem] rounded-[0.06rem] bg-black" />
            </div>
            {/* Battery */}
            <div className="relative w-[1.6rem] h-[0.82rem] rounded-[0.18rem] border border-black/80">
              <div className="absolute right-[-0.22rem] top-1/2 -translate-y-1/2 w-[0.18rem] h-[0.36rem] rounded-[0.12rem] bg-black/80" />
              <div className="absolute inset-[0.12rem] rounded-[0.12rem] bg-black/85" />
            </div>
          </div>
        </div>

        {/* Dynamic Island (floating pill under the frame) */}
        <div className="absolute z-30 left-1/2 -translate-x-1/2 top-[0.7rem] h-[1.6rem] w-[5rem] bg-black/90 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.22)]" />

        {/* Instagram-like overlay */}
        <div
          className="absolute z-50 grid text-black rounded-[1.9rem] overflow-hidden pointer-events-auto"
          style={{
            gridTemplateRows: "auto 1fr",
            left: "0.24rem",
            right: "0.24rem",
            top: "2.6rem",
            bottom: "1rem",
          }}
        >
          {/* Header */}
          <div className="px-[1rem] pt-[0.4rem] pb-[0.6rem]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[0.6rem] min-w-0">
                <div className="relative size-[2rem] rounded-full bg-[#2d2d2d] overflow-hidden ring-1 ring-white/30 shrink-0">
                  <Image
                    src="/nytforge.webp"
                    alt="nytforge avatar"
                    fill
                    sizes="2rem"
                    className="object-cover pt-[0.1rem]"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URLS.black}
                  />
                </div>
                <div className="leading-tight min-w-0">
                  <div className="flex items-center gap-[0.3rem] text-[0.95rem] font-semibold">
                    <span className="truncate">nytforge</span>
                    <BadgeCheck className="size-[1rem] text-sky-400" />
                  </div>
                  <div className="text-[0.75rem] opacity-80 truncate">nytforge · Original audio</div>
                </div>
              </div>
              {/*<MoreHorizontal className="size-[1.4rem] opacity-90" />*/}
            </div>
          </div>

          {/* Media carousel */}
          <div className="relative px-0">
            <div 
              ref={carouselRef}
              className="relative w-full overflow-hidden bg-black/60 ring-1 ring-white/10 select-none cursor-pointer"
              style={{ aspectRatio: '4/5', touchAction: 'pan-y' }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleClick}
              onDragStart={(e) => e.preventDefault()}
            >
              {/* Carousel wrapper */}
              <div 
                className="flex h-full transition-transform duration-300 ease-out"
                style={{ 
                  transform: `translateX(-${currentSlide * 100}%)`,
                  userSelect: 'none',
                  WebkitUserDrag: 'none'
                } as React.CSSProperties}
              >
                {carouselImages.map((image, idx) => {
                  const blurDataURL = idx === 0 ? blurDataURL0 : blurDataURL1;
                  return (
                    <div key={idx} className="relative w-full h-full flex-shrink-0" suppressHydrationWarning>
                      {/* Pulsing overlay on top of blurhash */}
                      {!imageLoaded && idx === currentSlide && (
                        <div className="absolute inset-0 z-10 bg-white/5 animate-pulse rounded-none" />
                      )}
                      <Image
                        src={image.src}
                        alt={`car post ${image.label.toLowerCase()}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 19rem"
                        className="object-cover transition-opacity duration-[900ms] ease-out pointer-events-none"
                        onLoad={() => idx === currentSlide && setImageLoaded(true)}
                        priority={idx === 0}
                        fetchPriority={idx === 0 ? "high" : "auto"}
                        quality={85}
                        placeholder="blur"
                        blurDataURL={blurDataURL}
                        draggable={false}
                      />
                      {/* Before/After badge */}
                      <div className="absolute left-[0.75rem] top-[0.75rem] z-20 pointer-events-none">
                        <div className="rounded-md bg-black/80 backdrop-blur-sm text-white text-[1.1rem] font-bold px-[1rem] py-[0.5rem] shadow-lg">
                          {image.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Carousel indicator dots */}
              <div className="absolute bottom-[0.75rem] left-1/2 -translate-x-1/2 z-20 flex gap-[0.35rem] pointer-events-none">
                {carouselImages.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-[0.4rem] h-[0.4rem] rounded-full transition-all duration-300 ${
                      idx === currentSlide 
                        ? 'bg-white w-[0.5rem] h-[0.5rem]' 
                        : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </div>
            {/* Actions and caption */}
          <div className="px-[0.9rem] pb-[1.1rem] pt-[0.9rem] relative z-50 pointer-events-auto">
            <div className="flex items-center justify-between pb-[0.4rem]">
              <div className="flex items-center gap-[1rem]">
                <button
                  type="button"
                  onClick={() => setLiked((prev) => !prev)}
                  aria-pressed={liked}
                  aria-label={liked ? "Unlike" : "Like"}
                  className="inline-flex items-center gap-[0.35rem] cursor-pointer select-none relative z-50 pointer-events-auto"
                >
                  <Heart
                    className={`size-[1.6rem] transition-colors cursor-pointer ${liked ? "text-red-500 fill-red-500 stroke-red-500" : "fill-transparent"}`}
                    fill={liked ? "currentColor" : "none"}
                  />
                  <KCountUp toK={likes} className="text-[0.9rem] opacity-90" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-[0.35rem] cursor-pointer"
                  aria-label="Comment"
                >
                  <MessageCircle className="size-[1.6rem]" />
                  <KCountUp toK={comments} className="text-[0.9rem] opacity-90" />
                </button>
                <div className="inline-flex items-center gap-[0.35rem]">
                  <Send className="size-[1.6rem]" />
                  <KCountUp toK={shares} className="text-[0.9rem] opacity-90" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaved((prev) => !prev)}
                aria-pressed={saved}
                aria-label={saved ? "Unsave" : "Save"}
                className="inline-flex items-center justify-center cursor-pointer select-none relative z-50 pointer-events-auto"
              >
                <Bookmark
                  className={`size-[1.6rem] transition-colors ${saved ? "text-black fill-black stroke-black" : "fill-transparent"}`}
                  fill={saved ? "currentColor" : "none"}
                />
              </button>
            </div>
            <div className="mt-[0.35rem] text-[0.85rem] leading-snug">
              <span className="font-semibold">nytforge</span> RS3 before and after
            </div>
            <div className="mt-[0.3rem] text-[0.82rem] text-sky-300">#rs3 #audirs3 #beforeandafter #carsofinstagram</div>
          </div>
          </div>
        </div>
      </div>
    </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-[1rem] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact Us</DialogTitle>
        </DialogHeader>
        <form onSubmit={submitContact} className="space-y-[0.75rem]">
          <div className="space-y-[0.3rem]">
            <label htmlFor="igc-name" className="text-sm text-[color:var(--foreground)]/80">Name</label>
            <Input id="igc-name" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" className="h-10" required />
          </div>
          <div className="space-y-[0.3rem]">
            <label htmlFor="igc-email" className="text-sm text-[color:var(--foreground)]/80">Email</label>
            <Input id="igc-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" className="h-10" required />
          </div>
          <div className="space-y-[0.3rem]">
            <label htmlFor="igc-message" className="text-sm text-[color:var(--foreground)]/80">Message</label>
            <Textarea id="igc-message" value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="How can we help?" className="min-h-[7rem]" required />
          </div>
          <div className="flex items-center justify-end gap-[0.5rem] pt-[0.25rem]">
            <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={sending}>{sending ? "Sending..." : "Send"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}


