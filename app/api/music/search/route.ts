import { NextResponse } from "next/server";

type UnifiedTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string;
  artworkUrl?: string;
  source: "itunes" | "deezer";
  externalUrl?: string;
};

type ITunesTrack = {
  trackId?: number | string;
  collectionId?: number | string;
  artistId?: number | string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  previewUrl?: string;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
};

type DeezerTrack = {
  id?: number | string;
  title?: string;
  link?: string;
  preview?: string;
  artist?: { name?: string } | null;
  album?: { title?: string; cover?: string; cover_medium?: string } | null;
};

async function searchITunes(query: string, limit: number): Promise<UnifiedTrack[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ results: [] as ITunesTrack[] }));
  const results = (Array.isArray(data?.results) ? data.results : []) as ITunesTrack[];
  return results.map((r) => {
    const id = String(r.trackId || r.collectionId || r.artistId || Math.random());
    const artwork = typeof r.artworkUrl100 === "string" ? r.artworkUrl100.replace("100x100bb", "200x200bb") : undefined;
    const external = typeof r.trackViewUrl === "string" ? r.trackViewUrl : undefined;
    const preview = typeof r.previewUrl === "string" ? r.previewUrl : undefined;
    return {
      id: `itunes:${id}`,
      title: String(r.trackName || r.collectionName || "Unknown Title"),
      artist: String(r.artistName || "Unknown Artist"),
      album: typeof r.collectionName === "string" ? r.collectionName : undefined,
      previewUrl: preview,
      artworkUrl: artwork,
      source: "itunes",
      externalUrl: external,
    } satisfies UnifiedTrack;
  });
}

async function searchDeezer(query: string, limit: number): Promise<UnifiedTrack[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ data: [] as DeezerTrack[] }));
  const results = (Array.isArray(data?.data) ? data.data : []) as DeezerTrack[];
  return results.map((r) => {
    const id = String(r.id || Math.random());
    const artwork = typeof r?.album?.cover_medium === "string" ? r.album.cover_medium : (typeof r?.album?.cover === "string" ? r.album.cover : undefined);
    const external = typeof r.link === "string" ? r.link : undefined;
    const preview = typeof r.preview === "string" ? r.preview : undefined;
    return {
      id: `deezer:${id}`,
      title: String(r.title || "Unknown Title"),
      artist: String(r?.artist?.name || "Unknown Artist"),
      album: typeof r?.album?.title === "string" ? r.album.title : undefined,
      previewUrl: preview,
      artworkUrl: artwork,
      source: "deezer",
      externalUrl: external,
    } satisfies UnifiedTrack;
  });
}

function dedupeTracks(tracks: UnifiedTrack[]): UnifiedTrack[] {
  const seen = new Set<string>();
  const out: UnifiedTrack[] = [];
  for (const t of tracks) {
    const key = `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limitRaw = Number(searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
    const source = (searchParams.get("source") || "all").toLowerCase();

    if (!q) return NextResponse.json({ results: [] });

    const tasks: Promise<UnifiedTrack[]>[] = [];
    if (source === "all" || source === "itunes") tasks.push(searchITunes(q, limit));
    if (source === "all" || source === "deezer") tasks.push(searchDeezer(q, limit));

    const results = await Promise.allSettled(tasks);
    const merged = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const deduped = dedupeTracks(merged).filter((t) => !!t.previewUrl);

    return NextResponse.json({ results: deduped.slice(0, limit) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}


