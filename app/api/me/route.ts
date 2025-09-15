import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { email, image, role, plan, xp } = session.user;
  let dbPlan: string | null = null;
  let dbDisplayName: string | null = null;
  let dbHandle: string | null = null;
  if (email) {
    try {
      const db = await getSurreal();
      const res = await db.query("SELECT plan, displayName, name FROM user WHERE email = $email LIMIT 1;", { email });
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { plan?: string | null; displayName?: string | null; name?: string | null } | null) : null;
      dbPlan = (row?.plan ?? null) as string | null;
      dbDisplayName = (row?.displayName ?? null) as string | null;
      dbHandle = (row?.name ?? null) as string | null;
    } catch {}
  }
  const effectivePlan = (dbPlan || plan || null) as string | null;
  const effectiveName = (dbDisplayName && dbDisplayName.trim()) || (dbHandle && dbHandle.trim()) || (session.user.name as string | undefined) || email;
  return NextResponse.json({ email, name: effectiveName, image, role: role || "user", plan: effectivePlan, xp: xp || 0 });
}


