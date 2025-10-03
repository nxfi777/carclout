/**
 * Generate BlurHash for "How It Works" videos
 * 
 * Run: bun run scripts/generate-video-blurhash.ts
 */

import { generateBlurHash } from '@/lib/blurhash-server';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const VIDEOS = [
  { name: 'part1', title: 'Pick a Template' },
  { name: 'part2', title: 'Upload Your Car' },
  { name: 'part3', title: 'Post & Go Viral' },
];

async function extractVideoFrame(videoPath: string, outputPath: string) {
  // Use ffmpeg to extract first frame
  const cmd = `ffmpeg -i "${videoPath}" -vframes 1 -f image2 "${outputPath}" -y`;
  
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error(`Failed to extract frame from ${videoPath}:`, error);
    return false;
  }
}

async function generateBlurhashForVideo(videoName: string, title: string) {
  const videoPath = path.join(process.cwd(), 'public', 'how-it-works', `${videoName}.mp4`);
  const tempDir = path.join(process.cwd(), '.temp');
  const framePath = path.join(tempDir, `${videoName}-frame.jpg`);
  
  if (!existsSync(videoPath)) {
    console.log(`❌ Video not found: ${videoPath}`);
    return null;
  }

  // Create temp directory
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  console.log(`📹 Processing ${title} (${videoName}.mp4)...`);
  
  // Extract frame
  const extracted = await extractVideoFrame(videoPath, framePath);
  if (!extracted) {
    return null;
  }

  try {
    // Read frame and generate blurhash
    const imageBuffer = await sharp(framePath).toBuffer();
    const blurhash = await generateBlurHash(imageBuffer, 4, 3);
    
    console.log(`✅ ${title}: ${blurhash}`);
    return blurhash;
  } catch (error) {
    console.error(`Failed to generate blurhash for ${videoName}:`, error);
    return null;
  }
}

async function main() {
  console.log('🎬 Generating BlurHash values for "How It Works" videos\n');
  console.log('Prerequisites: ffmpeg must be installed (brew install ffmpeg)\n');

  const results: { name: string; title: string; blurhash: string | null }[] = [];

  for (const video of VIDEOS) {
    const blurhash = await generateBlurhashForVideo(video.name, video.title);
    results.push({ ...video, blurhash });
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 Copy these values to components/how-it-works-carousel.tsx:');
  console.log('='.repeat(60) + '\n');

  results.forEach(({ name, title, blurhash }) => {
    console.log(`// ${title} (${name}.mp4)`);
    console.log(`blurhash: "${blurhash || 'GENERATION_FAILED'}",\n`);
  });

  console.log('\nReplace the placeholder blurhash values in the videos array!');
}

main().catch(console.error);

