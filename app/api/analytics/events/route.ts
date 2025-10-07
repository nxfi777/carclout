import { NextRequest, NextResponse } from 'next/server';
import { getEvents, getEventCounts } from '@/lib/analytics-server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/events
 * Get analytics events with optional filters
 * 
 * Query params:
 * - startDate: ISO date string (default: 7 days ago)
 * - endDate: ISO date string (default: now)
 * - event: optional event name filter
 * - summary: if 'true', returns event counts instead of individual events
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication - require admin role
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userRole = (session.user as Record<string, unknown>).role;
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    
    // Parse date range
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();
    
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const eventName = searchParams.get('event') || undefined;
    const summary = searchParams.get('summary') === 'true';
    
    // Get data
    if (summary) {
      const counts = await getEventCounts(startDate, endDate);
      return NextResponse.json({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        counts,
      });
    } else {
      const events = await getEvents(startDate, endDate, eventName);
      return NextResponse.json({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        eventName,
        events,
        count: Array.isArray(events) ? events.length : 0,
      });
    }
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

