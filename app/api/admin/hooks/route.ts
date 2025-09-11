import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";
import type { Role } from "@/lib/chatPerms";

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
  const role = (user as { role?: Role } | null | undefined)?.role ?? null;
  if (!user?.email || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = await getSurreal();
  const res = await db.query("SELECT id, title, text, tags, created_at, updated_at, authorEmail FROM hook ORDER BY created_at DESC LIMIT 500;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
  const hooks = rows.map((r) => ({
    id: ((): string | undefined => {
      const anyId = (r as { id?: unknown } | undefined)?.id;
      if (anyId && typeof (anyId as { toString?: () => string }).toString === 'function') {
        return (anyId as { toString: () => string }).toString();
      }
      return typeof anyId === 'string' ? anyId : undefined;
    })(),
    title: (r as { title?: string } | undefined)?.title as string,
    text: (r as { text?: string } | undefined)?.text as string,
    tags: Array.isArray((r as { tags?: unknown[] } | undefined)?.tags) ? ((r as { tags: unknown[] }).tags.filter((t)=> typeof t === 'string') as string[]) : [],
    created_at: (r as { created_at?: string } | undefined)?.created_at,
    updated_at: (r as { updated_at?: string } | undefined)?.updated_at,
    authorEmail: (r as { authorEmail?: string } | undefined)?.authorEmail,
  })) as HookDoc[];
  return NextResponse.json({ hooks });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const role = (user as { role?: Role } | null | undefined)?.role ?? null;
  if (!user?.email || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const title: string = (body?.title || "").toString().trim();
  const text: string = (body?.text || "").toString().trim();
  const tags: string[] = Array.isArray(body?.tags) ? (body.tags as unknown[]).map((t) => String(t)).slice(0, 10) : [];
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
  const outId = ((): string | undefined => {
    const anyId = (row as { id?: unknown } | undefined)?.id;
    if (anyId && typeof (anyId as { toString?: () => string }).toString === 'function') {
      return (anyId as { toString: () => string }).toString();
    }
    return typeof anyId === 'string' ? anyId : undefined;
  })();
  return NextResponse.json({ hook: { id: outId, title, text, tags, authorEmail: user.email } });
}


