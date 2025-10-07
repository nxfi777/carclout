/**
 * Server-side Umami tracking
 * For tracking events that happen outside the browser (e.g., webhook events)
 */

const UMAMI_HOST = 'https://umami-production-ddaa.up.railway.app';
const UMAMI_WEBSITE_ID = '0e2c9c29-d47e-438b-a98d-5ae80da99a63';

/**
 * Track event in Umami from server-side
 */
export async function trackEvent(
  eventName: string,
  data?: Record<string, unknown>
) {
  try {
    const response = await fetch(`${UMAMI_HOST}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CarClout-Server/1.0',
      },
      body: JSON.stringify({
        type: 'event',
        payload: {
          website: UMAMI_WEBSITE_ID,
          url: `/email/${eventName}`,
          name: eventName,
          data: data || {},
        },
      }),
    });
    
    if (!response.ok) {
      console.error('Umami tracking failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Failed to send Umami event:', error);
    // Don't throw - tracking failures shouldn't break application flow
  }
}

/**
 * Track page view in Umami from server-side
 */
export async function trackPageView(
  url: string,
  referrer?: string,
  data?: Record<string, unknown>
) {
  try {
    const response = await fetch(`${UMAMI_HOST}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CarClout-Server/1.0',
      },
      body: JSON.stringify({
        type: 'pageview',
        payload: {
          website: UMAMI_WEBSITE_ID,
          url,
          referrer: referrer || '',
          data: data || {},
        },
      }),
    });
    
    if (!response.ok) {
      console.error('Umami tracking failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Failed to send Umami pageview:', error);
  }
}

