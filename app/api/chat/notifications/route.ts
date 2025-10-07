import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionLite } from "@/lib/chatPerms";

type NotificationRow = {
  id?: string;
  recipientEmail: string;
  senderEmail: string;
  senderName: string;
  messageId: string;
  messageText: string;
  channel?: string;
  dmKey?: string;
  type: "mention" | "everyone";
  read: boolean;
  created_at: string;
};

// GET - Fetch unread notifications for current user
// Query params: ?muted=channel1,channel2,dm:user@example.com
export async function GET(request: Request) {
  try {
    const session = await getSessionLite();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mutedParam = searchParams.get("muted") || "";
    const mutedChats = mutedParam ? mutedParam.split(",").filter(Boolean) : [];

    const db = await getSurreal();
    
    // Fetch unread notifications
    const result = await db.query<[NotificationRow[]]>(
      `SELECT * FROM notification 
       WHERE recipientEmail = $email 
       AND read = false
       ORDER BY created_at DESC
       LIMIT 100;`,
      { email: session.email }
    );

    let notifications = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];

    // Filter out notifications from muted channels/DMs
    if (mutedChats.length > 0) {
      const mutedSet = new Set(mutedChats);
      notifications = notifications.filter((notif) => {
        // Check if channel is muted
        if (notif.channel && mutedSet.has(notif.channel)) {
          return false;
        }
        // Check if DM is muted (format: dm:email)
        if (notif.dmKey) {
          const emails = notif.dmKey.split('|');
          const otherEmail = emails.find(e => e.toLowerCase() !== session.email?.toLowerCase());
          if (otherEmail && mutedSet.has(`dm:${otherEmail}`)) {
            return false;
          }
        }
        return true;
      });
    }

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("[notifications GET]", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST - Mark notifications as read
export async function POST(request: Request) {
  try {
    const session = await getSessionLite();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const notificationIds = Array.isArray(body.ids) ? body.ids : [];

    if (notificationIds.length === 0) {
      return NextResponse.json({ error: "No notification IDs provided" }, { status: 400 });
    }

    const db = await getSurreal();

    // Mark notifications as read (only if they belong to the current user)
    for (const id of notificationIds) {
      if (typeof id === "string") {
        await db.query(
          `UPDATE $id SET read = true WHERE recipientEmail = $email;`,
          { id, email: session.email }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications POST]", error);
    return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
  }
}

// DELETE - Mark all notifications as read
export async function DELETE() {
  try {
    const session = await getSessionLite();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getSurreal();

    await db.query(
      `UPDATE notification SET read = true WHERE recipientEmail = $email AND read = false;`,
      { email: session.email }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications DELETE]", error);
    return NextResponse.json({ error: "Failed to mark all notifications as read" }, { status: 500 });
  }
}

