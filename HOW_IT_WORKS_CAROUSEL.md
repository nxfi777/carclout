# How It Works Carousel - Implementation Summary

## ✅ What's Been Implemented

### 1. Component Created
- **File:** `components/how-it-works-carousel.tsx`
- Features:
  - 3-video carousel with swipe support
  - Auto-play videos when visible
  - Loop videos continuously
  - No player controls (clean, minimal UI)
  - Responsive design (mobile-first)
  - Smooth transitions between slides
  - Step indicators on each video
  - Dot navigation for mobile and desktop
  - Arrow navigation for desktop
  - **BlurHash placeholders** - Professional blurred previews while videos load

### 2. Landing Page Integration
- Added between Brand Marquee and Bento Features sections
- Dynamically imported for optimal performance
- Server-side rendered

### 3. Video Format Decision
**✅ MP4 + WebM (Recommended)**
- MP4 (H.264): Universal browser support, main format
- WebM (VP9): Better compression for modern browsers
- ❌ GIF: Rejected (too large, lower quality)

## 📝 Next Steps - Add Your Videos

### Required Files
You need to add **3 video files** to `/carclout/public/how-it-works/`:

1. `part1.mp4` - Pick a Template
2. `part2.mp4` - Upload Your Car
3. `part3.mp4` - Post & Go Viral

### Generate BlurHash (Optional but Recommended)

For the best UX, generate blurhash values for your videos:

```bash
cd carclout
bun run scripts/generate-video-blurhash.ts
```

See `/public/how-it-works/GENERATE_BLURHASH.md` for details.

### Video Specs
- **Duration:** 3-6 seconds each
- **Aspect Ratio:** 4:3 (horizontal)
- **Resolution:** 1024x768 or 1280x960 recommended
- **Target Size:** < 500KB per video
- **No audio needed** (muted)
- **Loop-friendly ending**

### Quick Creation Guide

**Option 1: Screen Recording**
1. Open your app
2. Use screen recording (phone or QuickTime)
3. Crop to show just the relevant action
4. Speed up if needed (videos should be punchy)
5. Export and compress

**Option 2: FFmpeg Compression**
See `/carclout/public/how-it-works/README.md` for full FFmpeg commands.

Quick example:
```bash
ffmpeg -i input.mov -c:v libx264 -crf 23 \
  -vf "scale=1280:960:force_original_aspect_ratio=decrease" \
  -movflags +faststart part1.mp4
```

## 🎨 Customization Options

### Change Video Titles/Descriptions
Edit the `videos` array in `components/how-it-works-carousel.tsx`:

```typescript
const videos = [
  {
    title: "Upload Your Car Pic", // ← Change this
    description: "Drop any photo...", // ← And this
    mp4: "/how-it-works/step1.mp4",
    webm: "/how-it-works/step1.webm",
  },
  // ...
];
```

### Adjust Carousel Behavior
In `how-it-works-carousel.tsx`:

```typescript
<Carousel
  opts={{
    align: "center",    // "start" | "center" | "end"
    loop: true,         // Enable/disable looping
  }}
>
```

### Change Number of Visible Videos
Modify the `basis` classes in `CarouselItem`:

```typescript
// Current: 1 on mobile, 2 on tablet, 3 on desktop
className="basis-full md:basis-1/2 lg:basis-1/3"

// Example: Always show 1
className="basis-full"

// Example: 1 on mobile, 3 on desktop
className="basis-full lg:basis-1/3"
```

## 🧪 Testing Checklist

Once you add videos, test:

- [ ] Videos auto-play on first load
- [ ] Videos loop seamlessly
- [ ] Swiping on mobile switches videos
- [ ] Only the visible video plays
- [ ] Arrow buttons work on desktop
- [ ] Dot indicators work on mobile
- [ ] Responsive on all screen sizes
- [ ] No layout shift during load
- [ ] Fast loading (< 3MB total)

## 📱 Browser Compatibility

The implementation supports:
- ✅ All modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ iOS Safari (mobile)
- ✅ Chrome/Firefox on Android
- ✅ WebM fallback for older browsers
- ✅ `playsInline` attribute for iOS

## 🚀 Performance Features

- **Lazy loading:** Component is dynamically imported
- **Preload metadata only:** Videos load metadata first, full video on demand
- **Optimized formats:** MP4 + WebM for best size/quality ratio
- **Conditional playback:** Only active video plays
- **No autoplay blocking:** Handles autoplay restrictions gracefully

## 💡 Pro Tips

1. **Keep videos under 500KB each** for fast mobile loading
2. **Test on real devices**, especially iOS Safari
3. **Use actual app footage** - authenticity converts
4. **Make the action obvious** - users should instantly understand
5. **Loop-friendly edits** - fade out at the end or make it seamless

---

**Video Placeholder Directory:** `/carclout/public/how-it-works/`
**Full Documentation:** `/carclout/public/how-it-works/README.md`

