# Chat Notification Behavior - Quick Reference

## How Notifications Are Delivered

### ✅ **Current Implementation** (Exactly as requested)

```
┌─────────────────────────────────────────────────────────┐
│  User Receives Mention or DM                            │
└─────────────────────────────────────────────────────────┘
                        ↓
          ┌─────────────────────────┐
          │  Is app window focused? │
          └─────────────────────────┘
                 ↙             ↘
            YES                  NO
             ↓                    ↓
    ┌─────────────────┐    ┌──────────────────────┐
    │ IN-APP TOAST 🔔 │    │ BROWSER NOTIFICATION │
    │ (Sonner toast)  │    │ (Desktop/mobile OS)  │
    └─────────────────┘    └──────────────────────┘
```

### When You Get Notified

**✅ You WILL get notified for:**
- Direct messages (DMs) - always
- @everyone in channels (admin broadcasts)
- @mentions in channels (when someone types @yourname)

**❌ You will NOT get notified for:**
- Regular channel messages (no @mention or @everyone)
- Messages in muted channels/DMs
- Your own messages

### Where Notifications Work

**ALL PAGES** - The notification system is global:
- ✅ Showroom page
- ✅ Templates page
- ✅ Admin page  
- ✅ Home/Dashboard
- ✅ Any other page in the app

**How**: `ChatNotificationListener` is mounted in the root layout, polls every 15 seconds.

### Notification Types

#### 1. In-App Toast (Window Focused)
- Appears in bottom-right corner
- Shows for 5 seconds
- "View" button navigates to the chat
- Uses Sonner toast library
- **Triggers when**: App window is focused (any page)

#### 2. Browser Notification (Window Unfocused)
- Native OS notification (macOS notification center, Windows action center, etc.)
- Requires permission grant
- Click to focus window and navigate to chat
- **Triggers when**: App window is not focused or minimized

#### 3. Notification Bell (Always Available)
- Red badge shows unread count
- Click to view all unread mentions
- Click any notification to navigate to that chat
- Visible in showroom chat header

## Mute Controls

### How to Mute
1. Hover over a channel or DM in the sidebar
2. Click the 🔔 bell icon that appears
3. Icon changes to 🔕 (muted)

### Effect of Muting
- ❌ No in-app toasts
- ❌ No browser notifications
- ❌ No entries in notification bell
- ✅ Messages still appear in chat (just no notifications)

### Where Mute Settings Are Stored
- **Location**: `localStorage` (client-side)
- **Key**: `mutedChats`
- **Format**: JSON array of strings
  - Channels: `["general", "announcements"]`
  - DMs: `["dm:user@example.com"]`
- **Persistence**: Saved across browser sessions

## Admin @everyone Feature

### Usage
```
Admin types in channel:
"@everyone Check out the new template!"
```

### What Happens
1. ✅ Message is sent to channel
2. ✅ @everyone is highlighted in orange
3. ✅ All users get a notification (one per user)
4. ✅ Non-admin users see the message but can't trigger @everyone

### Visual Feedback for Admins
When typing `@everyone`, a hint appears:
```
📢 @everyone will notify all users
```

## Technical Details

### Dual-Layer System

**Layer 1: Real-time EventSource** (Showroom page)
- Connected when viewing showroom
- Instant notifications via WebSocket-like connection
- Shows toast/browser notification immediately

**Layer 2: Global Polling** (All pages)
- Runs every 15 seconds from any page
- Queries `/api/chat/notifications`
- Catches notifications even if EventSource missed them
- Works when browsing templates, admin panel, etc.

**Why Both?**
- EventSource = instant feedback when actively chatting
- Polling = reliable delivery across all pages
- Together = best of both worlds

### Notification Flow

```
Message sent with @mention
        ↓
Backend creates notification record in DB
        ↓
    ┌───────────────────────────────────┐
    │ IF user is on showroom page       │
    │   → EventSource delivers instantly │
    └───────────────────────────────────┘
        ↓
    ┌───────────────────────────────────┐
    │ Global polling (every 15s)        │
    │   → Checks DB for new notifications│
    │   → Shows toast or browser notif  │
    └───────────────────────────────────┘
        ↓
    Notification appears in bell (until marked read)
```

## FAQ

**Q: Will I get notified if I'm on the templates page?**
A: Yes! The global polling system works from any page.

**Q: What if I'm viewing a different channel when someone mentions me?**
A: You'll get an in-app toast with a "View" button to jump to that channel.

**Q: Do I get double notifications?**
A: No, the system deduplicates. Each notification ID is tracked to prevent duplicates.

**Q: Can I disable notifications for specific channels?**
A: Yes, hover over the channel and click the bell icon to mute it.

**Q: What if I close and reopen the browser?**
A: Unread notifications persist in the database and notification bell. Mute settings persist in localStorage.

**Q: Can regular users use @everyone?**
A: They can type it, but it won't create notifications. Only admins can trigger @everyone.

## Examples

### Example 1: Admin Announcement
```
Admin in #announcements:
"@everyone New template drop tonight at 8pm! 🔥"

Result:
- All users receive notification
- Message highlighted in orange
- In-app toast (if focused) or browser notification (if unfocused)
- Notification in bell until marked read
```

### Example 2: User Mention
```
Alice in #general:
"@bob can you help with this design?"

Result:
- Bob receives notification
- @bob highlighted in purple
- In-app toast (if focused) or browser notification (if unfocused)
- Bob can click "View" to jump to #general
```

### Example 3: DM
```
Alice sends DM to Bob:
"Hey, check out my new car photo!"

Result:
- Bob receives notification (always, even without @mention)
- In-app toast (if focused) or browser notification (if unfocused)
- Shows as "Alice (DM)" in notification
```

### Example 4: Muted Channel
```
Alice in #random (Bob has muted this channel):
"@bob are you there?"

Result:
- Bob receives NO notification (channel is muted)
- Message still appears in #random if Bob visits it
- No toast, no browser notification, no bell entry
```

