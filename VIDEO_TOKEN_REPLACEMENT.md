# Video Generation Token Replacement Implementation

## Overview
Constant tokens like `[BRAND]`, `[MODEL]`, `[COLOR_FINISH]`, `[ACCENTS]`, etc. now work in video generation prompts, just like they do in image generation prompts. These tokens are automatically replaced with user data when generating videos.

## How It Works

### Supported Tokens
The following tokens are automatically replaced with user vehicle data:
- `[BRAND]` - Vehicle make (e.g., "Tesla")
- `[MAKE]` - Alias for BRAND
- `[BRAND_CAPS]` - Vehicle make in uppercase (e.g., "TESLA")
- `[MODEL]` - Vehicle model (e.g., "Model 3")
- `[COLOR_FINISH]` - Color/finish of the vehicle (e.g., "Midnight Silver Metallic")
- `[ACCENTS]` - Accent color if specified (e.g., "Red")
- `[COLOR_FINISH_ACCENTS]` - Combined color and accents (e.g., "Midnight Silver Metallic with Red")

Any custom variables defined in the template's `variables` array are also supported.

## Implementation Details

### Backend (API)
**File**: `carclout/app/api/templates/video/route.ts`

The video API already had token replacement logic (lines 125-134):
```typescript
// Process custom tokens in video prompt
if (body?.variables && typeof body.variables === 'object') {
  const variables = body.variables as Record<string, string>;
  for (const [key, value] of Object.entries(variables)) {
    if (typeof key === 'string' && typeof value === 'string') {
      const token = `[${key}]`;
      videoPrompt = videoPrompt.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }
  }
}
```

### Frontend Components

#### 1. Templates Tab (Already Working ✅)
**File**: `carclout/components/ui/content-tabs-core.tsx`

The Templates tab was already correctly passing variables to the video API:
- Variables are built from vehicle data and user input (lines 1390-1425)
- Passed to video API in the request (line 1784):
  ```typescript
  const allVariables = { ...varState, ...animVariables };
  const resp = await fetch('/api/templates/video', { 
    method: 'POST', 
    body: JSON.stringify({ 
      templateId: active?.id, 
      templateSlug: active?.slug, 
      startKey, 
      duration: animDuration, 
      variables: allVariables 
    }) 
  });
  ```

#### 2. Workspace Panel (Fixed ✅)
**File**: `carclout/components/dashboard-workspace-panel.tsx`

Previously, the workspace panel was NOT passing variables when generating videos from designs. This has been fixed:

**Changes Made:**
1. Added state to store user's profile vehicles (line 123):
   ```typescript
   const [profileVehicles, setProfileVehicles] = useState<Array<{ make?: string; model?: string; colorFinish?: string; accents?: string; type?: string }>>([]);
   ```

2. Added effect to fetch profile vehicles (lines 156-176):
   ```typescript
   useEffect(() => {
     const fetchVehicles = async () => {
       const profile = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json());
       const vehicles = Array.isArray(profile?.profile?.vehicles) ? profile.profile.vehicles : [];
       if (!cancelled) setProfileVehicles(vehicles);
     };
     fetchVehicles();
     
     // Re-fetch when profile is updated
     window.addEventListener("profile-updated", onProfileUpdated);
     // ...
   }, []);
   ```

3. Modified the `onAnimate` callback to build and pass variables (lines 2137-2159):
   ```typescript
   // Build variables for token replacement in video prompts
   const variables: Record<string, string> = {};
   if (profileVehicles.length > 0) {
     const v = profileVehicles[0];
     const brand = v.make || '';
     const model = v.model || '';
     const cf = v.colorFinish || '';
     const acc = v.accents || '';
     const combo = acc ? `${cf} with ${acc}` : cf;
     if (brand) {
       variables.BRAND = brand;
       variables.MAKE = brand;
       variables.BRAND_CAPS = brand.toUpperCase();
     }
     if (model) variables.MODEL = model;
     if (cf) variables.COLOR_FINISH = cf;
     if (acc) variables.ACCENTS = acc;
     if (combo) variables.COLOR_FINISH_ACCENTS = combo;
   }
   
   const resp = await fetch('/api/templates/video', { 
     method: 'POST', 
     body: JSON.stringify({ 
       templateSlug: slug, 
       startKey: key, 
       variables // Now passing variables!
     }) 
   });
   ```

## Usage Example

### In Admin Template Creation
When creating or editing a template in the admin panel, you can use tokens in the video prompt:

```
A cinematic pan around a [BRAND] [MODEL] with [COLOR_FINISH_ACCENTS] parked in a modern showroom
```

This will automatically be replaced with the user's actual vehicle data:
```
A cinematic pan around a Tesla Model 3 with Midnight Silver Metallic with Red parked in a modern showroom
```

### Token Replacement Flow
1. User generates an image using a template
2. User clicks "Animate" on the generated design
3. System fetches user's profile vehicles
4. System extracts vehicle data (make, model, color, accents)
5. System builds variables object with tokens
6. System passes variables to video API
7. Video API replaces tokens in the video prompt
8. Video is generated with personalized prompt

## Benefits
- **Consistency**: Video prompts use the same token system as image prompts
- **Personalization**: Videos are automatically customized to user's vehicle
- **Simplicity**: Users don't need to manually enter vehicle details for video generation
- **Maintainability**: Single source of truth for vehicle data (user profile)

## Notes
- Currently uses the first vehicle in the user's profile for workspace video generation
- Could be enhanced in the future to match vehicle based on filename patterns or user selection
- Profile vehicles are automatically refreshed when the "profile-updated" event is triggered

