import { NextResponse } from "next/server";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { auth } from "@/lib/auth";

const ALLOWED_ATTACHMENT_ROOTS = new Set(["chat-uploads", "car-photos", "vehicles", "library"]);

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

function isValidChatAttachment(key: string): boolean {
  // Must start with users/
  if (!key.startsWith("users/")) return false;
  
  // Extract the path after users/email/
  const parts = key.split("/");
  if (parts.length < 3) return false;
  
  // parts[0] = 'users', parts[1] = email, parts[2] = folder
  const folder = parts[2];
  
  // Check if folder is in allowed list
  return ALLOWED_ATTACHMENT_ROOTS.has(folder);
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const key = (url.searchParams.get("key") || "").replace(/^\/+/, "");
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    // Validate this is a chat attachment from an allowed folder
    if (!isValidChatAttachment(key)) {
      return NextResponse.json({ error: "Invalid chat attachment key" }, { status: 403 });
    }

    const range = req.headers.get("range") || undefined;
    const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
    const body = result.Body as unknown as Readable;
    if (!body) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const stream = Readable.toWeb(body) as unknown as ReadableStream;
    const headers = new Headers();
    const contentType = result.ContentType || guessContentType(key);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Accept-Ranges", "bytes");
    if (result.ETag) headers.set("ETag", result.ETag);
    if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
    if (range && result.ContentRange) headers.set("Content-Range", result.ContentRange);

    const status = range ? 206 : 200;
    return new Response(stream, { status, headers });
  } catch (err) {
    console.error("[chat/file] Error:", err);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}

