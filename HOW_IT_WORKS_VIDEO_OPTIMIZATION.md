# How It Works Carousel - Video Optimization

## 🎯 Problems Solved

### 1. Missing Step Badges on Mobile ✅
**Issue:** Step 1, 2, 3 badges were not showing on mobile devices

**Root Cause:** Badges were only rendered when `isVideoLoaded === true`, which could fail on mobile due to:
- Autoplay restrictions
- Slow video loading
- Missing `loadeddata` event

**Solution:**
- Made step badges **always visible** regardless of video load state
- Added responsive sizing (smaller on mobile)
- Added shadow for better visibility
- Positioned appropriately for mobile screens

### 2. Slow Video Loading ✅
**Issue:** Videos showed gray skeleton while loading, making perceived load time slow

**Solution:** Implemented blurhash placeholders extracted from video first frames

## 🚀 What Was Implemented

### 1. Blurhash Generation Script
**File:** `scripts/generate-video-blurhash.ts`

Automated script that:
- Uses **ffmpeg** to extract first frame from each video
- Generates blurhash from the frame
- Outputs JSON metadata file
- One-command regeneration when videos change

**Usage:**
```bash
bun run scripts/generate-video-blurhash.ts
```

### 2. Video Metadata
**File:** `public/how-it-works/video-blurhash.json`

Contains blurhash for each video:
```json
[
  {
    "mp4": "/how-it-works/part1.mp4",
    "title": "Pick a Template",
    "blurhash": "LJ8$anD4PXf-MJxtMxoKIoW-%LWB"
  },
  ...
]
```

### 3. Enhanced Carousel Component
**File:** `components/how-it-works-carousel.tsx`

**Before:**
```tsx
{!isVideoLoaded && <Skeleton />}
<video ... />
{isVideoLoaded && <StepBadge />} // ❌ Not showing on mobile
```

**After:**
```tsx
{!isVideoLoaded && <BlurhashBackground />}
<video className="transition-opacity" ... />
<StepBadge /> // ✅ Always visible
```

**Improvements:**
- ✅ Blurhash backgrounds show instantly
- ✅ Smooth 500ms fade-in when video loads
- ✅ Step badges always visible
- ✅ Responsive badge sizing
- ✅ Better preload strategy (preload current, prefetch adjacent)

## 📊 Performance Impact

### Load Time Perception

**Before:**
```
[Gray skeleton] → [Video loads 500-2000ms] → [Playback]
Perceived delay: 500-2000ms
```

**After:**
```
[Blurred preview instantly] → [Video loads] → [Smooth fade-in]
Perceived delay: 0ms (content visible immediately)
```

### Data Size

| Asset | Size | Notes |
|-------|------|-------|
| Blurhash (text) | ~30 bytes | Per video, in JSON |
| Decoded preview | <1KB | Generated client-side |
| Video (part1.mp4) | ~5MB | Preloaded intelligently |
| Total metadata | ~200 bytes | All three blurhashes |

### Preload Strategy

- **Current video**: `preload="auto"` + `<link rel="preload">`
- **Adjacent videos**: `preload="auto"` + `<link rel="prefetch">`
- **Other videos**: `preload="metadata"` (minimal)

This ensures:
- Current video starts loading immediately
- Next/previous videos are ready for smooth swiping
- Bandwidth is preserved by not loading all videos

## 🎨 UX Improvements

### Mobile Fixes
1. **Step badges always visible** - No more missing step indicators
2. **Smaller badge size** - Better fit on small screens
3. **Responsive positioning** - Optimized spacing for mobile
4. **Shadow on badges** - Better visibility on any background

### Loading Experience
1. **Instant blurhash preview** - Users see blurred content immediately
2. **Smooth fade-in** - Professional 500ms transition
3. **No layout shift** - Blurhash maintains aspect ratio
4. **Intelligent preloading** - Adjacent videos ready before user swipes

### Visual Quality
- **Accurate preview** - Blurhash generated from actual first frame
- **Proper colors** - Reflects actual video content
- **High quality encode** - 4x3 components for good detail

## 🛠️ Technical Details

### Blurhash Generation Pipeline

```
Video File (part1.mp4)
    ↓
ffmpeg -ss 0.1 -vframes 1
    ↓
First Frame (JPEG)
    ↓
Sharp (resize to 32x32)
    ↓
Blurhash Encode (4x3)
    ↓
Hash String → JSON
```

### Client-Side Rendering

```
Load video-blurhash.json
    ↓
blurHashToDataURLCached()
    ↓
Data URL (cached)
    ↓
Background image (instant)
    ↓
Video loads & fades in
```

### Caching Strategy

- **Blurhash decode**: Memoized with `useMemo()`
- **Data URL**: Cached by `blurHashToDataURLCached()`
- **No re-renders**: Only decodes once per video

## 📱 Browser Support

| Feature | Support | Fallback |
|---------|---------|----------|
| Blurhash | All modern browsers | Transparent background |
| Video preload | All browsers | Standard loading |
| Smooth transitions | Modern browsers | Instant swap |
| ffmpeg (generation) | Server/dev only | Pre-generated JSON |

## 🔧 Maintenance

### When Videos Change

1. Replace video files in `public/how-it-works/`
2. Run script:
   ```bash
   bun run scripts/generate-video-blurhash.ts
   ```
3. Commit the updated `video-blurhash.json`
4. Done! Component automatically uses new blurhashes

### When Adding New Videos

1. Add video to `public/how-it-works/`
2. Update script's `videos` array:
   ```typescript
   const videos = [
     ...existing,
     { name: 'part4', title: 'New Step' },
   ];
   ```
3. Run script
4. Update carousel component's `videos` array to include new entry

## 📖 Documentation

- **Main docs**: `HOW_IT_WORKS_CAROUSEL.md` - Original implementation
- **Blurhash setup**: `public/how-it-works/BLURHASH_README.md` - Detailed blurhash docs
- **This file**: Overview of video optimization

## ✅ Testing Checklist

- [x] Step badges visible on mobile
- [x] Step badges visible on desktop
- [x] Blurhash shows immediately on load
- [x] Video fades in smoothly when ready
- [x] Swiping works on mobile
- [x] Arrows work on desktop
- [x] Dots indicator updates correctly
- [x] Videos auto-play when active
- [x] Only active video plays
- [x] Preloading works for adjacent videos
- [x] No console errors
- [x] No layout shift during load
- [x] Works on slow connections (blurhash instant)

## 🎉 Results

✅ **Step badges now visible on mobile**
✅ **Videos appear to load instantly** (blurhash preview)
✅ **Smooth professional fade-in** when video ready
✅ **Intelligent preloading** for fast swiping
✅ **One-command regeneration** when videos change
✅ **< 200 bytes overhead** for all blurhashes
✅ **Zero layout shift** during load
✅ **Better mobile UX** (responsive badges)

---

**Implemented:** October 4, 2025  
**Files Modified:**
- `components/how-it-works-carousel.tsx`
- `scripts/generate-video-blurhash.ts` (new)
- `public/how-it-works/video-blurhash.json` (new)

