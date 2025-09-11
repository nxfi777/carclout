import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";
import { checkChannelRead, getSessionLite, type ChannelLike } from "@/lib/chatPerms";

async function ensureGeneral(db: Awaited<ReturnType<typeof getSurreal>>) {
  const res = await db.query("SELECT * FROM channel WHERE slug = 'general' LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as unknown) : null;
  if (!row) {
    await db.create("channel", { name: "General", slug: "general", created_at: new Date().toISOString() });
  }
}

async function ensureLivestream(db: Awaited<ReturnType<typeof getSurreal>>) {
  const res = await db.query("SELECT * FROM channel WHERE slug = 'livestream' LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as unknown) : null;
  if (!row) {
    await db.create("channel", { name: "Livestream", slug: "livestream", created_at: new Date().toISOString() });
  }
}

async function ensurePro(db: Awaited<ReturnType<typeof getSurreal>>) {
  const res = await db.query("SELECT * FROM channel WHERE slug = 'pro' LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as unknown) : null;
  if (!row) {
    await db.create("channel", { name: "Pro", slug: "pro", requiredReadPlan: 'ultra', requiredWritePlan: 'ultra', created_at: new Date().toISOString() });
  }
}

export async function GET() {
  const db = await getSurreal();
  await Promise.allSettled([
    ensureGeneral(db),
    ensureLivestream(db),
    ensurePro(db),
  ]);
  const session = await getSessionLite();
  const res = await db.query("SELECT * FROM channel ORDER BY created_at;");
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as ChannelLike[]) : [];
  const visible = session.role === 'admin' ? rows : rows.filter((r: ChannelLike) => checkChannelRead(session, r));
  return NextResponse.json({ channels: visible });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = session.user.role || "user";
  if (userRole !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const name: string = body?.name || "";
  const slug: string = (body?.slug || name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const requiredRole: string | undefined = body?.requiredRole || undefined; // legacy single role
  const requiredReadRole: string | undefined = body?.requiredReadRole || undefined;
  const requiredWriteRole: string | undefined = body?.requiredWriteRole || undefined;
  const requiredReadPlan: string | undefined = body?.requiredReadPlan || undefined; // 'base' | 'premium' | 'ultra'
  const requiredWritePlan: string | undefined = body?.requiredWritePlan || undefined;
  if (!name || !slug) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const db = await getSurreal();
  const created = await db.create("channel", {
    name,
    slug,
    requiredRole,
    requiredReadRole,
    requiredWriteRole,
    requiredReadPlan,
    requiredWritePlan,
    created_at: new Date().toISOString(),
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ channel: row });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = session.user.role || "user";
  if (userRole !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const slug: string = String(body?.slug || "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const allowedRoles = new Set(["user", "staff", "admin"]);
  const allowedPlans = new Set(["base", "premium", "ultra"]);

  const name: string | undefined = body?.name ? String(body.name) : undefined;
  const requiredRole: string | null | undefined = body?.requiredRole === null ? null : (typeof body?.requiredRole === 'string' ? (allowedRoles.has(body.requiredRole) ? body.requiredRole : null) : undefined);
  const requiredReadRole: string | null | undefined = body?.requiredReadRole === null ? null : (typeof body?.requiredReadRole === 'string' ? (allowedRoles.has(body.requiredReadRole) ? body.requiredReadRole : null) : undefined);
  const requiredWriteRole: string | null | undefined = body?.requiredWriteRole === null ? null : (typeof body?.requiredWriteRole === 'string' ? (allowedRoles.has(body.requiredWriteRole) ? body.requiredWriteRole : null) : undefined);
  const requiredReadPlan: string | null | undefined = body?.requiredReadPlan === null ? null : (typeof body?.requiredReadPlan === 'string' ? (allowedPlans.has(body.requiredReadPlan) ? body.requiredReadPlan : null) : undefined);
  const requiredWritePlan: string | null | undefined = body?.requiredWritePlan === null ? null : (typeof body?.requiredWritePlan === 'string' ? (allowedPlans.has(body.requiredWritePlan) ? body.requiredWritePlan : null) : undefined);

  const sets: string[] = [];
  const params: Record<string, unknown> = { slug };
  if (name !== undefined) { sets.push("name = $name"); params.name = name; }
  if (requiredRole !== undefined) { sets.push("requiredRole = $requiredRole"); params.requiredRole = requiredRole; }
  if (requiredReadRole !== undefined) { sets.push("requiredReadRole = $requiredReadRole"); params.requiredReadRole = requiredReadRole; }
  if (requiredWriteRole !== undefined) { sets.push("requiredWriteRole = $requiredWriteRole"); params.requiredWriteRole = requiredWriteRole; }
  if (requiredReadPlan !== undefined) { sets.push("requiredReadPlan = $requiredReadPlan"); params.requiredReadPlan = requiredReadPlan; }
  if (requiredWritePlan !== undefined) { sets.push("requiredWritePlan = $requiredWritePlan"); params.requiredWritePlan = requiredWritePlan; }

  if (sets.length === 0) return NextResponse.json({ error: "No changes" }, { status: 400 });

  const db = await getSurreal();
  const q = `UPDATE channel SET ${sets.join(", ")} WHERE slug = $slug RETURN AFTER;`;
  const res = await db.query(q, params);
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as unknown) : null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ channel: row });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = session.user.role || "user";
  if (userRole !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const slug: string = String(body?.slug || "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  if (slug === "general" || slug === "livestream") return NextResponse.json({ error: "Cannot delete built-in channel" }, { status: 400 });
  const db = await getSurreal();
  await db.query("DELETE channel WHERE slug = $slug;", { slug });
  return NextResponse.json({ ok: true });
}


