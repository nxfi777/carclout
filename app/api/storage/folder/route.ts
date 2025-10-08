import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { ensureFolder } from "@/lib/r2";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const path = body?.path as string;
  const scope = (body?.scope || 'user') as string;
  const isAdminScope = scope === 'admin';
  if (isAdminScope && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (typeof path !== "string") return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  const clean = path.replace(/^\/+|\/+$/g, "");
  // Disallow creating folders directly under managed roots
  if (!isAdminScope) {
    const parts = clean.split('/').filter(Boolean);
    if (parts[0] === 'vehicles' && parts.length === 1) {
      return NextResponse.json({ error: "Cannot create folders directly in 'vehicles'. Use a specific car folder." }, { status: 400 });
    }
    if (parts[0] === 'designer_masks' && parts.length === 1) {
      return NextResponse.json({ error: "Cannot create folders directly in 'designer_masks'. This is managed automatically." }, { status: 400 });
    }
    if (parts[0] === 'designer_states' && parts.length === 1) {
      return NextResponse.json({ error: "Cannot create folders directly in 'designer_states'. This is managed automatically." }, { status: 400 });
    }
    if (parts[0] === 'chat-uploads' && parts.length === 1) {
      return NextResponse.json({ error: "Cannot create folders directly in 'chat-uploads'. This is managed automatically." }, { status: 400 });
    }
  }
  // Protect admin/templates root from being created outside ensure step
  if (isAdminScope) {
    const normalized = clean.replace(/\/+$/,'');
    if (normalized === 'templates') {
      return NextResponse.json({ error: "Cannot manually create reserved folder 'templates'" }, { status: 400 });
    }
  }
  const key = `${root}/${clean}/`;
  await ensureFolder(key);
  return NextResponse.json({ ok: true, key });
}


