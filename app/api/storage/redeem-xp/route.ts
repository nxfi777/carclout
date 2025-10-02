import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

export const runtime = "nodejs";

// XP cost for storage add-ons (Premium plan only)
const XP_PER_10GB = 5000; // 5,000 XP = 10GB storage add-on
const GB = 1024 ** 3;

type UserRow = { id: unknown; email: string; xp?: number; xp_redeemed?: number; plan?: string | null };

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gigabytes } = await request.json().catch(() => ({ gigabytes: 0 }));
  const gbToRedeem = typeof gigabytes === "number" ? Math.floor(Math.max(0, gigabytes)) : 0;

  if (gbToRedeem <= 0 || gbToRedeem % 10 !== 0) {
    return NextResponse.json({ error: "Invalid amount. Must be a multiple of 10GB." }, { status: 400 });
  }

  const db = await getSurreal();
  
  // Check user plan and XP balance
  const r = await db.query("SELECT id, email, xp, xp_redeemed, plan FROM user WHERE email = $email LIMIT 1;", {
    email: session.user.email,
  });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as UserRow | undefined) : undefined;

  if (!row || !row.id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only premium users can redeem XP for storage
  const plan = (row.plan || "base").toLowerCase();
  if (plan !== "premium") {
    return NextResponse.json(
      { error: "Storage redemption is only available for Premium plan users." },
      { status: 403 }
    );
  }

  const totalXp = row.xp || 0;
  const redeemedXp = row.xp_redeemed || 0;
  const availableXp = Math.max(0, totalXp - redeemedXp);
  const units = gbToRedeem / 10; // Each unit is 10GB
  const xpCost = units * XP_PER_10GB;

  if (xpCost > availableXp) {
    return NextResponse.json(
      { 
        error: "Insufficient XP", 
        availableXp, 
        requiredXp: xpCost,
        conversionRate: `${XP_PER_10GB} XP = 10GB storage`
      },
      { status: 400 }
    );
  }

  // Update redeemed XP
  await db.query("UPDATE user SET xp_redeemed = $newRedeemed WHERE email = $email;", {
    newRedeemed: redeemedXp + xpCost,
    email: session.user.email,
  });

  // Create storage add-on record
  const userId = row.id instanceof RecordId ? row.id : new RecordId("user", String(row.id));
  const bytes = gbToRedeem * GB;
  
  await db.query(
    `CREATE storage_addon CONTENT {
      user: $user,
      bytes: $bytes,
      purchased_at: time::now(),
      expires_at: NONE,
      source: 'xp_redemption'
    };`,
    {
      user: userId,
      bytes,
    }
  );

  return NextResponse.json({
    ok: true,
    storageAdded: `${gbToRedeem}GB`,
    xpSpent: xpCost,
    remainingXp: availableXp - xpCost,
  });
}

