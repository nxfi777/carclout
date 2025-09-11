import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { getUserFacebookAccessToken } from "@/lib/instagram";
import { RecordId } from "surrealdb";

// This endpoint can be triggered by an external scheduler (e.g., cron) to attempt any pending IG posts
export async function POST() {
  // Optional auth gate: only allow admins
  const session = await auth().catch(() => null);
  const role = session?.user?.role || "user";
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getSurreal();
  // Find due schedules that are not published yet
  const res = await db.query<[
    { id: RecordId<"instagram_schedule"> | string; user: RecordId<"user"> | string; ig_user_id: string; creation_id: string; publish_time: number | null; published_at?: string | null }[]
  ]>(
    `SELECT id, user, ig_user_id, creation_id, publish_time, published_at FROM instagram_schedule WHERE (published_at = NONE OR published_at = NULL) AND publish_time != NONE`
  );
  const rows = res[0] || [];

  let published = 0;
  for (const row of rows) {
    try {
      const due = typeof row.publish_time === 'number' ? row.publish_time : 0;
      const now = Math.floor(Date.now() / 1000);
      if (now < due) continue;
      const userRid = row.user instanceof RecordId ? row.user : new RecordId("user", String(row.user));
      const userId = userRid.toString();
      const access = await getUserFacebookAccessToken(userId);
      if (!access) continue;
      const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(row.ig_user_id)}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: row.creation_id, access_token: access }),
      });
      if (!resp.ok) continue;
      await db.merge(row.id, { published_at: new Date().toISOString() });
      published++;
    } catch {}
  }
  return NextResponse.json({ ok: true, published });
}


