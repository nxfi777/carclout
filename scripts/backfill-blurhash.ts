/**
 * Backfill BlurHash for Existing Templates
 * 
 * Run with: bun run scripts/backfill-blurhash.ts
 * 
 * This script:
 * 1. Fetches all templates without blurhash
 * 2. Generates blurhash for each thumbnail
 * 3. Updates templates in database
 */

import { getSurreal } from '../lib/surrealdb';
import { r2, bucket } from '../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { generateBlurHash } from '../lib/blurhash-server';

async function backfillBlurhash() {
  console.log('🎨 Starting BlurHash backfill for templates...\n');

  try {
    const db = await getSurreal();

    // Get all templates
    const query = `SELECT id, name, thumbnailKey, blurhash FROM template WHERE thumbnailKey != NONE;`;
    const res = await db.query(query);
    const templates = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []) as Array<{
      id: unknown;
      name: string;
      thumbnailKey?: string;
      blurhash?: string;
    }>;

    const needsBackfill = templates.filter(t => t.thumbnailKey && !t.blurhash);

    console.log(`📊 Total templates: ${templates.length}`);
    console.log(`📊 Need blurhash: ${needsBackfill.length}`);
    console.log(`📊 Already have blurhash: ${templates.length - needsBackfill.length}\n`);

    if (needsBackfill.length === 0) {
      console.log('✅ All templates already have blurhash!');
      return;
    }

    // Debug: Check first template's key structure
    if (needsBackfill.length > 0) {
      const first = needsBackfill[0]!;
      console.log(`🔍 First template: ${first.name}`);
      console.log(`🔍 thumbnailKey: "${first.thumbnailKey}"`);
      console.log('');
    }

    let success = 0;
    let failed = 0;
    const errors: Array<{ name: string; error: string }> = [];

    // Process each template
    for (let i = 0; i < needsBackfill.length; i++) {
      const template = needsBackfill[i]!;
      const progress = `[${i + 1}/${needsBackfill.length}]`;

      try {
        console.log(`${progress} Processing: ${template.name}`);

        // Fetch image directly from R2
        // thumbnailKey is stored without 'admin/' prefix, add it
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

        console.log(`${progress}   → Fetching image from R2...`);

        // Convert AWS SDK stream to buffer
        const chunks: Buffer[] = [];
        
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          chunks.push(Buffer.from(chunk));
        }

        const buffer = Buffer.concat(chunks);

        console.log(`${progress}   → Generating blurhash (${(buffer.length / 1024).toFixed(1)}KB)...`);

        // Generate blurhash from buffer
        const blurhash = await generateBlurHash(buffer, 4, 3);

        console.log(`${progress}   → BlurHash: ${blurhash.substring(0, 20)}...`);

        // Update template
        const updateQuery = `UPDATE $id SET blurhash = $blurhash;`;
        await db.query(updateQuery, { id: template.id, blurhash });

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

    console.log('\n💡 New templates will automatically get blurhash on upload!');
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run it
backfillBlurhash()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

