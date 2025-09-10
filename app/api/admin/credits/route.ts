import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { adjustCredits, getUserRecordIdByEmail } from "@/lib/credits";

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email || "";
  const role = (session as any)?.user?.role || (session as any)?.user?.plan || null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { targetEmail, credits, reason } = await req.json().catch(()=>({}));
  if (!targetEmail || typeof credits !== 'number' || !Number.isFinite(credits)) {
    return NextResponse.json({ error: "targetEmail and numeric credits required" }, { status: 400 });
  }
  try {
    const rid = await getUserRecordIdByEmail(String(targetEmail));
    if (!rid) return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    await adjustCredits(String(targetEmail), Math.trunc(credits), String(reason || 'admin_grant'), null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to bestow credits" }, { status: 500 });
  }
}


