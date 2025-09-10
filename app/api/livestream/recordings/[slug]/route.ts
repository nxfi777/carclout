import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";
import type { Role } from "@/lib/chatPerms";

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const isPublic: boolean | undefined = typeof body?.isPublic === 'boolean' ? body.isPublic : undefined;
  const minRole: Role | undefined = (['admin','staff','user'] as const).includes(body?.minRole) ? body.minRole as Role : undefined;
  if (isPublic === undefined && !minRole) return NextResponse.json({ error: 'No changes' }, { status: 400 });
  const db = await getSurreal();
  const updates: string[] = [];
  const vars: Record<string, unknown> = { slug };
  if (isPublic !== undefined) { updates.push('isPublic = $isPublic'); vars.isPublic = isPublic; }
  if (minRole) { updates.push('minRole = $minRole'); vars.minRole = minRole; }
  const q = `UPDATE livestream_recording SET ${updates.join(', ')} WHERE slug = $slug RETURN AFTER;`;
  const res = await db.query(q, vars);
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : null;
  return NextResponse.json({ recording: row });
}


