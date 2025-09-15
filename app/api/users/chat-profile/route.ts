import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

type VehicleDb = { make: string; model: string; type?: string; kitted?: boolean; colorFinish?: string; accents?: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").toLowerCase();
    if (!email || !/@/.test(email)) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }
    const db = await getSurreal();
    const res = await db.query(
      "SELECT displayName, name, image, vehicles, carPhotos, chatProfilePhotos, bio FROM user WHERE email = $email LIMIT 1;",
      { email }
    );
    const rowRaw = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as Record<string, unknown>) : null;
    if (!rowRaw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const displayName: string | undefined = typeof (rowRaw as { displayName?: unknown })?.displayName === 'string' ? (rowRaw as { displayName: string }).displayName : undefined;
    const name: string | undefined = typeof rowRaw?.name === 'string' ? (rowRaw.name as string) : undefined;
    const image: string | undefined = typeof rowRaw?.image === 'string' ? (rowRaw.image as string) : undefined;
    const vehicles: VehicleDb[] = Array.isArray((rowRaw as { vehicles?: unknown })?.vehicles) ? (rowRaw as { vehicles?: unknown }).vehicles as VehicleDb[] : [];
    const carPhotos: string[] = Array.isArray((rowRaw as { carPhotos?: unknown })?.carPhotos) ? ((rowRaw as { carPhotos?: unknown }).carPhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : [];
    const chatProfilePhotosRaw: string[] = Array.isArray((rowRaw as { chatProfilePhotos?: unknown })?.chatProfilePhotos) ? ((rowRaw as { chatProfilePhotos?: unknown }).chatProfilePhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : [];

    // Prefer explicit chatProfilePhotos if set; otherwise pick up to 6 from carPhotos
    const chatPhotos: string[] = (chatProfilePhotosRaw.length ? chatProfilePhotosRaw : carPhotos).slice(0, 6);

    const bio: string | undefined = typeof rowRaw?.bio === 'string' ? rowRaw.bio : undefined;
    return NextResponse.json({ name: (displayName && displayName.trim()) ? displayName : name, image, vehicles, photos: chatPhotos, bio });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


