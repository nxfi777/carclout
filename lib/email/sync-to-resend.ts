import { getSurreal } from '@/lib/surrealdb';

/**
 * Sync CarClout users to Resend audience via Retainly
 */
export async function syncUsersToResend(audienceId: string) {
  const db = await getSurreal();
  
  // Get all subscribed users who don't have a Resend contact ID yet
  const usersResult = await db.query(
    `SELECT id, email, name, resendContactId 
     FROM user 
     WHERE emailSubscribed = true;`
  );
  
  const users = (usersResult?.[0] || []) as Array<{ email: string; name?: string; id?: string; resendContactId?: string }>;
  
  if (users.length === 0) {
    return {
      total: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
    };
  }
  
  // Prepare contacts for Retainly
  const contacts = users.map((user) => {
    const nameParts = (user.name || '').split(' ');
    return {
      email: user.email,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      carcloutUserId: user.id?.toString(), // For reference
    };
  });
  
  // Send to Retainly to add to Resend
  const retainlyUrl = process.env.RETAINLY_URL || 'http://localhost:3001';
  const retainlyApiKey = process.env.RETAINLY_API_KEY;
  
  const response = await fetch(`${retainlyUrl}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(retainlyApiKey && { 'Authorization': `Bearer ${retainlyApiKey}` }),
    },
    body: JSON.stringify({
      audienceId,
      contacts,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sync contacts: ${response.statusText}`);
  }
  
  const results = await response.json();
  
  // Update CarClout users with their Resend contact IDs
  if (results.results && Array.isArray(results.results)) {
    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      if (result.success && result.data?.id) {
        const user = users[i];
        try {
          await db.query(
            `UPDATE $userId SET resendContactId = $contactId;`,
            {
              userId: user.id,
              contactId: result.data.id,
            }
          );
        } catch (error) {
          console.error('Failed to update user with contact ID:', error);
        }
      }
    }
  }
  
  return {
    total: contacts.length,
    synced: results.successful || 0,
    failed: results.failed || 0,
    skipped: 0,
  };
}

/**
 * Sync single user to Resend
 */
export async function syncUserToResend(userId: string, audienceId: string) {
  const db = await getSurreal();
  
  // Get user
  const userResult = await db.query(
    `SELECT id, email, name, resendContactId 
     FROM user 
     WHERE id = $userId 
     LIMIT 1;`,
    { userId }
  );
  
  type UserData = { id?: string; email: string; name?: string; resendContactId?: string };
  const user = (userResult?.[0] as UserData[])?.[0];
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (user.resendContactId) {
    return {
      success: true,
      message: 'User already synced',
      contactId: user.resendContactId,
    };
  }
  
  const nameParts = (user.name || '').split(' ');
  
  const retainlyUrl = process.env.RETAINLY_URL || 'http://localhost:3001';
  const retainlyApiKey = process.env.RETAINLY_API_KEY;
  
  const response = await fetch(`${retainlyUrl}/api/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(retainlyApiKey && { 'Authorization': `Bearer ${retainlyApiKey}` }),
    },
    body: JSON.stringify({
      audienceId,
      email: user.email,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sync user: ${response.statusText}`);
  }
  
  const contact = await response.json();
  
  // Update user with Resend contact ID
  await db.query(
    `UPDATE $userId SET resendContactId = $contactId;`,
    {
      userId: user.id,
      contactId: contact.id,
    }
  );
  
  return {
    success: true,
    contactId: contact.id,
  };
}

