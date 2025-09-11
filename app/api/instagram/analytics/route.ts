import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFacebookAccessToken, getUserLinkedInstagram, getAccountInsights, listRecentMedia } from "@/lib/instagram";

export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = String(session.user.id || "");
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") || "impressions,reach,profile_views,followers_count,website_clicks";
  const period = (url.searchParams.get("period") as "day" | "week" | "days_28" | null) || "day";
  try {
    const access = await getUserFacebookAccessToken(userId);
    if (!access) return NextResponse.json({ error: "fb_not_connected" }, { status: 400 });
    const ig = await getUserLinkedInstagram(userId);
    if (!ig) return NextResponse.json({ error: "ig_not_linked" }, { status: 400 });
    const data = await getAccountInsights(ig.id, access, metric, period);
    const media = await listRecentMedia(ig.id, access, 9).catch(()=>[]);
    return NextResponse.json({ data, media });
  } catch {
    return NextResponse.json({ error: "analytics_failed" }, { status: 400 });
  }
}


