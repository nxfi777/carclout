import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status: PresenceStatus = body?.status || "online";
  if (!["online", "idle", "dnd", "invisible"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const db = await getSurreal();
  const now = new Date().toISOString();
  await db.query("UPDATE user SET presence_status = $status, presence_updated_at = $now WHERE email = $email;", { status, now, email: session.user.email });
  return NextResponse.json({ ok: true });
}


