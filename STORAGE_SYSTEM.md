# Storage Limit System - Implementation & Strategy

## Executive Summary

**Problem:** Storage limits were advertised but not enforced. Users could bypass limits through car cutouts (rembg) and template generation, getting unlimited storage on the base plan.

**Solution:** Strict enforcement of storage limits with strategic upgrade paths based on Hormozi's freemium pricing principles.

**Business Impact:**
- Creates clear friction point for base plan users → drives upgrades
- Enables premium users to purchase storage add-ons (new revenue stream)
- XP redemption for storage creates engagement loop
- Enforces value metric pricing (storage = tangible value)

---

## Storage Tiers

| Plan | Base Storage | Add-Ons Available | XP Redemption |
|------|-------------|-------------------|---------------|
| **Base** | 1GB | ❌ No | ❌ No |
| **Premium** | 100GB | ✅ Yes | ✅ Yes |
| **Ultra** | 1TB | ❌ No | ❌ No |

### Design Rationale (Hormozi Principles)

**Base Plan (1GB):**
- **Freemium Constraint:** "Give away something people use... limit their use so anyone who regularly uses it would need more"
- **Pain Point:** 1GB fills up quickly with car cutouts → forces upgrade decision
- **Conversion Driver:** When storage is full, users must either:
  1. Download and delete files (friction)
  2. Upgrade to Premium (100× more storage!)
  3. Stop using core features (unacceptable)

**Premium Plan (100GB + Add-Ons):**
- **Decoy Pricing:** Base plan's 1GB makes 100GB look like an incredible deal (100× more!)
- **Upsell Path:** Can purchase additional storage when needed
- **XP Engagement:** Can "earn" storage through platform engagement
- **Retention:** Storage accumulation creates switching costs

**Ultra Plan (1TB):**
- **Anchor Pricing:** Makes Premium look reasonable
- **No Add-Ons:** 1TB is generous enough for power users

---

## Enforcement Points

Storage limits are now enforced at ALL save points:

### 1. Manual Uploads
**Endpoint:** `/api/storage/upload`
**Already enforced** ✅

### 2. Car Cutouts (Background Removal)
**Endpoint:** `/api/tools/rembg`
**Fixed:** Now checks storage before saving cutout + mask to `designer_masks/`
```typescript
// Validates BEFORE saving to R2
const validation = await validateStorageSpace(userEmail, incomingSize, effectivePlan);
if (!validation.ok) {
  return NextResponse.json({ error: validation.error }, { status: 413 });
}
```

### 3. Template Generation
**Endpoint:** `/api/templates/generate`
**Fixed:** Now checks storage before saving generated image to `library/`
```typescript
// Validates BEFORE saving to R2
const validation = await validateStorageSpace(user.email, arrayBuffer.byteLength, effectivePlan);
if (!validation.ok) {
  return NextResponse.json({ error: validation.error }, { status: 413 });
}
```

---

## Error Messages (User-Friendly & Strategic)

### Base Plan Users
```
"Storage limit exceeded. Upgrade to Premium for 100× more storage, or download and delete files to free up space."
```
**Strategy:** Direct CTA to upgrade, emphasizing massive value jump (100×)

### Premium Plan Users
```
"Storage limit exceeded. Purchase additional storage or redeem XP for storage upgrades in your Billing settings."
```
**Strategy:** Two upsell paths: paid add-ons OR XP redemption (creates engagement)

### Ultra Plan Users
```
"Storage limit exceeded. Please free up space or contact support."
```
**Strategy:** Rare case (1TB is huge), directs to support for custom solution

---

## XP Redemption for Storage

### Conversion Rate
- **5,000 XP = 10GB storage add-on**
- Must be redeemed in 10GB increments
- **Premium plan ONLY**

### Why This Works (Hormozi Framework)

1. **Engagement Loop:** Users grind XP → redeem for storage → continue using platform → need more storage → repeat
2. **Delayed Gratification:** "Saving up" for storage creates psychological investment
3. **Loss Aversion:** Once redeemed, users don't want to lose their earned storage
4. **Free vs. Paid Balance:** Users can "earn" upgrades OR pay → caters to different user types

