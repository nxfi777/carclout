import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET(req: Request) {
  const session = await auth();
  const role = session?.user?.role || session?.user?.plan || null;
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(50, parseInt(String(searchParams.get("limit") || "20"))));

  const db = await getSurreal();
  // Ensure analyzers and FTS indexes exist (ignore errors if already defined)
  // Autocomplete-friendly analyzers using edgengram to support prefix matching without '*'
  try { await db.query(`DEFINE ANALYZER IF NOT EXISTS user_search TOKENIZERS blank, class, camel, punct FILTERS lowercase, ascii, edgengram(2,10);`); } catch {}
  try { await db.query(`DEFINE ANALYZER IF NOT EXISTS email_search TOKENIZERS punct, class FILTERS lowercase, ascii, edgengram(2,10);`); } catch {}
  // Overwrite indexes to use the new analyzers
  try { await db.query(`DEFINE INDEX OVERWRITE user_name_ft ON TABLE user FIELDS name SEARCH ANALYZER user_search BM25;`); } catch {}
  try { await db.query(`DEFINE INDEX OVERWRITE user_email_ft ON TABLE user FIELDS email SEARCH ANALYZER email_search BM25;`); } catch {}
  

  let rows: Array<{ name?: string; email?: string; credits_balance?: number }> = [];
  try {
    if (q) {
      const res = await db.query(
        `SELECT name, email, credits_balance FROM user 
         WHERE name @@ $q OR email @@ $q 
         LIMIT $limit;`,
        { q, limit }
      );
      rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; email?: string; credits_balance?: number }>) : []);
    } else {
      const res = await db.query(
        `SELECT name, email, credits_balance FROM user ORDER BY string::lower(name) LIMIT $limit;`,
        { limit }
      );
      rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; email?: string; credits_balance?: number }>) : []);
    }
  } catch {
    rows = [];
  }

  const users = rows.map((r) => ({
    name: r?.name || null,
    email: String(r?.email || ""),
    credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
  }));
  return NextResponse.json({ users });
}


