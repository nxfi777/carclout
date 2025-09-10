import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import type { Session } from "next-auth";

export type Role = "admin" | "staff" | "user";
export type Plan = "base" | "premium" | "ultra" | null;

export interface ChannelPerms {
  requiredReadRole?: Role | "user";
  requiredWriteRole?: Role | "user";
  requiredReadPlan?: Exclude<Plan, null> | undefined;
  requiredWritePlan?: Exclude<Plan, null> | undefined;
}

export interface SessionLite {
  email: string | null;
  role: Role;
  plan: Plan;
}

export async function getSessionLite(): Promise<SessionLite> {
  const session = (await auth().catch(() => null)) as Session | null;
  const base: SessionLite = {
    email: session?.user?.email || null,
    role: session?.user?.role ?? "user",
    plan: session?.user?.plan ?? null,
  };
  // Optionally load latest plan from DB if we have an email
  if (base.email) {
    try {
      const db = await getSurreal();
      const res = await db.query("SELECT plan, role FROM user WHERE email = $email LIMIT 1;", { email: base.email });
      type Row = { plan?: Plan; role?: Role } | undefined;
      const row: Row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Row) : undefined;
      if (row?.plan !== undefined) base.plan = row.plan ?? base.plan;
      if (row?.role !== undefined) base.role = row.role ?? base.role;
    } catch {}
  }
  return base;
}

export function canAccessByRole(userRole: Role, required?: Role): boolean {
  if (!required) return true;
  if (required === "user") return true;
  if (required === "staff") return userRole === "staff" || userRole === "admin";
  if (required === "admin") return userRole === "admin";
  return false;
}

export function canAccessByPlan(plan: Plan, required?: Exclude<Plan, null>): boolean {
  // Normalize plan names across the app ('minimum'|'basic'|'pro' synonyms)
  function canonicalize(p: string | null | undefined): Plan {
    const s = (p || "").toString().toLowerCase();
    if (s === "ultra" || s === "pro") return "ultra";
    if (s === "premium") return "premium";
    if (s === "base" || s === "basic" || s === "minimum") return "base";
    return null;
  }
  if (!required) return true;
  const canonical = canonicalize(plan);
  if (canonical === null) return false;
  if (required === "base") return canonical === "base" || canonical === "premium" || canonical === "ultra";
  if (required === "premium") return canonical === "premium" || canonical === "ultra";
  if (required === "ultra") return canonical === "ultra";
  return false;
}

export type ChannelLike = Partial<ChannelPerms> & { requiredRole?: Role };

export function checkChannelRead(session: SessionLite, channel: ChannelLike): boolean {
  const requiredRole = channel?.requiredReadRole ?? channel?.requiredRole;
  const requiredPlan = channel?.requiredReadPlan ?? undefined;
  return canAccessByRole(session.role, requiredRole) && canAccessByPlan(session.plan, requiredPlan);
}

export function checkChannelWrite(session: SessionLite, channel: ChannelLike): boolean {
  const requiredRole = channel?.requiredWriteRole ?? channel?.requiredRole;
  const requiredPlan = channel?.requiredWritePlan ?? undefined;
  return canAccessByRole(session.role, requiredRole) && canAccessByPlan(session.plan, requiredPlan);
}


