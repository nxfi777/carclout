import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { getSessionUser } from "@/lib/user";

type MutePayload = {
	targetEmail: string;
	channels?: string[]; // channel slugs; empty/undefined => global (all channels)
	durationSeconds?: number; // optional; if omitted, indefinite
};

function idToStringLike(id: unknown): string | undefined {
	try {
		if (typeof id === "object" && id !== null) {
			const obj = id as { id?: { toString?: () => string }; toString?: () => string };
			if (obj.id && typeof obj.id.toString === "function") {
				const s = obj.id.toString();
				if (typeof s === "string" && s) return s;
			}
			if (typeof obj.toString === "function") {
				const s = obj.toString();
				if (typeof s === "string" && s) return s;
			}
		}
		if (typeof id === "string" && id) return id;
	} catch {}
	return undefined;
}

export async function GET() {
	const user = await getSessionUser();
	if (!user?.email || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const db = await getSurreal();
	const res = await db.query("SELECT id, targetEmail, channels, expires_at, created_at, reason FROM mute ORDER BY created_at DESC LIMIT 500;");
	const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Array<Record<string, unknown>>) : [];
	const mutes = rows.map((r) => ({
		id: idToStringLike((r as { id?: unknown }).id) || "",
		targetEmail: (r as { targetEmail?: string }).targetEmail,
		channels: Array.isArray((r as { channels?: string[] }).channels) ? (r as { channels?: string[] }).channels : null,
		expires_at: (r as { expires_at?: string }).expires_at,
		created_at: (r as { created_at?: string }).created_at,
		reason: (r as { reason?: string }).reason,
	}));
	return NextResponse.json({ mutes });
}

export async function POST(req: Request) {
	const user = await getSessionUser();
	if (!user?.email || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const body = await req.json().catch(() => ({} as Record<string, unknown>));
	const payload: MutePayload = {
		targetEmail: String((body as { targetEmail?: string }).targetEmail || "").toLowerCase(),
		channels: Array.isArray((body as { channels?: unknown[] }).channels) ? ((body as { channels?: unknown[] }).channels as unknown[]).map((s) => String(s)) : undefined,
		durationSeconds: Number.isFinite((body as { durationSeconds?: unknown }).durationSeconds as number) ? Number((body as { durationSeconds?: unknown }).durationSeconds) : undefined,
	};
	if (!payload.targetEmail) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
	if (payload.targetEmail === user.email.toLowerCase()) return NextResponse.json({ error: "Cannot mute self" }, { status: 400 });
	const now = Date.now();
	const expires = payload.durationSeconds ? new Date(now + payload.durationSeconds * 1000).toISOString() : undefined;
	const db = await getSurreal();
	const created = await db.create("mute", {
		targetEmail: payload.targetEmail,
		channels: payload.channels && payload.channels.length ? payload.channels : null,
		created_at: new Date(now).toISOString(),
		expires_at: expires,
	});
	const row = Array.isArray(created) ? (created[0] as Record<string, unknown>) : (created as Record<string, unknown>);
	return NextResponse.json({ mute: { id: idToStringLike((row as { id?: unknown }).id) || "", ...payload, expires_at: expires } });
}

export async function DELETE(req: Request) {
	const user = await getSessionUser();
	if (!user?.email || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { targetEmail } = (await req.json().catch(() => ({} as Record<string, unknown>))) as { targetEmail?: unknown };
	if (!targetEmail || typeof targetEmail !== "string") return NextResponse.json({ error: "Invalid target" }, { status: 400 });
	const db = await getSurreal();
	await db.query("DELETE mute WHERE targetEmail = $target;", { target: targetEmail.toLowerCase() });
	return NextResponse.json({ ok: true });
}


