import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const res = await db.query("SELECT id, targetEmail FROM block WHERE userEmail = $email;", { email: user.email });
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const blocked = rows.map((r) => String(r?.targetEmail || "")).filter(Boolean);
  return NextResponse.json({ blocked });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { targetEmail } = await req.json().catch(() => ({}));
  if (!targetEmail || typeof targetEmail !== "string") return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  if (targetEmail.toLowerCase() === user.email.toLowerCase()) return NextResponse.json({ error: "Cannot block self" }, { status: 400 });
  const db = await getSurreal();
  await db.create("block", { userEmail: user.email, targetEmail: targetEmail.toLowerCase(), created_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { targetEmail } = await req.json().catch(() => ({}));
  if (!targetEmail || typeof targetEmail !== "string") return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  const db = await getSurreal();
  await db.query("DELETE block WHERE userEmail = $email AND targetEmail = $target;", { email: user.email, target: targetEmail.toLowerCase() });
  return NextResponse.json({ ok: true });
}


