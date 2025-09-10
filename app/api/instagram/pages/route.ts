import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFacebookAccessToken, listManagedPages } from "@/lib/instagram";

export async function GET() {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = String((session as any)?.user?.id || "");
  const access = await getUserFacebookAccessToken(userId);
  if (!access) return NextResponse.json({ pages: [] });
  const pages = await listManagedPages(access).catch(() => []);
  return NextResponse.json({ pages });
}


