import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/user";
import { getSurreal } from "@/lib/surrealdb";

export async function GET() {
	const db = await getSurreal();
	const res = await db.query("SELECT userEmail FROM cohost;");
	const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<{ userEmail?: string }>) : [];
	return NextResponse.json({ cohosts: rows.map(r => r.userEmail).filter(Boolean) });
}

export async function POST(req: Request) {
	const user = await getSessionUser();
	if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	const body = await req.json().catch(() => ({} as Record<string, unknown>));
	const email: string = String((body as { email?: unknown })?.email || '').trim();
	if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
	const db = await getSurreal();
	await db.create('cohost', { userEmail: email, created_at: new Date().toISOString() });
	return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
	const user = await getSessionUser();
	if (user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	const body = await req.json().catch(() => ({} as Record<string, unknown>));
	const email: string = String((body as { email?: unknown })?.email || '').trim();
	if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
	const db = await getSurreal();
	await db.query('DELETE cohost WHERE userEmail = $email;', { email });
	return NextResponse.json({ ok: true });
}


