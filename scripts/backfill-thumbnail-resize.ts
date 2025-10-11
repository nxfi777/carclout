/**
 * Backfill Template Thumbnail Resize
 * 
 * Run with: bun run scripts/backfill-thumbnail-resize.ts
 * 
 * This script:
 * 1. Fetches all templates with thumbnailKey
 * 2. For each thumbnail in R2:
 *    - Fetches the image
 *    - Checks dimensions with Sharp
 *    - If width > 800px, resizes to 800px max width (maintain aspect ratio)
 *    - Converts/keeps as webp at 90% quality
 *    - Uploads resized version back to same key
 *    - Logs file size savings
 * 3. Handles errors gracefully (skips if fetch fails)
 */

import { getSurreal } from '../lib/surrealdb';
import { r2, bucket } from '../lib/r2';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

interface Template {
  id: unknown;
  name: string;
  thumbnailKey?: string;
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function resizeThumbnail(fullKey: string, displayName: string): Promise<boolean> {
  try {
    console.log(`Processing: ${displayName}`);
    console.log(`  Key: ${fullKey}`);
    
    // Fetch image from R2
    const result = await r2.send(new GetObjectCommand({
      Bucket: bucket,
      Key: fullKey
    }));

    if (!result.Body) {
      console.log(`  ⚠️  No image data found, skipping`);
      return false;
    }

    const originalBuffer = await streamToBuffer(result.Body as AsyncIterable<Uint8Array>);
    const originalSize = originalBuffer.length;

    console.log(`  Original: ${(originalSize / 1024).toFixed(1)}KB`);

    // Get metadata
    const metadata = await sharp(originalBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    
    console.log(`  Dimensions: ${originalWidth}x${originalHeight}px`);

    // Check if resize is needed
    if (originalWidth <= 800) {
      console.log(`  ✓ Already 800px or smaller, skipping`);
      return false;
    }

    // Resize to 800px max width
    console.log(`  Resizing to 800px max width...`);
    const resizedBuffer = await sharp(originalBuffer)
      .resize(800, null, { withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    const newSize = resizedBuffer.length;
    const savings = ((1 - newSize / originalSize) * 100).toFixed(1);
    const newMetadata = await sharp(resizedBuffer).metadata();
    
    console.log(`  Resized: ${(newSize / 1024).toFixed(1)}KB (${savings}% reduction)`);
    console.log(`  New dimensions: ${newMetadata.width}x${newMetadata.height}px`);

    // Upload back to R2 (overwrite)
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      Body: resizedBuffer,
      ContentType: 'image/webp',
    }));

    console.log(`  ✓ Uploaded resized thumbnail`);
    return true;

  } catch (error) {
    console.error(`  ✗ Failed to process thumbnail:`, error);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Template Thumbnail Resize Backfill');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const db = await getSurreal();
    
    // Fetch all templates with thumbnailKey
    const result = await db.query<Template[][]>(
      'SELECT id, name, thumbnailKey FROM template WHERE thumbnailKey IS NOT NONE;'
    );
    
    const templates = Array.isArray(result) && Array.isArray(result[0]) 
      ? result[0] 
      : [];

    if (templates.length === 0) {
      console.log('No templates with thumbnails found.');
      return;
    }

    console.log(`Found ${templates.length} template(s) with thumbnails\n`);

    let processed = 0;
    let resized = 0;
    let skipped = 0;
    let failed = 0;

    for (const template of templates) {
      processed++;
      const progress = `[${processed}/${templates.length}]`;
      
      if (!template.thumbnailKey) {
        console.log(`${progress} Skipping ${template.name}: no thumbnail key`);
        skipped++;
        continue;
      }

      // Build full key (handle both relative and full paths)
      let fullKey = String(template.thumbnailKey);
      if (!fullKey.startsWith('admin/')) {
        fullKey = `admin/${fullKey}`;
      }

      console.log(`\n${progress} ${template.name}`);
      
      const wasResized = await resizeThumbnail(fullKey, template.name);
      
      if (wasResized) {
        resized++;
      } else {
        // Check if it failed or was skipped
        if (fullKey) {
          skipped++;
        } else {
          failed++;
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Summary:');
    console.log(`  Total templates: ${templates.length}`);
    console.log(`  Resized: ${resized}`);
    console.log(`  Skipped (already optimized): ${skipped}`);
    console.log(`  Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();

