import { getSurreal } from "@/lib/surrealdb";

async function checkBlurhashes() {
  const db = await getSurreal();
  
  // Count total vehicle photos
  const countRes = await db.query("SELECT count() FROM vehicle_photo GROUP ALL;");
  const count = Array.isArray(countRes) && Array.isArray(countRes[0]) && countRes[0][0] 
    ? (countRes[0][0] as { count?: number }).count 
    : 0;
  
  console.log(`Total vehicle_photo records: ${count}`);
  
  // Count by user
  const byUserRes = await db.query("SELECT email, count() as photo_count FROM vehicle_photo GROUP BY email;");
  const byUser = Array.isArray(byUserRes) && Array.isArray(byUserRes[0]) 
    ? byUserRes[0]
    : [];
  
  console.log(`\nTotal users with vehicle photo blurhashes: ${byUser.length}`);
  
  // Sample a few records
  const sampleRes = await db.query("SELECT email, key, blurhash FROM vehicle_photo LIMIT 10;");
  const samples = Array.isArray(sampleRes) && Array.isArray(sampleRes[0]) 
    ? sampleRes[0]
    : [];
  
  console.log('\nSample records:');
  for (const sample of samples) {
    const s = sample as { email?: string; key?: string; blurhash?: string };
    console.log(`  - ${s.email}: ${s.key?.split('/').pop()} -> ${s.blurhash ? '✓ has blurhash' : '✗ missing'}`);
  }
  
  process.exit(0);
}

checkBlurhashes().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

