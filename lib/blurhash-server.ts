/**
 * Server-side BlurHash generation
 * Only import this in API routes or server components
 */

import { encode } from 'blurhash';
import sharp from 'sharp';

/**
 * Generate BlurHash from image buffer
 * 
 * @param imageBuffer - Buffer containing image data
 * @param componentX - Horizontal components (4-9, default 4)
 * @param componentY - Vertical components (3-9, default 3)
 * @returns BlurHash string
 */
export async function generateBlurHash(
  imageBuffer: Buffer,
  componentX = 4,
  componentY = 3
): Promise<string> {
  try {
    // Resize image to small size for fast processing (32x32)
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blurHash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      componentX,
      componentY
    );

    return blurHash;
  } catch (error) {
    console.error('Error generating blurhash:', error);
    throw error;
  }
}

/**
 * Generate BlurHash from image URL
 * 
 * @param imageUrl - URL of the image to process
 * @param componentX - Horizontal components (default 4)
 * @param componentY - Vertical components (default 3)
 * @returns BlurHash string
 */
export async function generateBlurHashFromURL(
  imageUrl: string,
  componentX = 4,
  componentY = 3
): Promise<string> {
  try {
    // Fetch image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return await generateBlurHash(buffer, componentX, componentY);
  } catch (error) {
    console.error('Error generating blurhash from URL:', error);
    throw error;
  }
}

/**
 * Generate BlurHash from file path
 * 
 * @param filePath - Path to image file
 * @param componentX - Horizontal components (default 4)
 * @param componentY - Vertical components (default 3)
 * @returns BlurHash string
 */
export async function generateBlurHashFromFile(
  filePath: string,
  componentX = 4,
  componentY = 3
): Promise<string> {
  try {
    const buffer = await sharp(filePath)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const { width, height } = await sharp(filePath)
      .resize(32, 32, { fit: 'inside' })
      .metadata();

    const blurHash = encode(
      new Uint8ClampedArray(buffer),
      width || 32,
      height || 32,
      componentX,
      componentY
    );

    return blurHash;
  } catch (error) {
    console.error('Error generating blurhash from file:', error);
    throw error;
  }
}

