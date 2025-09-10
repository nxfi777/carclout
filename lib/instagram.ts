import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

type SurrealQueryResult<T> = T[];

export interface FacebookAccount {
  id: string;
  name: string;
}

export interface LinkedInstagramAccount {
  id: string; // ig user id (numeric string)
  username: string;
}

export interface InstagramPublishRequest {
  igUserId: string;
  imageUrl?: string;
  videoUrl?: string;
  isCarousel?: boolean;
  caption?: string;
  scheduledPublishTime?: number; // unix timestamp seconds
}

export interface InstagramInsight {
  name: string;
  period: string;
  values: Array<{ value: number; end_time?: string }>;
}

const FB_GRAPH = "https://graph.facebook.com/v21.0";

export async function getUserFacebookAccessToken(userId: string): Promise<string | null> {
  const db = await getSurreal();
  const res = await db.query<SurrealQueryResult<{ access_token?: string }>>(
    `SELECT access_token FROM account WHERE userId = $userId AND provider = 'facebook' LIMIT 1`,
    { userId: new RecordId("user", userId) }
  );
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { access_token?: string } | undefined) : undefined;
  return row?.access_token || null;
}

export async function getUserLinkedInstagram(dbUserId: string): Promise<LinkedInstagramAccount | null> {
  const db = await getSurreal();
  const res = await db.query<SurrealQueryResult<{ id?: unknown; ig_user_id: string; username: string }>>(
    `SELECT id, ig_user_id, username FROM instagram_account WHERE user = $user LIMIT 1`,
    { user: new RecordId("user", dbUserId) }
  );
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { ig_user_id: string; username: string } | undefined) : undefined;
  if (!row) return null;
  return { id: row.ig_user_id, username: row.username };
}

export async function upsertInstagramAccount(dbUserId: string, igUserId: string, username: string) {
  const db = await getSurreal();
  await db.query(
    `LET $u = $user; IF $exists = (SELECT * FROM instagram_account WHERE user = $u LIMIT 1) THEN
       UPDATE (SELECT id FROM instagram_account WHERE user = $u LIMIT 1)[0].id SET ig_user_id = $ig, username = $username
     ELSE CREATE instagram_account SET user = $u, ig_user_id = $ig, username = $username END;`,
    { user: new RecordId("user", dbUserId), ig: igUserId, username }
  );
}

export async function listManagedPages(userAccessToken: string): Promise<FacebookAccount[]> {
  const res = await fetch(`${FB_GRAPH}/me/accounts?fields=id,name&access_token=${encodeURIComponent(userAccessToken)}`);
  if (!res.ok) throw new Error(`pages_error_${res.status}`);
  const data = await res.json();
  type Page = { id: string; name: string };
  const arr: unknown = data?.data;
  const pages: Page[] = Array.isArray(arr)
    ? (arr.filter((p: unknown): p is Page => {
        if (!p || typeof p !== 'object') return false;
        const obj = p as { id?: unknown; name?: unknown };
        return typeof obj.id === 'string' && typeof obj.name === 'string';
      }))
    : [];
  return pages.map((p) => ({ id: p.id, name: p.name }));
}

export async function getInstagramBusinessAccountId(pageId: string, pageAccessToken: string): Promise<string | null> {
  const res = await fetch(
    `${FB_GRAPH}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.instagram_business_account?.id || null;
}

export async function getPageAccessToken(pageId: string, userAccessToken: string): Promise<string | null> {
  const res = await fetch(
    `${FB_GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userAccessToken)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.access_token || null;
}

export async function getInstagramUser(igUserId: string, pageAccessToken: string): Promise<LinkedInstagramAccount | null> {
  const res = await fetch(
    `${FB_GRAPH}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return { id: data.id, username: data.username };
}

export async function scheduleInstagramPost(
  dbUserId: string,
  req: InstagramPublishRequest,
  accessToken: string
) {
  const { igUserId, imageUrl, videoUrl, caption, scheduledPublishTime } = req;

  const body = new URLSearchParams();
  if (imageUrl) body.set("image_url", imageUrl);
  if (videoUrl) body.set("video_url", videoUrl);
  if (caption) body.set("caption", caption);
  if (scheduledPublishTime) body.set("scheduled_publish_time", String(scheduledPublishTime));
  body.set("access_token", accessToken);

  const createRes = await fetch(`${FB_GRAPH}/${igUserId}/media`, { method: "POST", body });
  if (!createRes.ok) throw new Error(`ig_media_create_${createRes.status}`);
  const created = await createRes.json();
  const creationId = created.id as string;

  // Persist schedule row; publishing will be handled by cron after due time
  const db = await getSurreal();
  await db.create("instagram_schedule", {
    user: new RecordId("user", dbUserId),
    ig_user_id: igUserId,
    creation_id: creationId,
    caption: caption || "",
    publish_time: scheduledPublishTime || null,
    created_at: new Date().toISOString(),
  });

  return { creationId };
}

export async function getAccountInsights(
  igUserId: string,
  accessToken: string,
  metric: string,
  period: "day" | "week" | "days_28" = "day"
): Promise<InstagramInsight[]> {
  const url = new URL(`${FB_GRAPH}/${igUserId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", period);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ig_insights_${res.status}`);
  const data = await res.json();
  return (data.data || []) as InstagramInsight[];
}

export async function listRecentMedia(igUserId: string, accessToken: string, limit: number = 9) {
  const url = new URL(`${FB_GRAPH}/${igUserId}/media`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ig_media_list_${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getMediaInsights(
  mediaId: string,
  accessToken: string,
  metric: string
): Promise<InstagramInsight[]> {
  const url = new URL(`${FB_GRAPH}/${mediaId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ig_media_insights_${res.status}`);
  const data = await res.json();
  return (data.data || []) as InstagramInsight[];
}


