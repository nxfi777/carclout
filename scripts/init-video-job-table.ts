/**
 * Initialize video_job table in SurrealDB
 * Run with: bun run scripts/init-video-job-table.ts
 */

import { getSurreal } from '@/lib/surrealdb';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initSchema() {
  try {
    console.log('Initializing video_job table schema...');
    
    const db = await getSurreal();
    
    // Read the schema file
    const schemaPath = join(process.cwd(), 'scripts', 'video-job-table.surql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Split into individual statements and execute
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    for (const statement of statements) {
      await db.query(statement);
      console.log('✓ Executed:', statement.substring(0, 60) + '...');
    }
    
    console.log('\n✅ video_job table schema initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to initialize schema:', error);
    process.exit(1);
  }
}

initSchema();

