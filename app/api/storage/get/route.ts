import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createGetUrl } from "@/lib/r2";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") || "").replace(/^\/+/, "");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  const root = `users/${sanitizeUserId(user.email)}`;
  if (!key.startsWith(root)) return NextResponse.json({ error: "Out of scope" }, { status: 403 });
  const { url } = await createGetUrl(key);
  return NextResponse.json({ url });
}


