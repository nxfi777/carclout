# Async Video Generation Fix

## Problem
Video generation was experiencing 524 timeout errors from Cloudflare when videos took longer than 100 seconds to generate. The endpoint was using `fal.subscribe()` which blocks the HTTP response until the video completes, causing timeouts.

## Solution
Implemented an asynchronous job-based system:

1. **Immediate Job Submission**: Changed from `fal.subscribe()` to `fal.queue()` to submit jobs without waiting
2. **Job Tracking**: Added `video_job` table in SurrealDB to track job status
3. **Status Polling**: Created `/api/templates/video/status` endpoint for checking job progress
4. **Frontend Polling**: Updated UI to poll for completion instead of blocking

## Changes Made

### Backend
- **`/app/api/templates/video/route.ts`**: Modified to use `fal.queue()` and return job ID immediately
- **`/app/api/templates/video/status/route.ts`**: New endpoint to poll job status and process completed videos
- **`/scripts/video-job-table.surql`**: Database schema for video jobs
- **`/scripts/init-video-job-table.ts`**: Migration script to create the table

### Frontend
- **`/components/dashboard-workspace-panel.tsx`**: Updated to poll for video completion instead of waiting for immediate response

### Database
- Created `video_job` table with fields:
  - `email`, `fal_request_id`, `template_id`, `start_key`
  - `status` (pending, processing, completed, failed)
  - `provider`, `credits`, timestamps
  - Optional fields for video metadata

## How It Works

1. User initiates video generation
2. Backend immediately queues job on fal.ai and returns `jobId`
3. Frontend receives `jobId` and starts polling `/api/templates/video/status?jobId=xxx` every 3 seconds
4. Status endpoint checks fal.ai and updates database accordingly
5. When complete, status endpoint downloads video, uploads to R2, charges credits, and returns final URL
6. Frontend displays completed video

## Benefits
- ✅ No more 524 timeouts - initial response is instant
- ✅ Videos can take as long as needed to generate
- ✅ Users get real-time feedback ("Generating video...")
- ✅ Job state is persisted in database
- ✅ Credits are only charged after successful completion

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

