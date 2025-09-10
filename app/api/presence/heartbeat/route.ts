import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const now = new Date().toISOString();
  // Retry on write conflict up to 3 times with small backoff
  let attempts = 0;
  while (true) {
    try {
      await db.query("UPDATE user SET presence_updated_at = $now, last_seen = $now WHERE email = $email;", { now, email: session.user.email });
      break;
    } catch (e) {
      attempts++;
      if (attempts >= 3) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempts));
    }
  }
  return NextResponse.json({ ok: true, at: now });
}


