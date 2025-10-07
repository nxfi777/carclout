import { NextRequest, NextResponse } from 'next/server';
import { getSurreal } from '@/lib/surrealdb';
import { trackEmailEvent } from '@/lib/analytics-server';

export const runtime = 'nodejs';

interface EmailWebhook {
  event: 'email.opened' | 'email.clicked';
  timestamp: string;
  campaign: {
    id: string;
    name?: string;
  };
  recipient: {
    id: string; // Resend contact ID
  };
  data?: {
    url?: string;
  };
}

/**
 * Webhook receiver for Retainly email events
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== process.env.RETAINLY_WEBHOOK_SECRET) {
      console.error('Invalid webhook secret');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const webhook: EmailWebhook = await req.json();
    
    // Process based on event type
    switch (webhook.event) {
      case 'email.opened':
        await handleEmailOpened(webhook);
        break;
      
      case 'email.clicked':
        await handleEmailClicked(webhook);
        break;
      
      default:
        console.warn('Unknown event type:', webhook.event);
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Handle email.opened event
 */
async function handleEmailOpened(webhook: EmailWebhook) {
  const db = await getSurreal();
  
  try {
    // Update user's last email open and engagement score
    // Find user by Resend contact ID
    const result = await db.query(
      `UPDATE user SET 
        lastEmailOpen = d"${webhook.timestamp}",
        emailEngagementScore = emailEngagementScore + 10
      WHERE resendContactId = $contactId
      RETURN AFTER;`,
      {
        contactId: webhook.recipient.id,
      }
    );
    
    const updatedUsers = result?.[0] as unknown[];
    
    if (updatedUsers && Array.isArray(updatedUsers) && updatedUsers.length > 0) {
      // Track in analytics database
      await trackEmailEvent(
        'opened',
        webhook.campaign.id,
        webhook.campaign.name || 'unknown',
        webhook.recipient.id
      );
    } else {
      console.warn('User not found for contact ID:', webhook.recipient.id);
    }
  } catch (error) {
    console.error('Error handling email.opened:', error);
    // Don't throw - webhook should still return success
  }
}

/**
 * Handle email.clicked event
 */
async function handleEmailClicked(webhook: EmailWebhook) {
  const db = await getSurreal();
  
  try {
    // Update user's last email click and engagement score
    const result = await db.query(
      `UPDATE user SET 
        lastEmailClick = d"${webhook.timestamp}",
        emailEngagementScore = emailEngagementScore + 25
      WHERE resendContactId = $contactId
      RETURN AFTER;`,
      {
        contactId: webhook.recipient.id,
      }
    );
    
    const updatedUsers = result?.[0] as unknown[];
    
    if (updatedUsers && Array.isArray(updatedUsers) && updatedUsers.length > 0) {
      // Track in analytics database
      await trackEmailEvent(
        'clicked',
        webhook.campaign.id,
        webhook.campaign.name || 'unknown',
        webhook.recipient.id,
        webhook.data?.url
      );
    } else {
      console.warn('User not found for contact ID:', webhook.recipient.id);
    }
  } catch (error) {
    console.error('Error handling email.clicked:', error);
    // Don't throw - webhook should still return success
  }
}

