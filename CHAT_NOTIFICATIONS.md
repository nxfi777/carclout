# Chat Notification System

## Overview

The CarClout showroom chat now includes a comprehensive notification system with @mentions, @everyone for admins, and granular mute controls.

## Features

### 1. @Mentions
- **Usage**: Type `@username` to mention a specific user
- **Matching**: Mentions match against:
  - Email prefix (before the @)
  - Display name
  - Partial matches (e.g., `@john` matches `john.doe@example.com`)
- **Highlighting**: Mentions are highlighted in purple/blue in the chat
- **Notifications**: Mentioned users receive a notification (unless the channel/DM is muted)

### 2. @everyone (Admin Only)
- **Usage**: Type `@everyone` to notify all users in a channel
- **Permissions**: Only admins can use @everyone
- **Non-admins**: If a non-admin types @everyone, it won't create notifications
- **Highlighting**: @everyone is highlighted in orange in the chat
- **Notifications**: All users receive a notification (unless they muted the channel)

### 3. Notification Preferences

#### Default Behavior
Users receive notifications for:
- ✅ Direct messages (DMs)
- ✅ @everyone in channels (admin broadcasts)
- ✅ @mentions in channels (when someone mentions them)
- ❌ Regular channel messages (no @mention or @everyone)

#### Muting Channels/DMs
- **How to Mute**: Hover over a channel or DM in the sidebar and click the 🔔 bell icon
- **Effect**: 
  - No browser notifications
  - No in-app toast notifications
  - Notifications for that channel/DM won't appear in the notification bell
- **Unmute**: Click the bell icon again to unmute

### 4. Notification Bell
- Located in the chat header (top right)
- Shows a red badge with unread count (max "9+")
- Click to view all unread mentions
- Each notification shows:
  - Who mentioned you
  - The message preview
  - Which channel/DM
  - Time ago
- Click a notification to navigate to that chat
- Mark individual notifications as read (click or X button)
- Mark all as read (button at top)

## Technical Implementation

### Database Schema
```sql
-- Notification table
DEFINE TABLE notification TYPE ANY SCHEMALESS PERMISSIONS NONE;

-- Fields:
-- - recipientEmail: Who receives the notification
-- - senderEmail: Who sent the message
-- - senderName: Display name of sender
-- - messageId: Reference to the message
-- - messageText: Preview of the message (max 200 chars)
-- - channel: Channel slug (if channel message)
-- - dmKey: DM key (if DM message)
-- - type: "mention" | "everyone"
-- - read: boolean
-- - created_at: ISO timestamp
```

### API Endpoints

#### GET `/api/chat/notifications`
Fetch unread notifications for the current user.

**Query Parameters**:
- `muted` (optional): Comma-separated list of muted channel slugs and DM chat IDs

**Response**:
```json
{
  "notifications": [
    {
      "id": "notification:xyz",
      "senderName": "John Doe",
      "senderEmail": "john@example.com",
      "messageText": "Hey @jane, check this out!",
      "channel": "general",
      "type": "mention",
      "created_at": "2025-10-07T10:30:00.000Z"
    }
  ]
}
```

#### POST `/api/chat/notifications`
Mark specific notifications as read.

**Request Body**:
```json
{
  "ids": ["notification:xyz", "notification:abc"]
}
```

#### DELETE `/api/chat/notifications`
Mark all notifications as read for the current user.

### Message Parsing

The system uses regex to detect mentions:
- Pattern: `@[a-zA-Z0-9._-]+`
- Excludes email addresses (checks for non-word chars before @)
- Case-insensitive matching

### Components

#### `ChatNotifications`
- Located in: `components/chat-notifications.tsx`
- Displays notification bell with badge
- Polls for new notifications every 30 seconds
- Respects muted channels from localStorage

#### `HighlightMentions`
- Located in: `lib/mention-highlighter.tsx`
- Highlights @mentions and @everyone in message text
- Different colors for different mention types:
  - Orange: @everyone
  - Blue: Self-mention
  - Purple: Other mentions

#### `MentionParser`
- Located in: `lib/mention-parser.ts`
- Utility functions for parsing and matching mentions
- Used by backend to create notifications

## User Experience Flow

### Sending a Mention
1. User types `@john` in a message
2. Message is sent to `/api/chat/messages` (or `/api/chat/dm/messages`)
3. Backend parses the message for mentions
4. Backend matches `@john` against user database
5. Backend creates notification records for matched users
6. Message appears in chat with highlighted mention

### Receiving a Mention
1. User receives a notification in the database
2. Notification bell shows unread count
3. If window is unfocused: Desktop notification (if permission granted)
4. If window is focused but different chat: In-app toast
5. If viewing the chat: No notification (already reading)
6. User clicks notification to navigate to the chat
7. Notification is marked as read

### Admin @everyone
1. Admin types `@everyone` in a channel
2. Backend checks if user is admin
3. If admin: Creates notifications for ALL users in the channel
4. If not admin: No notifications created (treated as regular text)
5. All users receive notifications (unless they muted the channel)

## Configuration

### Notification Permissions
- Desktop notifications require browser permission
- Requested automatically on first visit
- User can enable/disable in browser settings

### Mute Settings
- Stored in localStorage as JSON array
- Key: `mutedChats`
- Format: `["channel-slug", "dm:user@example.com"]`
- Synced between tabs
- Persists across sessions

## Performance Considerations

- Notifications are created asynchronously (fire-and-forget)
- Polling interval: 30 seconds (configurable)
- Max notifications fetched: 100
- Message text truncated to 200 chars in notifications
- Lazy loading of notification UI (only renders when popover opens)

## Future Enhancements

Potential improvements:
- [ ] Real-time notification updates via WebSocket/SSE
- [ ] Autocomplete dropdown when typing @
- [ ] Notification sound effects
- [ ] Notification history/archive
- [ ] Per-channel notification preferences
- [ ] Email digest for missed mentions
- [ ] Notification grouping (e.g., "3 new mentions in #general")

