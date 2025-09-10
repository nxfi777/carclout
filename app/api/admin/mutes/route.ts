import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

type MutePayload = {
  targetEmail: string;
  channels?: string[]; // channel slugs; empty/undefined => global (all channels)
  durationSeconds?: number; // optional; if omitted, indefinite
};

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getSurreal();
  const res = await db.query("SELECT id, targetEmail, channels, expires_at, created_at, reason FROM mute ORDER BY created_at DESC LIMIT 500;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as any[]) : [];
  const mutes = rows.map((r) => ({
    id: r?.id?.id?.toString?.() || r?.id,
    targetEmail: r?.targetEmail,
    channels: Array.isArray(r?.channels) ? r.channels : null,
    expires_at: r?.expires_at,
    created_at: r?.created_at,
    reason: r?.reason,
  }));
  return NextResponse.json({ mutes });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const payload: MutePayload = {
    targetEmail: String(body?.targetEmail || "").toLowerCase(),
    channels: Array.isArray(body?.channels) ? body.channels.map((s: any) => String(s)) : undefined,
    durationSeconds: Number.isFinite(body?.durationSeconds) ? Number(body.durationSeconds) : undefined,
  };
  if (!payload.targetEmail) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  if (payload.targetEmail === user.email.toLowerCase()) return NextResponse.json({ error: "Cannot mute self" }, { status: 400 });
  const now = Date.now();
  const expires = payload.durationSeconds ? new Date(now + payload.durationSeconds * 1000).toISOString() : undefined;
  const db = await getSurreal();
  const created = await db.create("mute", {
    targetEmail: payload.targetEmail,
    channels: payload.channels && payload.channels.length ? payload.channels : null,
    created_at: new Date(now).toISOString(),
    expires_at: expires,
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ mute: { id: row?.id?.id?.toString?.() || row?.id, ...payload, expires_at: expires } });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { targetEmail } = await req.json().catch(() => ({}));
  if (!targetEmail || typeof targetEmail !== "string") return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  const db = await getSurreal();
  await db.query("DELETE mute WHERE targetEmail = $target;", { target: targetEmail.toLowerCase() });
  return NextResponse.json({ ok: true });
}


