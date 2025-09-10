import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

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
  const db = await getSurreal();
  const res = await db.query("SELECT id, tracks, updated_at FROM music_defaults ORDER BY updated_at DESC LIMIT 1;");
  const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : null;
  const tracks: Track[] = Array.isArray(row?.tracks) ? row.tracks : [];
  return NextResponse.json({ tracks: tracks.slice(0, 20) });
}


