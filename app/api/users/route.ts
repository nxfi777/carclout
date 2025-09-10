import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  const db = await getSurreal();
  // Only expose minimal public info; more fields can be added as needed
  const res = await db.query("SELECT name, image, email, last_seen FROM user LIMIT 500;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  return NextResponse.json({ users: rows });
}


