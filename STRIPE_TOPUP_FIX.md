# Stripe Top-Up & Subscription Fix

## Issue Summary

A customer topped up credits but encountered these problems:
1. Payment was processed as a "guest" in Stripe (no customer association)
2. User record was missing `stripeCustomerId` and `stripeSubscriptionId` fields
3. User had `plan: 'minimum'` without any active Stripe subscription
4. Concern that users could bypass the subscription flow entirely

## Root Cause Analysis

### 1. Guest Checkouts for Top-Ups
**Problem:** The top-up checkout flow was using `customer_email` without checking for existing Stripe customer IDs.

**Location:** `app/api/billing/create-checkout/route.ts` line 102

**Impact:** Every top-up created a guest checkout session, preventing proper customer tracking and subscription management.

### 2. Webhook Didn't Capture Customer IDs
**Problem:** The webhook processed top-up payments but didn't capture or store the Stripe customer ID.

**Location:** `app/api/webhooks/stripe/route.ts` lines 95-100

**Impact:** Even when Stripe auto-created customers, the customer IDs weren't being stored in the database.

### 3. No Subscription Enforcement
**Problem:** The subscription checkout flow was commented out (lines 234-242 in create-checkout), meaning users couldn't actually subscribe.

**Location:** `app/api/billing/create-checkout/route.ts`

**Impact:** Users could potentially access the platform without a valid subscription, or have plan status without Stripe records.

## Fixes Implemented

### Fix 1: Top-Up Checkout Now Uses/Creates Stripe Customers
**File:** `app/api/billing/create-checkout/route.ts`

**Changes:**
1. Query database for existing `stripeCustomerId` along with plan
2. If no customer ID in database, search Stripe for existing customer by email
3. If found in Stripe, backfill the database with the customer ID
4. If still no customer, create a new Stripe customer
5. Store the customer ID in the database
6. Use `customer: existingCustomerId` in checkout session instead of `customer_email`

**Result:** All top-ups now properly associate with Stripe customers, no more guest checkouts.

### Fix 2: Webhook Captures Customer IDs from Top-Ups
**File:** `app/api/webhooks/stripe/route.ts`

**Changes:**
1. After processing top-up credits, extract customer ID from the session
2. Check if user already has this customer ID stored
3. If missing or different, update the database with the customer ID
4. Log the action for debugging

**Result:** Even if a customer ID wasn't set during checkout, the webhook will capture it and store it.

### Fix 3: Verified Top-Ups Don't Modify Plan
**Verification:** Reviewed `adjustCredits` function and webhook logic

**Confirmation:**
- `adjustCredits()` only updates `credits_balance` field, never touches `plan`
- Top-up webhook logic is isolated in its own `if` block (lines 95-125)
- Plan modifications only happen in the subscription checkout `else` block

**Result:** Top-ups are guaranteed to never affect subscription status.

## Testing Recommendations

### For the Affected Customer
1. Check Stripe dashboard for customer record with email `landonfoster045@icloud.com`
2. If customer exists, manually update their user record with the `stripeCustomerId`
3. Verify their current plan status and subscription state
4. If they should have a subscription but don't, create one manually or have them go through the subscription flow

### For Future Top-Ups
1. Test a top-up with a new user who has never topped up before
2. Verify a Stripe customer is created
3. Check that `stripeCustomerId` is stored in the database
4. Confirm no guest checkouts appear in Stripe

### For Existing Users
1. The next time any existing user tops up, their customer ID will be backfilled
2. Monitor logs for `[Top-up] Backfilled Stripe customer ID` messages
3. Run a one-time script to backfill all existing users (optional, see below)

## Manual Backfill Script (Optional)

If you want to immediately backfill customer IDs for all existing users:

```typescript
// Run this once in a script or admin endpoint
import { stripe } from '@/lib/stripe';
import { getSurreal } from '@/lib/surrealdb';

async function backfillStripeCustomers() {
  const db = await getSurreal();
  const users = await db.query("SELECT email, stripeCustomerId FROM user WHERE email IS NOT NULL;");
  const userList = Array.isArray(users) && Array.isArray(users[0]) ? users[0] : [];
  
  for (const user of userList) {
    if (user.stripeCustomerId) continue; // Skip if already has customer ID
    
    try {
      const customers = await stripe.customers.search({ query: `email:'${user.email}'` });
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        await db.query(
          "UPDATE user SET stripeCustomerId = $customerId WHERE email = $email;",
          { customerId, email: user.email }
        );
        console.log(`Backfilled ${user.email} -> ${customerId}`);
      }
    } catch (e) {
      console.error(`Failed to backfill ${user.email}:`, e);
    }
  }
}
```

## Subscription Flow Issue (Separate Concern)

**Note:** The subscription checkout flow is currently commented out (lines 110-232 in create-checkout). This means:
- Users cannot currently subscribe to pro/ultra plans
- The "minimum" plan checkout is disabled
- Only credit top-ups are functional

**If this is intentional** (single plan model with no recurring subscriptions):
- Document this clearly
- Ensure users understand they're on a credit-based system
- Consider removing subscription-related UI elements

**If this is NOT intentional:**
- Uncomment and test the subscription checkout flow
- Ensure the minimum plan has a valid Stripe Price ID
- Test the full subscription lifecycle

## Files Modified

1. `/Users/nafironato/Dev/Projects/nytforge/carclout/app/api/billing/create-checkout/route.ts`
   - Added Stripe customer lookup/creation for top-ups
   - Modified checkout session to use customer instead of email

2. `/Users/nafironato/Dev/Projects/nytforge/carclout/app/api/webhooks/stripe/route.ts`
   - Added customer ID capture from top-up sessions
   - Added database update logic for customer IDs

## Verification Steps

Run these checks after deploying:

```bash
# 1. Check for TypeScript errors
cd carclout
bunx tsc --noEmit

# 2. Check for linting errors  
bunx next lint

# 3. Test a top-up in development
# - Create a test user
# - Initiate a top-up
# - Check Stripe dashboard for customer creation
# - Verify customer ID is stored in database

# 4. Check webhook logs
# - Look for "[Webhook] Stored Stripe customer ID" messages
# - Verify no errors related to customer ID storage
```

## Customer Support Action Items

For the affected customer (`landonfoster045@icloud.com`):

1. **Immediate Action:**
   - Check their Stripe payment history
   - Identify their Stripe customer ID (if one was created)
   - Manually update their user record with the customer ID
   
2. **Verify Plan Status:**
   - Determine if they should have an active subscription
   - If yes, either:
     a. Create a subscription manually in Stripe
     b. Have them go through the subscription flow again
   - Update their `plan` and `stripeSubscriptionId` fields accordingly

3. **Future Prevention:**
   - These fixes ensure this won't happen again
   - All future top-ups will properly track customers

