import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export type SessionUser = Session["user"];

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user || null;
}

export function sanitizeUserId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}


