import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { adjustCredits } from "@/lib/credits";

// Conversion rates
const XP_PER_IMAGE_CREDIT = 10; // 1,000 XP = 100 credits

type UserRow = { id: unknown; email: string; xp?: number; xp_redeemed?: number };

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getSurreal();
  const r = await db.query("SELECT xp, xp_redeemed FROM user WHERE email = $email LIMIT 1;", {
    email: session.user.email,
  });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as UserRow | undefined) : undefined;
  
  const totalXp = row?.xp || 0;
  const redeemedXp = row?.xp_redeemed || 0;
  const availableXp = Math.max(0, totalXp - redeemedXp);
  const availableCredits = Math.floor(availableXp / XP_PER_IMAGE_CREDIT);

  return NextResponse.json({
    totalXp,
    redeemedXp,
    availableXp,
    availableCredits,
    conversionRate: XP_PER_IMAGE_CREDIT,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount } = await request.json().catch(() => ({ amount: 0 }));
  const creditsToRedeem = typeof amount === "number" ? Math.floor(Math.max(0, amount)) : 0;

  if (creditsToRedeem <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const db = await getSurreal();
  const r = await db.query("SELECT xp, xp_redeemed FROM user WHERE email = $email LIMIT 1;", {
    email: session.user.email,
  });
  const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as UserRow | undefined) : undefined;

  const totalXp = row?.xp || 0;
  const redeemedXp = row?.xp_redeemed || 0;
  const availableXp = Math.max(0, totalXp - redeemedXp);
  const xpCost = creditsToRedeem * XP_PER_IMAGE_CREDIT;

  if (xpCost > availableXp) {
    return NextResponse.json(
      { error: "Insufficient XP", availableXp, requiredXp: xpCost },
      { status: 400 }
    );
  }

  // Update redeemed XP
  await db.query("UPDATE user SET xp_redeemed = $newRedeemed WHERE email = $email;", {
    newRedeemed: redeemedXp + xpCost,
    email: session.user.email,
  });

  // Add credits to balance
  await adjustCredits(session.user.email, creditsToRedeem, "xp_redemption", null);

  return NextResponse.json({
    ok: true,
    creditsAdded: creditsToRedeem,
    xpSpent: xpCost,
    remainingXp: availableXp - xpCost,
  });
}

