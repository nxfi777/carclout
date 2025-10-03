# Drawer Queue System

## Overview

Implemented a centralized drawer queue system to prevent race conditions and ensure only one drawer is visible at a time, with proper priority handling.

## Problem Solved

Previously, multiple drawers could try to open simultaneously:
- Welcome to Pro drawer (checks on dashboard load)
- Daily Bonus drawer (auto-prompts on dashboard load)
- Level Up drawer (triggered by XP events)

This created race conditions where drawers would overlap, creating poor UX.

## Solution

Created a **DrawerQueueProvider** that manages a priority queue for all drawer requests.

### Priority Levels

```typescript
DRAWER_PRIORITY = {
  CRITICAL: 100,  // Welcome messages, first-time experiences
  HIGH: 50,       // Level-up celebrations, achievements
  MEDIUM: 10,     // Daily bonuses, routine prompts
}
```

### How It Works

1. **Request Phase**: When a drawer wants to show, it calls `requestShow(id, priority, show, hide)`
2. **Queue Management**: Requests are queued and sorted by:
   - Priority (highest first)
   - Timestamp (oldest first for same priority)
3. **Sequential Display**: Only one drawer shows at a time
4. **Cleanup**: When a drawer closes, it calls `notifyDismissed(id)` to allow the next in queue

### Implementation Details

#### DrawerQueueProvider (`lib/drawer-queue.tsx`)

```typescript
export function DrawerQueueProvider({ children }: { children: ReactNode })
```

- Maintains a queue of drawer requests
- Tracks which drawer is currently active
- Processes queue automatically when a drawer closes
- 300ms delay between drawers for smooth UX

#### Updated Drawers

All three drawers now use the queue system:

1. **WelcomeToProDrawer** - Priority: CRITICAL (100)
   - Shows first if user upgraded from minimum to pro
   
2. **LevelUpDrawer** - Priority: HIGH (50)
   - Shows when user levels up
   
3. **DailyBonusDrawer** - Priority: MEDIUM (10)
   - Shows for daily login bonuses

### Usage Example

```typescript
import { useDrawerQueue, DRAWER_PRIORITY } from "@/lib/drawer-queue";

function MyDrawer() {
  const [open, setOpen] = useState(false);
  const { requestShow, notifyDismissed } = useDrawerQueue();

  // Request to show
  requestShow(
    "my-drawer-id",
    DRAWER_PRIORITY.HIGH,
    () => setOpen(true),
    () => setOpen(false)
  );

  // Notify when dismissed
  function handleClose() {
    setOpen(false);
    notifyDismissed("my-drawer-id");
  }

  return <Sheet open={open} onOpenChange={(next) => !next && handleClose()} />;
}
```

## Benefits

✅ **No overlapping drawers** - Only one shows at a time  
✅ **Smart prioritization** - Important messages show first  
✅ **No lost notifications** - All requests are queued  
✅ **Smooth transitions** - 300ms delay between drawers  
✅ **Race condition safe** - Centralized state management  
✅ **Extensible** - Easy to add new drawers  

## Testing Scenarios

1. **New Pro user on first dashboard visit**:
   - Welcome to Pro drawer shows first (CRITICAL)
   - After dismissing, Daily Bonus shows (MEDIUM)

2. **User levels up while daily bonus is showing**:
   - Daily bonus continues
   - Level up queued with HIGH priority
   - Shows after daily bonus is dismissed

3. **Multiple events fire simultaneously**:
   - All requests queued
   - Display in priority order
   - No overlaps or lost notifications

## Future Enhancements

- Add animation between drawer transitions
- Track drawer history for analytics
- Add max wait time before forcing show
- Support drawer groups (show multiple related drawers in sequence)

