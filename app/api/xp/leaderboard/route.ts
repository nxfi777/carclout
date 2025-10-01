import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionLite } from "@/lib/chatPerms";

export async function GET() {
  const session = await getSessionLite();
  const db = await getSurreal();

  // Get top 50 users by XP with their levels
  const res = await db.query(`
    SELECT 
      email, 
      xp, 
      level,
      name,
      displayName
    FROM user 
    WHERE xp > 0
    ORDER BY xp DESC 
    LIMIT 50;
  `);

  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{
    email?: string;
    xp?: number;
    level?: number;
    name?: string;
    displayName?: string;
  }>) : [];

  const leaderboard = rows.map((row, index) => {
    const displayName = (row.displayName && String(row.displayName).trim()) 
      || (row.name && String(row.name).trim()) 
      || (row.email && !/@/.test(String(row.email)) ? String(row.email) : undefined)
      || "Anonymous";
    
    return {
      rank: index + 1,
      name: displayName,
      email: row.email,
      xp: row.xp || 0,
      level: row.level || 0,
      isMe: session?.email === row.email,
    };
  });

  // Get current user's rank if not in top 50
  let myRank = null;
  if (session?.email) {
    const myEntry = leaderboard.find((entry) => entry.isMe);
    if (!myEntry) {
      // User not in top 50, get their rank
      const myRes = await db.query(
        "SELECT COUNT() AS rank FROM user WHERE xp > (SELECT xp FROM user WHERE email = $email LIMIT 1);",
        { email: session.email }
      );
      const myRow = Array.isArray(myRes) && Array.isArray(myRes[0]) ? (myRes[0][0] as { rank?: number } | undefined) : undefined;
      if (typeof myRow?.rank === "number") {
        myRank = myRow.rank + 1; // +1 because count gives 0-indexed
      }
    }
  }

  return NextResponse.json({ leaderboard, myRank });
}

