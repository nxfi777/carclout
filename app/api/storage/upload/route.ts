import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { r2, bucket, listAllObjects } from "@/lib/r2";
import { getSurreal } from "@/lib/surrealdb";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { generateBlurHash } from "@/lib/blurhash-server";
import type { LibraryImage } from "@/lib/library-image";
import type { VehiclePhoto } from "@/lib/vehicle-photo";
import sharp from "sharp";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const path = (form.get("path") as string | null) || "";
    const scope = (form.get("scope") as string | null) || 'user';
    const isAdminScope = scope === 'admin';
    if (isAdminScope && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const cleanUser = sanitizeUserId(user.email);
    const folder = path.replace(/^\/+|\/+$/g, "");
    // Disallow uploading directly into the immutable 'vehicles' root
    if (!isAdminScope) {
      const parts = folder.split('/').filter(Boolean);
      if (parts[0] === 'vehicles' && parts.length === 1) {
        return NextResponse.json({ error: "Cannot upload directly to 'vehicles'. Open a specific vehicle folder to add photos." }, { status: 400 });
      }
      // Enforce per-vehicle photo limit of 30 images
      if (parts[0] === 'vehicles' && parts.length >= 2) {
        const carFolder = parts[1];
        const carPrefix = `users/${cleanUser}/vehicles/${carFolder}/`;
        try {
          const existing = await listAllObjects(carPrefix);
          const currentFiles = existing.filter(o => {
            const k = o.Key || '';
            return k.startsWith(carPrefix) && !k.endsWith('/');
          }).length;
          if (currentFiles >= 30) {
            return NextResponse.json({ error: "This vehicle already has 30 photos. Delete some before uploading more." }, { status: 400 });
          }
        } catch {}
      }
    }
    const keyBase = isAdminScope ? (folder ? `admin/${folder}` : `admin`) : (folder ? `users/${cleanUser}/${folder}` : `users/${cleanUser}`);
    
    // Generate random filename for admin template images/thumbnails (with collision prevention)
    let fileName = file.name;
    const isTemplateAsset = isAdminScope && folder.startsWith('templates/');
    if (isTemplateAsset) {
      const ext = file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
      // Try up to 10 times to find a unique filename (nanoid collisions are astronomically rare)
      let attempts = 0;
      let candidateKey = '';
      while (attempts < 10) {
        fileName = `${nanoid(12)}.${ext}`;
        candidateKey = `${keyBase}/${fileName}`;
        
        // Check if key already exists
        try {
          await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: candidateKey }));
          // If no error, file exists - try again
          attempts++;
          console.warn(`Filename collision detected: ${fileName}, retrying...`);
        } catch {
          // Error means file doesn't exist - we can use this name
          break;
        }
      }
      
      if (attempts >= 10) {
        return NextResponse.json({ error: "Unable to generate unique filename" }, { status: 500 });
      }
    }
    
    const key = `${keyBase}/${fileName}`;

    // Enforce storage quota for non-admin scope
    if (!isAdminScope) {
      // Resolve effective plan
      let effectivePlan: string | null = user.plan ?? null;
      try {
        const db = await getSurreal();
        const res = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email: user.email });
        const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { plan?: string | null } | undefined) : undefined;
        if (row && "plan" in row) effectivePlan = row.plan || effectivePlan || null;
      } catch {}
      const GB = 1024 ** 3;
      const TB = 1024 ** 4;
      const plan = (effectivePlan || 'base').toLowerCase();
      const limitBytes = plan === 'ultra' ? (1 * TB) : plan === 'premium' ? (100 * GB) : (1 * GB);
      // Compute current usage for this user
      const root = `users/${cleanUser}`;
      const objects = await listAllObjects(root.endsWith('/') ? root : `${root}/`);
      const usedBytes = objects.reduce((acc, o) => acc + (o.Size || 0), 0);
      const incomingBytes = file.size || 0;
      if (usedBytes + incomingBytes > limitBytes) {
        return NextResponse.json({ error: "Storage limit exceeded. Please upgrade your plan or free up space." }, { status: 413 });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(arrayBuffer);
    let finalKey = key;
    let finalContentType = file.type || "application/octet-stream";
    
    // Auto-convert template assets (both thumbnails and images) to webp
    const isConvertibleImage = /\.(jpe?g|png|gif|bmp)$/i.test(fileName);
    
    if (isTemplateAsset && isConvertibleImage) {
      try {
        console.log(`Converting template asset to webp: ${fileName}`);
        buffer = await sharp(buffer)
          .webp({ quality: 90 })
          .toBuffer() as Buffer;
        // Update key to use .webp extension
        finalKey = key.replace(/\.(jpe?g|png|gif|bmp)$/i, '.webp');
        finalContentType = 'image/webp';
        console.log(`✓ Converted to webp: ${finalKey}`);
      } catch (error) {
        console.error('WebP conversion failed, using original:', error);
        // Fall back to original if conversion fails
      }
    }
    
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: finalKey,
      Body: buffer,
      ContentType: finalContentType,
    }));

    // Generate blurhash for images (async, don't block response)
    let blurhash: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    
    if (isImage) {
      try {
        blurhash = await generateBlurHash(buffer, 4, 3);
        // Get image dimensions
        const metadata = await sharp(buffer).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (error) {
        console.error('BlurHash generation failed (non-fatal):', error);
        // Don't fail upload if blurhash fails
      }
    }

    // Store metadata in database for library images
    const isLibraryImage = folder === 'library' || folder.startsWith('library/');
    if (isLibraryImage && isImage && blurhash) {
      try {
        const db = await getSurreal();
        const libraryImageData: Omit<LibraryImage, 'id'> = {
          key: finalKey,
          email: user.email,
          blurhash,
          width,
          height,
          size: file.size,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };
        
        // Check if record exists, update or create
        const existing = await db.query(
          "SELECT id FROM library_image WHERE key = $key AND email = $email LIMIT 1;",
          { key: finalKey, email: user.email }
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
        
        console.log(`Stored library image metadata for ${finalKey}`);
      } catch (error) {
        console.error('Failed to store library image metadata (non-fatal):', error);
        // Don't fail upload if database fails
      }
    }

    // Store metadata in database for vehicle photos
    const isVehiclePhoto = folder.startsWith('vehicles/');
    if (isVehiclePhoto && isImage && blurhash) {
      try {
        const db = await getSurreal();
        const vehiclePhotoData: Omit<VehiclePhoto, 'id'> = {
          key: finalKey,
          email: user.email,
          blurhash,
          width,
          height,
          size: file.size,
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };
        
        // Check if record exists, update or create
        const existing = await db.query(
          "SELECT id FROM vehicle_photo WHERE key = $key AND email = $email LIMIT 1;",
          { key: finalKey, email: user.email }
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
        
        console.log(`Stored vehicle photo metadata for ${finalKey}`);
      } catch (error) {
        console.error('Failed to store vehicle photo metadata (non-fatal):', error);
        // Don't fail upload if database fails
      }
    }

    return NextResponse.json({ key: finalKey, blurhash });
  } catch (e) {
    console.error("upload error", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}


