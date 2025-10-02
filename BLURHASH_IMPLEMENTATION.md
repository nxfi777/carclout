# BlurHash Implementation Guide

## 🎨 What is BlurHash?

BlurHash generates **actual blurred previews** of your images, not just solid colors.

### Visual Comparison

**Before (Color Blur):**
```
[Gray blur rectangle] → [Image pops in]
```

**After (BlurHash):**
```
[Blurred version of actual image] → [Sharp image fades in]
     ↑ You can see shapes/colors!
```

**Example:**
- Image: Red Ferrari on track
- BlurHash preview: Blurred red car shape visible
- User Experience: Feels instant + professional

---

## ✅ What Was Implemented

### 1. **Dependencies Installed**
```json
{
  "blurhash": "^2.0.5",  // Encode/decode library
  "sharp": "^0.34.4"     // Image processing
}
```

### 2. **New Files Created**

#### `lib/blurhash-server.ts` (Server-side)
Functions for generating BlurHash:
- `generateBlurHash(buffer)` - From image buffer
- `generateBlurHashFromURL(url)` - From URL
- `generateBlurHashFromFile(path)` - From file path

#### `lib/blur-placeholder.ts` (Updated)
Client-side decoding:
- `blurHashToDataURL(hash)` - Decode to data URL
- `blurHashToDataURLCached(hash)` - With caching
- `isValidBlurHash(hash)` - Validation

#### `components/ui/blurhash-image.tsx` (New)
Drop-in component:
```tsx
<BlurhashImage 
  src="/image.webp"
  blurhash="LKO2?V%2Tw=w]~RBVZRi};RPxuwH"
  width={600}
  height={400}
/>
```

#### `app/api/blurhash/generate/route.ts` (New)
API endpoint to generate blurhash on-demand:
```typescript
POST /api/blurhash/generate
Body: { imageUrl: string }
Returns: { blurhash: string }
```

### 3. **Upload Integration**

