import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export async function POST() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getSurreal();
    await db.query(
      "UPDATE user SET welcomeProShown = true WHERE email = $email;",
      { email }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error dismissing welcome:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

