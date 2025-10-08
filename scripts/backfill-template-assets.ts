/**
 * Backfill Template Assets (Thumbnails + Admin Images)
 * 
 * Run with: bun run scripts/backfill-template-assets.ts
 * 
 * This script:
 * 1. Fetches all templates with thumbnails and/or admin images
 * 2. Converts non-webp images to webp format (90% quality)
 * 3. Renames files with random nanoid names for cleaner URLs
 * 4. Uploads converted/renamed images to R2
 * 5. Updates template records with new keys
 * 6. Generates blurhash for all images
 * 7. Deletes old files
 */

import { getSurreal } from '../lib/surrealdb';
import { r2, bucket } from '../lib/r2';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { generateBlurHash } from '../lib/blurhash-server';
import { nanoid } from 'nanoid';

interface Template {
  id: unknown;
  name: string;
  thumbnailKey?: string;
  adminImageKeys?: string[];
  blurhash?: string;
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function processImage(
  fullKey: string,
  displayName: string,
  progress: string
): Promise<{ newKey: string; blurhash: string; newRelativeKey: string } | null> {
  try {
    console.log(`${progress}   → Processing: ${displayName}`);
    
    // Fetch image from R2
    const result = await r2.send(new GetObjectCommand({
      Bucket: bucket,
      Key: fullKey
    }));

    if (!result.Body) {
      throw new Error('No image data in R2');
    }

    const originalBuffer = await streamToBuffer(result.Body as AsyncIterable<Uint8Array>);
    const originalSize = originalBuffer.length;

    console.log(`${progress}      Fetched (${(originalSize / 1024).toFixed(1)}KB)`);

    // Check if needs conversion
    const isWebp = /\.webp$/i.test(fullKey);
    const needsRename = !/^[a-zA-Z0-9_-]{12}\.webp$/.test(fullKey.split('/').pop() || '');
    
    let processedBuffer = originalBuffer;
    let newExt = fullKey.match(/\.([^.]+)$/)?.[1] || 'jpg';
    
    if (!isWebp) {
      console.log(`${progress}      Converting to webp...`);
      processedBuffer = await sharp(originalBuffer)
        .webp({ quality: 90 })
        .toBuffer();
      newExt = 'webp';
      
      const newSize = processedBuffer.length;
      const savings = ((1 - newSize / originalSize) * 100).toFixed(1);
      console.log(`${progress}      Converted (${(newSize / 1024).toFixed(1)}KB, ${savings}% reduction)`);
    } else if (!needsRename) {
      console.log(`${progress}      ✓ Already optimized, skipping`);
      return null;
    }

    // Generate new key with random name (with collision prevention)
    const pathParts = fullKey.split('/');
    const folder = pathParts.slice(0, -1).join('/');
    
    let newFileName = '';
    let newKey = '';
    let attempts = 0;
    
    while (attempts < 10) {
      newFileName = `${nanoid(12)}.${newExt}`;
      newKey = `${folder}/${newFileName}`;
      
      // Check if key already exists
      try {
        await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: newKey }));
        // If no error, file exists - try again
        attempts++;
        console.warn(`${progress}      ⚠️  Collision detected: ${newFileName}, retrying...`);
      } catch (error) {
        // Error means file doesn't exist - we can use this name
        break;
      }
    }
    
    if (attempts >= 10) {
      throw new Error('Unable to generate unique filename after 10 attempts');
    }
    
    const newRelativeKey = newKey.replace(/^admin\//, '');

    console.log(`${progress}      New name: ${newFileName}`);

    // Upload to R2
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: newKey,
      Body: processedBuffer,
      ContentType: 'image/webp',
    }));

    console.log(`${progress}      ✓ Uploaded`);

    // Generate blurhash
    const blurhash = await generateBlurHash(processedBuffer, 4, 3);
    console.log(`${progress}      ✓ Generated blurhash`);

    // Delete old file if key changed
    if (newKey !== fullKey) {
      try {
        await r2.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: fullKey
        }));
        console.log(`${progress}      ✓ Deleted old file`);
      } catch (error) {
        console.warn(`${progress}      ⚠️  Failed to delete old file (non-fatal)`);
      }
    }

    return { newKey, blurhash, newRelativeKey };
  } catch (error) {
    throw error;
  }
}

