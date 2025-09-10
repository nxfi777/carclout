import { auth } from "@/lib/auth";

export async function getSessionUser() {
  const session = await auth();
  return session?.user || null;
}

export function sanitizeUserId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}


