import { listAllObjects } from "@/lib/r2";
import { sanitizeUserId } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";

const GB = 1024 ** 3;
const TB = 1024 ** 4;

type StorageAddOn = {
  id?: unknown;
  user?: unknown;
  bytes: number;
  purchased_at: string;
  expires_at?: string | null;
  source: "purchase" | "xp_redemption";
};

/**
 * Get storage limit in bytes for a given plan, including any purchased add-ons
 */
export async function getStorageLimitBytes(
  email: string,
  plan?: string | null
): Promise<number> {
  // Base limits by plan
  const p = (plan || "base").toLowerCase();
  const baseLimit = p === "ultra" ? 1 * TB : p === "premium" ? 100 * GB : 1 * GB;

  // For premium users, add any purchased storage add-ons
  if (p === "premium") {
    try {
      const db = await getSurreal();
      const res = await db.query(
        `SELECT bytes FROM storage_addon WHERE user.email = $email AND (expires_at IS NONE OR expires_at > time::now());`,
        { email }
      );
      const addOns = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as StorageAddOn[]) : [];
      const addOnBytes = addOns.reduce((sum, addon) => sum + (addon.bytes || 0), 0);
      return baseLimit + addOnBytes;
    } catch (e) {
      console.error("[storage] Failed to fetch add-ons:", e);
      // Fall back to base limit if query fails
    }
  }

  return baseLimit;
}

/**
 * Get current storage usage in bytes for a user
 */
export async function getStorageUsageBytes(email: string): Promise<number> {
  const cleanUser = sanitizeUserId(email);
  const root = `users/${cleanUser}`;
  const objects = await listAllObjects(root.endsWith("/") ? root : `${root}/`);
  return objects.reduce((acc, o) => acc + (o.Size || 0), 0);
}

/**
 * Check if user has sufficient storage space for incoming bytes
 * Returns { ok: true } if space available, or { ok: false, error: string } if not
 */
export async function validateStorageSpace(
  email: string,
  incomingBytes: number,
  plan?: string | null
): Promise<{ ok: boolean; error?: string; used?: number; limit?: number; remaining?: number }> {
  try {
    const [usedBytes, limitBytes] = await Promise.all([
      getStorageUsageBytes(email),
      getStorageLimitBytes(email, plan),
    ]);

    const remaining = limitBytes - usedBytes;
    
    if (usedBytes + incomingBytes > limitBytes) {
      const planName = (plan || "base").toLowerCase();
      
      // Different messages based on plan
      if (planName === "base") {
        return {
          ok: false,
          error: "Storage limit exceeded. Upgrade to Premium for 100× more storage, or download and delete files to free up space.",
          used: usedBytes,
          limit: limitBytes,
          remaining,
        };
      } else if (planName === "premium") {
        return {
          ok: false,
          error: "Storage limit exceeded. Purchase additional storage or redeem XP for storage upgrades in your Billing settings.",
          used: usedBytes,
          limit: limitBytes,
          remaining,
        };
      } else {
        // ultra
        return {
          ok: false,
          error: "Storage limit exceeded. Please free up space or contact support.",
          used: usedBytes,
          limit: limitBytes,
          remaining,
        };
      }
    }

    return { ok: true, used: usedBytes, limit: limitBytes, remaining };
  } catch (e) {
    console.error("[storage] Validation error:", e);
    return { ok: false, error: "Failed to validate storage space. Please try again." };
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

