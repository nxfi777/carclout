/**
 * Server-side video BlurHash generation
 * Only import this in API routes or server components
 */

import { encode } from 'blurhash';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Extract first frame from video buffer and generate BlurHash
 * 
 * @param videoBuffer - Buffer containing video data
 * @param componentX - Horizontal components (4-9, default 4)
 * @param componentY - Vertical components (3-9, default 3)
 * @returns Object with blurhash, width, height, and duration
 */
export async function generateVideoBlurHash(
  videoBuffer: Buffer,
  componentX = 4,
  componentY = 3
): Promise<{ blurhash: string; width?: number; height?: number; duration?: number }> {
  const tempDir = join(tmpdir(), 'video-blurhash');
  const videoPath = join(tempDir, `temp-${Date.now()}.mp4`);
  const framePath = join(tempDir, `frame-${Date.now()}.jpg`);

  try {
    // Ensure temp directory exists
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Write video buffer to temp file
    await writeFile(videoPath, videoBuffer);

    // Extract first frame and get video info using ffmpeg
    const { width, height, duration } = await extractFirstFrame(videoPath, framePath);

    // Generate blurhash from the extracted frame
    const { data, info } = await sharp(framePath, { autoOrient: false })
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blurhash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      componentX,
      componentY
    );

    return { blurhash, width, height, duration };
  } catch (error) {
    console.error('Error generating video blurhash:', error);
    throw error;
  } finally {
    // Clean up temp files
    try {
      if (existsSync(videoPath)) await unlink(videoPath);
      if (existsSync(framePath)) await unlink(framePath);
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
  }
}

/**
 * Extract first frame from video file using ffmpeg
 * 
 * @param videoPath - Path to video file
 * @param outputPath - Path to save extracted frame
 * @returns Video metadata (width, height, duration)
 */
async function extractFirstFrame(
  videoPath: string,
  outputPath: string
): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve, reject) => {
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;

    // First, get video metadata
    const probe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'csv=p=0',
      videoPath
    ]);

    let probeOutput = '';
    probe.stdout.on('data', (data) => {
      probeOutput += data.toString();
    });

    probe.on('close', (code) => {
      if (code === 0 && probeOutput) {
        const parts = probeOutput.trim().split(',');
        if (parts[0]) width = parseInt(parts[0], 10);
        if (parts[1]) height = parseInt(parts[1], 10);
        if (parts[2]) duration = parseFloat(parts[2]);
      }

      // Extract first frame
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vframes', '1',
        '-f', 'image2',
        '-y',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (frameCode) => {
        if (frameCode !== 0) {
          reject(new Error(`ffmpeg failed: ${stderr}`));
        } else {
          resolve({ width, height, duration });
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });
    });

    probe.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}

