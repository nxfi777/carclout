import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  try {
    const db = await getSurreal();
    const res = await db.query("SELECT count() as count FROM user GROUP ALL;");
    const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ count?: number }>) : [];
    const count = rows[0]?.count || 0;
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error fetching user count:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
