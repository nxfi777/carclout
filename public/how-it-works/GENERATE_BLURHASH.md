# Generate BlurHash for Videos

## Quick Start

### Option 1: Automatic Script (Recommended)

**Prerequisites:**
```bash
brew install ffmpeg  # macOS
# or
sudo apt install ffmpeg  # Linux
```

**Run the script:**
```bash
cd carclout
bun run scripts/generate-video-blurhash.ts
```

This will:
1. Extract the first frame from each video
2. Generate a blurhash for each frame
3. Print the values to copy into `components/how-it-works-carousel.tsx`

---

### Option 2: Manual Generation

If you prefer to do it manually or the script doesn't work:

**1. Extract first frame from each video:**
```bash
cd carclout/public/how-it-works

# Part 1
ffmpeg -i part1.mp4 -vframes 1 -f image2 part1-frame.jpg

# Part 2
ffmpeg -i part2.mp4 -vframes 1 -f image2 part2-frame.jpg

# Part 3
ffmpeg -i part3.mp4 -vframes 1 -f image2 part3-frame.jpg
```

**2. Use the blurhash API to generate hashes:**

You can use the existing `/api/blurhash/generate` endpoint in your app:

```bash
# Start your dev server if not running
cd carclout
bun dev

# In another terminal, use the API:
curl -X POST http://localhost:3000/api/blurhash/generate \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "http://localhost:3000/how-it-works/part1-frame.jpg"}'
```

Or upload the frames to a temporary location and use any blurhash generator online.

---

### Option 3: Use Placeholder Blurhash

The component already has placeholder blurhash values. They'll show a generic blurred preview. This is fine if you want to ship quickly!

---

## Update the Component

Once you have your blurhash values, update `components/how-it-works-carousel.tsx`:

```typescript
const videos = [
  {
    title: "Pick a Template",
    description: "Choose from viral templates that actually work",
    mp4: "/how-it-works/part1.mp4",
    blurhash: "YOUR_GENERATED_BLURHASH_HERE", // ← Replace this
  },
  // ... etc
];
```

---

## Why BlurHash?

- **Better UX:** Users see a blurred preview of the actual video before it loads
- **Professional:** Looks like Netflix, Instagram, Medium
- **Fast:** BlurHash is tiny (20-30 characters) and decodes instantly
- **Smooth:** Fade from blur to sharp video feels premium

**Visual:**
```
[Blurred preview of actual frame] → [Sharp video plays]
     ↑ Recognizable!                    Smooth!
```

vs

```
[Black rectangle] → [Video pops in]
     ↑ Generic          Jarring
```

