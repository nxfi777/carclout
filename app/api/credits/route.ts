import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email || "";
  if (!email) return NextResponse.json({ credits: 0 });
  const db = await getSurreal();
  const r = await db.query("SELECT credits_balance FROM user WHERE email = $email LIMIT 1;", { email });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { credits_balance?: number } | undefined) : undefined;
  const credits = typeof row?.credits_balance === "number" ? row!.credits_balance! : 0;
  return NextResponse.json({ credits });
}


