import { NextResponse } from "next/server";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { getSessionLite, canAccessByRole, canAccessByPlan, type Role } from "@/lib/chatPerms";
import { getSurreal } from "@/lib/surrealdb";

function guessContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const keyRaw = (url.searchParams.get("key") || "").replace(/^\/+/, "");
    if (!keyRaw) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(keyRaw);
    const _isVideo = /\.(mp4|webm|mov|m4v)$/i.test(keyRaw);
    const _isPdf = /\.pdf$/i.test(keyRaw);

    // Allow listing thumbnails for livestream recordings by exact DB thumbKey match
    const isLearnScope = keyRaw.startsWith("admin/learn/");
    if (!isLearnScope) {
      // Only permit thumbnail files for known livestream recordings
      if (!isImage) return NextResponse.json({ error: "Out of scope" }, { status: 403 });
      const db = await getSurreal();
      const res = await db.query("SELECT id FROM livestream_recording WHERE thumbKey = $k LIMIT 1;", { k: keyRaw });
      const found = Array.isArray(res) && Array.isArray(res[0]) && res[0][0];
      if (!found) return NextResponse.json({ error: "Out of scope" }, { status: 403 });
      // Stream image as-is (public cache)
      const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: keyRaw }));
      const body = result.Body as unknown as Readable;
      if (!body) return NextResponse.json({ error: "No body" }, { status: 404 });
      const stream = Readable.toWeb(body) as unknown as ReadableStream;
      const headers = new Headers();
      const contentType = result.ContentType || guessContentType(keyRaw);
      headers.set("Content-Type", contentType);
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      if (result.ETag) headers.set("ETag", result.ETag);
      if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
      return new Response(stream, { status: 200, headers });
    }

    // Learn scope: restrict by role for non-image content
    const parts = keyRaw.split("/"); // admin/learn/{kind}/{slug}/...
    const kind = parts[2] as "tutorials" | "ebooks" | undefined;
    const slug = parts[3] || undefined;
    if (!kind || !slug) return NextResponse.json({ error: "Bad key" }, { status: 400 });

    // For images (thumb/cover), allow without gating. For video/pdf, enforce role and plan.
    if (!isImage) {
      const session = await getSessionLite();
      if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const db = await getSurreal();
      const res = await db.query("SELECT minRole, minPlan FROM learn_item WHERE slug = $slug LIMIT 1;", { slug });
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { minRole?: Role; minPlan?: 'base' | 'premium' | 'ultra' | null }) : null;
      const minRole: Role = row?.minRole ?? (kind === "tutorials" ? "user" : "user");
      const minPlan = (row?.minPlan ?? null) as 'base' | 'premium' | 'ultra' | null;
      const ok = canAccessByRole(session.role, minRole) && canAccessByPlan(session.plan, (minPlan || undefined) as Exclude<'base' | 'premium' | 'ultra' | null, null> | undefined);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = req.headers.get("range") || undefined;
    const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: keyRaw, Range: range }));
    const body = result.Body as unknown as Readable;
    if (!body) return NextResponse.json({ error: "No body" }, { status: 404 });
    const stream = Readable.toWeb(body) as unknown as ReadableStream;
    const headers = new Headers();
    const contentType = result.ContentType || guessContentType(keyRaw);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", isImage ? "public, max-age=3600" : "private, max-age=0, must-revalidate");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Accept-Ranges", "bytes");
    if (result.ETag) headers.set("ETag", result.ETag);
    if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
    const contentRange = (result as unknown as { ContentRange?: string }).ContentRange;
    if (range && contentRange) headers.set("Content-Range", contentRange);
    const status = range ? 206 : 200;
    return new Response(stream, { status, headers });
  } catch {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}


