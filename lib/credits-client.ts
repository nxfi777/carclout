// Client-safe credit estimation helpers (no DB access)

export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto';
export type VideoProvider = 'seedance' | 'kling2_5';

export const PRICE_PER_CREDIT_USD = 0.001; // 1 credit = $0.001 (10x scale)
export const CREDITS_PER_DOLLAR = Math.round(1 / PRICE_PER_CREDIT_USD); // 1000

export const DEFAULT_VIDEO_FPS = 24;
export const VIDEO_VENDOR_USD_PER_MILLION_TOKENS = 2.5;
export const VIDEO_MARKUP_MULTIPLIER = 2.25; // ~125% margin aligned with image pricing

function heightForResolution(resolution: VideoResolution): number {
  switch (resolution) {
    case '480p': return 480;
    case '720p': return 720;
    case '1080p':
    default: return 1080;
  }
}

function ratioTuple(ar: Exclude<VideoAspectRatio, 'auto'>): [number, number] {
  switch (ar) {
    case '21:9': return [21, 9];
    case '16:9': return [16, 9];
    case '4:3': return [4, 3];
    case '1:1': return [1, 1];
    case '3:4': return [3, 4];
    case '9:16':
    default: return [9, 16];
  }
}

function dimsFor(resolution: VideoResolution, aspect: VideoAspectRatio): { width: number; height: number } {
  const h = heightForResolution(resolution);
  if (aspect === 'auto') {
    const w = Math.round(h * (16 / 9));
    return { width: w, height: h };
  }
  const [rw, rh] = ratioTuple(aspect);
  const w = Math.round(h * (rw / rh));
  return { width: Math.max(1, w), height: h };
}

export function estimateVideoTokens(
  resolution: VideoResolution,
  durationSeconds: number,
  fps: number = DEFAULT_VIDEO_FPS,
  aspect: VideoAspectRatio = 'auto'
): number {
  const { width, height } = dimsFor(resolution, aspect);
  const dur = Math.max(1, Math.round(durationSeconds));
  const framesPerSecond = Math.max(1, Math.round(fps));
  return Math.max(1, Math.round((height * width * framesPerSecond * dur) / 1024));
}

export function estimateVideoVendorUsd(
  resolution: VideoResolution,
  durationSeconds: number,
  fps: number = DEFAULT_VIDEO_FPS,
  aspect: VideoAspectRatio = 'auto',
  provider: VideoProvider = 'seedance'
): number {
  if (provider === 'kling2_5') {
    const blocks = Math.max(1, Math.ceil(Math.max(1, Math.round(durationSeconds)) / 5));
    return Math.max(0, 0.35 * blocks);
  }
  const tokens = estimateVideoTokens(resolution, durationSeconds, fps, aspect);
  return Math.max(0, (tokens / 1_000_000) * VIDEO_VENDOR_USD_PER_MILLION_TOKENS);
}

export function estimateVideoCredits(
  resolution: VideoResolution,
  durationSeconds: number,
  fps: number = DEFAULT_VIDEO_FPS,
  aspect: VideoAspectRatio = 'auto',
  provider: VideoProvider = 'seedance'
): number {
  const usd = estimateVideoVendorUsd(resolution, durationSeconds, fps, aspect, provider) * VIDEO_MARKUP_MULTIPLIER;
  const credits = Math.ceil(usd * CREDITS_PER_DOLLAR);
  return Math.max(1, credits);
}


