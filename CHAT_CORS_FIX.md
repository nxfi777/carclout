# Chat Image CORS Fix

## Problem
Users could see their own images in chat but other users couldn't view them. This was a permission issue, not actually a CORS problem.

## Root Cause
1. When User A uploaded an image, it was stored as `users/userA@email.com/chat-uploads/image.jpg`
2. The `/api/storage/file` endpoint only allowed users to access files in their own user directory
3. When User B tried to view User A's image, the API blocked access

## Solution
Created a dedicated `/api/chat/file` endpoint that:
- Allows any authenticated user to access chat attachments from ANY user
- Validates that files are from allowed chat folders: `chat-uploads`, `car-photos`, `vehicles`, `library`
- Maintains security by preventing access to other user files outside these shared folders

## Changes Made

### 1. New API Route: `/api/chat/file/route.ts`
- Authenticates users
- Validates attachment keys are from allowed chat folders
- Serves files from R2 storage with proper headers
- Uses public caching (3600s) for better performance

### 2. Updated: `/api/storage/view-bulk/route.ts`
- Detects chat attachments by folder name
- Returns direct `/api/chat/file` URLs instead of signed URLs for chat content
- Maintains signed URL behavior for non-chat files (library, vehicles, etc.)
- Added `library` to allowed cross-user folders

## How It Works

1. **Upload**: User A uploads image → stored as `users/userA@email.com/chat-uploads/image.jpg`
2. **Post Message**: User A sends chat message with attachment key
3. **Fetch URLs**: Client calls `/api/storage/view-bulk` with attachment keys
4. **URL Generation**: 
   - For chat attachments: Returns `/api/chat/file?key=...`
   - For other files: Returns signed R2 URL
5. **View Image**: User B loads message, fetches via `/api/chat/file`, gets image data

## Security

✅ **Protected**: Only authenticated users can access chat attachments
✅ **Restricted**: Only files in allowed folders (chat-uploads, car-photos, vehicles, library)
✅ **Validated**: Path traversal attacks prevented (`..` checks)
✅ **Scoped**: Users still can't access each other's private files outside chat folders

## Cache Considerations

The client caches view URLs for 9 minutes. To see the fix:
1. Refresh the page (clears in-memory cache)
2. Or wait for cache to expire
3. New images will use the new endpoint immediately

## Testing

To verify the fix works:
1. User A uploads and sends an image in chat
2. User B should now see User A's image immediately
3. Check browser Network tab - images should load from `/api/chat/file?key=...`