### XP Earning Rates (Existing System)
- Daily Login: 20 XP (40 with streak)
- Chat Message: 1 XP (2 with streak) - capped at 100/day
- Showroom Post: 50 XP (100 with streak)
- First Post Bonus: 100 XP (200 with streak)

**Time to Earn 10GB:**
- ~50 days of daily login (100 days without streak)
- ~50-100 showroom posts
- Or combination of activities

---

## Database Schema

### New Table: `storage_addon`
```sql
CREATE TABLE storage_addon (
  user: RecordId<"user">,
  bytes: number,
  purchased_at: datetime,
  expires_at: datetime | NONE,  -- NONE for XP redemptions, date for time-limited purchases
  source: string  -- "purchase" | "xp_redemption"
);

-- Index for performance
DEFINE INDEX storage_addon_user ON storage_addon FIELDS user;
```

### Storage Calculation
```typescript
// Base limit by plan
baseLimit = plan === "ultra" ? 1TB : plan === "premium" ? 100GB : 1GB;

// Add purchased/redeemed storage (Premium only)
if (plan === "premium") {
  addOnBytes = SUM(storage_addon.bytes WHERE user = currentUser AND expires_at IS NONE OR expires_at > NOW());
  totalLimit = baseLimit + addOnBytes;
}
```

---

## API Endpoints

### GET `/api/storage/usage`
**Returns:** Current usage + limit (including add-ons)
**Updated:** Now uses `getStorageLimitBytes()` helper that includes add-ons

```json
{
  "scope": "user",
  "plan": "premium",
  "usedBytes": 50000000000,
  "limitBytes": 120000000000,  // 100GB base + 20GB add-ons
  "remainingBytes": 70000000000,
  "percentUsed": 42
}
```

### POST `/api/storage/redeem-xp`
**Premium only** - Redeem XP for storage

**Request:**
```json
{
  "gigabytes": 10  // Must be multiple of 10
}
```

**Response:**
```json
{
  "ok": true,
  "storageAdded": "10GB",
  "xpSpent": 5000,
  "remainingXp": 12000
}
```

**Errors:**
- 400: Invalid amount (not multiple of 10)
- 400: Insufficient XP
- 403: Not premium plan
- 404: User not found

---

## Shared Storage Validation Helper

**File:** `lib/storage.ts`

### `validateStorageSpace(email, incomingBytes, plan)`
Central validation function used by all save endpoints:
1. Fetches current usage via `getStorageUsageBytes()`
2. Fetches limit (including add-ons) via `getStorageLimitBytes()`
3. Checks if incoming bytes would exceed limit
4. Returns plan-specific error message if exceeded

### `getStorageLimitBytes(email, plan)`
Returns total storage limit including purchased add-ons:
- Base limits: 1GB / 100GB / 1TB
- Queries `storage_addon` table for active add-ons
- Returns `baseLimit + addOnBytes`

### `getStorageUsageBytes(email)`
Returns current storage usage:
- Lists all objects under `users/{sanitizedEmail}/`
- Sums all file sizes
- Returns total bytes

---

## Business Strategy Alignment

### Freemium Conversion Framework
From Hormozi's "Lost Chapters" - Freemium model:

> "Give something away that costs you almost nothing to fulfill, provides continuous value, and limits their use so anyone who regularly uses it would need more."

**Applied:**
- ✅ Costs us little (R2 storage is cheap)
- ✅ Continuous value (users accumulate work)
- ✅ Limited use (1GB fills up fast)
- ✅ Regular users MUST upgrade

### Decoy Pricing
From Hormozi's "Money Models" - Anchor pricing:

> "Present a premium version first. When prospects gasp, offer a cheaper but acceptable alternative. The contrast makes the main offer a way better deal."

**Applied:**
- Base plan (1GB) = Decoy → feels restrictive
- Premium plan (100GB) = Main offer → feels generous by comparison
- Ultra plan (1TB) = Anchor → makes Premium look reasonable

### Value Metric Pricing
From Hormozi's "Pricing" playbook:

> "Pricing should be tied to value created... The perfect value-driven price"

**Applied:**
- Storage is a tangible value metric (more storage = more value)
- Users can see exactly what they're getting
- Clear upgrade path based on actual usage

---

## User Experience Flow

### Base User Hits Limit

