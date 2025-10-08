/**
 * Backfill Template Thumbnails to WebP
 * 
 * Run with: bun run scripts/backfill-template-thumbnails-webp.ts
 * 
 * This script:
 * 1. Fetches all templates with thumbnails
 * 2. Converts non-webp thumbnails to webp format
 * 3. Uploads converted images to R2
 * 4. Updates template records with new thumbnail keys
 * 5. Deletes old thumbnail files
 */

import { getSurreal } from '../lib/surrealdb';
import { r2, bucket } from '../lib/r2';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { generateBlurHash } from '../lib/blurhash-server';

interface Template {
  id: unknown;
  name: string;
  thumbnailKey?: string;
  blurhash?: string;
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function backfillTemplateWebP() {
  console.log('🖼️  Starting Template Thumbnail WebP Conversion...\n');

  try {
    const db = await getSurreal();

    // Get all templates with thumbnails
    const query = `SELECT id, name, thumbnailKey, blurhash FROM template WHERE thumbnailKey != NONE;`;
    const res = await db.query(query);
    const templates = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []) as Template[];

    // Filter templates with non-webp thumbnails
    const needsConversion = templates.filter(t => {
      if (!t.thumbnailKey) return false;
      return !/\.webp$/i.test(t.thumbnailKey);
    });

    console.log(`📊 Total templates with thumbnails: ${templates.length}`);
    console.log(`📊 Already webp: ${templates.length - needsConversion.length}`);
    console.log(`📊 Need conversion: ${needsConversion.length}\n`);

    if (needsConversion.length === 0) {
      console.log('✅ All template thumbnails are already webp!');
      return;
    }

    let success = 0;
    let failed = 0;
    const errors: Array<{ name: string; error: string }> = [];

    // Process each template
    for (let i = 0; i < needsConversion.length; i++) {
      const template = needsConversion[i]!;
      const progress = `[${i + 1}/${needsConversion.length}]`;

      try {
        console.log(`${progress} Processing: ${template.name}`);
        console.log(`${progress}   → Current thumbnail: ${template.thumbnailKey}`);

        // Fetch image from R2
        const fullKey = template.thumbnailKey!.startsWith('admin/') 
          ? template.thumbnailKey!
          : `admin/${template.thumbnailKey}`;
        
        const result = await r2.send(new GetObjectCommand({
          Bucket: bucket,
          Key: fullKey
        }));

        if (!result.Body) {
          throw new Error('No image data in R2');
        }

        const originalBuffer = await streamToBuffer(result.Body as AsyncIterable<Uint8Array>);
        const originalSize = originalBuffer.length;

        console.log(`${progress}   → Fetched from R2 (${(originalSize / 1024).toFixed(1)}KB)`);

        // Convert to webp
        console.log(`${progress}   → Converting to webp...`);
        const webpBuffer = await sharp(originalBuffer)
          .webp({ quality: 90 })
          .toBuffer();

        const newSize = webpBuffer.length;
        const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

        console.log(`${progress}   → Converted (${(newSize / 1024).toFixed(1)}KB, ${savings}% reduction)`);

        // Generate new key with webp extension
        const newKey = fullKey.replace(/\.(jpe?g|png|gif|bmp)$/i, '.webp');
        const newThumbnailKey = newKey.replace(/^admin\//, '');

        // Upload webp to R2
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: newKey,
          Body: webpBuffer,
          ContentType: 'image/webp',
        }));

        console.log(`${progress}   → Uploaded webp: ${newKey}`);

        // Generate blurhash for the webp image
        let blurhash: string | undefined;
        try {
          blurhash = await generateBlurHash(webpBuffer, 4, 3);
          console.log(`${progress}   → Generated blurhash: ${blurhash.substring(0, 20)}...`);
        } catch (error) {
          console.warn(`${progress}   ⚠️  BlurHash generation failed (non-fatal):`, error);
        }

        // Update template record
        const updateQuery = blurhash 
          ? `UPDATE $id SET thumbnailKey = $thumbnailKey, blurhash = $blurhash;`
          : `UPDATE $id SET thumbnailKey = $thumbnailKey;`;
        
        const params = blurhash
          ? { id: template.id, thumbnailKey: newThumbnailKey, blurhash }
          : { id: template.id, thumbnailKey: newThumbnailKey };

        await db.query(updateQuery, params);

        console.log(`${progress}   → Updated database`);

        // Delete old file
        try {
          await r2.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: fullKey
          }));
          console.log(`${progress}   → Deleted old file: ${fullKey}`);
        } catch (error) {
          console.warn(`${progress}   ⚠️  Failed to delete old file (non-fatal):`, error);
        }

        success++;
        console.log(`${progress}   ✅ Success!\n`);
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ name: template.name, error: errorMsg });
        console.error(`${progress}   ❌ Failed: ${errorMsg}\n`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Backfill Complete!');
    console.log('='.repeat(50));
    console.log(`✅ Success: ${success}`);
    console.log(`❌ Failed: ${failed}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors:');
      errors.forEach(e => console.log(`   - ${e.name}: ${e.error}`));
    }

    console.log('\n💡 New template thumbnails will automatically be converted to webp on upload!');
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run it
backfillTemplateWebP()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

