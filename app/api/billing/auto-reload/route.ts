import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getSurreal();
    const res = await db.query(
      "SELECT auto_reload_enabled, auto_reload_threshold, auto_reload_amount FROM user WHERE email = $email LIMIT 1;",
      { email }
    );
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
    
    return NextResponse.json({
      enabled: row?.auto_reload_enabled || false,
      threshold: row?.auto_reload_threshold || 100,
      amount: row?.auto_reload_amount || 10,
    });
  } catch (e) {
    console.error("Failed to get auto-reload settings:", e);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const enabled = typeof body.enabled === "boolean" ? body.enabled : false;
    const threshold = typeof body.threshold === "number" && body.threshold >= 0 ? body.threshold : 100;
    const amount = typeof body.amount === "number" && body.amount >= 5 ? body.amount : 10;

    // Validate amount
    if (amount < 5) {
      return NextResponse.json({ error: "Minimum reload amount is $5" }, { status: 400 });
    }

    const db = await getSurreal();
    await db.query(
      "UPDATE user SET auto_reload_enabled = $enabled, auto_reload_threshold = $threshold, auto_reload_amount = $amount WHERE email = $email;",
      { email, enabled, threshold, amount }
    );

    return NextResponse.json({ 
      success: true,
      enabled,
      threshold,
      amount,
    });
  } catch (e) {
    console.error("Failed to update auto-reload settings:", e);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

