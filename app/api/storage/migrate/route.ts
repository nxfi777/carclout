import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { listAllObjects, ensureFolder, moveObject } from "@/lib/r2";
import { createHash } from "crypto";

export const runtime = "nodejs";

function sha1Hex(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export async function POST() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const clean = sanitizeUserId(user.email);
    const userRoot = `users/${clean}`;
    const fromPrefix = `${userRoot}/generations/`;
    const toPrefix = `${userRoot}/library/`;

    await ensureFolder(toPrefix);

    // List all objects under generations
    const objects = await listAllObjects(fromPrefix);
    const files = objects
      .map((o) => String(o.Key || ""))
      .filter((k) => k && !k.endsWith("/"));

    let moved = 0;
    let maskMoved = 0;
    const maskPrefix = `${userRoot}/designer_masks/`;

    for (const oldKey of files) {
      const rest = oldKey.slice(fromPrefix.length);
      const newKey = `${toPrefix}${rest}`;
      // Move image
      try {
        if (oldKey !== newKey) {
          await moveObject(oldKey, newKey);
          moved += 1;
        }
      } catch {
        // Skip on error; continue with other files
      }

      // Migrate correlated masks based on digest(oldKey) -> digest(newKey)
      try {
        const oldDigest = sha1Hex(oldKey);
        const newDigest = sha1Hex(newKey);
        const oldFg = `${maskPrefix}${oldDigest}.png`;
        const oldMask = `${maskPrefix}${oldDigest}.mask.png`;
        const newFg = `${maskPrefix}${newDigest}.png`;
        const newMask = `${maskPrefix}${newDigest}.mask.png`;
        // Move foreground if exists
        try { await moveObject(oldFg, newFg); maskMoved += 1; } catch {}
        // Move mask if exists
        try { await moveObject(oldMask, newMask); maskMoved += 1; } catch {}
      } catch {}
    }

    return NextResponse.json({ migratedFiles: moved, migratedMasks: maskMoved });
  } catch (e) {
    try { console.error("/api/storage/migrate error", e); } catch {}
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}


