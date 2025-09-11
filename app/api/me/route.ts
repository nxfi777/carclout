import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { email, name, image, role, plan, xp } = session.user;
  let dbPlan: string | null = null;
  if (email) {
    try {
      const db = await getSurreal();
      const res = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { plan?: string | null }) : null;
      dbPlan = (row?.plan ?? null) as string | null;
    } catch {}
  }
  const effectivePlan = (dbPlan || plan || null) as string | null;
  return NextResponse.json({ email, name, image, role: role || "user", plan: effectivePlan, xp: xp || 0 });
}


