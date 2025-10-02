# 28-Day Billing Cycle Implementation Guide

## Overview
To implement 28-day billing cycles (instead of monthly) for your subscription plans, you need to update your Stripe Price objects. This change provides +8.3% annual revenue (13.04 billing cycles per year vs 12).

## Why 28-Day Cycles?
- **More billing cycles**: 13.04 cycles/year vs 12 monthly cycles
- **Revenue increase**: Pro plan ($27): $27 × 13.04 = $352.08/year vs $324/year (+$28.08)
- **Customer-friendly**: Consistent, predictable billing
- **Standard practice**: Used by many SaaS companies (Netflix, gym memberships, etc.)

## Implementation Steps

### 1. Create New Price Objects in Stripe Dashboard

You need to create **new** Price objects with 28-day intervals. The existing Price objects cannot be modified.

#### For Minimum Plan ($1):
1. Go to Stripe Dashboard → Products
2. Find your Minimum Plan product
3. Click "Add another price"
4. Set up:
   - **Price**: $1.00 USD
   - **Billing period**: Custom
   - **Interval**: Every **28 days**
   - **Payment type**: Recurring
5. Copy the new Price ID (starts with `price_`)

#### For Pro Plan ($27):
1. Go to Stripe Dashboard → Products
2. Find your Pro Plan product (or create if needed)
3. Click "Add another price"
4. Set up:
   - **Price**: $27.00 USD
   - **Billing period**: Custom
   - **Interval**: Every **28 days**
   - **Payment type**: Recurring
5. Copy the new Price ID (starts with `price_`)

### 2. Update Environment Variables

Update your `.env` file with the new Price IDs:

\`\`\`bash
# Old monthly prices (keep for reference or gradual migration)
# STRIPE_PRICE_MINIMUM_OLD=price_xxxxx
# STRIPE_PRICE_PRO_OLD=price_xxxxx

# New 28-day prices
STRIPE_PRICE_MINIMUM=price_NEW_MINIMUM_28DAY_ID
STRIPE_PRICE_PRO=price_NEW_PRO_28DAY_ID
\`\`\`

### 3. Migration Strategy

You have two options for existing customers:

#### Option A: Immediate Migration (Recommended)
- Update the env vars and restart your app
- New subscribers get 28-day billing immediately
- Existing subscribers continue with their current billing until they cancel/resubscribe
- Naturally migrates over time

#### Option B: Forced Migration
- Use Stripe's subscription update API to migrate existing customers
- More complex, requires careful testing
- Consider customer communication

### 4. Update Customer-Facing Copy

Update any pricing pages or marketing materials to reflect "Billed every 28 days" instead of "monthly":

\`\`\`tsx
// Example: Update plan-selector.tsx or pricing page
<p className="text-sm text-muted-foreground">
  Billed every 28 days for consistent access to your credits
</p>
\`\`\`

### 5. Test the Implementation

Before going live:

1. Use Stripe Test Mode
2. Create test Price objects with 28-day intervals
3. Run a test subscription to verify:
   - Correct billing interval
   - Webhook handling works correctly
   - Credits are granted properly
   - Customer portal shows correct billing cycle

### 6. Monitor & Communicate

After deployment:
- Monitor Stripe dashboard for any issues
- Track billing cycle completion
- Be prepared to answer customer questions about the change
- Consider sending an email to existing customers explaining the change (if migrating)

## Technical Details

### How It Works in Code

The billing cycle is controlled by the **Price object** in Stripe, not by your application code. When you call \`stripe.checkout.sessions.create()\`, you only specify the \`price\` parameter:

\`\`\`typescript
// From app/api/billing/create-checkout/route.ts
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  line_items: [{ price, quantity: 1 }], // Price object contains the interval
  // ... other params
});
\`\`\`

The Price object itself contains:
- Amount ($27)
- Currency (USD)
- Interval (28 days)
- All billing logic

### Webhook Compatibility

Your existing webhooks (\`customer.subscription.updated\`, \`invoice.paid\`, etc.) will work unchanged. The billing interval is transparent to webhook handling.

## Expected Results

### Revenue Impact Per Customer
- **Pro Plan**: $27 × 13.04 = $352.08/year (vs $324 with monthly = +$28.08)
- **Minimum Plan**: $1 × 13.04 = $13.04/year (vs $12 with monthly = +$1.04)

### At Scale (1,000 customers)
- 1,000 Pro customers: +$28,080/year
- Mix of 800 Pro + 200 Minimum: +$22,672/year

## FAQ

**Q: Do I need to change any application code?**
A: No! Just create new Price objects in Stripe Dashboard and update env vars.

**Q: Will existing customers be affected?**
A: Not immediately. They continue with their current billing until they cancel/resubscribe, unless you explicitly migrate them.

**Q: Can customers cancel anytime?**
A: Yes, cancellation logic remains unchanged.

**Q: Is this legal/ethical?**
A: Yes! 28-day billing is standard practice in many industries. Just communicate clearly on your pricing page.

**Q: What about annual subscriptions?**
A: This guide focuses on 28-day recurring. For annual, you'd create separate Price objects with 1-year intervals.

## Summary

✅ Pro plan price increased to $27
✅ Auto-reload credits implemented (opt-in)
📝 28-day billing requires new Stripe Price objects (see steps above)

The code is ready - you just need to create the new Price objects in Stripe Dashboard!

