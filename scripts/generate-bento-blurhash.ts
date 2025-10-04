/**
 * Generate BlurHash for Bento Box Videos
 * 
 * Run with: bun run scripts/generate-bento-blurhash.ts
 * 
 * This script:
 * 1. Extracts first frame from each bento video using ffmpeg
 * 2. Generates blurhash for each frame
 * 3. Outputs the blurhashes to console for copy/paste
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { encode } from 'blurhash';

const execAsync = promisify(exec);

const PUBLIC_DIR = join(process.cwd(), 'public', 'bento-vids');
const TEMP_DIR = join(PUBLIC_DIR, '.temp');

const videos = ['1.mp4', '2.mp4', '3.mp4', '4.mp4'];

async function extractFirstFrame(videoPath: string, outputPath: string): Promise<void> {
  try {
    // Check if ffmpeg is available
    try {
      await execAsync('ffmpeg -version');
    } catch {
      throw new Error('ffmpeg is not installed. Install it with: brew install ffmpeg');
    }

    // Extract first frame at 0.1 seconds (to avoid black frames)
    const command = `ffmpeg -ss 0.1 -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`;
    
    await execAsync(command);
    
    if (!existsSync(outputPath)) {
      throw new Error(`Failed to extract frame: ${outputPath} does not exist`);
    }
  } catch (error) {
    throw new Error(`Failed to extract frame from ${videoPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function generateBentoBlurHashes(): Promise<void> {
  console.log('🎬 Generating BlurHash for Bento Box videos...\n');

  // Create temp directory for extracted frames
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  const results: Array<{ src: string; blurhash: string }> = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i++) {
    const videoName = videos[i]!;
    const progress = `[${i + 1}/${videos.length}]`;
    
    try {
      console.log(`${progress} Processing: ${videoName}`);
      
      const videoPath = join(PUBLIC_DIR, videoName);
      const framePath = join(TEMP_DIR, `${videoName.replace('.mp4', '')}-frame.jpg`);
      
      // Check if video exists
      if (!existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
      }
      
      // Extract first frame
      console.log(`${progress}   → Extracting first frame with ffmpeg...`);
      await extractFirstFrame(videoPath, framePath);
      
      // Generate blurhash from the extracted frame
      console.log(`${progress}   → Generating blurhash...`);
      const { data, info } = await sharp(framePath)
        .resize(32, 32, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const blurhash = encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        4,
        3
      );
      
      console.log(`${progress}   → BlurHash: ${blurhash}`);
      
      results.push({
        src: `/bento-vids/${videoName}`,
        blurhash,
      });
      
      success++;
      console.log(`${progress}   ✅ Success!\n`);
    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${progress}   ❌ Failed: ${errorMsg}\n`);
    }
  }

  // Output results for copy/paste
  console.log('\n' + '='.repeat(60));
  console.log('🎉 BlurHash Generation Complete!');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (results.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 Copy this to bento-features.tsx:');
    console.log('='.repeat(60));
    console.log('\nconst bentoVideos = [');
    results.forEach((result, idx) => {
      const comma = idx < results.length - 1 ? ',' : '';
      console.log(`  { src: '${result.src}', blurhash: '${result.blurhash}' }${comma}`);
    });
    console.log('];');
  }
  
  console.log(`\n🧹 To clean up temp frames: rm -rf ${TEMP_DIR}`);
}

// Run it
generateBentoBlurHashes()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

