# Maintenance Mode

CarClout includes a built-in maintenance page that can be enabled/disabled via an environment variable.

## How to Enable Maintenance Mode

### Option 1: Environment Variable (Recommended for Production)

Add the following to your `.env.local` file:

```bash
MAINTENANCE_MODE=true
```

### Option 2: Temporary (for Development)

Set the environment variable when starting the server:

```bash
MAINTENANCE_MODE=true bun run dev
```

Or for production:

```bash
MAINTENANCE_MODE=true bun run start
```

## How to Disable Maintenance Mode

Remove the environment variable from your `.env.local` file, or set it to `false`:

```bash
MAINTENANCE_MODE=false
```

## Features

- **Elegant Design**: The maintenance page matches the site's deep navy/indigo theme
- **Brand Consistent**: Includes CarClout logo and styling
- **Anticipation Building**: Copy is designed to build excitement rather than frustration
- **Accessible**: Provides contact information for urgent inquiries
- **Automatic Redirect**: All routes automatically redirect to `/maintenance` when enabled
- **Smart Routing**: When disabled, maintenance page redirects back to home

## What Gets Blocked

When maintenance mode is enabled:
- All public pages redirect to `/maintenance`
- All dashboard and protected routes redirect to `/maintenance`
- Auth pages redirect to `/maintenance`

What still works:
- Static assets (images, CSS, JS)
- Next.js internal routes (`/_next/*`)
- The maintenance page itself

## Testing

To test the maintenance page locally:

1. Add `MAINTENANCE_MODE=true` to your `.env.local` file
2. Restart your dev server
3. Visit any page - you should see the maintenance page
4. Remove or set to `false` and restart to disable

## Customization

The maintenance page is located at:
```
carclout/app/maintenance/page.tsx
```

The root layout automatically detects when the maintenance page is being rendered and skips the header/footer components.

You can customize:
- Heading and copy
- Colors and styling
- Contact information
- Additional content or CTAs