Updated `app/api/storage/upload/route.ts`:
- Automatically generates BlurHash for uploaded images
- Returns `blurhash` in response
- Non-blocking (doesn't slow down upload)

---

## 🔄 **How It Works**

### Upload Flow

```
1. User uploads image
   ↓
2. Image saved to R2 storage
   ↓
3. BlurHash generated (tiny encoded string)
   ↓
4. BlurHash returned in upload response
   ↓
5. Store blurhash in your database/state
```

### Render Flow

```
1. Component receives blurhash string
   ↓
2. BlurHash decoded to blurred preview (32x32 pixels)
   ↓
3. Preview shown immediately (< 10ms)
   ↓
4. Actual image loads in background
   ↓
5. Smooth fade from blur to sharp
```

---

## 💻 **Usage**

### Option 1: BlurhashImage Component (Easiest)

```tsx
import { BlurhashImage } from '@/components/ui/blurhash-image';

<BlurhashImage 
  src="/template-thumb.webp"
  alt="Template preview"
  width={640}
  height={360}
  blurhash="LKO2?V%2Tw=w]~RBVZRi};RPxuwH"  // From database
  showSkeleton={true}
  fallbackBlur="cardGradient"  // If no blurhash
/>
```

### Option 2: Manual Usage

```tsx
import Image from 'next/image';
import { blurHashToDataURLCached } from '@/lib/blur-placeholder';

const blurDataURL = blurHashToDataURLCached(template.blurhash);

<Image 
  src={template.thumbUrl}
  placeholder="blur"
  blurDataURL={blurDataURL}
  width={600}
  height={400}
/>
```

### Option 3: Generate BlurHash On-Demand

```tsx
// In your upload handler
const response = await fetch('/api/storage/upload', {
  method: 'POST',
  body: formData
});

const { key, blurhash } = await response.json();

// Store blurhash with image metadata
await db.update('template', {
  thumbUrl: key,
  blurhash: blurhash  // ← Store this!
});
```

---

## 🗄️ **Database Schema Updates Needed**

You'll need to add `blurhash` field to your database tables:

### Templates Table
```typescript
type Template = {
  id: string;
  name: string;
  thumbUrl?: string;
  blurhash?: string;  // ← ADD THIS
  // ... other fields
};
```

### User Images/Workspace
```typescript
type WorkspaceImage = {
  key: string;
  url: string;
  blurhash?: string;  // ← ADD THIS (optional)
  // ... other fields
};
```

### Example SurrealDB Schema
```surql
DEFINE FIELD blurhash ON TABLE template TYPE option<string>;
DEFINE FIELD blurhash ON TABLE workspace_image TYPE option<string>;
```

---

## 🔧 **Integration Steps**

### Step 1: Update Upload Handler

Already done! The upload API now returns `blurhash`.

### Step 2: Store BlurHash in Database

Example for templates:
```typescript
// When uploading template thumbnail
const formData = new FormData();
formData.append('file', thumbnailFile);
formData.append('path', 'admin/templates');
formData.append('scope', 'admin');

const uploadRes = await fetch('/api/storage/upload', {
  method: 'POST',
  body: formData
});

const { key, blurhash } = await uploadRes.json();

// Store in database
await db.create('template', {
  name: templateName,
  thumbUrl: key,
  blurhash: blurhash,  // ← Store this!
  // ... other fields
});
```

### Step 3: Use in Components

Update template card to use BlurHash:
```tsx
<BlurhashImage 
  src={template.thumbUrl}
  blurhash={template.blurhash}  // ← From database
  alt={template.name}
  width={640}
  height={360}
/>
```

---

## 🎯 **Where to Use BlurHash**

### High Priority (Best ROI)
1. ✅ **Template thumbnails** - Most visible
2. ✅ **User workspace images** - Frequent viewing
3. ✅ **Hero images** - First impression
4. ✅ **Car photos** - Main content

### Medium Priority
5. **Profile avatars**
6. **Feature images**
7. **Generated results**

### Not Needed
- Icons (too small)
- UI elements
- Non-photo images

---

## 📊 **Performance Impact**

### BlurHash Characteristics

| Metric | Value |
|--------|-------|
| **Encoded Size** | ~20-30 characters |
| **Decode Time** | < 10ms (client-side) |
| **Preview Quality** | Recognizable shapes/colors |
| **Browser Support** | All modern browsers |

### Comparison

| Type | Size | Generation | Visual Quality | Use Case |
|------|------|------------|----------------|----------|
| **Color Blur** | < 1KB | Instant | Solid color | Fallback |
| **BlurHash** | 30 chars | ~50ms server | Actual image blur | Primary |
| **LQIP** | ~2-5KB | ~100ms | High quality blur | Overkill |

---

## 🚀 **Example: Template Card with BlurHash**

```tsx
// Before
<Image 
  src={template.thumbUrl}
  alt={template.name}
  width={640}
  height={360}
  placeholder="blur"
  blurDataURL={BLUR_DATA_URLS.cardGradient}  // ← Generic gray blur
/>

// After
<BlurhashImage 
  src={template.thumbUrl}
  alt={template.name}
  width={640}
  height={360}
  blurhash={template.blurhash}  // ← Actual image blur!
  fallbackBlur="cardGradient"   // ← Falls back if no blurhash
/>
```

**Result:**
- User sees blurred template preview instantly
- Actual template fades in smoothly
- Professional, polished feel
- No empty boxes or solid colors

---

## 🔄 **Migration Strategy**

### Phase 1: New Uploads (Immediate)
✅ Upload API now generates blurhash automatically  
✅ Store blurhash when creating new templates/images  
✅ New content has image-based blur  

### Phase 2: Existing Images (Gradual)
You can backfill blurhash for existing images:

```typescript
// Script to generate blurhash for existing templates
const templates = await db.select('template');

for (const template of templates) {
  if (!template.blurhash && template.thumbUrl) {
    try {
      const res = await fetch('/api/blurhash/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: template.thumbUrl })
      });
      
      const { blurhash } = await res.json();
      
      await db.update(template.id, { blurhash });
      console.log(`Generated blurhash for ${template.name}`);
    } catch (error) {
      console.error(`Failed for ${template.name}:`, error);
    }
  }
}
```

---

## 🎨 **Visual Examples**

### What Users See

**Template Loading:**
```
[Blurred template shape with colors]
  ↓ (smooth 700ms fade)
[Sharp, high-quality template]
```

**Car Photo Loading:**
```
[Blurred car silhouette]
  ↓
[Sharp car photo]
```

**Compared to Current:**
```
[Gray rectangle]
  ↓
[Image suddenly appears]
```

---

## 🛠️ **Configuration**

### BlurHash Component Settings

| Prop | Default | Purpose |
|------|---------|---------|
| `componentX` | 4 | Horizontal detail (4-9) |
| `componentY` | 3 | Vertical detail (3-9) |
| `width` | 32 | Decode width (16-64) |
| `height` | 32 | Decode height (16-64) |

**Higher values = more detail = larger blurhash string**

Recommended:
- Small images (< 200px): 3x3 components
- Medium images: 4x3 components (default)
- Large images: 6x4 components

---

## 📝 **Next Steps**

### 1. Add BlurHash Field to Database

```surql
-- For templates
DEFINE FIELD blurhash ON TABLE template TYPE option<string>;

-- For workspace metadata (if tracked)
DEFINE FIELD blurhash ON TABLE workspace_file TYPE option<string>;
```

### 2. Update Template Creation

When admins create templates:
```typescript
// The upload already returns blurhash
const { key, blurhash } = await uploadResponse.json();

// Just store it!
await db.create('template', {
  thumbUrl: key,
  blurhash: blurhash,
  // ... other fields
});
```

### 3. Update Template Card

Replace Image with BlurhashImage:
```tsx
<BlurhashImage 
  src={template.thumbUrl}
  blurhash={template.blurhash}
  // ... props
/>
```

---

## ✨ **Benefits**

### User Experience
- ✅ **Instant visual feedback** - See blurred image immediately
- ✅ **Professional polish** - Like Netflix, Medium, etc.
- ✅ **Smooth transitions** - No jarring pops
- ✅ **Context while loading** - Know what's coming

### Performance
- ✅ **Tiny storage** - 20-30 characters per image
- ✅ **Fast decode** - < 10ms client-side
- ✅ **Cached** - Decoded once, reused
- ✅ **Zero layout shift** - Dimensions known

### Developer Experience
- ✅ **Automatic** - Generated on upload
- ✅ **Optional** - Falls back gracefully
- ✅ **Simple API** - Just pass blurhash prop
- ✅ **Type-safe** - Full TypeScript support

---

## 🔍 **Testing**

### Test Upload
```bash
# Upload an image via API
# Check response includes blurhash

{
  "key": "users/test/library/car.jpg",
  "blurhash": "LKO2?V%2Tw=w]~RBVZRi};RPxuwH"  // ← Should see this!
}
```

### Test Rendering
```tsx
// Paste actual blurhash to test
<BlurhashImage 
  src="/test.jpg"
  blurhash="LKO2?V%2Tw=w]~RBVZRi};RPxuwH"
  width={400}
  height={300}
/>

// Should show blurred preview, then sharp image
```

---

## 🚨 **Important Notes**

1. **BlurHash is optional** - Images work without it (falls back to color blur)
2. **Backward compatible** - Existing images continue working
3. **Non-blocking** - Generation doesn't slow upload
4. **Cached** - Decoded blurhash cached in sessionStorage
5. **Small overhead** - ~30 chars storage per image

---

## 🎯 **Summary**

**What You Have Now:**

✅ Server-side blurhash generation (`lib/blurhash-server.ts`)  
✅ Client-side blurhash decoding (`lib/blur-placeholder.ts`)  
✅ Auto-generation on upload (`api/storage/upload`)  
✅ Easy-to-use components (`BlurhashImage`)  
✅ API endpoint for backfilling (`api/blurhash/generate`)  
✅ Caching for performance  
✅ Graceful fallbacks  

**Next Steps:**

1. Add `blurhash` field to database schema
2. Update template creation to store blurhash
3. Replace Image with BlurhashImage in components
4. (Optional) Backfill existing images

**Result:** Professional, Netflix-style image loading! 🎬

