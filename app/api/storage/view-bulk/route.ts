import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createViewUrl } from "@/lib/r2";

const ALLOWED_SHARED_USER_FOLDERS = new Set(["vehicles", "car-photos", "chat-profile", "chat-uploads"]);

function normalizeKey(input: unknown): string {
  return String(input || "").replace(/^\/+/u, "");
}

function isSafeUserSegment(segment: string): boolean {
  return /^[a-z0-9_-]+$/u.test(segment);
}

function isAllowedCrossUserKey(normalized: string): boolean {
  if (!normalized.startsWith("users/")) return false;
  if (normalized.includes("..")) return false;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 3) return false;
  const [rootSegment, userSegment, folderSegment] = parts;
  if (rootSegment !== "users") return false;
  if (!isSafeUserSegment(userSegment)) return false;
  return ALLOWED_SHARED_USER_FOLDERS.has(folderSegment);
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({} as { keys?: unknown; scope?: unknown }));
    const keys = Array.isArray(body?.keys) ? (body.keys as unknown[]) : [];
    const scope = body?.scope === "admin" ? "admin" : "user";
    const requestedAdmin = scope === "admin";

    // Allow non-admins to fetch a safe, read-only subset of admin assets (template thumbnails, hooks previews)
    if (requestedAdmin && user.role !== "admin") {
      const whitelistPrefixes = ["admin/templates/", "admin/hooks/"];
      const allWhitelisted = keys.every((k) => {
        if (typeof k !== "string" || !k) return false;
      const rel = normalizeKey(k);
        const full = rel.startsWith("admin/") ? rel : `admin/${rel}`;
        return whitelistPrefixes.some((p) => full.startsWith(p));
      });
      if (!allWhitelisted) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const isAdminScope = requestedAdmin;

    const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
    const results: Record<string, string> = {};
    const tasks: Promise<void>[] = [];

    for (const k of keys) {
      if (typeof k !== "string" || !k) continue;
      const rel = normalizeKey(k);
      if (!rel) continue;

      let fullKey: string | null = null;
      if (rel.startsWith(root)) {
        fullKey = rel;
      } else if (isAllowedCrossUserKey(rel)) {
        fullKey = rel;
      } else {
        const candidate = `${root}/${rel}`;
        if (!candidate.includes("..")) {
          fullKey = candidate;
        }
      }

      if (!fullKey) continue;
      tasks.push(
        (async () => {
          try {
            const { url } = await createViewUrl(fullKey!, 60 * 10);
            // Use the original key string as the map key so the client can match it
            results[k] = url;
          } catch {
            // ignore individual failures
          }
        })()
      );
    }

    await Promise.all(tasks);
    return NextResponse.json({ urls: results });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}


