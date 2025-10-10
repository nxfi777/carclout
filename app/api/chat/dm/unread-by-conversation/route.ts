import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionLite } from "@/lib/chatPerms";

// GET - Get unread notification count per DM conversation
export async function GET() {
  try {
    const session = await getSessionLite();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getSurreal();
    
    // Fetch unread DM notifications
    const result = await db.query<[Array<{ dmKey?: string }>]>(
      `SELECT dmKey FROM notification 
       WHERE recipientEmail = $email 
       AND dmKey IS NOT NONE
       AND read = false;`,
      { email: session.email }
    );

    const notifications = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
    
    // Count unread notifications per dmKey
    const unreadByDmKey: Record<string, number> = {};
    for (const notif of notifications) {
      if (notif.dmKey && typeof notif.dmKey === 'string') {
        unreadByDmKey[notif.dmKey] = (unreadByDmKey[notif.dmKey] || 0) + 1;
      }
    }
    
    // Convert dmKeys to email addresses (dmKey format: "email1|email2")
    const unreadByEmail: Record<string, number> = {};
    for (const [dmKey, count] of Object.entries(unreadByDmKey)) {
      const emails = dmKey.split('|');
      const otherEmail = emails.find(e => e.toLowerCase() !== session.email?.toLowerCase());
      if (otherEmail) {
        unreadByEmail[otherEmail] = count;
      }
    }

    return NextResponse.json({ unreadByEmail });
  } catch (error) {
    console.error("[dm unread-by-conversation GET]", error);
    return NextResponse.json({ error: "Failed to fetch unread counts" }, { status: 500 });
  }
}

