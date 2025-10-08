import { NextResponse } from "next/server";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

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
  return "application/octet-stream";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const keyRaw = (url.searchParams.get("key") || "").replace(/^\/+/, "");
    if (!keyRaw) return NextResponse.json({ error: "Missing key" }, { status: 400 });
    // Restrict to hooks area for safety
    if (!keyRaw.startsWith("admin/hooks/")) return NextResponse.json({ error: "Out of scope" }, { status: 403 });

    const range = req.headers.get("range") || undefined;

    const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: keyRaw, Range: range }));
    const body = result.Body as unknown as Readable;
    if (!body) return NextResponse.json({ error: "No body" }, { status: 404 });

    const stream = Readable.toWeb(body) as unknown as ReadableStream;
    const headers = new Headers();
    const contentType = result.ContentType || guessContentType(keyRaw);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Accept-Ranges", "bytes");
    if (result.ETag) headers.set("ETag", result.ETag);
    if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
    if (range && result.ContentRange) headers.set("Content-Range", result.ContentRange);

    // If download=1 query param present, set Content-Disposition to attachment to force download
    const dl = url.searchParams.get('download');
    if (dl) {
      const filename = keyRaw.split('/').pop() || 'file';
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }

    const status = range ? 206 : 200;
    return new Response(stream, { status, headers });
  } catch {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}