async function backfillTemplateAssets() {
  console.log('🖼️  Starting Template Assets Backfill (WebP + Random Names)...\n');

  try {
    const db = await getSurreal();

    // Get all templates with assets
    const query = `SELECT id, name, thumbnailKey, adminImageKeys, blurhash FROM template WHERE thumbnailKey != NONE OR adminImageKeys != NONE;`;
    const res = await db.query(query);
    const templates = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []) as Template[];

    console.log(`📊 Total templates with assets: ${templates.length}\n`);

    let templatesProcessed = 0;
    let imagesProcessed = 0;
    let imagesSkipped = 0;
    let imagesFailed = 0;
    const errors: Array<{ template: string; image: string; error: string }> = [];

    // Process each template
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i]!;
      const progress = `[${i + 1}/${templates.length}]`;
      let templateChanged = false;

      console.log(`${progress} Template: ${template.name}`);

      let newThumbnailKey: string | undefined = undefined;
      let newBlurhash: string | undefined = undefined;
      const newAdminImageKeys: string[] = [];

      // Process thumbnail
      if (template.thumbnailKey) {
        try {
          const fullKey = template.thumbnailKey.startsWith('admin/') 
            ? template.thumbnailKey
            : `admin/${template.thumbnailKey}`;
          
          const result = await processImage(fullKey, 'Thumbnail', progress);
          
          if (result) {
            newThumbnailKey = result.newRelativeKey;
            newBlurhash = result.blurhash;
            templateChanged = true;
            imagesProcessed++;
          } else {
            imagesSkipped++;
          }
        } catch (error) {
          imagesFailed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ template: template.name, image: 'thumbnail', error: errorMsg });
          console.error(`${progress}   ❌ Thumbnail failed: ${errorMsg}`);
        }
      }

      // Process admin images
      if (Array.isArray(template.adminImageKeys)) {
        for (let j = 0; j < template.adminImageKeys.length; j++) {
          const key = template.adminImageKeys[j];
          if (!key) continue;

          try {
            // Try different key patterns to find the file
            const fullKey = key.startsWith('admin/') ? key : `admin/${key}`;
            
            // First, verify the file exists before processing
            let fileExists = false;
            try {
              await r2.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey }));
              fileExists = true;
            } catch (checkError) {
              // File doesn't exist at this path, skip it
              console.warn(`${progress}   ⚠️  Admin image ${j + 1} not found: ${fullKey}`);
              console.warn(`${progress}      Keeping original key in database (may be stale)`);
              newAdminImageKeys.push(key); // Keep original key
              imagesSkipped++;
              continue;
            }

            if (fileExists) {
              const result = await processImage(fullKey, `Admin image ${j + 1}/${template.adminImageKeys.length}`, progress);
              
              if (result) {
                newAdminImageKeys.push(result.newRelativeKey);
                templateChanged = true;
                imagesProcessed++;
              } else {
                newAdminImageKeys.push(key); // Keep original if not changed
                imagesSkipped++;
              }
            }
          } catch (error) {
            imagesFailed++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            errors.push({ template: template.name, image: `admin image ${j + 1} (${key})`, error: errorMsg });
            console.error(`${progress}   ❌ Admin image ${j + 1} failed: ${errorMsg}`);
            newAdminImageKeys.push(key); // Keep original on error
          }
        }
      }

      // Update database if anything changed
      if (templateChanged) {
        try {
          const updates: string[] = [];
          const params: Record<string, unknown> = { id: template.id };

          if (newThumbnailKey !== undefined) {
            updates.push('thumbnailKey = $thumbnailKey');
            params.thumbnailKey = newThumbnailKey;
          }

          if (newBlurhash !== undefined) {
            updates.push('blurhash = $blurhash');
            params.blurhash = newBlurhash;
          }

          if (newAdminImageKeys.length > 0) {
            updates.push('adminImageKeys = $adminImageKeys');
            params.adminImageKeys = newAdminImageKeys;
          }

          if (updates.length > 0) {
            const updateQuery = `UPDATE $id SET ${updates.join(', ')};`;
            await db.query(updateQuery, params);
            console.log(`${progress}   ✓ Updated database`);
          }

          templatesProcessed++;
        } catch (error) {
          console.error(`${progress}   ❌ Database update failed:`, error);
        }
      }

      console.log(`${progress}   ✅ Complete\n`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Backfill Complete!');
    console.log('='.repeat(60));
    console.log(`📦 Templates processed: ${templatesProcessed}/${templates.length}`);
    console.log(`🖼️  Images processed: ${imagesProcessed}`);
    console.log(`⏭️  Images skipped (already optimized): ${imagesSkipped}`);
    console.log(`❌ Images failed: ${imagesFailed}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors:');
      errors.forEach(e => console.log(`   - ${e.template} (${e.image}): ${e.error}`));
    }

    console.log('\n💡 New uploads will automatically use webp + random names!');
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run it
backfillTemplateAssets()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

