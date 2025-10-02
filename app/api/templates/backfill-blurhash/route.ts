import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/user';
import { getSurreal } from '@/lib/surrealdb';
import { createViewUrl } from '@/lib/r2';

/**
 * API Route: Backfill BlurHash for existing templates
 * POST /api/templates/backfill-blurhash
 * 
 * Generates blurhash for all templates that have thumbnailKey but no blurhash
 * Admin only
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getSurreal();
    
    // Get all templates without blurhash
    const query = `SELECT id, name, thumbnailKey, blurhash FROM template WHERE thumbnailKey != NONE;`;
    const res = await db.query(query);
    const templates = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []) as Array<{
      id: unknown;
      name: string;
      thumbnailKey?: string;
      blurhash?: string;
    }>;

    const needsBackfill = templates.filter(t => t.thumbnailKey && !t.blurhash);
    
    if (needsBackfill.length === 0) {
      return NextResponse.json({ 
        message: 'All templates already have blurhash',
        total: templates.length,
        backfilled: 0
      });
    }

    const results = {
      total: needsBackfill.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ name: string; error: string }>,
    };

    // Process in batches to avoid overwhelming the server
    for (const template of needsBackfill) {
      try {
        // Get view URL for the thumbnail
        const fullKey = template.thumbnailKey!.startsWith('admin/')
          ? template.thumbnailKey!
          : `admin/${template.thumbnailKey}`;
        const { url: viewUrl } = await createViewUrl(fullKey);
        
        if (!viewUrl) {
          results.failed++;
          results.errors.push({ name: template.name, error: 'Could not get view URL' });
          continue;
        }

        // Generate blurhash
        const blurhashRes = await fetch(`${request.nextUrl.origin}/api/blurhash/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: viewUrl }),
        });

        if (!blurhashRes.ok) {
          results.failed++;
          results.errors.push({ name: template.name, error: 'BlurHash generation failed' });
          continue;
        }

        const { blurhash } = await blurhashRes.json();

        // Update template with blurhash
        const updateQuery = `UPDATE $id SET blurhash = $blurhash;`;
        await db.query(updateQuery, { id: template.id, blurhash });

        results.success++;
        console.log(`✅ Generated blurhash for template: ${template.name}`);
      } catch (error) {
        results.failed++;
        results.errors.push({ 
          name: template.name, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        console.error(`❌ Failed to generate blurhash for ${template.name}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Backfill complete',
      results,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}

// Add NextRequest import
import { NextRequest } from 'next/server';

