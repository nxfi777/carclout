import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";
import { retryOnConflict } from "@/lib/retry";

type VehicleDb = { make: string; model: string; type?: string; kitted?: unknown };
type DbRow = {
  name?: string;
  displayName?: string;
  image?: string;
  vehicles?: Array<{ make: string; model: string; type?: string; kitted?: boolean; colorFinish?: string; accents?: string; photos?: string[] }>;
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
  // Compute flattened carPhotos from vehicles.photos for compatibility if present
  const flattenedFromVehicles = Array.isArray(vehicles)
    ? (vehicles as Array<{ photos?: unknown }>).flatMap((v) => (Array.isArray(v?.photos) ? (v.photos as string[]).filter((x) => typeof x === 'string') : []))
    : [];
  const carPhotos = flattenedFromVehicles.length ? flattenedFromVehicles : (Array.isArray(row?.carPhotos) ? row?.carPhotos.filter((x) => typeof x === 'string') : []);
  const chatProfilePhotos = Array.isArray(row?.chatProfilePhotos) ? row.chatProfilePhotos.filter((x) => typeof x === 'string') : [];
  const bio = typeof row?.bio === 'string' ? row?.bio : '';
  return NextResponse.json({ profile: { name: row?.name, displayName: row?.displayName, image: row?.image, vehicles, carPhotos, chatProfilePhotos, bio, plan: row?.plan, onboardingCompleted: !!row?.onboardingCompleted } });
}

export async function POST(req: Request) {
  try {
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
    
    // Normalize bio if provided
    let normalizedBio: string | null | undefined = undefined;
    if (bioRaw !== undefined) {
      normalizedBio = typeof bioRaw === 'string' ? bioRaw.slice(0, 500) : null;
    }

    // Wrap all database operations in retry logic to handle transaction conflicts
    await retryOnConflict(async () => {
      const db = await getSurreal();
      
      // Build a single combined UPDATE query for all basic fields
      const updateFields: string[] = [];
      const params: Record<string, unknown> = { email: user.email };
      
      if (normalizedName !== undefined) {
        updateFields.push("name = $name");
        params.name = normalizedName;
      }
      
      if (normalizedDisplayName !== undefined) {
        updateFields.push("displayName = $displayName");
        params.displayName = normalizedDisplayName;
      }
      
      if (image !== undefined) {
        updateFields.push("image = $image");
        params.image = image;
      }
      
      if (normalizedBio !== undefined) {
        updateFields.push("bio = $bio");
        params.bio = normalizedBio;
      }
      
      if (onboardingCompleted === true) {
        updateFields.push("onboardingCompleted = true");
      }
      
      // Handle vehicles and compute flattened carPhotos
      if (Array.isArray(vehicles)) {
        updateFields.push("vehicles = $vehicles");
        params.vehicles = vehicles;
        
        // Compute flattened carPhotos from vehicles.photos
        const flat = vehicles.flatMap((v: unknown) => 
          Array.isArray((v as { photos?: unknown }).photos) 
            ? ((v as { photos: unknown[] }).photos as unknown[]).filter((x)=> typeof x === 'string') as string[] 
            : []
        );
        updateFields.push("carPhotos = $carPhotos");
        params.carPhotos = flat;
      } else if (Array.isArray(carPhotos)) {
        // Only update carPhotos if vehicles not provided
        const cleaned = carPhotos.filter((x: unknown) => typeof x === 'string');
        updateFields.push("carPhotos = $carPhotos");
        params.carPhotos = cleaned;
      }
      
      if (Array.isArray(chatProfilePhotos)) {
        const cleaned = chatProfilePhotos.filter((x: unknown) => typeof x === 'string');
        updateFields.push("chatProfilePhotos = $chatProfilePhotos");
        params.chatProfilePhotos = cleaned;
      }
      
      // Execute combined update if there are fields to update
      if (updateFields.length > 0) {
        const query = `UPDATE user SET ${updateFields.join(", ")} WHERE email = $email;`;
        await db.query(query, params);
      }
      
      // Append single vehicle from either car* or vehicle* keys (separate query as it uses array::append)
      const make = vehicleMake || carMake;
      const model = vehicleModel || carModel;
      const type = vehicleType || 'car';
      if (make && model) {
        await db.query(
          "UPDATE user SET vehicles = array::append(if defined(vehicles) THEN vehicles ELSE [] END, { make: $make, model: $model, type: $type, kitted: $kitted }) WHERE email = $email;",
          { make, model, type, kitted: !!kitted, email: user.email }
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ 
      error: "Failed to update profile", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}


