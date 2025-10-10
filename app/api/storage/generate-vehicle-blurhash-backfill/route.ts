import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { generateBlurHash } from "@/lib/blurhash-server";
import type { VehiclePhoto } from "@/lib/vehicle-photo";
import sharp from "sharp";

/**
 * Generate and store blurhash for a vehicle photo (backfill endpoint)
 * 
 * POST /api/storage/generate-vehicle-blurhash-backfill
 * Body: { key: string }
 * 
 * Returns: { success: boolean; blurhash?: string; width?: number; height?: number }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const key = typeof body?.key === 'string' ? body.key : null;

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    // Verify key belongs to user's vehicle photos
    if (!key.startsWith(`users/`) || !key.includes('/vehicles/')) {
      return NextResponse.json({ error: "Invalid vehicle photo key" }, { status: 400 });
    }

    const db = await getSurreal();

    // Check if blurhash already exists
    try {
      const existing = await db.query(
        "SELECT blurhash FROM vehicle_photo WHERE key = $key AND email = $email LIMIT 1;",
        { key, email: user.email }
      );

      const row = Array.isArray(existing) && Array.isArray(existing[0]) && existing[0][0]
        ? (existing[0][0] as { blurhash?: string })
        : null;

      if (row?.blurhash) {
        console.log(`[vehicle-blurhash-backfill] Blurhash already exists for ${key}`);
        return NextResponse.json({ 
          success: true, 
          blurhash: row.blurhash,
          message: "Blurhash already exists" 
        });
      }
    } catch (error) {
      console.error(`[vehicle-blurhash-backfill] Error checking existing blurhash:`, error);
      // Continue with generation
    }

    // Fetch image from R2
    let imageBuffer: Buffer;
    let imageSize: number;
    try {
      const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body) {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }
      const bytes = await response.Body.transformToByteArray();
      imageBuffer = Buffer.from(bytes);
      imageSize = imageBuffer.length;
    } catch (error) {
      console.error(`[vehicle-blurhash-backfill] Failed to fetch image:`, error);
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 404 });
    }

    // Generate blurhash
    let blurhash: string | undefined;
    let width: number | undefined;
    let height: number | undefined;

    try {
      blurhash = await generateBlurHash(imageBuffer, 4, 3);
      // Get image dimensions
      const metadata = await sharp(imageBuffer, { autoOrient: false }).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch (error) {
      console.error(`[vehicle-blurhash-backfill] BlurHash generation failed:`, error);
      return NextResponse.json({ error: "Failed to generate blurhash" }, { status: 500 });
    }

    if (!blurhash) {
      return NextResponse.json({ error: "Failed to generate blurhash" }, { status: 500 });
    }

    // Store in database
    try {
      const vehiclePhotoData: Omit<VehiclePhoto, 'id'> = {
        key,
        email: user.email,
        blurhash,
        width,
        height,
        size: imageSize,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      // Check if record exists, update or create
      const existing = await db.query(
        "SELECT id FROM vehicle_photo WHERE key = $key AND email = $email LIMIT 1;",
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
            blurhash: vehiclePhotoData.blurhash,
            width: vehiclePhotoData.width,
            height: vehiclePhotoData.height,
            size: vehiclePhotoData.size,
            lastModified: vehiclePhotoData.lastModified
          }
        );
      } else {
        await db.create('vehicle_photo', vehiclePhotoData);
      }

      console.log(`[vehicle-blurhash-backfill] Generated and stored blurhash for ${key}`);

      return NextResponse.json({ 
        success: true, 
        blurhash,
        width,
        height
      });
    } catch (error) {
      console.error(`[vehicle-blurhash-backfill] Failed to store blurhash:`, error);
      return NextResponse.json({ error: "Failed to store blurhash" }, { status: 500 });
    }
  } catch (error) {
    console.error('[vehicle-blurhash-backfill] Error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

