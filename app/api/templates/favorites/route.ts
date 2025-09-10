import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";
import { getUserRecordIdByEmail } from "@/lib/credits";

type Body = {
  templateId?: string;
  templateSlug?: string;
  action?: "toggle" | "favorite" | "unfavorite";
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

async function resolveTemplateRecordId(db: Awaited<ReturnType<typeof getSurreal>>, body: Body): Promise<RecordId<"template"> | null> {
  // Prefer slug, then id
  if (body?.templateSlug) {
    try {
      const res = await db.query("SELECT id FROM template WHERE slug = $slug LIMIT 1;", { slug: body.templateSlug });
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { id?: unknown } | undefined) : undefined;
      const rid = row?.id instanceof RecordId ? (row.id as RecordId<"template">) : (row?.id ? new RecordId("template", String((row as any).id)) : null);
      if (rid) return rid;
    } catch {}
  }
  if (body?.templateId) {
    try {
      const raw = String(body.templateId);
      const parts = raw.split(":");
      const tb = parts[0] || "template";
      const idPart = parts.slice(1).join(":").replace(/^⟨|⟩$/g, "");
      return new RecordId(tb as any, idPart) as RecordId<"template">;
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const body = (await req.json().catch(() => ({}))) as Body;
  const tid = await resolveTemplateRecordId(db, body);
  if (!tid) return NextResponse.json({ error: "Missing or invalid template" }, { status: 400 });

  const uid = await getUserRecordIdByEmail(user.email).catch(() => null);
  if (!uid) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check current state
  let existing: { id?: unknown } | null = null;
  try {
    const res = await db.query("SELECT id FROM template_favorite WHERE user = $uid AND template = $tid LIMIT 1;", { uid, tid });
    existing = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { id?: unknown } | undefined) || null : null;
  } catch {}

  const want:
    | "favorite"
    | "unfavorite" = body?.action === "favorite" || body?.action === "unfavorite"
    ? (body.action as any)
    : (existing ? "unfavorite" : "favorite");

  if (want === "favorite" && !existing) {
    // Create
    try {
      const createdIso = new Date().toISOString();
      await db.query(
        `CREATE template_favorite SET user = $uid, template = $tid, created_at = d"${createdIso}";`,
        { uid, tid } as Record<string, unknown>
      );
    } catch {}
  } else if (want === "unfavorite" && existing) {
    try {
      const ridRaw = toIdString(existing?.id);
      let rid: RecordId<string> | string | undefined = ridRaw;
      try {
        if (ridRaw) {
          const parts = ridRaw.split(":");
          rid = new RecordId(parts[0] as any, parts.slice(1).join(":"));
        }
      } catch {}
      await db.query("DELETE $rid;", { rid } as Record<string, unknown>);
    } catch {}
  }

  // Return current state + count
  let count = 0;
  try {
    const res2 = await db.query("SELECT count() AS n FROM template_favorite WHERE template = $tid;", { tid });
    const row2 = Array.isArray(res2) && Array.isArray(res2[0]) ? (res2[0][0] as { n?: number } | undefined) : undefined;
    count = Number(row2?.n || 0);
  } catch {}
  const favorited = want === "favorite";
  return NextResponse.json({ favorited, count });
}


