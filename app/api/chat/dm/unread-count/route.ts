import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionLite } from "@/lib/chatPerms";

// GET - Count number of unique DM conversations with unread notifications
export async function GET() {
  try {
    const session = await getSessionLite();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getSurreal();
    
    // Count unique DM conversations with unread notifications using GROUP BY
    const result = await db.query<[Array<{ dmKey?: string }>]>(
      `SELECT dmKey FROM notification 
       WHERE recipientEmail = $email 
       AND dmKey IS NOT NONE
       AND read = false
       GROUP BY dmKey;`,
      { email: session.email }
    );

    const groupedResults = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
    
    // Each group represents one unique DM conversation
    const unreadCount = groupedResults.length;

    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error("[dm unread-count GET]", error);
    return NextResponse.json({ error: "Failed to fetch unread count" }, { status: 500 });
  }
}

