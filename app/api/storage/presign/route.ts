import { NextResponse } from "next/server";
import { createUploadUrl } from "@/lib/r2";
import { getSessionUser, sanitizeUserId } from "@/lib/user";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { filename, contentType, path } = await req.json();
  const cleanUser = sanitizeUserId(user.email || "anon");
  const base = `users/${cleanUser}`;
  const folder = (path || "").replace(/^\/+|\/+$/g, "");
  const keyBase = folder ? `${base}/${folder}` : base;
  const key = `${keyBase}/${Date.now()}-${filename}`;
  const { url } = await createUploadUrl(key, contentType);
  return NextResponse.json({ url, key });
}


