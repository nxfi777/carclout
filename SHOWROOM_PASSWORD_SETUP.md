# Showroom Password Protection

The showroom chat page is now password-protected and hidden from the dock navigation.

## Environment Variable

Add the following environment variable to your `.env.local` file:

```bash
SHOWROOM_PASSWORD=your_secure_password_here
```

## How It Works

1. The showroom link is removed from the dock navigation (commented out in `components/header-dock.tsx`)
2. Users can still access `/dashboard/showroom` directly via URL
3. When accessing the page, they'll see a password overlay
4. Password verification is handled server-side via server actions (cannot be bypassed by inspect element)
5. Once the correct password is entered, a secure HTTP-only cookie is set for 7 days
6. The cookie is scoped to `/dashboard/showroom` path only

## Files Changed

- `components/header-dock.tsx` - Commented out showroom dock item
- `app/dashboard/showroom/page.tsx` - Wrapped with `ShowroomPasswordGate`
- `app/dashboard/showroom/actions.ts` - Server actions for password verification
- `components/showroom-password-gate.tsx` - Password overlay component

## Security

The implementation is secure because:
- Password verification happens on the server
- Access is stored in an HTTP-only cookie (not accessible via JavaScript)
- Cookie is secure in production
- Cookie is scoped to the specific path
- Users cannot bypass the check by modifying client-side code

