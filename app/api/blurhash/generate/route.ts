import { NextRequest, NextResponse } from 'next/server';
import { generateBlurHashFromURL } from '@/lib/blurhash-server';

/**
 * API Route: Generate BlurHash from image URL
 * POST /api/blurhash/generate
 * 
 * Body: { imageUrl: string }
 * Returns: { blurhash: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageUrl = body?.imageUrl as string;

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl is required' },
        { status: 400 }
      );
    }

    // Generate blurhash
    const blurhash = await generateBlurHashFromURL(imageUrl);

    return NextResponse.json({ blurhash });
  } catch (error) {
    console.error('Error generating blurhash:', error);
    return NextResponse.json(
      { error: 'Failed to generate blurhash' },
      { status: 500 }
    );
  }
}

