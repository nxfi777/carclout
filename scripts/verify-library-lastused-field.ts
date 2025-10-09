/**
 * Quick verification script to check if lastUsed field exists on library_image table
 * Run with: bun run scripts/verify-library-lastused-field.ts
 */

import { getSurreal } from '../lib/surrealdb';

async function verify() {
  try {
    const db = await getSurreal();
    
    // Try to query the field
    const result = await db.query(
      "INFO FOR TABLE library_image;"
    );
    
    console.log('Table info:', JSON.stringify(result, null, 2));
    
    // Check if any records have lastUsed
    const records = await db.query(
      "SELECT key, email, lastUsed FROM library_image LIMIT 5;"
    );
    
    console.log('\nSample records:', JSON.stringify(records, null, 2));
    
    if (Array.isArray(records) && Array.isArray(records[0])) {
      const hasLastUsed = records[0].some((r: any) => 'lastUsed' in r);
      if (hasLastUsed) {
        console.log('\n✅ lastUsed field exists and is accessible');
      } else {
        console.log('\n⚠️  lastUsed field may not be defined. Run the migration:');
        console.log('DEFINE FIELD lastUsed ON library_image TYPE option<datetime>;');
      }
    }
    
  } catch (error) {
    console.error('Error verifying field:', error);
    console.log('\n⚠️  Please run the migration:');
    console.log('DEFINE FIELD lastUsed ON library_image TYPE option<datetime>;');
  }
  
  process.exit(0);
}

verify();

