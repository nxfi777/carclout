import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    
    if (!email) {
      return NextResponse.json({ shouldShowWelcome: false });
    }

    const db = await getSurreal();
    const result = await db.query(
      "SELECT plan, welcomeProShown FROM user WHERE email = $email LIMIT 1;",
      { email }
    );

    const row = Array.isArray(result) && Array.isArray(result[0]) 
      ? (result[0][0] as { plan?: string; welcomeProShown?: boolean } | undefined)
      : undefined;

    const currentPlan = row?.plan;
    const welcomeShown = row?.welcomeProShown ?? false;

    // Show welcome if:
    // 1. Current plan is 'pro' or 'ultra'
    // 2. Welcome hasn't been shown yet
    const shouldShowWelcome = (currentPlan === "pro" || currentPlan === "ultra") && !welcomeShown;

    return NextResponse.json({ shouldShowWelcome });
  } catch (error) {
    console.error("Error checking upgrade status:", error);
    return NextResponse.json({ shouldShowWelcome: false });
  }
}

