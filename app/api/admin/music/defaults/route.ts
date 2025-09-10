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
  if (!user?.email || (user as any).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getSurreal();
  const res = await db.query("SELECT id, tracks, updated_at FROM music_defaults ORDER BY updated_at DESC LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : null;
  const tracks: Track[] = Array.isArray(row?.tracks) ? row.tracks : [];
  return NextResponse.json({ tracks });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email || (user as any).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const tracksRaw: unknown = body?.tracks;
  if (!Array.isArray(tracksRaw)) return NextResponse.json({ error: "tracks must be an array" }, { status: 400 });
  const tracks: Track[] = tracksRaw
    .slice(0, 20)
    .map((t: any) => ({
      id: String(t?.id || ""),
      title: String(t?.title || ""),
      artist: String(t?.artist || ""),
      previewUrl: t?.previewUrl ? String(t.previewUrl) : undefined,
      artworkUrl: t?.artworkUrl ? String(t.artworkUrl) : undefined,
      source: (t?.source === "deezer" ? "deezer" : "itunes") as "itunes" | "deezer",
      externalUrl: t?.externalUrl ? String(t.externalUrl) : undefined,
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


