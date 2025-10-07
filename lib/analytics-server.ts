/**
 * Server-side analytics tracking
 * Stores events in SurrealDB for later analysis
 */

import { getSurreal } from '@/lib/surrealdb';

export interface AnalyticsEvent {
  event: string;
  timestamp: Date;
  data?: Record<string, unknown>;
  source: 'webhook' | 'server' | 'client';
}

/**
 * Track an analytics event in the database
 */
export async function trackEvent(
  eventName: string,
  data?: Record<string, unknown>,
  source: 'webhook' | 'server' | 'client' = 'server'
) {
  try {
    const db = await getSurreal();
    
    await db.create('analytics_event', {
      event: eventName,
      timestamp: new Date(),
      data: data || {},
      source,
    });
    
    console.log('Analytics event tracked:', eventName);
  } catch (error) {
    console.error('Failed to track analytics event:', error);
    // Don't throw - tracking failures shouldn't break application flow
  }
}

/**
 * Track email engagement events
 */
export async function trackEmailEvent(
  eventType: 'opened' | 'clicked',
  campaignId: string,
  campaignName: string,
  contactId: string,
  linkUrl?: string
) {
  await trackEvent(`email_${eventType}`, {
    campaign_id: campaignId,
    campaign_name: campaignName,
    contact_id: contactId,
    link_url: linkUrl,
  }, 'webhook');
}

/**
 * Get analytics events for a date range
 */
export async function getEvents(
  startDate: Date,
  endDate: Date,
  eventName?: string
) {
  try {
    const db = await getSurreal();
    
    const query = eventName
      ? `SELECT * FROM analytics_event WHERE timestamp >= $start AND timestamp <= $end AND event = $event ORDER BY timestamp DESC LIMIT 1000`
      : `SELECT * FROM analytics_event WHERE timestamp >= $start AND timestamp <= $end ORDER BY timestamp DESC LIMIT 1000`;
    
    const result = await db.query(query, {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      event: eventName,
    });
    
    return result?.[0] as unknown[] || [];
  } catch (error) {
    console.error('Failed to get analytics events:', error);
    return [];
  }
}

/**
 * Get event counts by event name
 */
export async function getEventCounts(startDate: Date, endDate: Date) {
  try {
    const db = await getSurreal();
    
    const result = await db.query(
      `SELECT event, count() as count FROM analytics_event 
       WHERE timestamp >= $start AND timestamp <= $end 
       GROUP BY event 
       ORDER BY count DESC`,
      {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      }
    );
    
    return result?.[0] as unknown[] || [];
  } catch (error) {
    console.error('Failed to get event counts:', error);
    return [];
  }
}

