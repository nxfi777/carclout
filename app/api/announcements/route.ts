import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";
import { RecordId } from "surrealdb";

type AnnouncementDoc = {
  id?: unknown;
  title: string;
  content: string;
  level?: "info" | "update" | "warning";
  published?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
};

function toIdString(id: unknown): string | undefined {
  try {
    if (typeof id === "object" && id !== null && "toString" in (id as object)) {
      const s = (id as { toString(): string }).toString();
      if (typeof s === "string" && s.length > 0) return s;
    }
  } catch {}
  if (typeof id === "string") return id;
  return undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(100, parseInt(String(searchParams.get("limit") || "10")) || 10));
  const includeAll = String(searchParams.get("all") || "").toLowerCase() === "1";

  const user = await getSessionUser();
  const isAdmin: boolean = !!(user && user.role === 'admin');

  const db = await getSurreal();
  let query = "";
  const params: Record<string, unknown> = { limit };
  if (includeAll && isAdmin) {
    query = "SELECT * FROM announcement ORDER BY created_at DESC LIMIT $limit;";
  } else {
    query = "SELECT * FROM announcement WHERE published = true ORDER BY created_at DESC LIMIT $limit;";
  }
  const res = await db.query(query, params);
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as AnnouncementDoc[]) : [];
  const list = rows.map((a) => ({ ...a, id: toIdString(a.id) }));
  return NextResponse.json({ announcements: list });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as Partial<AnnouncementDoc>));
  const title = String(body?.title || "").trim();
  const content = String(body?.content || "").trim();
  const levelRaw = String(body?.level || "info").toLowerCase();
  const level: "info" | "update" | "warning" = (levelRaw === "warning" || levelRaw === "update") ? (levelRaw as "warning" | "update") : "info";
  const published = !!body?.published;
  if (!title || !content) return NextResponse.json({ error: "Missing title or content" }, { status: 400 });

  const createdIso = new Date().toISOString();
  const updatedIso = createdIso;

  const db = await getSurreal();
  const query = `CREATE announcement SET 
    title = $title,
    content = $content,
    level = $level,
    published = $published,
    created_by = $created_by,
    created_at = d"${createdIso}",
    updated_at = d"${updatedIso}";`;
  const res = await db.query(query, {
    title,
    content,
    level,
    published,
    created_by: user.email as string,
  } as Record<string, unknown>);
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as AnnouncementDoc) : (Array.isArray(res) ? (res[0] as AnnouncementDoc) : null);
  return NextResponse.json({ announcement: row ? { ...row, id: toIdString(row.id) } : null });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Partial<AnnouncementDoc> & { id?: string };
  const idRaw = String(body?.id || "").trim();
  if (!idRaw) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const fields: Array<keyof AnnouncementDoc> = ["title", "content", "level", "published"];
  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      sets.push(`${f} = $${f}`);
      params[f] = (body as Record<string, unknown>)[f as keyof typeof body] as unknown;
    }
  }
  const updatedIso = new Date().toISOString();
  sets.push(`updated_at = d"${updatedIso}"`);
  if (!sets.length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  let rid: string | RecordId<string> = idRaw;
  try {
    const parts = String(idRaw).split(":");
    const tb = parts[0];
    const raw = parts.slice(1).join(":");
    rid = new RecordId(tb, raw);
  } catch {}
  params.rid = rid as unknown as Record<string, unknown>;

  const db = await getSurreal();
  const query = `UPDATE $rid SET ${sets.join(", ")};`;
  const res = await db.query(query, params);
  const result = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as AnnouncementDoc) : (Array.isArray(res) ? (res[0] as AnnouncementDoc) : null);
  if (!result) return NextResponse.json({ error: "Not found or not updated" }, { status: 404 });
  return NextResponse.json({ announcement: { ...result, id: toIdString(result.id) } });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = await getSurreal();
  let rid: string | RecordId<string> = id;
  try {
    const parts = String(id).split(":");
    const tb = parts[0];
    const raw = parts.slice(1).join(":");
    rid = new RecordId(tb, raw);
  } catch {}
  await db.query("DELETE $rid;", { rid });
  return NextResponse.json({ ok: true });
}


