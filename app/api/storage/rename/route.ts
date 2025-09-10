import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { moveObject, listAllObjects, copyObject, deletePrefix } from "@/lib/r2";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sourceKey, targetKey, isFolder, scope } = await req.json();
  const isAdminScope = scope === 'admin';
  if (isAdminScope && (user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  if (typeof sourceKey !== "string" || typeof targetKey !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const fromFull = sourceKey.startsWith(root) ? sourceKey : `${root}/${sourceKey.replace(/^\/+/, "")}`;
  const toFull = targetKey.startsWith(root) ? targetKey : `${root}/${targetKey.replace(/^\/+/, "")}`;

  // Prevent renaming or moving the reserved root folder "hooks" and immutable "vehicles" and "designer_masks"
  if (isFolder) {
    const fromNorm = fromFull.endsWith("/") ? fromFull : `${fromFull}/`;
    const toNorm = toFull.endsWith("/") ? toFull : `${toFull}/`;
    if (fromNorm === `${root}/hooks/`) {
      return NextResponse.json({ error: "Cannot rename reserved folder 'hooks'" }, { status: 400 });
    }
    // Also prevent targeting root hooks as a rename destination from another folder
    if (toNorm === `${root}/hooks/`) {
      return NextResponse.json({ error: "Cannot overwrite reserved folder 'hooks'" }, { status: 400 });
    }
    if (fromNorm === `${root}/vehicles/`) {
      return NextResponse.json({ error: "Cannot rename reserved folder 'vehicles'" }, { status: 400 });
    }
    if (toNorm === `${root}/vehicles/`) {
      return NextResponse.json({ error: "Cannot overwrite reserved folder 'vehicles'" }, { status: 400 });
    }
    if (fromNorm === `${root}/designer_masks/`) {
      return NextResponse.json({ error: "Cannot rename reserved folder 'designer_masks'" }, { status: 400 });
    }
    if (toNorm === `${root}/designer_masks/`) {
      return NextResponse.json({ error: "Cannot overwrite reserved folder 'designer_masks'" }, { status: 400 });
    }
    if (fromNorm === `${root}/templates/`) {
      return NextResponse.json({ error: "Cannot rename reserved folder 'templates'" }, { status: 400 });
    }
    if (toNorm === `${root}/templates/`) {
      return NextResponse.json({ error: "Cannot overwrite reserved folder 'templates'" }, { status: 400 });
    }
  }

  if (!isFolder) {
    // Disallow moving a file directly into the immutable vehicles or designer_masks roots
    const toDir = toFull.slice(0, Math.max(0, toFull.lastIndexOf('/') + 1));
    if (toDir === `${root}/vehicles/`) {
      return NextResponse.json({ error: "Cannot place files directly in 'vehicles'. Move into a specific vehicle folder." }, { status: 400 });
    }
    if (toDir === `${root}/designer_masks/`) {
      return NextResponse.json({ error: "Cannot place files directly in 'designer_masks'." }, { status: 400 });
    }
    await moveObject(fromFull, toFull);
    return NextResponse.json({ ok: true });
  }

  // Folder move/rename: copy all keys and delete source prefix
  const from = fromFull.endsWith("/") ? fromFull : `${fromFull}/`;
  const to = toFull.endsWith("/") ? toFull : `${toFull}/`;
  const objects = await listAllObjects(from);
  for (const o of objects) {
    const k = o.Key || "";
    if (!k) continue;
    const suffix = k.slice(from.length);
    await copyObject(k, `${to}${suffix}`);
  }
  await deletePrefix(from);
  return NextResponse.json({ ok: true });
}


