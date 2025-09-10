import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFacebookAccessToken, scheduleInstagramPost, getUserLinkedInstagram } from "@/lib/instagram";

export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = String((session as any)?.user?.id || "");
  const { imageUrl, videoUrl, caption, scheduledPublishTime } = await req.json().catch(() => ({}));
  if (!imageUrl && !videoUrl) return NextResponse.json({ error: "media_required" }, { status: 400 });
  try {
    const access = await getUserFacebookAccessToken(userId);
    if (!access) return NextResponse.json({ error: "fb_not_connected" }, { status: 400 });
    const ig = await getUserLinkedInstagram(userId);
    if (!ig) return NextResponse.json({ error: "ig_not_linked" }, { status: 400 });
    const result = await scheduleInstagramPost(
      userId,
      {
        igUserId: ig.id,
        imageUrl,
        videoUrl,
        caption,
        scheduledPublishTime: scheduledPublishTime ? Number(scheduledPublishTime) : undefined,
      },
      access
    );
    return NextResponse.json({ ok: true, creationId: result.creationId });
  } catch (_e) {
    return NextResponse.json({ error: "publish_failed" }, { status: 400 });
  }
}


