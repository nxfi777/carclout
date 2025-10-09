# Library Image Usage Tracking

## Overview

Library images now track when they were last used in template generation and are automatically sorted to show frequently used images at the top. This improves UX by making recently used images more accessible.

## How It Works

### 1. Database Field: `lastUsed`
- Added `lastUsed` field to `library_image` table
- Stores ISO 8601 timestamp of when the image was last used in generation
- Type: `option<datetime>` (nullable)

### 2. Tracking Usage
When a template is generated using library images:
- The generation endpoint identifies which library images were used
- Updates the `lastUsed` timestamp for those images
- Happens automatically, fire-and-forget (doesn't block response)

### 3. Smart Sorting
Library images are now sorted by:
1. **Primary**: `lastUsed` (most recently used first)
2. **Fallback**: `lastModified` (most recently uploaded first)

This means:
- Newly uploaded images appear at the top initially
- Once used in generation, they stay at the top
- Frequently used images remain easily accessible
- Unused images gradually move down the list

## Files Modified

### Database
- `lib/library-image.ts` - Added `lastUsed` field to type definition
- `scripts/add-library-image-lastused.surql` - Migration to add field to database

### Backend
- `app/api/templates/generate/route.ts` - Tracks usage when images are used in generation
- `app/api/storage/list/route.ts` - Fetches `lastUsed` and sorts library images accordingly

### Frontend
- `app/dashboard/showroom/page.tsx` - Removed client-side sorting (now handled by API)
- `components/ui/content-tabs-core.tsx` - Removed client-side sorting (now handled by API)
- `components/layer-editor/ToolOptionsBar.tsx` - No changes needed (already uses API order)

## Setup

Run the database migration:

```sql
-- In SurrealDB
DEFINE FIELD lastUsed ON library_image TYPE option<datetime>;
```

Or use the provided migration file:
```bash
# Apply migration from scripts/add-library-image-lastused.surql
```

## Benefits

1. **Better UX**: Most relevant images appear first
2. **No user effort**: Automatic tracking based on actual usage
3. **Smart defaults**: New images start at top, stay there if used
4. **Progressive improvement**: The more you use it, the smarter it gets

## Technical Details

- Usage tracking is non-blocking (fire-and-forget)
- Failed tracking doesn't affect generation
- Sorting happens server-side for consistency
- All library image display locations benefit automatically

