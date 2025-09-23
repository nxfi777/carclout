import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";

type VehicleDb = { make: string; model: string; type?: string; kitted?: boolean; colorFinish?: string; accents?: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").toLowerCase();
    const emailsParam = searchParams.getAll("emails");
    const emailsListRaw = searchParams.get("emails[]");
    const emailsCsv = searchParams.get("emails_csv");
    const wantBulk = !!(emailsParam.length || emailsListRaw || emailsCsv);
    if (!wantBulk) {
      if (!email || !/@/.test(email)) {
        return NextResponse.json({ error: "Missing email" }, { status: 400 });
      }
    }
    const db = await getSurreal();
    if (wantBulk) {
      // Accept formats: ?emails=a&emails=b OR ?emails[]=a&emails[]=b OR ?emails_csv=a,b
      const all: string[] = [];
      for (const e of emailsParam) all.push(String(e || "").toLowerCase());
      if (emailsListRaw) all.push(String(emailsListRaw || "").toLowerCase());
      if (emailsCsv) all.push(...String(emailsCsv).split(",").map((s)=>s.trim().toLowerCase()));
      const uniq = Array.from(new Set(all.filter((s)=> s && /@/.test(s)))).slice(0, 200);
      if (!uniq.length) return NextResponse.json({ profiles: {} });
      const res = await db.query(
        "SELECT email, displayName, name, image, vehicles, carPhotos, chatProfilePhotos, bio FROM user WHERE email IN $emails LIMIT 10000;",
        { emails: uniq }
      );
      const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
      const out: Record<string, { name?: string; image?: string; vehicles?: VehicleDb[]; photos?: string[]; bio?: string }> = {};
      for (const rowRaw of rows) {
        const em: string | undefined = typeof (rowRaw as { email?: unknown })?.email === 'string' ? (rowRaw as { email: string }).email.toLowerCase() : undefined;
        if (!em) continue;
        const displayName: string | undefined = typeof (rowRaw as { displayName?: unknown })?.displayName === 'string' ? (rowRaw as { displayName: string }).displayName : undefined;
        const name: string | undefined = typeof rowRaw?.name === 'string' ? (rowRaw.name as string) : undefined;
        const image: string | undefined = typeof rowRaw?.image === 'string' ? (rowRaw.image as string) : undefined;
        const vehicles: VehicleDb[] = Array.isArray((rowRaw as { vehicles?: unknown })?.vehicles) ? (rowRaw as { vehicles?: unknown }).vehicles as VehicleDb[] : [];
        const vehiclePhotosFlat: string[] = Array.isArray((rowRaw as { vehicles?: unknown })?.vehicles)
          ? ((rowRaw as { vehicles?: unknown }).vehicles as Array<{ photos?: unknown }>).flatMap(v => Array.isArray(v?.photos) ? (v.photos as unknown[]).filter((x)=> typeof x === 'string') as string[] : [])
          : [];
        const carPhotos: string[] = vehiclePhotosFlat.length
          ? vehiclePhotosFlat
          : (Array.isArray((rowRaw as { carPhotos?: unknown })?.carPhotos) ? ((rowRaw as { carPhotos?: unknown }).carPhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : []);
        const chatProfilePhotosRaw: string[] = Array.isArray((rowRaw as { chatProfilePhotos?: unknown })?.chatProfilePhotos) ? ((rowRaw as { chatProfilePhotos?: unknown }).chatProfilePhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : [];
        const chatPhotos: string[] = (chatProfilePhotosRaw.length ? chatProfilePhotosRaw : carPhotos).slice(0, 6);
        const bio: string | undefined = typeof rowRaw?.bio === 'string' ? rowRaw.bio : undefined;
        out[em] = { name: (displayName && displayName.trim()) ? displayName : name, image, vehicles, photos: chatPhotos, bio };
      }
      return NextResponse.json({ profiles: out });
    }
    // Single lookup
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
    const vehiclePhotosFlat: string[] = Array.isArray((rowRaw as { vehicles?: unknown })?.vehicles)
      ? ((rowRaw as { vehicles?: unknown }).vehicles as Array<{ photos?: unknown }>).flatMap(v => Array.isArray(v?.photos) ? (v.photos as unknown[]).filter((x)=> typeof x === 'string') as string[] : [])
      : [];
    const carPhotos: string[] = vehiclePhotosFlat.length
      ? vehiclePhotosFlat
      : (Array.isArray((rowRaw as { carPhotos?: unknown })?.carPhotos) ? ((rowRaw as { carPhotos?: unknown }).carPhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : []);
    const chatProfilePhotosRaw: string[] = Array.isArray((rowRaw as { chatProfilePhotos?: unknown })?.chatProfilePhotos) ? ((rowRaw as { chatProfilePhotos?: unknown }).chatProfilePhotos as unknown[]).filter((x: unknown) => typeof x === "string") as string[] : [];

    // Prefer explicit chatProfilePhotos if set; otherwise pick up to 6 from carPhotos
    const chatPhotos: string[] = (chatProfilePhotosRaw.length ? chatProfilePhotosRaw : carPhotos).slice(0, 6);

    const bio: string | undefined = typeof rowRaw?.bio === 'string' ? rowRaw.bio : undefined;
    return NextResponse.json({ name: (displayName && displayName.trim()) ? displayName : name, image, vehicles, photos: chatPhotos, bio });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


