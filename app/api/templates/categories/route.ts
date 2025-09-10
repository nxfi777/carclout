import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  const db = await getSurreal();
  // Fetch only categories field from all templates (bounded)
  const res = await db.query("SELECT categories FROM template LIMIT 1000;");
  const rows: Array<{ categories?: unknown }> = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ categories?: unknown }>) : [];
  const set = new Set<string>();
  for (const r of rows) {
    try {
      const arr = Array.isArray((r as any)?.categories) ? ((r as any).categories as unknown[]) : [];
      for (const v of arr) {
        if (typeof v === "string") set.add(v);
      }
    } catch {}
  }
  const categories = Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ categories });
}


