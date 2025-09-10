import { NextResponse } from "next/server";
import { listAllObjects } from "@/lib/r2";

// Public previews for admin hooks: list bundles under admin/hooks/* and return signed URLs
export async function GET() {
  try {
    const prefix = "admin/hooks/";
    const objects = await listAllObjects(prefix);
    const bundles = new Map<string, { thumbKey?: string; videoKey?: string }>();
    for (const o of objects) {
      const key = o.Key || "";
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const firstSlash = rest.indexOf("/");
      if (firstSlash === -1) continue; // skip markers
      const folder = rest.slice(0, firstSlash);
      const file = rest.slice(firstSlash + 1);
      const entry = bundles.get(folder) || {};
      // Allow timestamp prefixes like 1756754459558-thumb.jpg and 1756754460009-video.mp4
      const cleanedName = file.replace(/^\d{10,15}-/, "");
      if (/^(thumb|poster)\.(jpg|jpeg|png|webp)$/i.test(cleanedName)) {
        entry.thumbKey = key;
      }
      if (/^(video|index)\.(mp4|mov|webm|m4v)$/i.test(cleanedName)) {
        entry.videoKey = key;
      }
      bundles.set(folder, entry);
    }
    const items: { name: string; thumbUrl?: string; videoUrl?: string }[] = [];
    for (const [name, { thumbKey, videoKey }] of bundles) {
      const thumbUrl = thumbKey ? `/api/hooks/file?key=${encodeURIComponent(thumbKey)}` : undefined;
      const videoUrl = videoKey ? `/api/hooks/file?key=${encodeURIComponent(videoKey)}` : undefined;
      if (thumbUrl || videoUrl) items.push({ name, thumbUrl, videoUrl });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load previews" }, { status: 500 });
  }
}


