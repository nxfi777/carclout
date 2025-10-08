import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { retryOnConflict } from "@/lib/retry";

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status: PresenceStatus = body?.status || "online";
  if (!["online", "idle", "dnd", "invisible"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  
  try {
    await retryOnConflict(async () => {
      const db = await getSurreal();
      const now = new Date().toISOString();
      await db.query(
        "UPDATE user SET presence_status = $status, presence_updated_at = $now WHERE email = $email;",
        { status, now, email: session.user.email }
      );
    }, { context: 'Presence status update' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update presence after retries:", error);
    return NextResponse.json({ error: "Failed to update presence" }, { status: 500 });
  }
}


