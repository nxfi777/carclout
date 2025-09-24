import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

// Credit economics
export const PRICE_PER_CREDIT_USD = 0.01; // 1 credit = $0.01 to the user
export const CREDITS_PER_DOLLAR = Math.round(1 / PRICE_PER_CREDIT_USD); // 100

// Operation pricing in credits (≥50% margin over vendor cost)
// - Nano Banana generation cost ~$0.039 ⇒ charge 6 credits ($0.06) ~54% margin
export const GENERATION_CREDITS_PER_IMAGE = 6;
// - BiRefNet (rembg) ~0.00666 avg ⇒ charge 1 credit ($0.01) ~50% margin
export const REMBG_CREDITS_PER_CALL = 1;
// - Upscale (SeedVR2) flat: $0.0005 per compute second. Our flat charge: 1 credit per call
export const UPSCALE_CREDITS_PER_CALL = 1;
// - Streak restore: +25 credits per missed day
export const STREAK_RESTORE_CREDITS_PER_DAY = 25;

export function estimateUpscaleCredits(_originalWidth: number, _originalHeight: number, _upscaleFactor: number): number {
  // Flat pricing for UI estimation
  return UPSCALE_CREDITS_PER_CALL;
}

export function actualUpscaleCredits(_finalWidth: number, _finalHeight: number): number {
  // Flat post-success charge
  return UPSCALE_CREDITS_PER_CALL;
}

export async function getUserRecordIdByEmail(email: string): Promise<RecordId<"user"> | null> {
  const db = await getSurreal();
  const r = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { id?: unknown } | undefined) : undefined;
  const rid = row?.id instanceof RecordId
    ? (row.id as RecordId<"user">)
    : (typeof (row?.id as unknown) === 'string' ? new RecordId("user", String(row!.id as string)) : null);
  return rid;
}

export async function getCreditsBalance(email: string): Promise<number> {
  const db = await getSurreal();
  const r = await db.query("SELECT credits_balance FROM user WHERE email = $email LIMIT 1;", { email });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { credits_balance?: number } | undefined) : undefined;
  return typeof row?.credits_balance === "number" ? row!.credits_balance! : 0;
}

export async function adjustCredits(email: string, delta: number, reason: string, ref?: string | null) {
  const db = await getSurreal();
  const rid = await getUserRecordIdByEmail(email);
  if (!rid) throw new Error("User not found for credits adjustment");
  const nowIso = new Date().toISOString();
  // Update balance and insert ledger entry
  await db.query(
    `UPDATE user SET credits_balance = (credits_balance ?? 0) + $delta WHERE id = $rid;
     CREATE credit_txn SET user = $rid, delta = $delta, reason = $reason, ref = $ref, created_at = d"${nowIso}";`,
    { rid, delta, reason, ref: ref || null }
  );
}

export async function requireAndReserveCredits(email: string, cost: number, reason: string, ref?: string | null) {
  if (cost <= 0) return; // nothing to reserve
  const db = await getSurreal();
  const rid = await getUserRecordIdByEmail(email);
  if (!rid) throw new Error("User not found");
  const r = await db.query("SELECT credits_balance FROM user WHERE id = $rid LIMIT 1;", { rid });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { credits_balance?: number } | undefined) : undefined;
  const bal = typeof row?.credits_balance === "number" ? row!.credits_balance! : 0;
  if (bal < cost) {
    throw new Error("INSUFFICIENT_CREDITS");
  }
  await adjustCredits(email, -cost, `reserve:${reason}`, ref || null);
}

export function includedMonthlyCreditsForPlan(plan: "basic" | "pro" | "ultra" | "$1" | "$20" | "$200"): number {
  // Map the app's 3 plans ($1, $20, $200) to included monthly credits.
  // We price credits at $0.01, with bigger plan bonuses for CX while keeping margins safe.
  switch (plan) {
    case "$1":
    case "basic":
      return 50; // $1 ⇒ 50 credits → ~8 generations at 6 credits/image
    case "$20":
    case "pro":
      return 1200; // $20 ⇒ 1,200 credits → ~200 generations
    case "$200":
    case "ultra":
      return 12000; // $200 ⇒ 12,000 credits → ~2,000 generations
    default:
      return 0;
  }
}


