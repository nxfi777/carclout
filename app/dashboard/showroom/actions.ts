'use server';

import { cookies } from 'next/headers';

const SHOWROOM_ACCESS_COOKIE = 'showroom_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function verifyShowroomPassword(password: string): Promise<{ success: boolean }> {
  const correctPassword = process.env.SHOWROOM_PASSWORD;
  
  if (!correctPassword) {
    console.error('SHOWROOM_PASSWORD environment variable is not set');
    return { success: false };
  }
  
  if (password === correctPassword) {
    const cookieStore = await cookies();
    // Set a secure cookie to remember access
    cookieStore.set(SHOWROOM_ACCESS_COOKIE, 'granted', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/dashboard/showroom',
    });
    return { success: true };
  }
  
  return { success: false };
}

export async function checkShowroomAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(SHOWROOM_ACCESS_COOKIE);
  return accessCookie?.value === 'granted';
}

