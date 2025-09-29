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
    "SELECT email, displayName, name, image, presence_status, presence_updated_at, last_seen, role, plan FROM user LIMIT 1000;"
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
  const now = Date.now();
  // Derive effective status with grace window. Self defaults to online unless explicitly idle/dnd/invisible.
  const GRACE_MS = 60_000; // 1 minute to avoid flapping with 60s heartbeat
  const users = rows.map((u) => {
    const updatedAtRaw = (u as { presence_updated_at?: string | null }).presence_updated_at ?? (u as { last_seen?: string | null }).last_seen ?? null;
    const last = Date.parse(typeof updatedAtRaw === "string" ? updatedAtRaw : "");
    const ageMs = isFinite(last) ? now - last : Number.POSITIVE_INFINITY;
    const base: PresenceStatus | undefined = (u as { presence_status?: PresenceStatus }).presence_status as PresenceStatus | undefined;
    const rawStatus: PresenceStatus | "offline" = base ?? "online";
    let derived: PresenceStatus | "offline";
    if (base === "invisible") {
      derived = "invisible";
    } else if ((u as { email?: string })?.email && meEmail && (u as { email?: string }).email === meEmail) {
      // Self: default to online unless explicitly idle/dnd/invisible
      derived = base === "idle" || base === "dnd" ? base : "online";
    } else {
      if (ageMs <= GRACE_MS) {
        derived = base === "idle" || base === "dnd" ? base : "online";
      } else {
        derived = "offline";
      }
    }
    const dn = (u as { displayName?: string })?.displayName;
    const nm = (u as { name?: string })?.name;
    const eff = (typeof dn === 'string' && dn.trim().length > 0) ? dn : nm;
    const updatedAt = typeof updatedAtRaw === 'string' && updatedAtRaw.length ? updatedAtRaw : null;
    return {
      email: (u as { email?: string })?.email,
      name: eff,
      image: (u as { image?: string })?.image,
      status: derived,
      rawStatus,
      updatedAt,
      role: (u as { role?: string })?.role,
      plan: (u as { plan?: string })?.plan,
    };
  });
  return NextResponse.json({ users });
}


