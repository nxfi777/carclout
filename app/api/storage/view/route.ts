import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createViewUrl } from "@/lib/r2";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, scope } = await req.json();
  if (typeof key !== 'string') return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  const isAdminScope = scope === 'admin';
  if (isAdminScope && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  const fullKey = key.startsWith(root) ? key : `${root}/${key.replace(/^\/+/, "")}`;
  const { url } = await createViewUrl(fullKey, 60 * 10);
  return NextResponse.json({ url });
}


