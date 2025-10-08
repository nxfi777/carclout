import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { generateBlurHash } from "@/lib/blurhash-server";
import { generateVideoBlurHash } from "@/lib/video-blurhash-server";
import type { LibraryImage, LibraryVideo } from "@/lib/library-image";

export const runtime = "nodejs";

/**
 * Generate blurhash for an existing image or video in storage
 * Used for backfilling missing blurhashes
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { key, scope } = body as { key?: string; scope?: string };

    if (!key) {
      return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
    }

    // Verify user has access to this key
    const isAdminScope = scope === 'admin';
    if (isAdminScope && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only process library files
    if (!key.startsWith('library/') && !(isAdminScope && key.includes('/'))) {
      return NextResponse.json({ error: "Only library files can be backfilled" }, { status: 400 });
    }

    // Determine if image or video
    const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(key);
    const isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(key);

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: "File must be an image or video" }, { status: 400 });
    }

    // Download file from R2
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await r2.send(getCommand);
    
    if (!response.Body) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    const db = await getSurreal();

    if (isImage) {
      // Generate blurhash for image
      const blurhash = await generateBlurHash(fileBuffer, 4, 3);
      
      // Get image dimensions using sharp
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(fileBuffer).metadata();
      
      const libraryImageData: Omit<LibraryImage, 'id'> = {
        key,
        email: user.email,
        blurhash,
        width: metadata.width,
        height: metadata.height,
        size: fileBuffer.length,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      // Check if record exists, update or create
      const existing = await db.query(
        "SELECT id FROM library_image WHERE key = $key AND email = $email LIMIT 1;",
        { key, email: user.email }
      );

      const existingId = Array.isArray(existing) && Array.isArray(existing[0]) && existing[0][0]
        ? (existing[0][0] as { id?: string }).id
        : null;

      if (existingId) {
        await db.query(
          "UPDATE $id SET blurhash = $blurhash, width = $width, height = $height, size = $size, lastModified = $lastModified;",
          {
            id: existingId,
            blurhash: libraryImageData.blurhash,
            width: libraryImageData.width,
            height: libraryImageData.height,
            size: libraryImageData.size,
            lastModified: libraryImageData.lastModified
          }
        );
      } else {
        await db.create('library_image', libraryImageData);
      }

      console.log(`[backfill] Generated blurhash for image: ${key}`);
      return NextResponse.json({ success: true, blurhash, type: 'image' });

    } else if (isVideo) {
      // Generate blurhash for video
      const { blurhash, width, height, duration } = await generateVideoBlurHash(fileBuffer);

      const libraryVideoData: Omit<LibraryVideo, 'id'> = {
        key,
        email: user.email,
        blurhash,
        width,
        height,
        duration,
        size: fileBuffer.length,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      // Check if record exists, update or create
      const existing = await db.query(
        "SELECT id FROM library_video WHERE key = $key AND email = $email LIMIT 1;",
        { key, email: user.email }
      );

      const existingId = Array.isArray(existing) && Array.isArray(existing[0]) && existing[0][0]
        ? (existing[0][0] as { id?: string }).id
        : null;

      if (existingId) {
        await db.query(
          "UPDATE $id SET blurhash = $blurhash, width = $width, height = $height, duration = $duration, size = $size, lastModified = $lastModified;",
          {
            id: existingId,
            blurhash: libraryVideoData.blurhash,
            width: libraryVideoData.width,
            height: libraryVideoData.height,
            duration: libraryVideoData.duration,
            size: libraryVideoData.size,
            lastModified: libraryVideoData.lastModified
          }
        );
      } else {
        await db.create('library_video', libraryVideoData);
      }

      console.log(`[backfill] Generated blurhash for video: ${key}`);
      return NextResponse.json({ success: true, blurhash, type: 'video' });
    }

    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });

  } catch (error) {
    console.error('[backfill] Error generating blurhash:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate blurhash" },
      { status: 500 }
    );
  }
}

