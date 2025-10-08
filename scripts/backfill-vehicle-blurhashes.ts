/**
 * Backfill script to generate blurhashes for existing vehicle photos
 * 
 * Usage:
 *   bun run scripts/backfill-vehicle-blurhashes.ts
 */

import { getSurreal } from "@/lib/surrealdb";
import { r2, bucket } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { generateBlurHash } from "@/lib/blurhash-server";
import type { VehiclePhoto } from "@/lib/vehicle-photo";
import sharp from "sharp";
import { listAllObjects } from "@/lib/r2";

async function backfillVehicleBlurhashes() {
  console.log('[backfill] Starting vehicle photo blurhash backfill...');
  
  const db = await getSurreal();
  
  // Get all users with vehicles
  const usersRes = await db.query(
    "SELECT email, vehicles FROM user WHERE vehicles != NONE AND array::len(vehicles) > 0;"
  );
  
  const users = Array.isArray(usersRes) && Array.isArray(usersRes[0]) 
    ? (usersRes[0] as Array<{ email: string; vehicles?: Array<{ photos?: string[] }> }>)
    : [];
  
  console.log(`[backfill] Found ${users.length} users with vehicles`);
  
  let totalPhotos = 0;
  let processedPhotos = 0;
  let skippedPhotos = 0;
  let errorPhotos = 0;
  
  for (const user of users) {
    if (!user.email) continue;
    
    console.log(`\n[backfill] Processing user: ${user.email}`);
    
    // Get all vehicle photo keys for this user
    const vehiclePhotos: string[] = [];
    if (Array.isArray(user.vehicles)) {
      for (const vehicle of user.vehicles) {
        if (Array.isArray(vehicle.photos)) {
          vehiclePhotos.push(...vehicle.photos.filter(p => typeof p === 'string'));
        }
      }
    }
    
    if (vehiclePhotos.length === 0) {
      console.log(`[backfill] No vehicle photos found for ${user.email}`);
      continue;
    }
    
    console.log(`[backfill] Found ${vehiclePhotos.length} vehicle photos for ${user.email}`);
    totalPhotos += vehiclePhotos.length;
    
    for (const key of vehiclePhotos) {
      try {
        // Check if blurhash already exists
        const existingRes = await db.query(
          "SELECT blurhash FROM vehicle_photo WHERE key = $key AND email = $email LIMIT 1;",
          { key, email: user.email }
        );
        
        const existing = Array.isArray(existingRes) && Array.isArray(existingRes[0]) && existingRes[0][0]
          ? (existingRes[0][0] as { blurhash?: string })
          : null;
        
        if (existing?.blurhash) {
          console.log(`[backfill] ✓ Blurhash already exists for ${key}`);
          skippedPhotos++;
          continue;
        }
        
        // Verify the file exists in R2 and is an image
        if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(key)) {
          console.log(`[backfill] ⊘ Skipping non-image file: ${key}`);
          skippedPhotos++;
          continue;
        }
        
        console.log(`[backfill] → Generating blurhash for ${key}...`);
        
        // Fetch image from R2
        let imageBuffer: Buffer;
        let imageSize: number;
        
        try {
          const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          if (!response.Body) {
            console.log(`[backfill] ✗ Image not found in R2: ${key}`);
            errorPhotos++;
            continue;
          }
          const bytes = await response.Body.transformToByteArray();
          imageBuffer = Buffer.from(bytes);
          imageSize = imageBuffer.length;
        } catch (error) {
          console.log(`[backfill] ✗ Failed to fetch from R2: ${key}`, error instanceof Error ? error.message : '');
          errorPhotos++;
          continue;
        }
        
        // Generate blurhash
        let blurhash: string | undefined;
        let width: number | undefined;
        let height: number | undefined;
        
        try {
          blurhash = await generateBlurHash(imageBuffer, 4, 3);
          const metadata = await sharp(imageBuffer).metadata();
          width = metadata.width;
          height = metadata.height;
        } catch (error) {
          console.log(`[backfill] ✗ Failed to generate blurhash for ${key}`, error instanceof Error ? error.message : '');
          errorPhotos++;
          continue;
        }
        
        if (!blurhash) {
          console.log(`[backfill] ✗ No blurhash generated for ${key}`);
          errorPhotos++;
          continue;
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
          
          await db.create('vehicle_photo', vehiclePhotoData);
          console.log(`[backfill] ✓ Generated and stored blurhash for ${key}`);
          processedPhotos++;
        } catch (error) {
          console.log(`[backfill] ✗ Failed to store blurhash for ${key}`, error instanceof Error ? error.message : '');
          errorPhotos++;
        }
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`[backfill] ✗ Error processing ${key}:`, error instanceof Error ? error.message : error);
        errorPhotos++;
      }
    }
  }
  
  console.log('\n[backfill] ========================================');
  console.log('[backfill] Backfill Complete!');
  console.log('[backfill] ========================================');
  console.log(`[backfill] Total photos found: ${totalPhotos}`);
  console.log(`[backfill] Successfully processed: ${processedPhotos}`);
  console.log(`[backfill] Skipped (already had blurhash): ${skippedPhotos}`);
  console.log(`[backfill] Errors: ${errorPhotos}`);
  console.log('[backfill] ========================================\n');
}

// Run the backfill
backfillVehicleBlurhashes()
  .then(() => {
    console.log('[backfill] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[backfill] Script failed with error:', error);
    process.exit(1);
  });

