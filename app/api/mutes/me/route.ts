import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const res = await db.query(
    "SELECT channels, expires_at, created_at FROM mute WHERE targetEmail = $email;",
    { email: user.email }
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const now = Date.now();
  const mutes = rows
    .map((m) => ({
      channels: Array.isArray(m?.channels) ? (m.channels as string[]) : null,
      expires_at: m?.expires_at as string | undefined,
      created_at: m?.created_at as string | undefined,
    }))
    .filter((m) => {
      if (!m?.expires_at) return true;
      const t = Date.parse(m.expires_at);
      return Number.isFinite(t) ? t > now : true;
    });
  return NextResponse.json({ mutes });
}


