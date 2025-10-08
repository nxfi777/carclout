# Async Video Generation Fix

## Problem
Video generation was experiencing 524 timeout errors from Cloudflare when videos took longer than 100 seconds to generate. The endpoint was using `fal.subscribe()` which blocks the HTTP response until the video completes, causing timeouts.

## Solution
Implemented an asynchronous job-based system:

1. **Immediate Job Submission**: Changed from `fal.subscribe()` to `fal.queue()` to submit jobs without waiting
2. **Job Tracking**: Added `video_job` table in SurrealDB to track job status
3. **Status Polling**: Created `/api/templates/video/status` endpoint for checking job progress
4. **Shared Hook Pattern**: Created reusable `useAsyncVideoGeneration()` hook for consistent polling across all UI components

## Changes Made

### Backend
- **`/app/api/templates/video/route.ts`**: Modified to use `fal.queue()` and return job ID immediately
- **`/app/api/templates/video/status/route.ts`**: New endpoint to poll job status and process completed videos
- **`/scripts/video-job-table.surql`**: Database schema for video jobs
- **`/scripts/init-video-job-table.ts`**: Migration script to create the table

### Frontend (Shared Hook Pattern)
- **`/lib/use-async-video-generation.ts`**: **Shared custom hook** encapsulating all async video logic
  - `generate(options, callbacks)` - Starts generation and handles polling
  - `isGenerating` - Boolean state for UI feedback
  - Callbacks: `onComplete`, `onError`, `onInsufficientCredits`
  - Used by both workspace panel and templates tab
- **`/components/dashboard-workspace-panel.tsx`**: Updated to use shared hook
- **`/components/ui/content-tabs-core.tsx`**: Updated to use shared hook

### Database
- Created `video_job` table with fields:
  - `email`, `fal_request_id`, `template_id`, `start_key`
  - `status` (pending, processing, completed, failed)
  - `provider`, `credits`, timestamps
  - Optional fields for video metadata

## How It Works

1. User initiates video generation
2. Backend immediately queues job on fal.ai and returns `jobId`
3. Frontend shows persistent "Generating video..." toast with loading spinner
4. Frontend starts polling `/api/templates/video/status?jobId=xxx` immediately, then every 3 seconds
5. Status endpoint checks fal.ai and updates database accordingly
6. When complete, status endpoint downloads video, uploads to R2, charges credits, and returns final URL
7. Frontend dismisses loading toast, shows success message, and displays completed video
8. **Background Processing**: Even if user closes the page, the video continues processing on the server and will be saved to their library automatically

## Benefits
- ✅ No more 524 timeouts - initial response is instant
- ✅ Videos can take as long as needed to generate
- ✅ Users get real-time feedback with persistent loading toast
- ✅ Job state is persisted in database
- ✅ Credits are only charged after successful completion
- ✅ **Background processing** - videos complete even if user closes browser
- ✅ Graceful degradation - polls for up to 10 minutes, then tells user to check library later
- ✅ Console logging for debugging video generation issues

## Using the Shared Hook

The `useAsyncVideoGeneration()` hook makes it easy to add video generation anywhere in your app:

```typescript
import { useAsyncVideoGeneration } from '@/lib/use-async-video-generation';

function MyComponent() {
  const videoGeneration = useAsyncVideoGeneration();
  
  const handleGenerate = async () => {
    await videoGeneration.generate(
      {
        templateSlug: 'my-template',
        startKey: 'users/123/library/image.png',
        variables: { BRAND: 'Tesla', MODEL: 'Model S' }
      },
      {
        onComplete: async (result) => {
          console.log('Video ready!', result.url, result.key);
          // Update UI, refresh library, etc.
        },
        onError: (error) => {
          console.error('Failed:', error);
        },
        onInsufficientCredits: () => {
          // Show credit top-up UI
        }
      }
    );
  };
  
  return (
    <button onClick={handleGenerate} disabled={videoGeneration.isGenerating}>
      {videoGeneration.isGenerating ? 'Generating...' : 'Generate Video'}
    </button>
  );
}
```

### Hook Benefits
✅ **DRY**: Single source of truth for polling logic  
✅ **Consistent UX**: Same toasts, timing, error handling everywhere  
✅ **Type-safe**: Full TypeScript support  
✅ **Easy to maintain**: Fix bugs once, works everywhere  

## Migration
The database table was already created by running:
```bash
bun run init:video-jobs
```

## API Changes

### POST /api/templates/video
**Before**: Returned video URL directly (blocked until complete)
```json
{ "url": "...", "key": "...", "credits": 500 }
```

**After**: Returns job ID immediately
```json
{ 
  "jobId": "fal-request-id-123",
  "status": "pending",
  "credits": 500,
  "message": "Video generation started. Check status at /api/templates/video/status"
}
```

### GET /api/templates/video/status?jobId=xxx
**New endpoint** - Poll for job completion
```json
// While processing:
{ "status": "processing", "message": "Generating video..." }

// When complete:
{ "status": "completed", "url": "...", "key": "...", "credits": 500 }

// On failure:
{ "status": "failed", "error": "..." }
```

## Testing
To test, simply generate a video from the workspace panel. You should see:
1. Immediate toast: "Video generation started! This may take a few minutes..."
2. Background polling (check network tab for status requests every 3s)
3. Success toast when complete: "Video generated successfully!"

