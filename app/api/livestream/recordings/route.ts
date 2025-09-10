import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import type { Role } from "@/lib/chatPerms";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slug: string = String(body?.slug || '').trim();
  const videoKey: string = String(body?.videoKey || '').trim();
  const thumbKey: string = String(body?.thumbKey || '').trim();
  const isPublic: boolean = !!body?.isPublic;
  const minRole: Role | undefined = (['admin','staff','user'] as const).includes(body?.minRole) ? body.minRole as Role : undefined;
  const startAt: string | undefined = body?.startAt ? new Date(String(body.startAt)).toISOString() : undefined;
  const endAt: string | undefined = body?.endAt ? new Date(String(body.endAt)).toISOString() : undefined;
  if (!slug || !videoKey || !thumbKey) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const db = await getSurreal();
  const createdIso = new Date().toISOString();
  // Use Surreal datetime casting d"..." for date fields
  const query = `CREATE livestream_recording SET 
    slug = $slug,
    videoKey = $videoKey,
    thumbKey = $thumbKey,
    chatChannel = 'livestream',
    isPublic = $isPublic,
    ${minRole ? 'minRole = $minRole,' : ''}
    createdBy = $createdBy,
    created_at = d"${createdIso}"${startAt ? `,
    start_at = d"${startAt}"` : ''}${endAt ? `,
    end_at = d"${endAt}"` : ''};`;
  const res = await db.query(query, { slug, videoKey, thumbKey, createdBy: user.email, isPublic, minRole });
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : (Array.isArray(res) ? res[0] : res);
  return NextResponse.json({ recording: row });
}

export async function GET() {
  const db = await getSurreal();
  const res = await db.query("SELECT * FROM livestream_recording ORDER BY created_at DESC LIMIT 200;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  return NextResponse.json({ recordings: rows });
}


