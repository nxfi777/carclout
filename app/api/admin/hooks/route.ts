import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

type HookDoc = {
  id?: string;
  title: string;
  text: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  authorEmail?: string;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = await getSurreal();
  const res = await db.query("SELECT id, title, text, tags, created_at, updated_at, authorEmail FROM hook ORDER BY created_at DESC LIMIT 500;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const hooks = rows.map((r) => ({
    id: r?.id?.id?.toString?.() || r?.id,
    title: r?.title,
    text: r?.text,
    tags: Array.isArray(r?.tags) ? r.tags : [],
    created_at: r?.created_at,
    updated_at: r?.updated_at,
    authorEmail: r?.authorEmail,
  })) as HookDoc[];
  return NextResponse.json({ hooks });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const title: string = (body?.title || "").toString().trim();
  const text: string = (body?.text || "").toString().trim();
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map((t: any) => String(t)).slice(0, 10) : [];
  if (!title || !text) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const db = await getSurreal();
  const created = await db.create("hook", {
    title,
    text,
    tags,
    authorEmail: user.email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ hook: { id: row?.id?.id?.toString?.() || row?.id, title, text, tags, authorEmail: user.email } });
}


