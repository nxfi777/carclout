/**
 * Test script to verify vehicle blurhash fetch endpoint works
 * Simulates what the UI does when fetching blurhashes
 */

import { getSurreal } from "@/lib/surrealdb";

async function testBlurhashFetch() {
  const db = await getSurreal();
  
  // Get a user with vehicle photos
  const userRes = await db.query(`
    SELECT email, vehicles FROM user 
    WHERE vehicles != NONE AND array::len(vehicles) > 0 
    LIMIT 1;
  `);
  
  const user = Array.isArray(userRes) && Array.isArray(userRes[0]) && userRes[0][0]
    ? (userRes[0][0] as { email: string; vehicles?: Array<{ photos?: string[] }> })
    : null;
  
  if (!user) {
    console.log('No users with vehicles found');
    process.exit(0);
  }
  
  console.log(`Testing blurhash fetch for user: ${user.email}`);
  
  // Get vehicle photo keys
  const keys: string[] = [];
  if (Array.isArray(user.vehicles)) {
    for (const vehicle of user.vehicles) {
      if (Array.isArray(vehicle.photos)) {
        keys.push(...vehicle.photos.filter((p): p is string => typeof p === 'string'));
      }
    }
  }
  
  console.log(`Found ${keys.length} vehicle photo keys`);
  
  if (keys.length === 0) {
    console.log('No vehicle photos found for this user');
    process.exit(0);
  }
  
  // Fetch blurhashes (simulate what the API does)
  const blurhashes: Record<string, { blurhash?: string; width?: number; height?: number }> = {};
  
  for (const key of keys) {
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
  }
  
  console.log(`\nBlurhash fetch results:`);
  console.log(`  Total keys: ${keys.length}`);
  console.log(`  With blurhash: ${Object.keys(blurhashes).length}`);
  console.log(`  Missing blurhash: ${keys.length - Object.keys(blurhashes).length}`);
  
  if (Object.keys(blurhashes).length > 0) {
    console.log(`\n✓ Blurhash fetch is working correctly!`);
    const sample = Object.entries(blurhashes)[0];
    console.log(`  Sample: ${sample[0].split('/').pop()}`);
    console.log(`    - blurhash: ${sample[1].blurhash?.substring(0, 20)}...`);
    console.log(`    - dimensions: ${sample[1].width}x${sample[1].height}`);
  }
  
  process.exit(0);
}

testBlurhashFetch().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