1. **User generates car cutout** → Storage check fails
2. **Error shown:** "Storage limit exceeded. Upgrade to Premium for 100× more storage..."
3. **Decision point:**
   - Download cutout immediately (doesn't save to library)
   - Delete old files to free space
   - **Upgrade to Premium** ← Primary goal

### Premium User Hits Limit

1. **User hits 100GB limit** → Storage check fails
2. **Error shown:** "Storage limit exceeded. Purchase additional storage or redeem XP..."
3. **Decision point:**
   - Purchase 10GB add-on (immediate, paid)
   - Redeem 5,000 XP for 10GB (free, creates engagement)
   - Delete old files

### XP Redemption Flow

1. User navigates to `/dashboard/billing`
2. Sees XP redemption interface
3. Selects storage add-on option
4. Redeems 5,000 XP for 10GB
5. Immediately gets 10GB added to limit
6. Toast: "10GB storage added! Keep grinding to earn more."

---

## Success Metrics

Track these metrics to validate strategy:

1. **Base → Premium Conversion Rate**
   - % of base users who hit storage limit
   - % who upgrade within 7/30/90 days after hitting limit
   - Target: >15% conversion within 30 days

2. **Storage Add-On Revenue**
   - MRR from storage add-ons (if implemented as paid feature)
   - Average add-ons per premium user
   - Lifetime value increase from storage upsells

3. **XP Engagement**
   - % of premium users who redeem XP for storage
   - Average days to first storage redemption
   - Correlation between storage redemption and retention

4. **Storage Utilization**
   - Average storage used by plan tier
   - % of users approaching limit
   - Churn rate when hitting storage limits

---

## Implementation Checklist

- [x] Create storage validation helper (`lib/storage.ts`)
- [x] Enforce limits in rembg API (car cutouts)
- [x] Enforce limits in template generation API
- [x] Update storage usage API to include add-ons
- [x] Create XP redemption endpoint for storage
- [x] Add plan-specific error messages
- [ ] Add database schema for `storage_addon` table
- [ ] Update billing page to show storage redemption UI
- [ ] Add storage usage visualization in dashboard
- [ ] Create admin tools to grant storage add-ons
- [ ] Add analytics tracking for storage events
- [ ] Optional: Create paid storage purchase flow (Stripe)

---

## Future Enhancements

### Phase 2: Paid Storage Add-Ons
- Stripe integration for purchasing storage
- Pricing: $5 for 50GB, $10 for 100GB
- One-time purchase vs. monthly subscription options

### Phase 3: Storage Management UI
- Visual breakdown of storage by folder
- One-click delete for old generations
- "Free up space" wizard

### Phase 4: Storage Tiers as Upsells
- "Running low on storage?" proactive notifications
- Automated downsell when storage >80% full
- Special offers for storage upgrades during high-usage periods

---

## Technical Notes

### Why This Approach?

1. **Centralized Validation:** Single source of truth (`validateStorageSpace()`) reduces bugs
2. **Fetch Before Save:** We fetch image bytes BEFORE saving to check size accurately
3. **Plan Resolution:** Always fetch plan from DB (not just session) for accuracy
4. **Premium-Only Add-Ons:** Base users can't buy add-ons → forces upgrade to Premium first
5. **No Expiration on XP Redemptions:** Purchased add-ons never expire (builds trust)

### Performance Considerations

- Storage calculation requires listing ALL user objects → cache aggressively
- Consider adding `total_storage_bytes` field to user table, updated on upload/delete
- Current implementation trades accuracy for simplicity (always live calculation)

### Edge Cases Handled

- What if user deletes files after redemption? → They keep the add-on (no refunds)
- What if user downgrades from Premium to Base? → Loses ability to redeem more, keeps existing add-ons
- What if calculation fails? → Falls back to base limit (safe default)

---

## Conclusion

This storage system transforms a compliance issue (advertised limits) into a **strategic revenue driver** and **engagement mechanism** using proven Hormozi principles:

1. **Freemium friction** → drives upgrades
2. **Decoy pricing** → makes Premium look like a steal
3. **Value metric** → users understand what they're paying for
4. **XP integration** → creates engagement loops
5. **Multiple monetization paths** → paid upgrades OR earned upgrades

The 1GB base limit is now a **feature, not a bug** - it creates the pain point that drives conversion while maintaining a positive user experience through clear messaging and multiple upgrade paths.

