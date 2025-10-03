import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { r2, bucket, listAllObjects } from "@/lib/r2";
import { getSurreal } from "@/lib/surrealdb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { generateBlurHash } from "@/lib/blurhash-server";
import type { LibraryImage } from "@/lib/library-image";
import sharp from "sharp";

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
    const key = `${keyBase}/${file.name}`;

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
    const buffer = Buffer.from(arrayBuffer);
    
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || "application/octet-stream",
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
          key,
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
        
        console.log(`Stored library image metadata for ${key}`);
      } catch (error) {
        console.error('Failed to store library image metadata (non-fatal):', error);
        // Don't fail upload if database fails
      }
    }

    return NextResponse.json({ key, blurhash });
  } catch (e) {
    console.error("upload error", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}


