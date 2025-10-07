import fs from 'fs';
import { parse } from 'csv-parse/sync';

/**
 * Import affiliates from CSV to Resend audience via Retainly
 * 
 * Usage:
 *   bun run scripts/import-affiliates.ts path/to/affiliates.csv
 * 
 * CSV format:
 *   email,first_name,last_name
 *   john@example.com,John,Doe
 */

const RETAINLY_URL = process.env.RETAINLY_URL || 'http://localhost:3001';
const AUDIENCE_ID = process.env.AUDIENCE_ID || process.env.PROD_AUDIENCE_ID;

interface AffiliateRecord {
  email: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  [key: string]: any;
}

async function importAffiliates(csvPath: string, audienceId: string) {
  console.log('🚀 Starting affiliate import...\n');
  
  // Read CSV file
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records: AffiliateRecord[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`📄 Found ${records.length} records in CSV`);
  
  // Validate records
  const validRecords = records.filter(r => {
    if (!r.email) {
      console.warn(`⚠️  Skipping record without email:`, r);
      return false;
    }
    return true;
  });
  
  if (validRecords.length === 0) {
    throw new Error('No valid records found in CSV');
  }
  
  console.log(`✅ ${validRecords.length} valid records to import\n`);
  
  // Batch contacts (Resend recommends batches of 100)
  const batchSize = 100;
  const batches: AffiliateRecord[][] = [];
  
  for (let i = 0; i < validRecords.length; i += batchSize) {
    batches.push(validRecords.slice(i, i + batchSize));
  }
  
  console.log(`📦 Importing in ${batches.length} batches of ${batchSize}...\n`);
  
  let totalSuccess = 0;
  let totalFailed = 0;
  const failedEmails: string[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const contacts = batch.map((row) => ({
      email: row.email,
      firstName: row.first_name || row.firstName || '',
      lastName: row.last_name || row.lastName || '',
    }));
    
    try {
      const response = await fetch(`${RETAINLY_URL}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audienceId,
          contacts,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const result = await response.json();
      totalSuccess += result.successful || 0;
      totalFailed += result.failed || 0;
      
      // Track failed emails
      if (result.results) {
        result.results.forEach((r: any) => {
          if (!r.success) {
            failedEmails.push(r.email);
          }
        });
      }
      
      const progress = ((i + 1) / batches.length * 100).toFixed(1);
      console.log(
        `[${i + 1}/${batches.length}] ${progress}% - ` +
        `✅ ${result.successful || 0} success, ❌ ${result.failed || 0} failed`
      );
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error instanceof Error ? error.message : error);
      totalFailed += batch.length;
      batch.forEach(r => failedEmails.push(r.email));
    }
    
    // Rate limiting: wait 100ms between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Complete!');
  console.log('='.repeat(50));
  console.log(`Total records: ${validRecords.length}`);
  console.log(`✅ Success: ${totalSuccess} (${(totalSuccess / validRecords.length * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${totalFailed} (${(totalFailed / validRecords.length * 100).toFixed(1)}%)`);
  
  if (failedEmails.length > 0) {
    console.log('\n⚠️  Failed emails:');
    failedEmails.slice(0, 10).forEach(email => console.log(`  - ${email}`));
    if (failedEmails.length > 10) {
      console.log(`  ... and ${failedEmails.length - 10} more`);
    }
  }
  
  console.log('\n✨ Done!');
}

// Parse command line arguments
const csvPath = process.argv[2];
const audienceIdArg = process.argv[3];

if (!csvPath) {
  console.error('❌ Error: CSV path is required\n');
  console.log('Usage: bun run scripts/import-affiliates.ts <csv-path> [audience-id]\n');
  console.log('Examples:');
  console.log('  bun run scripts/import-affiliates.ts ~/affiliates.csv');
  console.log('  bun run scripts/import-affiliates.ts ~/affiliates.csv aud_abc123');
  console.log('  AUDIENCE_ID=aud_abc123 bun run scripts/import-affiliates.ts ~/affiliates.csv\n');
  process.exit(1);
}

const audienceId = audienceIdArg || AUDIENCE_ID;

if (!audienceId) {
  console.error('❌ Error: Audience ID is required\n');
  console.log('Provide audience ID either as:');
  console.log('  1. Command line argument: bun run scripts/import-affiliates.ts file.csv aud_abc123');
  console.log('  2. Environment variable: AUDIENCE_ID=aud_abc123 bun run scripts/import-affiliates.ts file.csv\n');
  process.exit(1);
}

// Run import
importAffiliates(csvPath, audienceId).catch(error => {
  console.error('\n❌ Import failed:', error);
  process.exit(1);
});

