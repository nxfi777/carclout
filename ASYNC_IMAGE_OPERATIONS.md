# Async Image Operations Implementation

## Overview

All image generation and tool operations are now **asynchronous**, following the same pattern as video generation. This prevents long-running HTTP requests from blocking and provides a better user experience.

## What Changed

### Operations Converted to Async:

1. **Image Generation** (`/api/templates/generate`)
   - Now uses `fal.queue.submit()` instead of `fal.subscribe()`
   - Returns job ID immediately
   - Client polls `/api/templates/generate/status?jobId=xxx` for results

2. **Image Upscaling** (`/api/tools/upscale`)
   - Now uses `fal.queue.submit()` for clarity-upscaler
   - Returns job ID immediately
   - Client polls `/api/tools/status?jobId=xxx` for results

3. **Draw-to-Edit** (`/api/tools/draw-to-edit`)
   - Now uses `fal.queue.submit()` for Gemini editing
   - Stitching logic moved to status endpoint
   - Returns job ID immediately
   - Client polls `/api/tools/status?jobId=xxx` for results

4. **Studio** (`/api/studio`)
   - Now uses `fal.queue.submit()` for Gemini
   - Returns job ID immediately
   - Client polls `/api/tools/status?jobId=xxx` for results

### Operations That Remain Sync:

- **BiRefNet** (`/api/tools/rembg`) - Fast enough to stay synchronous
- **Video Upscale** (`/api/tools/video-upscale`) - Uses direct fetch, already fast
- **Video Interpolate** (`/api/tools/video-interpolate`) - Uses direct fetch, already fast

## Database Schema Changes

### New Tables Created:

1. **`image_job`** - Tracks async image generation jobs
   - Schema: `carclout/scripts/image-job-table.surql`
   - Fields: email, fal_request_id, fal_model, template_id, status, prompt, image_size, etc.

2. **`tool_job`** - Tracks async tool operations (upscale, draw_to_edit, studio)
   - Schema: `carclout/scripts/tool-job-table.surql`
   - Fields: email, fal_request_id, fal_model, tool_type, status, params, etc.

### Running Migrations:

```bash
# Connect to SurrealDB and run:
surreal import --endpoint http://localhost:8000 --username root --password root --namespace production --database carclout carclout/scripts/image-job-table.surql
surreal import --endpoint http://localhost:8000 --username root --password root --namespace production --database carclout carclout/scripts/tool-job-table.surql
```

Or run the SQL directly in your SurrealDB console.

## New API Endpoints

1. **`/api/templates/generate/status`** (GET)
   - Query param: `jobId`
   - Returns: `{ status, url, key, credits }` when completed
   - Returns: `{ status, message }` when pending/processing
   - Returns: `{ status, error }` when failed

2. **`/api/tools/status`** (GET)
   - Query param: `jobId`
   - Returns: `{ status, url, key, credits, tool_type }` when completed
   - Returns: `{ status, message, tool_type }` when pending/processing
   - Returns: `{ status, error, tool_type }` when failed

## Frontend Integration

### Example: Image Generation

**Before (Sync):**
```typescript
const response = await fetch('/api/templates/generate', {
  method: 'POST',
  body: JSON.stringify({ templateSlug, userImageKeys, variables })
});
const { url, key } = await response.json();
// Image is ready immediately
```

**After (Async):**
```typescript
// Step 1: Start generation
const response = await fetch('/api/templates/generate', {
  method: 'POST',
  body: JSON.stringify({ templateSlug, userImageKeys, variables })
});
const { jobId, credits } = await response.json();

// Step 2: Poll for completion
const pollStatus = async () => {
  const statusResponse = await fetch(`/api/templates/generate/status?jobId=${jobId}`);
  const result = await statusResponse.json();
  
  if (result.status === 'completed') {
    return { url: result.url, key: result.key };
  } else if (result.status === 'failed') {
    throw new Error(result.error);
  } else {
    // Still processing, poll again in 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    return pollStatus();
  }
};

const { url, key } = await pollStatus();
```

### Example: Tool Operations (Upscale, Draw-to-Edit, Studio)

**Before (Sync):**
```typescript
const response = await fetch('/api/tools/upscale', {
  method: 'POST',
  body: JSON.stringify({ r2_key, upscale_factor })
});
const { url, key } = await response.json();
```

**After (Async):**
```typescript
// Step 1: Start operation
const response = await fetch('/api/tools/upscale', {
  method: 'POST',
  body: JSON.stringify({ r2_key, upscale_factor })
});
const { jobId } = await response.json();

// Step 2: Poll for completion
const pollStatus = async () => {
  const statusResponse = await fetch(`/api/tools/status?jobId=${jobId}`);
  const result = await statusResponse.json();
  
  if (result.status === 'completed') {
    return { url: result.url, key: result.key, tool_type: result.tool_type };
  } else if (result.status === 'failed') {
    throw new Error(result.error);
  } else {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return pollStatus();
  }
};

const { url, key } = await pollStatus();
```

## Response Format Changes

### Image Generation (`/api/templates/generate`)

**Before:**
```json
{
  "key": "users/{userId}/library/gen-123.jpg",
  "url": "https://..."
}
```

**After (initial response):**
```json
{
  "jobId": "fal-request-id",
  "status": "pending",
  "credits": 20,
  "message": "Image generation started. Check status at /api/templates/generate/status"
}
```

**Status endpoint response (completed):**
```json
{
  "status": "completed",
  "url": "https://...",
  "key": "users/{userId}/library/gen-123.jpg",
  "credits": 20
}
```

### Tool Operations (`/api/tools/upscale`, `/api/tools/draw-to-edit`, `/api/studio`)

**Before:**
```json
{
  "key": "users/{userId}/library/upscaled-123.jpg",
  "url": "https://...",
  "credits_charged": 1
}
```

**After (initial response):**
```json
{
  "jobId": "fal-request-id",
  "status": "pending",
  "credits": 1,
  "message": "Upscale operation started. Check status at /api/tools/status"
}
```

**Status endpoint response (completed):**
```json
{
  "status": "completed",
  "url": "https://...",
  "key": "users/{userId}/library/upscale-123.jpg",
  "credits": 1,
  "tool_type": "upscale"
}
```

## Benefits

1. **No Blocking Requests**: HTTP connections are freed immediately
2. **Better UX**: Users see immediate feedback that processing has started
3. **Scalability**: Can handle more concurrent operations
4. **Reliability**: Jobs are persisted in database, can recover from crashes
5. **Consistency**: All async operations follow the same pattern as video generation

## Testing Checklist

- [ ] Run database migrations
- [ ] Update frontend to use polling pattern for image generation
- [ ] Update frontend to use polling pattern for upscale
- [ ] Update frontend to use polling pattern for draw-to-edit
- [ ] Update frontend to use polling pattern for studio
- [ ] Test error handling (failed jobs, insufficient credits, etc.)
- [ ] Test job cleanup/expiry if needed
- [ ] Monitor job status in database

## Notes

- BiRefNet (background removal) remains synchronous as it's fast enough
- Video operations (upscale, interpolate) remain as-is (already using direct fetch)
- Credit charging happens when job completes, not when job is created
- All job metadata is stored in SurrealDB for tracking and debugging

