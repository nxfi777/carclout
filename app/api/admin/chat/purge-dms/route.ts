import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

// Admin endpoint to purge expired DM messages across the database.
// Intended for cron usage. Uses each sender's dm_ttl_seconds setting; self-DMs are excluded.
export async function POST(_request: Request) {
	const session = await auth();
	if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const role = session.user.role || "user";
	if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const db = await getSurreal();
	// Strategy:
	// 1) Get distinct senderEmail values and their ttl (default 24h).
	// 2) For each, delete DMs older than cutoff, excluding self-DM.
	try {
		const ures = await db.query(
			"SELECT email, dm_ttl_seconds FROM user WHERE email IN (SELECT DISTINCT senderEmail FROM dm_message);"
		);
		const rows = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0] as Array<{ email?: string; dm_ttl_seconds?: number }>) : [];
		for (const r of rows) {
			const email = (r?.email || '').toLowerCase();
			if (!email) continue;
			let ttl = 24 * 60 * 60;
			if (typeof r?.dm_ttl_seconds === 'number' && Number.isFinite(r.dm_ttl_seconds)) ttl = Math.max(0, Math.floor(r.dm_ttl_seconds));
			if (ttl <= 0) continue; // never expire for this user
			const cutoffIso = new Date(Date.now() - ttl * 1000).toISOString();
			try {
				await db.query(
					"DELETE dm_message WHERE senderEmail = $email AND senderEmail != recipientEmail AND created_at < $cutoff RETURN NONE;",
					{ email, cutoff: cutoffIso }
				);
				// SurrealDB DELETE returns [] by default; we don't rely on return value for counts
				// Optionally we could run a COUNT before delete for accuracy
			} catch {}
		}
		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ error: "Failed to purge" }, { status: 500 });
	}
}


