import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";

/**
 * Fetch blurhashes for vehicle photos
 * 
 * POST /api/storage/vehicle-blurhashes
 * Body: { keys: string[] }
 * 
 * Returns: { blurhashes: Record<string, { blurhash: string; width: number; height: number; }> }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const keys = Array.isArray(body?.keys) ? body.keys.filter((k: unknown) => typeof k === 'string') : [];

    if (!keys.length) {
      return NextResponse.json({ blurhashes: {} });
    }

    const db = await getSurreal();
    
    // Fetch blurhashes for all requested keys
    const blurhashes: Record<string, { blurhash?: string; width?: number; height?: number }> = {};
    
    for (const key of keys) {
      try {
        const res = await db.query(
          "SELECT blurhash, width, height FROM vehicle_photo WHERE key = $key AND email = $email LIMIT 1;",
          { key, email: user.email }
        );
        
        const row = Array.isArray(res) && Array.isArray(res[0]) && res[0][0]
          ? (res[0][0] as { blurhash?: string; width?: number; height?: number })
          : null;

        if (row?.blurhash) {
          blurhashes[key] = {
            blurhash: row.blurhash,
            width: row.width,
            height: row.height,
          };
        }
      } catch (error) {
        console.error(`Failed to fetch blurhash for ${key}:`, error);
        // Continue with other keys
      }
    }

    return NextResponse.json({ blurhashes });
  } catch (error) {
    console.error('Vehicle blurhashes fetch error:', error);
    return NextResponse.json({ error: "Failed to fetch blurhashes" }, { status: 500 });
  }
}

