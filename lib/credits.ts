import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

// Credit economics (10x scale for granular pricing)
export const PRICE_PER_CREDIT_USD = 0.001; // 1 credit = $0.001 to the user (10x scale)
export const CREDITS_PER_DOLLAR = Math.round(1 / PRICE_PER_CREDIT_USD); // 1000

// Operation pricing in credits (≥50% margin over vendor cost)
// 10x scale for pricing flexibility - allows granular pricing and future model tiers
// - Nano Banana generation cost ~$0.039 ⇒ charge 90 credits ($0.09) ~131% margin
export const GENERATION_CREDITS_PER_IMAGE = 90;
// - BiRefNet (rembg) ~0.00666 avg ⇒ charge 10 credits ($0.01) ~50% margin
export const REMBG_CREDITS_PER_CALL = 10;
// - Upscale (SeedVR2) flat: $0.0005 per compute second. Our flat charge: 20 credits per call
export const UPSCALE_CREDITS_PER_CALL = 20;
// - Streak restore: +250 credits per missed day
export const STREAK_RESTORE_CREDITS_PER_DAY = 250;

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
  
  // Check if auto-reload should be triggered after credit deduction
  if (delta < 0) {
    try {
      await checkAndTriggerAutoReload(email);
    } catch (e) {
      console.error("Auto-reload check failed:", e);
      // Don't throw - auto-reload failure shouldn't block the main operation
    }
  }
}

export async function checkAndTriggerAutoReload(email: string): Promise<void> {
  const db = await getSurreal();
  
  // Get user's auto-reload settings and current balance
  const res = await db.query(
    "SELECT credits_balance, auto_reload_enabled, auto_reload_threshold, auto_reload_amount FROM user WHERE email = $email LIMIT 1;",
    { email }
  );
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
  
  if (!row) return;
  
  const enabled = row.auto_reload_enabled === true;
  const balance = typeof row.credits_balance === "number" ? row.credits_balance : 0;
  const threshold = typeof row.auto_reload_threshold === "number" ? row.auto_reload_threshold : 100;
  const amount = typeof row.auto_reload_amount === "number" ? row.auto_reload_amount : 10;
  
  // Only proceed if auto-reload is enabled and balance is below threshold
  if (!enabled || balance >= threshold || amount < 5) return;
  
  // Import stripe here to avoid circular dependencies
  const { stripe } = await import("@/lib/stripe");
  
  // Get plan for differential credit rates
  const planRes = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email });
  const planRow = Array.isArray(planRes) && Array.isArray(planRes[0]) ? (planRes[0][0] as { plan?: string }) : null;
  const currentPlan = planRow?.plan as "minimum" | "pro" | null;
  
  const ratePerDollar = currentPlan === "pro" ? CREDITS_PER_DOLLAR : Math.floor(2500 / 5); // 1000 or 500
  const credits = amount * ratePerDollar;
  
  try {
    // Create payment intent for auto-reload
    // We'll use Stripe's automatic payment with saved payment method
    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      console.log(`No Stripe customer found for ${email}, skipping auto-reload`);
      return;
    }
    
    const customer = customers.data[0];
    
    // Get default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
      limit: 1,
    });
    
    if (paymentMethods.data.length === 0) {
      console.log(`No payment method found for ${email}, skipping auto-reload`);
      return;
    }
    
    // Create payment intent with automatic confirmation
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      customer: customer.id,
      payment_method: paymentMethods.data[0].id,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        intent: "auto_reload",
        credits: String(credits),
        amount_usd: String(amount),
        userEmail: email,
        planAtPurchase: currentPlan || "minimum",
      },
      description: `Auto-reload: ${credits} credits`,
    });
    
    // If payment succeeded immediately, add credits
    if (paymentIntent.status === "succeeded") {
      await adjustCredits(email, credits, "auto_reload", paymentIntent.id);
      console.log(`Auto-reload succeeded for ${email}: ${credits} credits added`);
    }
  } catch (e) {
    console.error("Failed to process auto-reload:", e);
    // Don't throw - we don't want to interrupt the user's workflow
  }
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

export function includedMonthlyCreditsForPlan(plan: "minimum" | "pro" | "ultra" | "$1" | "$20" | "$200"): number {
  // Map the app's plans to included monthly credits.
  // Credit allocation based on $17/mo Pro = 13,900 credits (817.65 credits per dollar)
  switch (plan) {
    case "$1":
    case "minimum":
      return 1100; // $1 ⇒ 1100 credits → ~11 generations at 100 credits/image (90 gen + 10 cutout)
    case "$20":
    case "pro":
      return 13900; // $17/mo ⇒ 13,900 credits → ~139 generations at 100 credits/image
    case "$200":
    case "ultra":
      return 26165; // $32/mo (yearly) ⇒ 26,165 credits → ~261 generations + video features
    default:
      return 0;
  }
}


// Video pricing helpers
export type VideoResolution = 'auto' | '480p' | '720p' | '1080p';
export type VideoAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto';
export type VideoProvider = 'seedance' | 'kling2_5' | 'sora2' | 'sora2_pro';

export const DEFAULT_VIDEO_FPS = 24; // aligns with ~ $0.62 for 1080p 5s
export const VIDEO_VENDOR_USD_PER_MILLION_TOKENS = 2.5; // vendor guidance
export const VIDEO_MARKUP_MULTIPLIER = 2.25; // ~125% margin aligned with image pricing
// Sora 2 pricing
export const SORA2_VENDOR_USD_PER_SECOND = 0.1; // our cost
export const SORA2_USER_USD_PER_SECOND = 0.25; // user charge target => 250 credits/sec
// Sora 2 Pro pricing (720p)
export const SORA2_PRO_VENDOR_USD_PER_SECOND = 0.30; // our cost for 720p
export const SORA2_PRO_USER_USD_PER_SECOND = 0.75; // user charge target => 750 credits/sec (2.5x markup)

function heightForResolution(resolution: VideoResolution): number {
  switch (resolution) {
    case 'auto':
      return 1080;
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
  if (provider === 'sora2') {
    // Sora 2 flat vendor rate: $0.1 per second
    const duration = Math.max(1, Math.round(durationSeconds));
    const usd = SORA2_VENDOR_USD_PER_SECOND * duration;
    return Math.max(0, usd);
  }
  if (provider === 'sora2_pro') {
    // Sora 2 Pro flat vendor rate: $0.30 per second (720p)
    const duration = Math.max(1, Math.round(durationSeconds));
    const usd = SORA2_PRO_VENDOR_USD_PER_SECOND * duration;
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
  const withMargin = provider === 'sora2'
    ? Math.max(0, SORA2_USER_USD_PER_SECOND * Math.max(1, Math.round(durationSeconds)))
    : provider === 'sora2_pro'
    ? Math.max(0, SORA2_PRO_USER_USD_PER_SECOND * Math.max(1, Math.round(durationSeconds)))
    : usd * VIDEO_MARKUP_MULTIPLIER;
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


