import { NextResponse } from "next/server";
import { getSessionUser, sanitizeUserId } from "@/lib/user";
import { listAllObjects, listObjectsShallow, bucket, ensureFolder } from "@/lib/r2";
import { getSurreal } from "@/lib/surrealdb";
import { createHash } from "crypto";
export const runtime = "nodejs";
type BundleEntry = { name: string; key: string; thumbKey?: string; videoKey?: string; videoEtag?: string };
type ListItem = { type: "folder" | "file"; name: string; key?: string; size?: number; lastModified?: string; etag?: string; blurhash?: string };

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const path = (searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  const scope = (searchParams.get("scope") || "user").toString();
  const isAdminScope = scope === "admin";
  if (isAdminScope && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const root = isAdminScope ? `admin` : `users/${sanitizeUserId(user.email)}`;
  const prefix = path ? `${root}/${path.replace(/^\/+/, "")}` : root;
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;

  // Ensure reserved folders exist at root (admin scope only)
  if (!path && isAdminScope) {
    try { await ensureFolder(`${root}/hooks/`); } catch {}
    try { await ensureFolder(`${root}/templates/`); } catch {}
  }
  // Ensure common folders exist at root for user scope
  if (!path && !isAdminScope) {
    try { await ensureFolder(`${root}/vehicles/`); } catch {}
    try { await ensureFolder(`${root}/designer_masks/`); } catch {}
    try { await ensureFolder(`${root}/designer_states/`); } catch {}
    // Unified workspace folder for user uploads and generations
    try { await ensureFolder(`${root}/library/`); } catch {}
  }

  // Prefer shallow list for user scope to avoid deep scans; use deep list only where needed
  const childrenMap = new Map<string, ListItem>();
  let objectsForBundles: Array<{ Key?: string; Size?: number; LastModified?: Date; ETag?: string }> = [];
  if (!isAdminScope) {
    const { files, folders } = await listObjectsShallow(normalized);
    // Hide special folders from root listing
    const filteredFolders = folders.filter((folderName) => {
      if (!path && (folderName === 'avatars' || folderName === 'car-photos' || folderName === 'hooks')) return false;
      return true;
    });
    for (const folderName of filteredFolders) {
      childrenMap.set(folderName, { type: "folder", name: folderName });
    }
    for (const o of files) {
      const key = o.Key || "";
      const name = key.slice(normalized.length);
      if (!name) continue;
      childrenMap.set(name, { type: "file", name, key, size: o.Size, lastModified: o.LastModified?.toISOString?.(), etag: o.ETag ? String(o.ETag).replace(/\"/g, "") : undefined });
    }
  } else {
    // Admin scope: keep deep list because some views flatten bundle contents
    const objects = await listAllObjects(normalized);
    objectsForBundles = objects as Array<{ Key?: string; Size?: number; LastModified?: Date; ETag?: string }>;
    const baseLen = normalized.length;
    for (const o of objects) {
      const key = o.Key || "";
      const rest = key.slice(baseLen);
      const firstSlash = rest.indexOf("/");
      if (firstSlash === -1) {
        if (!rest) continue; // folder marker
        childrenMap.set(rest, { type: "file", name: rest, key, size: o.Size, lastModified: o.LastModified?.toISOString?.(), etag: o.ETag ? String(o.ETag).replace(/\"/g, "") : undefined });
      } else {
        const folderName = rest.slice(0, firstSlash);
        if (!folderName) continue;
        childrenMap.set(folderName, { type: "folder", name: folderName });
      }
    }
  }

  const items = Array.from(childrenMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Fetch blurhash from database for library images and videos
  const isLibraryPath = path === 'library' || path.startsWith('library/');
  if (isLibraryPath) {
    try {
      const db = await getSurreal();
      const imageKeys = items
        .filter(item => item.type === 'file' && item.key && /\.(jpe?g|png|webp|gif|bmp)$/i.test(item.key))
        .map(item => item.key!);
      
      const videoKeys = items
        .filter(item => item.type === 'file' && item.key && /\.(mp4|mov|webm|avi|mkv)$/i.test(item.key))
        .map(item => item.key!);

      const blurhashMap = new Map<string, string>();
      
      // Fetch blurhashes for images
      if (imageKeys.length > 0) {
        const imageBlurhashRes = await db.query(
          "SELECT key, blurhash FROM library_image WHERE key IN $keys AND email = $email;",
          { keys: imageKeys, email: user.email }
        );

        const imageRecords = Array.isArray(imageBlurhashRes) && Array.isArray(imageBlurhashRes[0]) ? imageBlurhashRes[0] : [];
        for (const record of imageRecords) {
          const r = record as { key?: string; blurhash?: string };
          if (r.key && r.blurhash) {
            blurhashMap.set(r.key, r.blurhash);
          }
        }
      }
      
      // Fetch blurhashes for videos
      if (videoKeys.length > 0) {
        const videoBlurhashRes = await db.query(
          "SELECT key, blurhash FROM library_video WHERE key IN $keys AND email = $email;",
          { keys: videoKeys, email: user.email }
        );

        const videoRecords = Array.isArray(videoBlurhashRes) && Array.isArray(videoBlurhashRes[0]) ? videoBlurhashRes[0] : [];
        for (const record of videoRecords) {
          const r = record as { key?: string; blurhash?: string };
          if (r.key && r.blurhash) {
            blurhashMap.set(r.key, r.blurhash);
          }
        }
      }

      // Add blurhash to items
      for (const item of items) {
        if (item.key && blurhashMap.has(item.key)) {
          item.blurhash = blurhashMap.get(item.key);
        }
      }
    } catch (error) {
      console.error("Failed to fetch blurhash data (non-fatal):", error);
      // Continue without blurhash if database fails
    }
  }

  // If admin is listing inside hooks, flatten bundle folders into pseudo entries
  const isHooksBundleView = isAdminScope && (path === 'hooks' || path.startsWith('hooks/'));
  let bundles: BundleEntry[] | undefined;
  if (isHooksBundleView) {
    const folderChildren = Array.from(childrenMap.values()).filter(it => it.type === 'folder');
    const results: BundleEntry[] = [];
    for (const f of folderChildren) {
      const folderPrefix = `${normalized}${f.name}/`;
      const source = objectsForBundles.length ? objectsForBundles : await listAllObjects(folderPrefix);
      const files = source.filter((o) => String(o.Key || '').startsWith(folderPrefix));
      function cleanedBase(k: string){ const base = k.slice(k.lastIndexOf('/')+1); return base.replace(/^\d{10,15}-/, ''); }
      const thumbObj = files.find(o => { const k = o.Key || ''; const b = cleanedBase(k); return /^(thumb|poster|cover)\.(jpg|jpeg|png|webp)$/i.test(b); });
      const vidObj = files.find(o => { const k = o.Key || ''; const b = cleanedBase(k); return /^(video|index)\.(mp4|mov|webm|m4v)$/i.test(b); });
      const thumb = thumbObj?.Key as string | undefined;
      const video = vidObj?.Key as string | undefined;
      const videoEtag = vidObj?.ETag ? String(vidObj.ETag).replace(/\"/g, '') : undefined;
      results.push({ name: f.name, key: `${path}/${f.name}`, thumbKey: thumb ? thumb.replace(`${root}/`, '') : undefined, videoKey: video ? video.replace(`${root}/`, '') : undefined, videoEtag });
    }
    bundles = results;
  }

  // Compute a deterministic digest over the current listing for conditional requests
  const fingerprint = items
    .map((it) => (it.type === "folder" ? `d:${it.name}` : `f:${it.name}:${it.size || 0}:${it.lastModified || ""}:${it.etag || ""}`))
    .join("|");
  const weakEtag = `W/"${createHash("sha1").update(fingerprint).digest("hex")}"`;

  const inm = req.headers.get("if-none-match");
  const inmClean = (inm || "").replace(/^W\//, "").replace(/\"/g, "").replace(/"/g, "");
  const etagClean = weakEtag.replace(/^W\//, "").replace(/\"/g, "").replace(/"/g, "");
  if (inm && inmClean === etagClean) {
    return new NextResponse(null, { status: 304, headers: { ETag: weakEtag } });
  }

  return NextResponse.json({ path, bucket, root, items, bundles, etag: etagClean }, { headers: { ETag: weakEtag } });
}


