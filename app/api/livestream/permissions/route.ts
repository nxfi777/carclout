import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ isCohost: false });
  if (user.role === 'admin') return NextResponse.json({ isCohost: true });
  const db = await getSurreal();
  try {
    const res = await db.query("SELECT * FROM cohost WHERE userEmail = $email LIMIT 1;", { email: user.email });
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
    return NextResponse.json({ isCohost: !!row });
  } catch {
    return NextResponse.json({ isCohost: false });
  }
}


