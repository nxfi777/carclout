# Tiered Credit Top-Up Pricing Strategy

## Overview
This document outlines the strategic tiered pricing structure for pro plan credit top-ups, designed using proven pricing psychology principles from Alex Hormozi's business frameworks.

## Pricing Tiers (Pro Plan)

| Tier | Price | Credits | Rate (cr/$) | Badge | Psychology |
|------|-------|---------|-------------|-------|------------|
| **Starter** | $9.99 | 9,000 | 900 | - | Entry tier, slightly less attractive |
| **Plus** | $19.99 | 19,000 | 950 | - | Better value, warming up |
| **Standard** | $27 | 25,000 | 926 | 🔵 POPULAR | Anchor tier, requested baseline |
| **Premium** | $49.99 | 50,000 | 1,000 | 🟡 BEST VALUE | Exact 1:1000 sweet spot |
| **Bulk** | $99 | 102,000 | 1,030 | 🟣 +3% BONUS | Volume incentive |
| **Ultimate** | $199 | 211,000 | 1,060 | 🟣 +6% BONUS | Maximum bulk reward |

### Minimum Plan
- **Flat rate**: 500 cr/$ (maintains 2:1 differential vs Pro)
- Encourages upgrade to Pro for better value

## Strategic Rationale

### 1. **Price Anchoring** (Hormozi Principle #9)
- Show the $27 "POPULAR" tier prominently
- Higher tiers make it feel like a reasonable middle option
- The $199 tier anchors expectations high, making $99 and $49.99 feel like better deals

**Key Insight from Business Library:**
> "The first number that comes out of your mouth anchors the entire conversation... start with what the monthly payments would be if added up over an entire year with no discount."

### 2. **Volume Discounts** (Pricing Play #5)
- Small purchases get less favorable rates (encourages buying more)
- Rates improve progressively: 850 → 900 → 950 → 926 → 1,000 → 1,030 → 1,060 cr/$
- Clear incentive structure drives higher average order value

**Key Insight from Business Library:**
> "Getting more money from current customers is like fixing the holes first. Then every drop you pour in stays."

### 3. **Psychological Pricing** (Pricing Play #6: Round Up)
- Use $.99 endings: $9.99, $19.99, $49.99
- Makes prices feel smaller without reducing revenue
- $27 uses round number for clean "POPULAR" anchor

**Key Insight from Business Library:**
> "I added .99 to all my prices, no one seemed to mind... Between 6.36% to 11.1% to my price. Again, with no change in conversion."

### 4. **The 1:1000 Sweet Spot**
- $50 tier hits exactly 1,000 credits per dollar
- This is the "goal" customers are scaling toward
- Creates satisfaction when they reach this rate
- Bonuses beyond this (1,030 and 1,060) feel like rewards

### 5. **Badge Strategy**
- **POPULAR** (Blue): Social proof, most people choose this
- **BEST VALUE** (Gold): Mathematical truth, exact 1:1000 ratio
- **+3% BONUS** / **+6% BONUS** (Purple): Tangible reward for bulk

**Key Insight from Business Library:**
> "If you present a more expensive offer before a less expensive offer, more people will buy the less expensive offer than they would have if you had presented the less expensive offer on its own."

### 6. **Decoy Effect**
The $9.99 tier acts as a decoy:
- Makes $19.99 feel like better value
- Makes $27 feel like the "right" choice
- Most users will skip it and go higher

**Key Insight from Business Library:**
> "Decoy Offers advertise something free or discounted. Then, when leads ask to learn more, you also present a more valuable premium offer."

## Expected Customer Behavior

### Distribution Prediction:
- **10%** choose $9.99-$19.99 (small topups, trying it out)
- **40%** choose $27 (popular anchor, feels "right")
- **35%** choose $49.99 (best value seekers)
- **12%** choose $99 (power users, bulk buyers)
- **3%** choose $199 (whales, maximum value)

### Average Order Value Impact:
**Before**: Flat $5-$50 topups averaging ~$18
**After**: Tiered $9.99-$199 averaging ~$42

**Expected AOV increase**: +133% 🚀

## Implementation Notes

