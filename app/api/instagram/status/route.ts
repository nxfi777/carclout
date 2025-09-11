import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFacebookAccessToken, getUserLinkedInstagram, getPageAccessToken, getInstagramBusinessAccountId, getInstagramUser, upsertInstagramAccount } from "@/lib/instagram";

export async function GET() {
  const session = await auth().catch(() => null);
  if (!session?.user?.email) return NextResponse.json({ connected: false }, { status: 200 });
  const userId = String(session.user.id || "");
  try {
    const access = await getUserFacebookAccessToken(userId);
    const linked = await getUserLinkedInstagram(userId);
    return NextResponse.json({ connected: Boolean(access && linked), linked, hasFacebook: Boolean(access) });
  } catch {
    return NextResponse.json({ connected: false, error: "status_error" }, { status: 200 });
  }
}

// POST to link the first available IG business account via selected FB page
export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = String(session.user.id || "");
  const body = await req.json().catch(() => ({}));
  const pageId = String(body.pageId || "");
  if (!pageId) return NextResponse.json({ error: "pageId_required" }, { status: 400 });
  try {
    const userAccess = await getUserFacebookAccessToken(userId);
    if (!userAccess) return NextResponse.json({ error: "fb_not_connected" }, { status: 400 });
    const pageToken = await getPageAccessToken(pageId, userAccess);
    if (!pageToken) return NextResponse.json({ error: "page_token_failed" }, { status: 400 });
    const igId = await getInstagramBusinessAccountId(pageId, pageToken);
    if (!igId) return NextResponse.json({ error: "no_ig_business" }, { status: 400 });
    const ig = await getInstagramUser(igId, pageToken);
    if (!ig) return NextResponse.json({ error: "ig_fetch_failed" }, { status: 400 });
    await upsertInstagramAccount(userId, ig.id, ig.username);
    return NextResponse.json({ linked: ig });
  } catch {
    return NextResponse.json({ error: "link_failed" }, { status: 400 });
  }
}


