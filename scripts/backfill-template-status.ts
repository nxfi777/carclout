#!/usr/bin/env bun
/**
 * Backfill script to set all templates without a status to 'public'
 * Run with: bun run scripts/backfill-template-status.ts
 */

import { getSurreal } from "@/lib/surrealdb";

async function backfillTemplateStatus() {
  console.log("🚀 Starting template status backfill...");
  
  const db = await getSurreal();
  
  try {
    // Update all templates where status is NONE or not set to 'public'
    const query = `UPDATE template SET status = 'public' WHERE status IS NONE OR status IS NULL;`;
    const result = await db.query(query);
    
    console.log("✅ Backfill complete!");
    console.log("Result:", result);
    
    // Verify the update
    const verifyQuery = `SELECT id, name, status FROM template LIMIT 100;`;
    const templates = await db.query(verifyQuery);
    const templateList = Array.isArray(templates) && Array.isArray(templates[0]) ? templates[0] : [];
    
    console.log("\n📋 Template status summary:");
    console.log(`Total templates checked: ${templateList.length}`);
    
    const statusCounts = templateList.reduce((acc: Record<string, number>, t: any) => {
      const status = t?.status || 'none';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    console.log("Status breakdown:", statusCounts);
    
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    throw error;
  } finally {
    await db.close();
  }
}

backfillTemplateStatus()
  .then(() => {
    console.log("\n✨ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });

