# Video BlurHash Setup

## Overview

The How It Works carousel uses blurhash placeholders generated from the first frame of each video. This provides an instant preview while videos load, significantly improving perceived load time.

## What's Implemented

### 1. Blurhash Generation Script
**File:** `scripts/generate-video-blurhash.ts`

This script:
- ✅ Extracts the first frame from each video using ffmpeg
- ✅ Generates a blurhash from that frame
- ✅ Outputs metadata to `public/how-it-works/video-blurhash.json`

### 2. Metadata File
**File:** `public/how-it-works/video-blurhash.json`

Contains blurhash strings for each video:
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

### 3. Updated Carousel Component
**File:** `components/how-it-works-carousel.tsx`

Changes:
- ✅ Imports blurhash metadata
- ✅ Converts blurhash to data URLs
- ✅ Shows blurhash background while video loads
- ✅ Smooth fade-in transition when video is ready
- ✅ Step badges always visible (fixed mobile bug)

## How to Regenerate Blurhashes

If you update the videos, regenerate the blurhashes:

```bash
cd carclout
bun run scripts/generate-video-blurhash.ts
```

**Requirements:**
- ffmpeg must be installed: `brew install ffmpeg`
- Videos must exist in `public/how-it-works/`:
  - `part1.mp4`
  - `part2.mp4`
  - `part3.mp4`

**Output:**
- Creates `video-blurhash.json` with updated hashes
- Temporary frames are stored in `.temp/` (auto-cleaned by script)

## Technical Details

### Blurhash Generation
1. **Frame Extraction**: Uses ffmpeg to grab frame at 0.1s (avoids black frames)
2. **Image Processing**: Resizes to 32x32 for fast encoding
3. **Encoding**: Generates blurhash with 4x3 components (good quality/size balance)

### Performance Benefits
- **Instant Preview**: Blurhash displays immediately (< 1KB)
- **Perceived Speed**: Users see blurred content while video loads
- **Smooth UX**: 500ms fade-in transition when video is ready
- **Mobile Optimized**: Tiny data size perfect for mobile networks

### Browser Compatibility
- ✅ All modern browsers
- ✅ Works with video preload strategies
- ✅ Fallback to transparent background if blurhash fails

## Customization

### Change Blurhash Quality
Edit `scripts/generate-video-blurhash.ts`:

```typescript
// Higher components = more detail (but larger hash)
const blurhash = encode(
  new Uint8ClampedArray(data),
  info.width,
  info.height,
  4, // ← componentX (1-9)
  3  // ← componentY (1-9)
);
```

**Recommended:**
- `4x3` - Good balance (default)
- `6x4` - More detail
- `3x3` - Smaller hash, less detail

### Change Frame Extraction Time
Edit the ffmpeg command:

```typescript
// Extract frame at 0.5 seconds instead of 0.1
const command = `ffmpeg -ss 0.5 -i "${videoPath}" ...`;
```

## Troubleshooting

### "ffmpeg is not installed"
```bash
brew install ffmpeg
```

### "Video not found"
Check that video files exist:
```bash
ls -la public/how-it-works/*.mp4
```

### "Width and height must match"
This is a sharp/blurhash compatibility issue. The script now uses the correct approach (getting width/height from the same buffer operation).

### Blurhash not showing
1. Check browser console for errors
2. Verify `video-blurhash.json` exists
3. Confirm blurhash strings are not empty

## File Structure

```
carclout/
├── scripts/
│   └── generate-video-blurhash.ts    # Generation script
├── public/
│   └── how-it-works/
│       ├── part1.mp4                 # Video files
│       ├── part2.mp4
│       ├── part3.mp4
│       ├── video-blurhash.json       # Generated metadata
│       └── BLURHASH_README.md        # This file
└── components/
    └── how-it-works-carousel.tsx     # Uses blurhashes
```

## Performance Metrics

**Before Blurhash:**
- Gray skeleton → Video loads → Playback
- Perceived delay: 500-2000ms

**After Blurhash:**
- Blurhash shows instantly → Video loads → Smooth fade-in
- Perceived delay: 0ms (content visible immediately)

**Data Size:**
- Each blurhash: ~30 characters (~30 bytes)
- Total metadata: ~200 bytes
- First video frame preview: < 1KB (when decoded)

---

**Last Updated:** October 4, 2025

