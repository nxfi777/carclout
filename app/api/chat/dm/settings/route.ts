import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function GET() {
	const session = await auth().catch(() => null);
	const me = session?.user?.email as string | undefined;
	if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const db = await getSurreal();
	try {
		const res = await db.query("SELECT dm_ttl_seconds FROM user WHERE email = $me LIMIT 1;", { me });
		const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { dm_ttl_seconds?: unknown } | null) : null;
		let ttl = DEFAULT_TTL_SECONDS;
		const v = (row?.dm_ttl_seconds as number | undefined);
		if (typeof v === 'number' && Number.isFinite(v)) ttl = Math.max(0, Math.floor(v));
		return NextResponse.json({ ttlSeconds: ttl });
	} catch {
		return NextResponse.json({ ttlSeconds: DEFAULT_TTL_SECONDS });
	}
}

export async function POST(request: Request) {
	const session = await auth().catch(() => null);
	const me = session?.user?.email as string | undefined;
	if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	let ttl: number = Number(body?.ttlSeconds);
	if (!Number.isFinite(ttl)) ttl = DEFAULT_TTL_SECONDS;
	// Clamp to sensible bounds: 0 = never expire, up to 30 days
	const MAX = 30 * 24 * 60 * 60;
	ttl = Math.max(0, Math.min(MAX, Math.floor(ttl)));
	const db = await getSurreal();
	try {
		await db.query("UPDATE user SET dm_ttl_seconds = $ttl WHERE email = $me;", { ttl, me });
		return NextResponse.json({ ok: true, ttlSeconds: ttl });
	} catch {
		return NextResponse.json({ error: "Failed to save" }, { status: 500 });
	}
}


