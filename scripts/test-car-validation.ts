/**
 * Test script for car image validation
 * 
 * Usage:
 *   bun run scripts/test-car-validation.ts <image-path>
 * 
 * Examples:
 *   bun run scripts/test-car-validation.ts test-images/car.jpg
 *   bun run scripts/test-car-validation.ts test-images/person.jpg
 *   bun run scripts/test-car-validation.ts test-images/rotated-car.jpg
 */

import { validateCarImage } from '@/lib/car-image-validation';
import fs from 'fs/promises';
import path from 'path';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function testValidation() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.yellow}Usage: bun run scripts/test-car-validation.ts <image-path>${colors.reset}`);
    console.log(`\nExample:`);
    console.log(`  bun run scripts/test-car-validation.ts test-car.jpg`);
    process.exit(1);
  }
  
  const imagePath = args[0];
  const fullPath = path.resolve(imagePath);
  
  console.log(`\n${colors.bright}🚗 Car Image Validation Test${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  try {
    // Check if file exists
    await fs.access(fullPath);
    console.log(`${colors.blue}📁 Reading image:${colors.reset} ${fullPath}`);
    
    // Read image buffer
    const buffer = await fs.readFile(fullPath);
    console.log(`${colors.blue}📊 Image size:${colors.reset} ${(buffer.length / 1024).toFixed(2)} KB\n`);
    
    // Test 1: Fast mode (EXIF + heuristics)
    console.log(`${colors.bright}Test 1: Fast Mode (EXIF + Heuristics)${colors.reset}`);
    console.log(`${colors.cyan}${'─'.repeat(40)}${colors.reset}`);
    const startFast = Date.now();
    
    const fastResult = await validateCarImage(buffer, 'test-fast', {
      minWidth: 400,
      minHeight: 400,
      // autoRotate disabled by default (EXIF unreliable)
    });
    
    const fastTime = Date.now() - startFast;
    printResult(fastResult, fastTime);
    
    // Test 2: Cloudflare AI mode (if configured)
    const hasCloudflare = process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN;
    
    if (hasCloudflare) {
      console.log(`\n${colors.bright}Test 2: Cloudflare AI Mode${colors.reset}`);
      console.log(`${colors.cyan}${'─'.repeat(40)}${colors.reset}`);
      const startCF = Date.now();
      
      const cfResult = await validateCarImage(buffer, 'test-cloudflare', {
        minWidth: 400,
        minHeight: 400,
        useCloudflareAI: true,
      });
      
      const cfTime = Date.now() - startCF;
      printResult(cfResult, cfTime);
    } else {
      console.log(`\n${colors.yellow}⚠️  Test 2: Cloudflare AI - SKIPPED${colors.reset}`);
      console.log(`   Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN to .env to enable`);
    }
    
    // Summary
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Summary${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    if (fastResult.correctedBuffer) {
      console.log(`${colors.green}✓${colors.reset} Image was auto-rotated based on EXIF data`);
    }
    
    if (fastResult.warnings && fastResult.warnings.length > 0) {
      console.log(`${colors.yellow}⚠${colors.reset}  ${fastResult.warnings.length} warning(s) detected`);
    }
    
    if (fastResult.isValid) {
      console.log(`${colors.green}${colors.bright}✓ VALIDATION PASSED${colors.reset}`);
    } else {
      console.log(`${colors.red}${colors.bright}✗ VALIDATION FAILED${colors.reset}`);
      console.log(`${colors.red}  Reason: ${fastResult.reason}${colors.reset}`);
    }
    
    console.log(); // Empty line at end
    
  } catch (error) {
    console.error(`${colors.red}${colors.bright}Error:${colors.reset} ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`\n${colors.yellow}File not found:${colors.reset} ${fullPath}`);
    }
    
    process.exit(1);
  }
}

function printResult(result: any, timeMs: number) {
  // Status
  const status = result.isValid
    ? `${colors.green}✓ PASSED${colors.reset}`
    : `${colors.red}✗ FAILED${colors.reset}`;
  
  console.log(`Status:      ${status}`);
  console.log(`Time:        ${colors.cyan}${timeMs}ms${colors.reset}`);
  
  // Detection info (if available)
  if (result.detectedObject) {
    console.log(`Detected:    ${colors.green}${result.detectedObject}${colors.reset}`);
  }
  
  if (result.confidence !== undefined) {
    const confidencePct = (result.confidence * 100).toFixed(1);
    const confidenceColor = result.confidence > 0.8 ? colors.green : result.confidence > 0.5 ? colors.yellow : colors.red;
    console.log(`Confidence:  ${confidenceColor}${confidencePct}%${colors.reset}`);
  }
  
  if (result.needsRotation) {
    console.log(`Rotation:    ${colors.yellow}Needs rotation (EXIF orientation ${result.needsRotation})${colors.reset}`);
  } else if (result.correctedBuffer) {
    console.log(`Rotation:    ${colors.green}Auto-corrected${colors.reset}`);
  }
  
  // Failure reason
  if (!result.isValid && result.reason) {
    console.log(`Reason:      ${colors.red}${result.reason}${colors.reset}`);
  }
  
  // Warnings
  if (result.warnings && result.warnings.length > 0) {
    console.log(`Warnings:    ${colors.yellow}${result.warnings.length} issue(s)${colors.reset}`);
    result.warnings.forEach((warning: string, i: number) => {
      console.log(`  ${colors.yellow}${i + 1}.${colors.reset} ${warning}`);
    });
  }
}

// Run tests
testValidation().catch(console.error);

