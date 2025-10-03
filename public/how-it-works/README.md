# How It Works Videos

This directory contains the short videos for the "How It Works" carousel section on the landing page.

## Required Videos

You need to create **3 short videos** (3-6 seconds each):

### Part 1: Pick a Template
**Filename:** `part1.mp4`
- Show the template selection screen
- Quick browsing through different styles
- Maybe selecting one template

### Part 2: Upload Your Car
**Filename:** `part2.mp4`
- Show the upload interface
- Someone selecting/uploading a car photo
- Keep it quick and simple

### Part 3: Post & Go Viral
**Filename:** `part3.mp4`
- Show the final edited result
- The download/share button
- Maybe a preview of posting to social media

## Video Specifications

### Format
- **Primary:** MP4 (H.264 codec) - universal browser support

### Encoding Settings

#### For MP4:
```bash
ffmpeg -i input.mov -c:v libx264 -crf 23 -preset slow \
  -vf "scale=1280:960:force_original_aspect_ratio=decrease,pad=1280:960:(ow-iw)/2:(oh-ih)/2" \
  -an -movflags +faststart partX.mp4
```

**Flags explained:**
- `-crf 23` - Quality (lower = better, 18-28 range)
- `-preset slow` - Better compression
- `-vf scale` - Resize to 4:3 aspect ratio
- `-an` - Remove audio (not needed)
- `-movflags +faststart` - Web optimization

### Recommendations
- **Aspect Ratio:** 4:3 (horizontal)
- **Resolution:** 1280x960 or 1024x768
- **Duration:** 3-6 seconds
- **File Size:** Aim for < 500KB per video (total < 1.5MB for all 3 files)
- **No audio needed** (videos are muted)
- **Loop-friendly:** Make sure the end frame works well looping back to the start
- **No transparency needed**

## Quick Tips

1. **Keep it snappy:** Users should instantly understand what they're seeing
2. **Use smooth transitions:** Avoid jarring cuts
3. **Optimize file size:** Smaller files = faster loading = better UX
4. **Test on mobile:** These videos will primarily be viewed on phones
5. **Screen recording works great:** Capture your actual app in action

## Testing

After adding your videos, test on:
- Mobile Safari (iOS)
- Chrome (Android)
- Desktop browsers

The carousel will:
- Auto-play the video when it's in view
- Loop continuously
- Switch to the next video when user swipes
- Pause videos that aren't currently visible

