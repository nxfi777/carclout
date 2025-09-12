import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

let hiddenIndexesEnsured = false;
async function ensureHiddenIndexes() {
	if (hiddenIndexesEnsured) return;
	try {
		const db = await getSurreal();
		await db.query("DEFINE INDEX uniq_dm_hidden ON TABLE dm_hidden FIELDS userEmail, otherEmail UNIQUE;");
	} catch {
	} finally {
		hiddenIndexesEnsured = true;
	}
}

export async function POST(request: Request) {
	const session = await auth().catch(() => null);
	const me = session?.user?.email as string | undefined;
	if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	const otherRaw: string = body?.otherEmail || "";
	const other = String(otherRaw || "").toLowerCase();
	if (!other) return NextResponse.json({ error: "Missing otherEmail" }, { status: 400 });
	// Do not allow hiding self-DM entry
	if (other === String(me).toLowerCase()) return NextResponse.json({ ok: true });

	const db = await getSurreal();
	await ensureHiddenIndexes();
	try {
		await db.create("dm_hidden", {
			userEmail: String(me).toLowerCase(),
			otherEmail: other,
			created_at: new Date().toISOString(),
		});
	} catch {}
	return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
	const session = await auth().catch(() => null);
	const me = session?.user?.email as string | undefined;
	if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	const otherRaw: string = body?.otherEmail || "";
	const other = String(otherRaw || "").toLowerCase();
	if (!other) return NextResponse.json({ error: "Missing otherEmail" }, { status: 400 });

	const db = await getSurreal();
	await ensureHiddenIndexes();
	try {
		await db.query("DELETE dm_hidden WHERE userEmail = $me AND otherEmail = $other;", { me: String(me).toLowerCase(), other });
	} catch {}
	return NextResponse.json({ ok: true });
}


