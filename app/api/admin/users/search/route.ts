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
  // Ensure analyzers and FTS indexes exist (only creates if missing)
  // Autocomplete-friendly analyzers using edgengram to support prefix matching without '*'
  // Use blank + camel + punct to keep alphanumeric together (removed 'class' to avoid splitting on letter/number boundaries)
  try { await db.query(`DEFINE ANALYZER IF NOT EXISTS user_search TOKENIZERS blank, camel, punct FILTERS lowercase, ascii, edgengram(2,10);`); } catch {}
  try { await db.query(`DEFINE ANALYZER IF NOT EXISTS email_search TOKENIZERS punct FILTERS lowercase, ascii, edgengram(2,10);`); } catch {}
  // Create indexes if they don't exist
  try { await db.query(`DEFINE INDEX IF NOT EXISTS user_name_ft ON TABLE user FIELDS name SEARCH ANALYZER user_search BM25;`); } catch {}
  try { await db.query(`DEFINE INDEX IF NOT EXISTS user_display_name_ft ON TABLE user FIELDS displayName SEARCH ANALYZER user_search BM25;`); } catch {}
  try { await db.query(`DEFINE INDEX IF NOT EXISTS user_email_ft ON TABLE user FIELDS email SEARCH ANALYZER email_search BM25;`); } catch {}
  

  let rows: Array<{ name?: string; displayName?: string; email?: string; credits_balance?: number; plan?: string | null; role?: string }> = [];
  try {
    if (q) {
      const res = await db.query(
        `SELECT name, displayName, email, credits_balance, plan, role FROM user 
         WHERE displayName @@ $q OR name @@ $q OR email @@ $q 
         LIMIT $limit;`,
        { q, limit }
      );
      rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; displayName?: string; email?: string; credits_balance?: number; plan?: string | null; role?: string }>) : []);
    } else {
      const res = await db.query(
        `SELECT name, displayName, email, credits_balance, plan, role FROM user ORDER BY string::lower(displayName ?? name) LIMIT $limit;`,
        { limit }
      );
      rows = (Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ name?: string; displayName?: string; email?: string; credits_balance?: number; plan?: string | null; role?: string }>) : []);
    }
  } catch {
    rows = [];
  }

  const users = rows.map((r) => ({
    name: r?.name || null,
    displayName: r?.displayName || null,
    email: String(r?.email || ""),
    credits: typeof r?.credits_balance === "number" ? Number(r.credits_balance) : 0,
    plan: r?.plan || null,
    role: r?.role || null,
  }));
  return NextResponse.json({ users });
}