// Video pricing helpers
export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto';
export type VideoProvider = 'seedance' | 'kling2_5';

export const DEFAULT_VIDEO_FPS = 24; // aligns with ~ $0.62 for 1080p 5s
export const VIDEO_VENDOR_USD_PER_MILLION_TOKENS = 2.5; // vendor guidance
export const VIDEO_MARKUP_MULTIPLIER = 1.5; // ~50% margin similar to image pricing

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
    // Assume 16:9 when unknown
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
  // tokens(video) = (height x width x FPS x duration) / 1024
  const tokens = (height * width * framesPerSecond * dur) / 1024;
  return Math.max(1, Math.round(tokens));
}

export function estimateVideoVendorUsd(
  resolution: VideoResolution,
  durationSeconds: number,
  fps: number = DEFAULT_VIDEO_FPS,
  aspect: VideoAspectRatio = 'auto',
  provider: VideoProvider = 'seedance'
): number {
  if (provider === 'kling2_5') {
    // Kling flat rate: $0.35 per 5 seconds block
    const blocks = Math.max(1, Math.ceil(Math.max(1, Math.round(durationSeconds)) / 5));
    const usd = 0.35 * blocks;
    return Math.max(0, usd);
  }
  const tokens = estimateVideoTokens(resolution, durationSeconds, fps, aspect);
  const usd = (tokens / 1_000_000) * VIDEO_VENDOR_USD_PER_MILLION_TOKENS;
  return Math.max(0, usd);
}

export function estimateVideoCredits(
  resolution: VideoResolution,
  durationSeconds: number,
  fps: number = DEFAULT_VIDEO_FPS,
  aspect: VideoAspectRatio = 'auto',
  provider: VideoProvider = 'seedance'
): number {
  const usd = estimateVideoVendorUsd(resolution, durationSeconds, fps, aspect, provider);
  const withMargin = usd * VIDEO_MARKUP_MULTIPLIER;
  const credits = Math.ceil(withMargin * CREDITS_PER_DOLLAR);
  return Math.max(1, credits);
}


// Idempotent post-success charge: deduct credits only once for a unique ref
export async function chargeCreditsOnce(email: string, amount: number, reason: string, ref: string): Promise<void> {
  if (amount <= 0) return;
  const db = await getSurreal();
  const rid = await getUserRecordIdByEmail(email);
  if (!rid) throw new Error("User not found");
  const reasonTag = `charge:${reason}`;
  // Idempotency: if we already charged with this (ref, reason), skip
  const existsRes = await db.query("SELECT id FROM credit_txn WHERE ref = $ref AND reason = $reason LIMIT 1;", { ref, reason: reasonTag });
  const existsRow = Array.isArray(existsRes) && Array.isArray(existsRes[0]) ? (existsRes[0][0] as { id?: unknown } | undefined) : undefined;
  if (existsRow) return;

  // Atomic balance decrement only if sufficient funds
  const updateRes = await db.query(
    "UPDATE user SET credits_balance = (credits_balance ?? 0) - $amount WHERE id = $rid AND (credits_balance ?? 0) >= $amount RETURN AFTER;",
    { rid, amount }
  );
  const updated = Array.isArray(updateRes) && Array.isArray(updateRes[0]) ? (updateRes[0][0] as { credits_balance?: number } | undefined) : undefined;
  if (!updated) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  // Record ledger entry
  const nowIso = new Date().toISOString();
  await db.query(
    `CREATE credit_txn SET user = $rid, delta = -$amount, reason = $reason, ref = $ref, created_at = d"${nowIso}";`,
    { rid, amount, reason: reasonTag, ref }
  );
}


