import { getSurreal } from "@/lib/surrealdb";
import { createViewUrl } from "@/lib/r2";
import { RecordId } from "surrealdb";

export interface TemplateItem {
  id?: string;
  name?: string;
  thumbnailKey?: string;
  thumbUrl?: string;
  blurhash?: string;
}

// Helper to convert RecordId to plain string
function toIdString(id: unknown): string | undefined {
  if (id instanceof RecordId) {
    return id.toString();
  }
  if (typeof id === "string") {
    return id;
  }
  return undefined;
}

export async function getBentoTemplates(): Promise<TemplateItem[]> {
  try {
    const db = await getSurreal();
    
    // Fetch 50 templates server-side with explicit blurhash field
    const res = await db.query("SELECT id, name, thumbnailKey, blurhash, created_at FROM template ORDER BY created_at DESC LIMIT 50;");
    const all = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as TemplateItem[]) : [];
    
    // Log for debugging
    console.log('[getBentoTemplates] Sample template:', all[0]);
    console.log('[getBentoTemplates] Total templates:', all.length);
    console.log('[getBentoTemplates] Templates with blurhash:', all.filter(t => t?.blurhash).length);
    
    // Shuffle and pick templates
    const pool = [...all];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const pick = pool.slice(0, 15); // Pick 15 templates
    
    // Resolve thumbnail URLs server-side and serialize data for client components
    const resolved = await Promise.all(
      pick.map(async (t) => {
        const keyRaw = t?.thumbnailKey;
        const key = keyRaw && typeof keyRaw === 'string' ? 
          (keyRaw.startsWith('admin/') ? keyRaw : `admin/${keyRaw}`) : 
          undefined;
        
        let thumbUrl: string | undefined;
        if (key) {
          try {
            const result = await createViewUrl(key, 60 * 60 * 24); // 24 hour expiry
            thumbUrl = result.url;
          } catch (error) {
            console.error('[getBentoTemplates] Failed to create URL for key:', key, error);
          }
        }
        
        // Return only serializable data (no RecordId objects)
        return {
          id: toIdString((t as { id?: unknown })?.id),
          name: t?.name,
          thumbnailKey: t?.thumbnailKey,
          blurhash: t?.blurhash,
          thumbUrl,
        };
      })
    );
    
    // Log resolved data
    console.log('[getBentoTemplates] Resolved templates with blurhash:', resolved.filter(t => t?.blurhash).length);
    console.log('[getBentoTemplates] Sample resolved:', resolved[0]);
    
    return resolved;
  } catch (error) {
    console.error('[getBentoTemplates] Error:', error);
    return [];
  }
}

