/**
 * Cleanup Template Admin Images
 * 
 * Run with: bun run scripts/cleanup-template-admin-images.ts
 * 
 * This script:
 * 1. Checks all template admin image keys to see if files exist
 * 2. Removes references to non-existent files
 * 3. If no admin images remain, uses thumbnail as the admin image
 */

import { getSurreal } from '../lib/surrealdb';
import { r2, bucket } from '../lib/r2';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

interface Template {
  id: unknown;
  name: string;
  thumbnailKey?: string;
  adminImageKeys?: string[];
}

async function fileExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function cleanupAdminImages() {
  console.log('🧹 Starting Template Admin Images Cleanup...\n');

  try {
    const db = await getSurreal();

    // Get all templates
    const query = `SELECT id, name, thumbnailKey, adminImageKeys FROM template;`;
    const res = await db.query(query);
    const templates = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []) as Template[];

    console.log(`📊 Total templates: ${templates.length}\n`);

    let cleaned = 0;
    let usedThumbnail = 0;
    let alreadyGood = 0;

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i]!;
      const progress = `[${i + 1}/${templates.length}]`;

      console.log(`${progress} ${template.name}`);

      // Check admin images
      const validAdminKeys: string[] = [];
      const invalidAdminKeys: string[] = [];

      if (Array.isArray(template.adminImageKeys) && template.adminImageKeys.length > 0) {
        for (const key of template.adminImageKeys) {
          if (!key) continue;

          const fullKey = key.startsWith('admin/') ? key : `admin/${key}`;
          const exists = await fileExists(fullKey);

          if (exists) {
            validAdminKeys.push(key);
            console.log(`${progress}   ✓ Valid: ${key}`);
          } else {
            invalidAdminKeys.push(key);
            console.log(`${progress}   ✗ Missing: ${key}`);
          }
        }

        // If we have invalid keys, we need to clean up
        if (invalidAdminKeys.length > 0) {
          console.log(`${progress}   → Removing ${invalidAdminKeys.length} stale reference(s)`);

          // If no valid admin images remain, use thumbnail as admin image
          if (validAdminKeys.length === 0 && template.thumbnailKey) {
            const thumbKey = template.thumbnailKey;
            validAdminKeys.push(thumbKey);
            console.log(`${progress}   → Using thumbnail as admin image: ${thumbKey}`);
            usedThumbnail++;
          }

          // Update database
          await db.query(
            `UPDATE $id SET adminImageKeys = $adminImageKeys;`,
            { id: template.id, adminImageKeys: validAdminKeys }
          );

          console.log(`${progress}   ✅ Cleaned (${validAdminKeys.length} remaining)\n`);
          cleaned++;
        } else {
          console.log(`${progress}   ✅ All admin images valid\n`);
          alreadyGood++;
        }
      } else {
        console.log(`${progress}   ℹ️  No admin images\n`);
        alreadyGood++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Cleanup Complete!');
    console.log('='.repeat(50));
    console.log(`✅ Templates cleaned: ${cleaned}`);
    console.log(`🖼️  Used thumbnail as admin image: ${usedThumbnail}`);
    console.log(`✓ Already valid: ${alreadyGood}`);

  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run it
cleanupAdminImages()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

