import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

// Status values similar to Discord
export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export async function GET() {
  const session = await auth().catch(() => null);
  const meEmail = session?.user?.email as string | undefined;
  const db = await getSurreal();
  const res = await db.query(
    "SELECT email, name, image, presence_status, presence_updated_at, last_seen, role, plan FROM user LIMIT 1000;"
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const now = Date.now();
  // Derive effective status with grace window. Self defaults to online unless explicitly idle/dnd/invisible.
  const GRACE_MS = 180_000; // 3 minutes to avoid flapping with 60s heartbeat
  const users = rows.map((u) => {
    const last = Date.parse(u?.presence_updated_at || u?.last_seen || 0);
    const ageMs = isFinite(last) ? now - last : Number.POSITIVE_INFINITY;
    const base: PresenceStatus | undefined = u?.presence_status;
    let derived: PresenceStatus | "offline";
    if (base === "invisible") {
      derived = "invisible";
    } else if (u?.email && meEmail && u.email === meEmail) {
      // Self: default to online unless explicitly idle/dnd/invisible
      derived = base === "idle" || base === "dnd" ? base : "online";
    } else {
      if (ageMs <= GRACE_MS) {
        derived = base === "idle" || base === "dnd" ? base : "online";
      } else {
        derived = "offline";
      }
    }
    return { email: u?.email, name: u?.name, image: u?.image, status: derived, role: u?.role, plan: u?.plan };
  });
  return NextResponse.json({ users });
}


