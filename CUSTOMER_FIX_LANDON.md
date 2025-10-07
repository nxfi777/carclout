# Fix for Customer: landonfoster045@icloud.com

## Current Status
- Email: `landonfoster045@icloud.com`
- Credits Balance: 5500
- Plan: `minimum` ✅ (has plan)
- Stripe Customer ID: ❌ **MISSING**
- Stripe Subscription ID: ❌ **MISSING**
- Issue: Topped up credits as guest, plan not backed by subscription

## Immediate Actions Required

### Step 1: Find Their Stripe Customer ID

Go to Stripe Dashboard and search for payments by this email. Look for:
- Recent payment for credit top-up
- Check if a customer was auto-created
- Get the customer ID (starts with `cus_`)

### Step 2: Update Their Database Record

If you found a Stripe customer ID, update their record:

```sql
-- In SurrealDB
UPDATE user 
SET stripeCustomerId = 'cus_XXXXXXXXXXXXX' 
WHERE email = 'landonfoster045@icloud.com';
```

Replace `cus_XXXXXXXXXXXXX` with the actual customer ID from Stripe.

### Step 3: Determine Subscription Status

**Question:** Should this user have an active subscription?

**Option A: They SHOULD have a subscription**
- They need the $1/month minimum plan subscription
- They may have bypassed the subscription flow
- Action: Create a subscription for them

**Option B: They should NOT have a subscription (Credit-only model)**
- They're just using credits without a recurring subscription
- Current setup is intentional
- Action: Verify this is the business model you want
- Note: Their `plan: 'minimum'` field might be misleading

### Step 4: Create Subscription (If Needed)

If they need a subscription:

1. **In Stripe Dashboard:**
   - Go to their customer record
   - Click "Create subscription"
   - Select the "Minimum Plan" price (should be $1/month)
   - Start the subscription

2. **Update Database:**
   ```sql
   UPDATE user 
   SET 
     stripeCustomerId = 'cus_XXXXXXXXXXXXX',
     stripeSubscriptionId = 'sub_XXXXXXXXXXXXX'
   WHERE email = 'landonfoster045@icloud.com';
   ```

3. **Verify:**
   - Check that webhook receives the subscription event
   - Confirm `plan` is still set to `minimum`
   - Verify they can access the platform

## Prevention (Already Fixed in Code)

The code fixes I implemented will prevent this from happening again:

1. ✅ Top-ups now create/use Stripe customers (no more guest checkouts)
2. ✅ Webhooks capture and store customer IDs
3. ✅ Top-ups never modify the plan field
4. ✅ Customer ID backfill logic in place

## Communication to Customer (Optional)

If you want to reach out to them:

> Hi Landon,
> 
> We noticed a small hiccup with your recent credit top-up. Your credits were added successfully (you have 5,500 credits), but we need to link your account to our billing system properly.
> 
> We've fixed this issue on our end, and your account is all set now. Future top-ups will work seamlessly.
> 
> Thanks for being an early user! Let us know if you have any questions.

## Questions to Answer

1. **Is the $1 subscription required?**
   - If YES: Create subscription for Landon
   - If NO: Consider removing `plan: 'minimum'` or clarifying its meaning

2. **How did they get `plan: 'minimum'` without a subscription?**
   - Possible manual admin action?
   - Database seed/migration?
   - Bug in onboarding flow?

3. **What's the intended user journey?**
   - Sign up → Subscribe → Top up credits?
   - Sign up → Top up credits (no subscription)?
   - Sign up → Free tier → Optional subscription?

## Monitoring

After deploying the fixes, monitor for:
- No more guest checkouts in Stripe for top-ups
- All new top-ups show customer IDs being stored
- Webhook logs showing successful customer ID capture
- Users with `plan` set also have `stripeSubscriptionId` (if subscriptions are required)

