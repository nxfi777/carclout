#!/usr/bin/env bun

import { getSurreal } from '../lib/surrealdb';

async function testConnection() {
  console.log('🔌 Testing SurrealDB connection...\n');

  try {
    // Get the Surreal client
    const db = await getSurreal();
    console.log('✅ Successfully connected to SurrealDB');

    // Test basic query
    const infoResult = await db.query('INFO FOR DB;');
    console.log('\n📊 Database info:');
    console.log(JSON.stringify(infoResult, null, 2));

    // Test simple SELECT query
    const testQuery = await db.query('SELECT * FROM user LIMIT 5;');
    console.log('\n👥 Sample users (first 5):');
    console.log(JSON.stringify(testQuery, null, 2));

    // Get version
    const versionResult = await db.version();
    console.log('\n🔖 SurrealDB version:', versionResult);

    console.log('\n✨ Connection test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection test failed:');
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Unknown error:', error);
    }
    
    console.log('\n📝 Connection details:');
    console.log('URL:', process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc');
    console.log('Namespace:', process.env.SURREAL_NAMESPACE || 'carclout');
    console.log('Database:', process.env.SURREAL_DATABASE || 'carclout');
    console.log('Username:', process.env.SURREAL_USERNAME || 'root');
    
    console.log('\n💡 Make sure SurrealDB is running with:');
    console.log('   surreal start --user root --pass root');
    
    process.exit(1);
  }
}

testConnection();

