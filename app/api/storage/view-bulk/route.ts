import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { createViewUrl } from "@/lib/r2";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({} as { keys?: unknown; scope?: unknown }));
    const keys = Array.isArray(body?.keys) ? (body.keys as unknown[]) : [];
    const scope = body?.scope === "admin" ? "admin" : "user";
    const isAdminScope = scope === "admin";
    if (isAdminScope && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
    const results: Record<string, string> = {};
    const tasks: Promise<void>[] = [];

    for (const k of keys) {
      if (typeof k !== "string" || !k) continue;
      const rel = k.replace(/^\/+/, "");
      const fullKey = rel.startsWith(root) ? rel : `${root}/${rel}`;
      tasks.push(
        (async () => {
          try {
            const { url } = await createViewUrl(fullKey, 60 * 10);
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


