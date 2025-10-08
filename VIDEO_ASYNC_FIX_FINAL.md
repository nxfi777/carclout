# Video Generation Async Fix - Complete

## Issues Fixed

### 1. ✅ 524 Cloudflare Timeout (Original Issue)
- **Problem**: Videos taking >100s caused Cloudflare timeout
- **Solution**: Changed from `fal.subscribe()` to `fal.queue.submit()` for async job submission

### 2. ✅ Database DateTime Errors
- **Problem**: SurrealDB rejected ISO string datetimes
- **Solution**: Use `time::now()` directly in queries instead of passing datetime as parameter

### 3. ✅ Status Polling 404 Errors
- **Problem**: `fal.queue.status()` requires BOTH model name AND request ID
- **Solution**: Store `fal_model` in database, use it when checking status:
  ```typescript
  await fal.queue.status(job.fal_model, { requestId: jobId })
  ```

### 4. ✅ UX Improvements
- **Problem**: Too many toasts (loading toast + designer modal = redundant)
- **Solution**: Removed loading toast, Designer modal already shows "Generating video..."

## Final Architecture

```
User clicks Animate
    ↓
Designer modal shows: "Generating video. This may take a couple of minutes..."
    ↓
POST /api/templates/video (with FormData + blob)
    ↓
Returns immediately with jobId
    ↓
Frontend polls GET /api/templates/video/status?jobId=xxx every 3s
    ↓
Status endpoint calls: fal.queue.status(model, { requestId: jobId })
    ↓
When complete: Downloads video, uploads to R2, charges credits
    ↓
Returns { status: 'completed', url, key, credits }
    ↓
Designer shows video in preview
```

## Database Schema

```sql
DEFINE TABLE video_job SCHEMAFULL;
DEFINE FIELD email ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_request_id ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_model ON video_job TYPE string ASSERT $value != NONE;  -- Critical for status polling!
DEFINE FIELD template_id ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD status ON video_job TYPE string ASSERT $value IN ['pending', 'processing', 'completed', 'failed'];
DEFINE FIELD provider ON video_job TYPE string ASSERT $value IN ['seedance', 'kling2_5', 'sora2', 'sora2_pro'];
-- Plus optional fields for metadata...
```

## API Usage

### Shared Hook (Recommended)
```typescript
import { useAsyncVideoGeneration } from '@/lib/use-async-video-generation';

const videoGeneration = useAsyncVideoGeneration();

await videoGeneration.generate(
  {
    templateSlug: 'night-life-roller',
    startImage: blob,  // Blob from canvas
    variables: { BRAND: 'Tesla' }
  },
  {
    onComplete: async (result) => {
      console.log('Video ready:', result.url);
    }
  }
);
```

### Direct API
```typescript
// 1. Submit job
const formData = new FormData();
formData.append('startImage', file);
formData.append('data', JSON.stringify({ 
  templateSlug: 'my-template',
  variables: { ... } 
}));

const response = await fetch('/api/templates/video', {
  method: 'POST',
  body: formData
});
const { jobId } = await response.json();

// 2. Poll status
const status = await fetch(`/api/templates/video/status?jobId=${jobId}`);
const data = await status.json();
// { status: 'completed', url: '...', key: '...' }
```

## Testing

Try generating a video now - you should see:
```
✅ Designer modal: "Generating video. This may take a couple of minutes..."
✅ Console: [VIDEO] Job started: <job-id>
✅ Console: [VIDEO] Poll 1: status=pending
✅ Console: [VIDEO] Poll 2: status=processing  
✅ Console: [VIDEO] Poll N: status=completed
✅ Console: [VIDEO] Generation complete: users/.../library/video.mp4
✅ Video appears in preview
✅ NO 524 timeouts!
✅ NO duplicate toasts!
```

## Background Processing

Even if you close the browser:
- Job continues on fal.ai ✅
- Server polls and processes when complete ✅
- Video saved to library ✅
- Credits charged ✅
- Will appear when you refresh ✅

## Migration Applied

```bash
✓ fal_model field already exists
✓ Updated existing records
✅ Migration complete!
```

All stuck jobs now have the correct `fal_model` field and will poll properly!

