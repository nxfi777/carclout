# XP Rewards & Gamification System

## Overview

A comprehensive XP-to-credits reward system that encourages daily engagement and community participation through gamification.

## Core Mechanics

### XP Earning

| Activity | Base XP | Notes |
|----------|---------|-------|
| Daily Login | 20 XP | Once per day |
| Chat Message | 1 XP | Per message in showroom (max 100 XP/day = 100 messages) |
| Showroom Post (with image) | 50 XP | Bonus for sharing Ignition edits (50× chat value) |
| **First Showroom Post** | **100 XP** | **One-time milestone bonus** |

### Streak Multiplier 🔥

- **7+ day streak** → **2× XP on all activities**
- Applies to: daily login, chat messages, and showroom posts
- Example: Daily login becomes 40 XP, showroom post becomes 100 XP

### XP to Credits Conversion

- **1,000 XP = 100 credits** (1 free image edit)
- **13,500 XP = 1,350 credits** (1 free video edit)

Users redeem XP for credits on the **Billing page** (`/dashboard/billing`).

## Anti-Spam & Rate Limiting

### Chat Message Protection
- **Daily Limit**: Max 100 XP per day from chat messages (100 messages at 1 XP each)
- **Purpose**: Prevents users from spamming chat for unlimited XP
- **Tracking**: Uses `xp_log` table to track daily chat XP per user
- **User Experience**: Silent rate limit (users can still chat, just don't earn XP after cap)

### XP Activity Logging
All XP gains are logged to `xp_log` table with:
- `user` (RecordId)
- `amount` (XP awarded)
- `reason` (daily-login, chat-message, showroom-post)
- `day` (date key for aggregation)
- `created_at` (timestamp)

## User Journey

### Daily Engagement Flow

1. **User logs into dashboard**
   - Daily Bonus Drawer auto-opens
   - Awards +20 XP (or +40 XP with 7-day streak)
   - Shows level progress

2. **User posts FIRST image in Showroom**
   - Special "First Post Bonus!" toast with 🎉
   - Receives +100 XP (or +200 XP with 7-day streak)
   - Welcome message celebration

3. **User posts subsequent images**
   - Sends message with attachment
   - Receives +50 XP (or +100 XP with 7-day streak)
   - Animated toast appears: "+50 XP - Ignition edit posted to Showroom"
   - If 7-day streak active, additional toast: "🔥 2× XP Active!"

4. **User levels up**
   - Level-Up Drawer auto-opens
   - Shows new level badge
   - Displays available XP redemption
   - Button to navigate to Billing page

5. **User checks leaderboard**
   - Navigates to "XP Leaderboard" channel in Showroom
   - Sees top 50 XP earners
   - Own rank highlighted if in top 50
   - Shows rank below if outside top 50

6. **User redeems XP**
   - Goes to `/dashboard/billing`
   - Sees total XP, available XP, redeemed XP
   - Enters amount of credits to redeem
   - Credits added instantly to balance

## Implementation Details

### API Endpoints

#### `GET /api/xp`
Returns current XP and level info:
```json
{
  "xp": 2500,
  "level": 5,
  "nextLevelXp": 3000,
  "remaining": 500,
  "xpIntoLevel": 500,
  "levelSpan": 1000
}
```

#### `POST /api/xp`
Awards XP for activities:
```json
{
  "reason": "daily-login" | "chat-message" | "showroom-post"
}
```

Returns:
```json
{
  "xp": 2550,
  "level": 5,
  "oldLevel": 5,
  "leveledUp": false,
  "added": 50,
  "streakMultiplier": 2,
  "currentStreak": 7,
  "hitChatLimit": false,
  "isFirstPost": false
}
```

#### `GET /api/xp/redeem`
Get XP redemption info:
```json
{
  "totalXp": 2500,
  "redeemedXp": 1000,
  "availableXp": 1500,
  "availableCredits": 150,
  "conversionRate": 10
}
```

#### `POST /api/xp/redeem`
Redeem XP for credits:
```json
{
  "amount": 100  // credits to redeem
}
```

#### `GET /api/xp/leaderboard`
Get top 50 XP earners:
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "xp": 15000,
      "level": 12,
      "isMe": false
    }
  ],
  "myRank": null  // Only set if user is outside top 50
}
```

### Components

#### `<LevelUpDrawer />`
- Listens for `level-up` custom event
- Shows celebration UI with new level
- Displays available XP rewards
- CTA button to Billing page

#### `<DailyBonusDrawer />`
- Existing component, enhanced with level-up detection
- Triggers level-up drawer after daily bonus claim

#### XP Toast Functions
Located in `lib/xp-toast.tsx`:
- `showXpBonusToast(amount, reason, multiplier)` - Animated XP gain toast
- `showStreakMultiplierToast(streak)` - 🔥 streak multiplier notification
- `showFirstPostToast(amount)` - 🎉 Special first post celebration

#### `<XpLeaderboard />`
- Real-time leaderboard of top 50 XP earners
- Renders in Showroom when "XP Leaderboard" channel is selected
- Highlights current user's rank
- Shows rank outside top 50 if applicable
- Auto-refreshes on XP changes

### Database Schema

#### User table additions:
```sql
xp: number              -- Total XP earned
level: number           -- Current level (derived from XP)
xp_redeemed: number     -- XP spent on credit redemption
lastLoginAt: string     -- For daily bonus check
```

#### New table: xp_log
```sql
CREATE TABLE xp_log (
  user: RecordId<"user">,
  amount: number,
  reason: string,
  day: string,           -- YYYY-MM-DD format
  created_at: datetime
);
```

Purpose: Track all XP activity for rate limiting and anti-spam

## Leveling Curve

Quadratic progression: `xp_required = (level * (level + 1) * 100) / 2`

| Level | Total XP Required | XP for This Level |
|-------|-------------------|-------------------|
| 1     | 100               | 100               |
| 2     | 300               | 200               |
| 3     | 600               | 300               |
| 4     | 1,000             | 400               |
| 5     | 1,500             | 500               |
| 10    | 5,500             | 1,000             |
| 20    | 21,000            | 2,000             |

## Psychology & Retention

### Quick Wins
- First 1,000 XP achievable in ~5-7 days of engagement
- Immediate feedback via toasts
- Visible progress bars

### Long-term Engagement
- Streak multiplier incentivizes daily logins
- Showroom post bonus encourages community participation
- Level-up celebrations provide dopamine hits

### Redemption Strategy
- XP redemption is **manual** (requires Billing page visit)
- Creates anticipation and ownership
- Users "save up" for bigger rewards
- Reinforces value of earned credits

## Events

Custom events for reactivity:

- `xp-refresh` - Refetch XP data
- `level-up` - Trigger level-up drawer `{ detail: { level: number } }`
- `credits-refresh` - Update credits display
- `streak-refresh` - Update streak UI

## Framing for Users

**Marketing messaging:**
- "Earn XP daily by logging in, chatting, and sharing your Ignitions"
- "Every 1,000 XP = 1 free edit"
- "Hit a 7-day streak for 2× XP rewards"
- "Grind levels, unlock badges, and get rewarded with credits"

## Future Enhancements

Potential additions:
- [ ] Weekly XP leaderboards
- [ ] Special badges for milestones (Level 10, 100 posts, etc.)
- [ ] XP events (2× XP weekends)
- [ ] Referral XP bonuses
- [ ] Profile showcase of level/badges
- [ ] XP history/analytics dashboard

## Testing Checklist

### Core XP Mechanics
- [ ] Daily login awards 20 XP (first login of the day)
- [ ] Daily login with 7-day streak awards 40 XP
- [ ] Chat message awards 1 XP
- [ ] Chat message with 7-day streak awards 2 XP
- [ ] Chat XP stops at 100 XP daily limit (after 100 messages)
- [ ] First showroom post awards 100 XP with special toast
- [ ] Subsequent showroom posts award 50 XP
- [ ] Showroom post with 7-day streak awards 100 XP (or 200 XP for first)

### UI & UX
- [ ] Level-up drawer appears when reaching new level
- [ ] First post toast shows 🎉 celebration
- [ ] Regular post toast shows for subsequent posts
- [ ] Streak multiplier toast shows for 7+ day streaks
- [ ] Leaderboard channel appears in Showroom
- [ ] Leaderboard shows top 50 users
- [ ] Current user is highlighted on leaderboard
- [ ] Rank shown if user is outside top 50

### Redemption
- [ ] XP redemption works correctly on Billing page
- [ ] Credits balance updates after redemption
- [ ] XP redeemed counter updates correctly
- [ ] Can't redeem more than available XP

### Anti-Spam
- [ ] Chat XP stops awarding after 100 XP in a day
- [ ] XP log tracks all activity correctly
- [ ] Leaderboard channel is read-only for non-admins

