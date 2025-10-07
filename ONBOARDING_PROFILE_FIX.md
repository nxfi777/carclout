# Onboarding Profile Save Fix

## Issue
Users were getting a **500 Internal Server Error** when completing onboarding and saving their profile with the error:
```
Error [ResponseError]: The query was not executed due to a failed transaction. 
Failed to commit transaction due to a read or write conflict. 
This transaction can be retried
```

## Root Cause
The `/api/profile` POST endpoint was making **multiple sequential UPDATE queries** to SurrealDB without any retry mechanism:

1. UPDATE name
2. UPDATE displayName  
3. UPDATE image
4. UPDATE vehicles
5. UPDATE carPhotos (computed from vehicles)
6. UPDATE carPhotos (if provided separately)
7. UPDATE chatProfilePhotos
8. UPDATE bio
9. UPDATE onboardingCompleted

When multiple users were onboarding simultaneously or when the same user triggered multiple requests, SurrealDB would throw **transaction conflict errors** because these separate UPDATE statements were competing for database locks.

## Solution Applied

### 1. **Added Retry Logic**
Imported and used the existing `retryOnConflict` utility that handles SurrealDB transaction conflicts with exponential backoff (100ms, 200ms, 400ms).

### 2. **Reduced Transaction Count**
Instead of 5-9 separate UPDATE queries, combined them into:
- **1 combined UPDATE query** for all basic fields (name, displayName, image, bio, vehicles, carPhotos, chatProfilePhotos, onboardingCompleted)
- **1 optional UPDATE query** for appending single vehicles (only when using the legacy car*/vehicle* parameters)

This reduces the number of transactions from 5-9 down to 1-2, significantly lowering the chance of conflicts.

### 3. **Better Error Handling**
- Wrapped all database operations in a try-catch block
- Added detailed error logging to console
- Return meaningful error messages to the client with details

## Code Changes

**File**: `carclout/app/api/profile/route.ts`

**Changes**:
1. Added import: `import { retryOnConflict } from "@/lib/retry";`
2. Refactored POST handler to:
   - Validate/normalize all input data upfront
   - Build a single UPDATE query with all fields
   - Wrap database operations in `retryOnConflict()`
   - Handle errors gracefully with detailed logging

## Testing
To verify the fix works:
1. Complete onboarding with a new user account
2. Submit profile with vehicle and photos
3. Verify successful save and redirect to `/plan` page
4. Check server logs for any retry messages (indicates conflicts were handled gracefully)

## Related Files
- `carclout/lib/retry.ts` - The retry utility that handles transaction conflicts
- `carclout/app/onboarding/_components/onboarding-page-client.tsx` - Client component that calls the API

## Prevention
This pattern should be used for all SurrealDB UPDATE operations that might have concurrent access:
- Wrap operations in `retryOnConflict()`
- Combine multiple UPDATEs into single queries where possible
- Always handle transaction conflict errors gracefully

