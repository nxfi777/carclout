import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { listAllObjects } from "@/lib/r2";
import { getStorageLimitBytes, getStorageUsageBytes } from "@/lib/storage";
import { getSurreal } from "@/lib/surrealdb";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const scope = (searchParams.get("scope") || "user").toString();
  const isAdminScope = scope === "admin";
  if (isAdminScope && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  const normalized = root.endsWith("/") ? root : `${root}/`;

  // Load plan from DB if possible; fall back to session
  let effectivePlan: string | null = user.plan ?? null;
  try {
    const db = await getSurreal();
    const res = await db.query("SELECT plan FROM user WHERE email = $email LIMIT 1;", { email: user.email });
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { plan?: string | null } | undefined) : undefined;
    if (row && "plan" in row) effectivePlan = row.plan || effectivePlan || null;
  } catch {}

  // For admin scope, use old logic (no limits)
  if (isAdminScope) {
    const objects = await listAllObjects(normalized);
    const usedBytes = objects.reduce((acc, o) => acc + (o.Size || 0), 0);
    return NextResponse.json({
      scope: "admin",
      plan: effectivePlan,
      usedBytes,
      limitBytes: null,
      remainingBytes: null,
      percentUsed: null,
    });
  }

  // For user scope, use new helper functions that include add-ons
  const usedBytes = await getStorageUsageBytes(user.email);
  const limitBytes = await getStorageLimitBytes(user.email, effectivePlan);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const percentUsed = limitBytes === 0 ? null : Math.min(100, Math.round((usedBytes / limitBytes) * 100));

  return NextResponse.json({
    scope: "user",
    plan: effectivePlan,
    usedBytes,
    limitBytes,
    remainingBytes,
    percentUsed,
  });
}


