import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

type VehicleDb = { make: string; model: string; type?: string; kitted?: unknown };
type DbRow = {
  name?: string;
  displayName?: string;
  image?: string;
  vehicles?: Array<{ make: string; model: string; type?: string; kitted?: boolean }>;
  cars?: VehicleDb[];
  plan?: unknown;
  onboardingCompleted?: boolean;
  carPhotos?: string[];
  chatProfilePhotos?: string[];
  bio?: string;
};

function validateInstagramHandle(input: unknown): { valid: boolean; value?: string; message?: string } {
  if (typeof input !== "string") return { valid: false, message: "Handle must be a string" };
  const trimmed = input.trim();
  const withoutAt = trimmed.replace(/^@+/, "");
  const value = withoutAt.toLowerCase();
  if (value.length === 0) return { valid: false, message: "Handle is required" };
  if (value.length > 30) return { valid: false, message: "Handle must be at most 30 characters" };
  if (!/^[a-z0-9._]+$/.test(value)) return { valid: false, message: "Only letters, numbers, periods, and underscores are allowed" };
  return { valid: true, value };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getSurreal();
  const res = await db.query("SELECT name, displayName, image, vehicles, cars, plan, onboardingCompleted, carPhotos, chatProfilePhotos, bio FROM user WHERE email = $email LIMIT 1;", { email: user.email });
  const rowRaw = Array.isArray(res) && Array.isArray(res[0]) ? res[0][0] : null;
  const row: DbRow | null = rowRaw as DbRow | null;
  // Backwards compatibility: if vehicles missing, lift cars to vehicles
  const vehicles = row?.vehicles || (Array.isArray(row?.cars) ? row.cars.map((c) => ({ make: c.make, model: c.model, type: c.type || 'car', kitted: !!c.kitted }) as { make: string; model: string; type?: string; kitted?: boolean }) : []);
  const carPhotos = Array.isArray(row?.carPhotos) ? row?.carPhotos.filter((x) => typeof x === 'string') : [];
  const chatProfilePhotos = Array.isArray(row?.chatProfilePhotos) ? row.chatProfilePhotos.filter((x) => typeof x === 'string') : [];
  const bio = typeof row?.bio === 'string' ? row?.bio : '';
  return NextResponse.json({ profile: { name: row?.name, displayName: row?.displayName, image: row?.image, vehicles, carPhotos, chatProfilePhotos, bio, plan: row?.plan, onboardingCompleted: !!row?.onboardingCompleted } });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, displayName: displayNameRaw, image, vehicles, carPhotos, chatProfilePhotos, bio: bioRaw, carMake, carModel, vehicleMake, vehicleModel, vehicleType, kitted, onboardingCompleted } = body || {};
  // If name provided, validate first and bail on error (do not partially update)
  let normalizedName: string | undefined = undefined;
  if (name !== undefined) {
    const result = validateInstagramHandle(name);
    if (!result.valid) return NextResponse.json({ error: result.message || "Invalid handle", code: "INVALID_HANDLE" }, { status: 400 });
    normalizedName = result.value;
  }
  // Normalize displayName if provided
  let normalizedDisplayName: string | null | undefined = undefined;
  if (displayNameRaw !== undefined) {
    if (displayNameRaw === null) {
      normalizedDisplayName = null;
    } else if (typeof displayNameRaw === 'string') {
      const trimmed = displayNameRaw.replace(/\s+/g, ' ').trim();
      normalizedDisplayName = trimmed.slice(0, 50);
    } else {
      return NextResponse.json({ error: "Invalid displayName", code: "INVALID_DISPLAY_NAME" }, { status: 400 });
    }
  }
  const db = await getSurreal();

  // Update basic fields (avoid unsupported SurrealQL functions like coalesce())
  if (normalizedName !== undefined) {
    await db.query("UPDATE user SET name = $name WHERE email = $email;", { name: normalizedName, email: user.email });
  }
  if (normalizedDisplayName !== undefined) {
    await db.query("UPDATE user SET displayName = $displayName WHERE email = $email;", { displayName: normalizedDisplayName, email: user.email });
  }
  if (image !== undefined) {
    await db.query("UPDATE user SET image = $image WHERE email = $email;", { image, email: user.email });
  }

  // Replace entire vehicles array
  if (Array.isArray(vehicles)) {
    await db.query("UPDATE user SET vehicles = $vehicles WHERE email = $email;", { vehicles, email: user.email });
  }

  // Replace car photos (array of storage keys); legacy single list kept for compatibility
  if (Array.isArray(carPhotos)) {
    const cleaned = carPhotos.filter((x: unknown) => typeof x === 'string');
    await db.query("UPDATE user SET carPhotos = $carPhotos WHERE email = $email;", { carPhotos: cleaned, email: user.email });
  }

  // Replace chat profile photos (subset of carPhotos)
  if (Array.isArray(chatProfilePhotos)) {
    const cleaned = chatProfilePhotos.filter((x: unknown) => typeof x === 'string');
    await db.query("UPDATE user SET chatProfilePhotos = $chatProfilePhotos WHERE email = $email;", { chatProfilePhotos: cleaned, email: user.email });
  }

  // Update bio if provided
  if (bioRaw !== undefined) {
    let bio: string | null = null;
    if (typeof bioRaw === 'string') {
      bio = bioRaw.slice(0, 500);
    }
    await db.query("UPDATE user SET bio = $bio WHERE email = $email;", { bio, email: user.email });
  }

  // Append single vehicle from either car* or vehicle* keys
  const make = vehicleMake || carMake;
  const model = vehicleModel || carModel;
  const type = vehicleType || 'car';
  if (make && model) {
    await db.query(
      "UPDATE user SET vehicles = array::append(if defined(vehicles) THEN vehicles ELSE [] END, { make: $make, model: $model, type: $type, kitted: $kitted }) WHERE email = $email;",
      { make, model, type, kitted: !!kitted, email: user.email }
    );
  }

  if (onboardingCompleted === true) {
    await db.query("UPDATE user SET onboardingCompleted = true WHERE email = $email;", { email: user.email });
  }

  return NextResponse.json({ ok: true });
}


