import { NextRequest, NextResponse } from 'next/server';
import { syncUsersToResend } from '@/lib/email/sync-to-resend';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Sync CarClout users to Resend audience
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // TODO: Add admin check
    // For now, any authenticated user can sync
    
    const { audienceId } = await req.json();
    
    if (!audienceId) {
      return NextResponse.json(
        { error: 'audienceId is required' },
        { status: 400 }
      );
    }
    
    const result = await syncUsersToResend(audienceId);
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

