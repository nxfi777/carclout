import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionLite, canAccessByRole, type Role } from "@/lib/chatPerms";

type LearnItem = {
  id?: string;
  kind: "tutorial" | "ebook" | "recording";
  slug: string;
  title?: string;
  description?: string;
  thumbKey?: string; // admin/learn/... or admin/hooks/... or admin/... livestreams
  fileKey?: string; // video or pdf key
  minRole?: Role;
  isPublic?: boolean; // for recordings
};

export async function GET() {
  try {
    const session = await getSessionLite();
    const db = await getSurreal();

    // Gather tutorials and ebooks from learn_item table
    const res = await db.query("SELECT * FROM learn_item ORDER BY created_at DESC LIMIT 500;");
    const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
    const items: LearnItem[] = rows
      .filter((r) => {
        const required: Role | undefined = (r?.minRole as Role | undefined) ?? undefined;
        return canAccessByRole(session.role, required);
      })
      .map((r) => ({
        id: (r as { id?: { toString?: () => string } | string })?.id?.toString?.() || (r as { id?: string }).id,
        kind: (r as { kind?: unknown })?.kind === "ebook" ? "ebook" : "tutorial",
        slug: (r as { slug?: string })?.slug as string,
        title: (r as { title?: string })?.title,
        description: (r as { description?: string })?.description,
        thumbKey: (r as { thumbKey?: string })?.thumbKey,
        fileKey: (r as { fileKey?: string })?.fileKey,
        minRole: (r as { minRole?: Role })?.minRole,
      }));

    // Merge in public livestream recordings that are flagged for learn
    try {
      const rec = await db.query("SELECT slug, thumbKey, videoKey, isPublic, minRole FROM livestream_recording ORDER BY created_at DESC LIMIT 200;");
      const recRows = Array.isArray(rec) && Array.isArray(rec[0]) ? (rec[0] as Array<Record<string, unknown>>) : [];
      const recItems: LearnItem[] = recRows
        .filter((r) => !!(r as { isPublic?: unknown })?.isPublic)
        .filter((r) => canAccessByRole(session.role, ((r as { minRole?: Role }).minRole)))
        .map((r) => ({
          kind: "recording",
          slug: (r as { slug?: string; id?: string }).slug || (r as { id?: string }).id || "rec",
          title: (r as { slug?: string }).slug || "Livestream",
          thumbKey: (r as { thumbKey?: string }).thumbKey,
          fileKey: (r as { videoKey?: string }).videoKey,
          minRole: (r as { minRole?: Role }).minRole,
          isPublic: true,
        }));
      items.push(...recItems);
    } catch {}

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

// Admin upsert for tutorials/ebooks
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { kind, slug, title, description, thumbKey, fileKey, minRole } = body || {};
  if (!kind || !slug) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const session = await getSessionLite();
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getSurreal();
  const createdIso = new Date().toISOString();
  const query = `
    UPSERT learn_item CONTENT {
      kind: $kind,
      slug: $slug,
      title: $title,
      description: $description,
      thumbKey: $thumbKey,
      fileKey: $fileKey,
      minRole: $minRole,
      updated_at: d"${createdIso}",
      created_at: d"${createdIso}"
    } RETURN AFTER;
  `;
  const res = await db.query(query, { kind, slug, title, description, thumbKey, fileKey, minRole });
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
  return NextResponse.json({ item: row as unknown });
}


