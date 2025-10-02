# Storage System Database Migration

## Overview
This migration adds the `storage_addon` table to support storage add-ons for Premium users via XP redemption or purchases.

## Migration Steps

### 1. Create `storage_addon` Table

Run this SurrealDB query:

```sql
-- Create the storage_addon table
DEFINE TABLE storage_addon SCHEMAFULL;

-- Define fields
DEFINE FIELD user ON storage_addon TYPE record<user>;
DEFINE FIELD bytes ON storage_addon TYPE number;
DEFINE FIELD purchased_at ON storage_addon TYPE datetime;
DEFINE FIELD expires_at ON storage_addon TYPE option<datetime>;
DEFINE FIELD source ON storage_addon TYPE string;

-- Add assertions for validation
DEFINE FIELD source ON storage_addon ASSERT $value IN ["purchase", "xp_redemption"];

-- Create index for performance
DEFINE INDEX storage_addon_user_idx ON storage_addon FIELDS user;
DEFINE INDEX storage_addon_expires_idx ON storage_addon FIELDS expires_at;
```

### 2. Verify Table Creation

```sql
-- Check table exists
INFO FOR TABLE storage_addon;

-- Test query (should return empty array)
SELECT * FROM storage_addon;
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `user` | `record<user>` | RecordId reference to the user who owns this add-on |
| `bytes` | `number` | Number of bytes added (e.g., 10GB = 10737418240) |
| `purchased_at` | `datetime` | When the add-on was created |
| `expires_at` | `option<datetime>` | When the add-on expires, or NONE for permanent add-ons |
| `source` | `string` | How the add-on was acquired: "purchase" or "xp_redemption" |

## Example Records

### XP Redemption (10GB, never expires)
```sql
CREATE storage_addon CONTENT {
  user: user:abc123,
  bytes: 10737418240,
  purchased_at: time::now(),
  expires_at: NONE,
  source: "xp_redemption"
};
```

### Hypothetical Paid Purchase (50GB, expires in 1 year)
```sql
CREATE storage_addon CONTENT {
  user: user:abc123,
  bytes: 53687091200,
  purchased_at: time::now(),
  expires_at: time::now() + 1y,
  source: "purchase"
};
```

## Query Examples

### Get Total Add-On Storage for a User
```sql
-- Get active (non-expired) add-ons
SELECT 
  math::sum(bytes) AS total_addon_bytes
FROM storage_addon
WHERE user.email = "user@example.com"
  AND (expires_at IS NONE OR expires_at > time::now())
GROUP ALL;
```

### List User's Storage Add-Ons
```sql
SELECT 
  id,
  bytes,
  bytes / 1073741824 AS gigabytes,
  purchased_at,
  expires_at,
  source
FROM storage_addon
WHERE user.email = "user@example.com"
ORDER BY purchased_at DESC;
```

### Find Expiring Add-Ons (for future notifications)
```sql
SELECT 
  user.email,
  bytes / 1073741824 AS gigabytes,
  expires_at
FROM storage_addon
WHERE expires_at IS NOT NONE
  AND expires_at < time::now() + 7d
  AND expires_at > time::now()
ORDER BY expires_at ASC;
```

## Rollback Plan

If you need to remove this feature:

```sql
-- Delete all records
DELETE FROM storage_addon;

-- Remove the table
REMOVE TABLE storage_addon;
```

⚠️ **Warning:** This will permanently delete all storage add-on records!

## Testing Checklist

After migration, test the following:

- [ ] Create a test storage add-on record manually
- [ ] Query storage add-ons for a test user
- [ ] Use `/api/storage/redeem-xp` endpoint (as Premium user)
- [ ] Verify `/api/storage/usage` includes add-on bytes
- [ ] Test storage limit enforcement with and without add-ons
- [ ] Verify expired add-ons are excluded from calculations

## Performance Notes

- **Indexes:** Two indexes created for optimal query performance
  - `user` field: Fast lookups by user
  - `expires_at` field: Fast filtering of active add-ons
- **Query Cost:** Adding storage add-on calculation adds one extra query per storage check
- **Caching:** Consider caching storage limits for 5-10 minutes if performance becomes an issue

## Security Considerations

1. **Plan Validation:** Only Premium users can redeem XP for storage (enforced in API)
2. **XP Balance Check:** Redemption endpoint validates sufficient XP before creating add-on
3. **Idempotency:** XP redemption updates `xp_redeemed` atomically
4. **No Refunds:** Once created, add-ons cannot be reversed (by design)

## Monitoring Queries

### Total Storage Add-Ons by Source
```sql
SELECT 
  source,
  count() AS count,
  math::sum(bytes) / 1073741824 AS total_gb
FROM storage_addon
GROUP BY source;
```

### Most Active Storage Redeemers
```sql
SELECT 
  user.email,
  count() AS redemptions,
  math::sum(bytes) / 1073741824 AS total_gb_redeemed
FROM storage_addon
WHERE source = "xp_redemption"
GROUP BY user
ORDER BY redemptions DESC
LIMIT 20;
```

### Storage Add-On Growth Over Time
```sql
SELECT 
  time::floor(purchased_at, 1d) AS day,
  count() AS new_addons,
  math::sum(bytes) / 1073741824 AS gb_added
FROM storage_addon
WHERE purchased_at > time::now() - 30d
GROUP BY day
ORDER BY day ASC;
```

---

**Migration Status:** ⏳ Pending - Run the SQL commands above in your SurrealDB instance

**Estimated Time:** < 1 minute

**Risk Level:** Low (new table, no changes to existing data)

