import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { deleteObject, deletePrefix } from "@/lib/r2";
import { createHash } from "crypto";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key, isFolder, scope } = await req.json();
  const isAdminScope = scope === 'admin';
  if (isAdminScope && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  if (typeof key !== "string") return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  const fullKey: string = key.startsWith(root) ? key : `${root}/${key.replace(/^\/+/, "")}`;
  if (isFolder) {
    // Protect reserved root folder "hooks"
    const normalized = fullKey.endsWith("/") ? fullKey : `${fullKey}/`;
    if (normalized === `${root}/hooks/`) {
      return NextResponse.json({ error: "Cannot delete reserved folder 'hooks'" }, { status: 400 });
    }
    // Protect immutable 'vehicles' root
    if (normalized === `${root}/vehicles/`) {
      return NextResponse.json({ error: "Cannot delete reserved folder 'vehicles'" }, { status: 400 });
    }
    // Protect designer_masks root
    if (normalized === `${root}/designer_masks/`) {
      return NextResponse.json({ error: "Cannot delete reserved folder 'designer_masks'" }, { status: 400 });
    }
    // Protect admin templates root
    if (normalized === `${root}/templates/`) {
      return NextResponse.json({ error: "Cannot delete reserved folder 'templates'" }, { status: 400 });
    }
    await deletePrefix(fullKey.endsWith("/") ? fullKey : `${fullKey}/`);
  } else {
    // File deletion. If this is a user-scope original, cascade delete matching designer mask(s)
    try {
      await deleteObject(fullKey);
    } finally {
      try {
        if (!isAdminScope) {
          const userRoot = `users/${sanitizeUserId(user.email)}`;
          const maskPrefix = `${userRoot}/designer_masks/`;
          // Only attempt cascade when deleting non-mask user files
          if (!fullKey.startsWith(maskPrefix)) {
            const digest = createHash("sha1").update(fullKey).digest("hex");
            // Remove both foreground and mask variants if present
            await Promise.allSettled([
              deleteObject(`${maskPrefix}${digest}.png`),
              deleteObject(`${maskPrefix}${digest}.mask.png`)
            ]);
          }
        }
      } catch {
        // ignore cascade errors
      }
    }
  }
  return NextResponse.json({ ok: true });
}


