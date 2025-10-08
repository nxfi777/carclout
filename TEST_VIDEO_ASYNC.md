# Testing the Async Video Generation Fix

## Quick Test Guide

### 1. Manual Testing via UI
1. Open the CarClout workspace (Dashboard)
2. Select a design image from your library
3. Click the "Animate" or video generation button
4. You should see:
   - ✅ Immediate toast: "Video generation started! This may take a few minutes..."
   - ✅ No 524 timeout errors
   - ✅ Page remains responsive
   - ✅ After 30s-3min: "Video generated successfully!"
   - ✅ Video appears in your library

### 2. Testing via API

#### Start Video Generation
```bash
curl -X POST https://carclout.io/api/templates/video \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "templateSlug": "night-life-roller",
    "startKey": "users/your-user-id/library/design-123.png",
    "duration": "5",
    "variables": {}
  }'
```

**Expected Response** (immediate, < 1 second):
```json
{
  "jobId": "fal-request-abc123",
  "status": "pending",
  "credits": 500,
  "message": "Video generation started. Check status at /api/templates/video/status"
}
```

#### Check Status
```bash
curl "https://carclout.io/api/templates/video/status?jobId=fal-request-abc123" \
  -H "Cookie: your-session-cookie"
```

**While Processing**:
```json
{
  "status": "processing",
  "message": "Generating video..."
}
```

**When Complete**:
```json
{
  "status": "completed",
  "url": "https://...",
  "key": "users/.../library/video.mp4",
  "credits": 500
}
```

**On Failure**:
```json
{
  "status": "failed",
  "error": "Error message"
}
```

### 3. Database Verification

Check that jobs are being tracked:
```sql
-- In SurrealDB console
SELECT * FROM video_job ORDER BY created_at DESC LIMIT 10;
```

You should see records with:
- `fal_request_id`: The job ID from fal.ai
- `status`: pending → processing → completed/failed
- `email`: User who requested the video
- `template_id`, `start_key`: Request details
- Timestamps: `created_at`, `updated_at`, `completed_at`

### 4. Network Tab Verification

Open browser DevTools → Network tab:

1. **Initial Request** to `/api/templates/video`
   - Should return immediately (< 1s)
   - Status: 200
   - Response includes `jobId`

2. **Polling Requests** to `/api/templates/video/status`
   - Frequency: Every 3 seconds
   - Continues until status is `completed` or `failed`
   - Should NOT timeout (each request < 30s)

### 5. Error Scenarios to Test

#### Insufficient Credits
```json
// POST /api/templates/video response
{ "error": "INSUFFICIENT_CREDITS" }
// Status: 402
```

#### Invalid Template
```json
{ "error": "Template not found" }
// Status: 404
```

#### Job Not Found
```bash
curl "/api/templates/video/status?jobId=invalid-id"
```
```json
{ "error": "Job not found" }
// Status: 404
```

## Monitoring

### Server Logs
Watch for these log messages:
```
[VIDEO JOB] Queued job fal-request-xyz for user email@example.com
[VIDEO JOB fal-request-xyz] Status: IN_QUEUE
[VIDEO JOB fal-request-xyz] Status: IN_PROGRESS
[VIDEO JOB fal-request-xyz] Status: COMPLETED
[VIDEO JOB fal-request-xyz] Completed, downloading from https://...
Stored library video metadata for users/.../library/video.mp4
```

### Expected Performance
- Initial submission: < 1 second
- Status checks: < 1 second each
- Total video generation: 30 seconds - 5 minutes (depends on provider)
- No 524 timeouts!

## Rollback Plan

If issues arise, you can rollback by:
1. Restoring the previous version of `/app/api/templates/video/route.ts`
2. Deleting `/app/api/templates/video/status/route.ts`
3. Reverting frontend changes in `dashboard-workspace-panel.tsx`

The database table `video_job` can remain - it won't cause issues if unused.