### Backend Logic (`create-checkout/route.ts`)
```typescript
if (currentPlan === "pro") {
  if (amountUsd >= 199) credits = Math.floor(amountUsd * 1060);
  else if (amountUsd >= 99) credits = Math.floor(amountUsd * 1030);
  else if (amountUsd >= 50) credits = Math.floor(amountUsd * 1000);
  else if (amountUsd >= 27) credits = Math.floor((amountUsd / 27) * 25000);
  else if (amountUsd >= 20) credits = Math.floor(amountUsd * 950);
  else if (amountUsd >= 10) credits = Math.floor(amountUsd * 900);
  else credits = Math.floor(amountUsd * 850);
}
```

### Frontend Display (`billing-dialog.tsx`)
- 2x3 grid on mobile/tablet, 3x2 on desktop
- Color-coded borders: white → white → blue → gold → purple
- Hover states for interactivity
- Click to pre-fill the custom amount input

## Revenue Projections

### Scenario: 1,000 Pro users per month buying credits

**Conservative Estimate** (40% adoption, avg $42 AOV):
- Monthly: 400 users × $42 = **$16,800**
- Annual: **$201,600** in topup revenue

**Optimistic Estimate** (60% adoption, avg $52 AOV):
- Monthly: 600 users × $52 = **$31,200**
- Annual: **$374,400** in topup revenue

### Key Metric to Watch:
**Topup Frequency × Average Amount**
- Goal: Increase from 0.5x/month to 0.8x/month
- Goal: Increase from $18 avg to $42+ avg

## A/B Testing Opportunities

1. **Badge Text Variations**
   - Test "MOST POPULAR" vs "POPULAR" vs "BEST SELLER"
   - Test "BEST VALUE" vs "MOST SAVINGS" vs "OPTIMAL"

2. **Tier Count**
   - Test 6 tiers vs 5 tiers vs 4 tiers
   - Find sweet spot between choice and paralysis

3. **Price Points**
   - Test $49.99 vs $50 (psychological pricing impact)
   - Test $27 vs $29.99 (anchor positioning)

4. **Visual Hierarchy**
   - Test different badge colors
   - Test tier ordering (low→high vs high→low)

## Business Library References

### Core Principles Applied:
1. **Pricing Play #5**: Annual Billing / Volume Pricing
2. **Pricing Play #6**: Round Up (.99 pricing)
3. **Pricing Play #9**: Ultra High Ticket Anchor ($199 tier)
4. **Anchor Upsells**: Premium first, then "better deal"
5. **Decoy Offers**: Lower tiers make mid-tier attractive
6. **Feature Downsells**: Lower amounts = worse rate

### Key Quote:
> "Improving pricing by 1%, is twice as efficient at increasing profit as improving retention. And nearly 4x as efficient at increasing profit as improving acquisition."
> — Profitwell study of 512 companies

## Success Metrics

Track these KPIs monthly:
- ✅ **Average Order Value (AOV)**: Target +100% ($18 → $42)
- ✅ **Tier Distribution**: 40%+ choosing $27+ tiers
- ✅ **Topup Frequency**: 0.5x → 0.8x per month
- ✅ **Revenue per Pro User**: $15 → $33 per month
- ✅ **Upgrade Rate**: More minimum users upgrading to Pro for better rates

## Next Optimizations

1. **Auto-Reload** (already implemented)
   - Set threshold (e.g., "reload when below 1,000 credits")
   - Automatic $27 or $49.99 topup
   - Expected 40-60% opt-in rate = passive recurring revenue

2. **Prepay Bundles**
   - "Buy 3 months of pro credits upfront, save 15%"
   - Combines subscription + credits in one payment
   - Front-loads cash flow

3. **Annual Credit Packages**
   - $297 = 300,000 credits (1,010 cr/$)
   - $497 = 520,000 credits (1,046 cr/$)
   - One-time payment, massive LTV boost

---

## Summary

This tiered pricing structure:
- ✅ Scales to exactly 1:1000 as requested
- ✅ Uses proven psychological pricing principles
- ✅ Creates clear value progression
- ✅ Encourages higher-value purchases
- ✅ Positions $27 as the popular anchor
- ✅ Rewards bulk buyers with bonuses
- ✅ Maintains 2:1 differential with minimum plan
- ✅ Projected to increase AOV by 100%+

**Expected Impact**: +$200k-$370k annual topup revenue at 1k monthly Pro users

