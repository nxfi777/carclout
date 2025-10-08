# Video BlurHash Implementation

## Overview

This implementation adds blurhash support for videos in the workspace library, matching the existing blurhash functionality for images. Videos now display a smooth blurhash placeholder while loading, providing a better user experience.

## What Was Implemented

### 1. Database Schema (`lib/library-image.ts`)
- Added `LibraryVideo` type to store video metadata
- Includes: `key`, `email`, `blurhash`, `width`, `height`, `size`, `duration`, `created`, `lastModified`
- Database table: `library_video` (similar to `library_image`)

### 2. Video BlurHash Generation (`lib/video-blurhash-server.ts`)
- Server-side utility to extract first frame from video using ffmpeg
- Generates blurhash from the extracted frame
- Returns blurhash along with video dimensions and duration
- **Dependencies**: Requires `ffmpeg` and `ffprobe` to be installed on the server

### 3. API Endpoints Updated

#### Video Generation (`app/api/templates/video/route.ts`)
- After video generation, extracts first frame and generates blurhash
- Stores metadata in `library_video` table

#### Video Upscale (`app/api/tools/video-upscale/route.ts`)
- After upscaling, generates blurhash from output video
- Stores metadata in `library_video` table

#### Video Interpolate (`app/api/tools/video-interpolate/route.ts`)
- After interpolation (60fps), generates blurhash from output video
- Stores metadata in `library_video` table

#### Storage List (`app/api/storage/list/route.ts`)
- Fetches blurhashes for both images AND videos in `/library`
- Returns blurhash data alongside file metadata

### 4. UI Component (`components/dashboard-workspace-panel.tsx`)
- Updated `VideoThumb` component to accept and display blurhash
- Shows blurhash placeholder while video loads
- Smooth fade-in transition when video is ready
- Maintains existing autoplay/pause on scroll behavior

## Database Setup

Run the following SurrealDB script to create the table:

```bash
# Using the surreal CLI
surreal sql --endpoint http://localhost:8000 --namespace <ns> --database <db> --auth-level root --user root --pass root < scripts/setup-library-video-table.surql
```

Or manually execute:
```sql
DEFINE TABLE library_video SCHEMAFULL;
DEFINE FIELD key ON library_video TYPE string ASSERT $value != NONE;
DEFINE FIELD email ON library_video TYPE string ASSERT $value != NONE;
DEFINE FIELD blurhash ON library_video TYPE option<string>;
DEFINE FIELD width ON library_video TYPE option<number>;
DEFINE FIELD height ON library_video TYPE option<number>;
DEFINE FIELD size ON library_video TYPE option<number>;
DEFINE FIELD duration ON library_video TYPE option<number>;
DEFINE FIELD created ON library_video TYPE option<datetime>;
DEFINE FIELD lastModified ON library_video TYPE option<datetime>;
DEFINE INDEX unique_key_email_video ON library_video FIELDS key, email UNIQUE;
```

## Server Requirements

### FFmpeg Installation

The video blurhash generation requires `ffmpeg` and `ffprobe` to be installed on the server:

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
apt-get update && apt-get install -y ffmpeg
```

**Docker:**
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg
```

## How It Works

### Video Upload Flow

1. Video is generated/upscaled/interpolated
2. Video bytes are uploaded to R2 storage
3. **New**: First frame is extracted using ffmpeg
4. **New**: BlurHash is generated from the first frame
5. **New**: Metadata (blurhash, dimensions, duration) stored in `library_video` table
6. Video appears in library with blurhash support

### Video Display Flow

1. Library list endpoint fetches video metadata including blurhash
2. VideoThumb component receives blurhash prop
3. While video loads, blurhash is displayed as placeholder
4. When video data is ready (`onLoadedData`), smooth fade-in transition
5. Video autoplays when in viewport (existing behavior)

## Automatic Backfilling

**Existing images and videos are automatically backfilled!**

When users view their workspace library, the system automatically:

1. **Detects** items without blurhashes (images and videos)
2. **Generates** blurhashes asynchronously in the background
3. **Updates** the UI in real-time as blurhashes are generated
4. **Processes** items one at a time (500ms delay) to avoid server overload

### How It Works

- Runs automatically when viewing `/library` folders
- Non-blocking - doesn't affect user experience
- Progress logged to console: `[blurhash-backfill]`
- Each item attempted only once per session
- Works for both images and videos

### API Endpoint

`POST /api/storage/generate-blurhash-backfill`

```json
{
  "key": "library/video.mp4",
  "scope": "user"
}
```

Response:
```json
{
  "success": true,
  "blurhash": "L6Pj0^jE.AyE_3t7t7R**0o#DgR4",
  "type": "video"
}
```

This endpoint can also be called manually for specific files if needed.

## Error Handling

All blurhash generation is **non-fatal**:
- If ffmpeg fails, video is still saved successfully
- If blurhash generation fails, video displays with skeleton loader
- Errors are logged but don't block the main operation

## Testing

1. **Generate a new video** from a template → Check workspace library for blurhash placeholder
2. **Upscale a video** → Verify blurhash is generated for upscaled version
3. **Interpolate a video to 60fps** → Verify blurhash is generated
4. **Scroll through library** → Verify videos autoplay in viewport with smooth blurhash transition

## Files Modified

- `carclout/lib/library-image.ts` - Added LibraryVideo type
- `carclout/lib/video-blurhash-server.ts` - New file for video blurhash generation
- `carclout/app/api/templates/video/route.ts` - Added blurhash generation
- `carclout/app/api/tools/video-upscale/route.ts` - Added blurhash generation
- `carclout/app/api/tools/video-interpolate/route.ts` - Added blurhash generation
- `carclout/app/api/storage/list/route.ts` - Fetch video blurhashes
- `carclout/app/api/storage/generate-blurhash-backfill/route.ts` - **New** backfill endpoint
- `carclout/components/dashboard-workspace-panel.tsx` - Updated VideoThumb with blurhash support + automatic backfill
- `carclout/scripts/setup-library-video-table.surql` - New database migration script

## Future Enhancements

- [x] ~~Create backfill script for existing videos~~ - **Done!** Automatic backfill implemented
- [ ] Add video blurhash generation on direct upload (via `/api/storage/upload`)
- [ ] Consider caching first frame extraction for performance
- [ ] Add video poster image as fallback if ffmpeg unavailable
- [ ] Add progress indicator in UI for backfill process
- [ ] Batch blurhash generation endpoint for bulk operations

