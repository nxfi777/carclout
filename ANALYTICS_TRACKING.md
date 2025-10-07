# Analytics Tracking

## Overview

Server-side analytics tracking system for CarClout. Stores events in SurrealDB for reliable tracking of webhook events and server-side actions.

## Why Not Umami for Server Events?

Umami's `/api/send` endpoint is designed for **client-side browser tracking** and expects:
- Browser cookies for session management
- Client IP addresses
- Browser user agents
- DOM context

When calling from server-side:
- All requests appear to come from the same "visitor" (the server)
- Umami's Prisma session creation fails with column length errors
- No proper visitor/session distinction

**Solution**: Use Umami for client-side tracking, store server/webhook events in SurrealDB.

## Setup

### 1. Initialize the Schema

```bash
cd carclout
bun run scripts/init-analytics-schema.ts
```

This creates the `analytics_event` table with proper indexes.

### 2. Events Are Automatically Tracked

The system automatically tracks:
- **Email opens** via `/api/webhooks/email` 
- **Email clicks** via `/api/webhooks/email`
- Any custom events you add

## Usage

### Track Custom Events

```typescript
import { trackEvent } from '@/lib/analytics-server';

// Track a simple event
await trackEvent('user_signup', {
  source: 'landing_page',
  plan: 'free'
});

// Track with detailed data
await trackEvent('product_viewed', {
  product_id: '123',
  category: 'floor_mats',
  referrer: 'email_campaign'
}, 'client');
```

### Track Email Events

```typescript
import { trackEmailEvent } from '@/lib/analytics-server';

await trackEmailEvent(
  'opened',
  'campaign_123',
  'Weekly Newsletter',
  'contact_456'
);

await trackEmailEvent(
  'clicked',
  'campaign_123',
  'Weekly Newsletter',
  'contact_456',
  'https://carclout.com/products'
);
```

## API Endpoints

### GET /api/analytics/events

Get analytics events with filters.

**Authentication**: Requires admin role

**Query Parameters**:
- `startDate` - ISO date string (default: 7 days ago)
- `endDate` - ISO date string (default: now)
- `event` - Filter by event name (optional)
- `summary` - If `true`, returns event counts (optional)

**Examples**:

```bash
# Get all events from last 7 days
curl https://carclout.com/api/analytics/events

# Get email events from specific date range
curl "https://carclout.com/api/analytics/events?startDate=2025-10-01&endDate=2025-10-07&event=email_opened"

# Get event summary counts
curl "https://carclout.com/api/analytics/events?summary=true&startDate=2025-10-01"
```

**Response** (individual events):
```json
{
  "startDate": "2025-09-30T00:00:00.000Z",
  "endDate": "2025-10-07T00:00:00.000Z",
  "eventName": "email_opened",
  "events": [
    {
      "id": "analytics_event:abc123",
      "event": "email_opened",
      "timestamp": "2025-10-06T10:30:00.000Z",
      "data": {
        "campaign_id": "camp_123",
        "campaign_name": "Weekly Newsletter",
        "contact_id": "contact_456"
      },
      "source": "webhook"
    }
  ],
  "count": 1
}
```

**Response** (summary):
```json
{
  "startDate": "2025-09-30T00:00:00.000Z",
  "endDate": "2025-10-07T00:00:00.000Z",
  "counts": [
    {
      "event": "email_opened",
      "count": 45
    },
    {
      "event": "email_clicked",
      "count": 23
    }
  ]
}
```

## Database Schema

```sql
-- Analytics Events Table
DEFINE TABLE analytics_event SCHEMAFULL;
DEFINE FIELD event ON TABLE analytics_event TYPE string;
DEFINE FIELD timestamp ON TABLE analytics_event TYPE datetime;
DEFINE FIELD data ON TABLE analytics_event TYPE option<object>;
DEFINE FIELD source ON TABLE analytics_event TYPE string 
  ASSERT $value IN ['webhook', 'server', 'client'];

-- Indexes
DEFINE INDEX idx_event ON TABLE analytics_event COLUMNS event;
DEFINE INDEX idx_timestamp ON TABLE analytics_event COLUMNS timestamp;
DEFINE INDEX idx_event_timestamp ON TABLE analytics_event COLUMNS event, timestamp;
```

## Event Sources

- `webhook` - Events from external webhooks (email providers, payment processors, etc.)
- `server` - Server-side application events (cron jobs, background tasks, etc.)
- `client` - Client-initiated events tracked server-side (form submissions, etc.)

## Best Practices

1. **Keep event names consistent** - Use snake_case: `email_opened`, `user_signup`
2. **Limit data size** - Store only essential metadata, not large objects
3. **Use specific event names** - `product_cart_added` not just `action`
4. **Include context** - Add campaign_id, source, referrer when relevant

## Future Enhancements

- Dashboard UI for viewing analytics
- Export functionality (CSV, JSON)
- Automated reports
- Event aggregation/rollup for long-term storage
- Integration with data visualization tools

## Client-Side Tracking

For browser-based events, continue using Umami:

```typescript
import { trackEvent } from '@/lib/umami';

// Client-side only
trackEvent('button_click', { button: 'cta_hero' });
```

Umami handles client-side tracking excellently with proper session management, geographic data, device info, etc.

