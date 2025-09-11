import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

type Track = {
  id: string;
  title: string;
  artist: string;
  previewUrl?: string;
  artworkUrl?: string;
  source: "itunes" | "deezer";
  externalUrl?: string;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getSurreal();
  const res = await db.query("SELECT id, tracks, updated_at FROM music_defaults ORDER BY updated_at DESC LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { tracks?: Track[] }) : null;
  const tracks: Track[] = Array.isArray(row?.tracks) ? (row?.tracks as Track[]) : [];
  return NextResponse.json({ tracks });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const tracksRaw: unknown = (body as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracksRaw)) return NextResponse.json({ error: "tracks must be an array" }, { status: 400 });
  const tracks: Track[] = tracksRaw
    .slice(0, 20)
    .map((t) => ({
      id: String((t as { id?: unknown })?.id || ""),
      title: String((t as { title?: unknown })?.title || ""),
      artist: String((t as { artist?: unknown })?.artist || ""),
      previewUrl: (t as { previewUrl?: unknown })?.previewUrl ? String((t as { previewUrl?: unknown }).previewUrl) : undefined,
      artworkUrl: (t as { artworkUrl?: unknown })?.artworkUrl ? String((t as { artworkUrl?: unknown }).artworkUrl) : undefined,
      source: ((t as { source?: unknown })?.source === "deezer" ? "deezer" : "itunes") as "itunes" | "deezer",
      externalUrl: (t as { externalUrl?: unknown })?.externalUrl ? String((t as { externalUrl?: unknown }).externalUrl) : undefined,
    }))
    .filter((t) => !!t.id && !!t.title && !!t.artist);
  const db = await getSurreal();
  const created = await db.create("music_defaults", {
    tracks,
    updated_at: new Date().toISOString(),
    authorEmail: user.email,
  });
  const row = Array.isArray(created) ? created[0] : created;
  return NextResponse.json({ ok: true, id: row?.id?.id?.toString?.() || row?.id, tracks });
}


