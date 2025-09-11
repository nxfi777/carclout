import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const db = await getSurreal();
    const res = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email });
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { id?: unknown } | undefined) : undefined;
    return NextResponse.json({ exists: !!row });
  } catch (e) {
    console.error("/api/auth/exists error", e);
    return NextResponse.json({ exists: false });
  }
}


