/**
 * Server-side Umami tracking
 * For tracking events that happen outside the browser (e.g., webhook events)
 * 
 * NOTE: Disabled due to Umami session creation issues with server-side tracking.
 * Use /lib/analytics-server.ts instead for server/webhook event tracking.
 */

/**
 * Track event in Umami from server-side
 * Note: Server-side tracking with Umami can be problematic. Consider using client-side tracking
 * or alternative analytics for server events.
 */
export async function trackEvent(
  eventName: string,
  data?: Record<string, unknown>
) {
  // Temporarily disabled due to Umami session creation issues with server-side tracking
  // The /api/send endpoint expects client-side browser context
  console.log('Umami event (not tracked):', eventName, data);
  return;
  
  /* Original implementation - keeping for reference
  try {
    // Truncate and sanitize data to prevent database column overflow
    const sanitizedData: Record<string, string | number> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        const stringValue = String(value);
        // Limit each data value to 100 characters
        sanitizedData[key] = stringValue.length > 100 
          ? stringValue.substring(0, 100) 
          : stringValue;
      }
    }

    // Create unique visitor ID from contact_id or use random
    const visitorId = data?.contact_id ? String(data.contact_id).substring(0, 36) : 
                      Math.random().toString(36).substring(2, 15);

    const response = await fetch(`${UMAMI_HOST}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Mozilla/5.0 (Server; ${visitorId})`,
        'X-Forwarded-For': `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      },
      body: JSON.stringify({
        type: 'event',
        payload: {
          hostname: 'carclout.com',
          language: 'en-US',
          referrer: '',
          screen: '1920x1080',
          title: eventName.substring(0, 50),
          url: `/webhooks/${eventName.substring(0, 30)}`,
          website: UMAMI_WEBSITE_ID,
          name: eventName.substring(0, 50),
          data: sanitizedData,
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Umami tracking failed:', response.status, errorText);
    }
  } catch (error) {
    console.error('Failed to send Umami event:', error);
    // Don't throw - tracking failures shouldn't break application flow
  }
  */
}

/**
 * Track page view in Umami from server-side
 */
export async function trackPageView(
  url: string,
  referrer?: string,
  data?: Record<string, unknown>
) {
  // Temporarily disabled due to Umami session creation issues
  console.log('Umami pageview (not tracked):', url, data);
  return;
}

