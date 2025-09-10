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
      "SELECT name, image, vehicles, carPhotos, chatProfilePhotos, bio FROM user WHERE email = $email LIMIT 1;",
      { email }
    );
    const rowRaw = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as any) : null;
    if (!rowRaw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const name: string | undefined = rowRaw?.name || undefined;
    const image: string | undefined = rowRaw?.image || undefined;
    const vehicles: VehicleDb[] = Array.isArray(rowRaw?.vehicles) ? rowRaw.vehicles : [];
    const carPhotos: string[] = Array.isArray(rowRaw?.carPhotos) ? rowRaw.carPhotos.filter((x: unknown) => typeof x === "string") : [];
    const chatProfilePhotosRaw: string[] = Array.isArray(rowRaw?.chatProfilePhotos) ? rowRaw.chatProfilePhotos.filter((x: unknown) => typeof x === "string") : [];

    // Prefer explicit chatProfilePhotos if set; otherwise pick up to 6 from carPhotos
    const chatPhotos: string[] = (chatProfilePhotosRaw.length ? chatProfilePhotosRaw : carPhotos).slice(0, 6);

    const bio: string | undefined = typeof rowRaw?.bio === 'string' ? rowRaw.bio : undefined;
    return NextResponse.json({ name, image, vehicles, photos: chatPhotos, bio });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


