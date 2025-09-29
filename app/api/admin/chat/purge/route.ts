import { NextResponse } from "next/server";
import { RecordId } from "surrealdb";
import { getSurreal } from "@/lib/surrealdb";
import { auth } from "@/lib/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveRecordId(raw: unknown): RecordId | null {
  try {
    if (!raw) return null;
    if (raw instanceof RecordId) return raw;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) {
        return new RecordId("message", trimmed);
      }
      const table = trimmed.slice(0, colonIndex) || "message";
      let idPart = trimmed.slice(colonIndex + 1);
      if (idPart.startsWith("⟨") && idPart.endsWith("⟨")) {
        idPart = idPart.slice(1, -1);
      }
      if (idPart.startsWith("⟨") && idPart.endsWith("⟩")) {
        idPart = idPart.slice(1, -1);
      }
      return new RecordId(table, idPart);
    }
    if (isRecord(raw)) {
      const tb = typeof raw.tb === "string" ? raw.tb : "message";
      if (typeof raw.id === "string") {
        return new RecordId(tb, raw.id);
      }
      if (typeof raw.value === "string") {
        return new RecordId(tb, raw.value);
      }
    }
  } catch {}
  return null;
}

function flattenQueryResult(res: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(res)) return [];
  const out: Array<Record<string, unknown>> = [];
  const stack: unknown[] = [...res];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (isRecord(current)) {
      out.push(current);
      const nested = current.result;
      if (nested !== undefined) {
        stack.push(nested);
      }
    }
  }
  return out;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role || "user";
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const channelRaw: unknown = body?.channel;
  const limitRaw: unknown = body?.limit;
  const channel = (typeof channelRaw === "string" && channelRaw.trim()) ? channelRaw.trim() : "general";
  let limit = 10;
  if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) limit = Math.floor(limitRaw);
  if (typeof limitRaw === "string" && /\d+/.test(limitRaw)) limit = parseInt(limitRaw, 10);
  if (limit < 1) limit = 1;
  if (limit > 500) limit = 500;

  const db = await getSurreal();
  const idsRaw: unknown = (body as { ids?: unknown } | undefined)?.ids;
  const explicitIds = Array.isArray(idsRaw)
    ? idsRaw
        .map((value) => resolveRecordId(value))
        .filter((value): value is RecordId => value instanceof RecordId)
    : [];

  const unique = new Map<string, RecordId>();
  for (const rid of explicitIds) {
    const key = rid.toString();
    if (!unique.has(key)) {
      unique.set(key, rid);
      if (unique.size >= limit) break;
    }
  }

  if (unique.size < limit) {
    const remaining = limit - unique.size;
    const res = await db.query(
      "SELECT id, created_at FROM message WHERE channel = $c ORDER BY created_at DESC LIMIT $l;",
      { c: channel, l: Math.max(remaining, 1) }
    );
    const rows = flattenQueryResult(res);
    for (const row of rows) {
      const resolved = resolveRecordId(row?.id);
      if (!resolved) continue;
      const key = resolved.toString();
      if (unique.has(key)) continue;
      unique.set(key, resolved);
      if (unique.size >= limit) break;
    }
  }

  const recordIds = Array.from(unique.values());
  if (recordIds.length === 0) {
    return NextResponse.json({ ok: true, purged: 0, purgedIds: [] });
  }

  let purged = 0;
  const purgedIds: string[] = [];
  const results = await Promise.all(
    recordIds.map(async (rid) => {
      try {
        await db.delete(rid);
        purgedIds.push(rid.toString());
        return true;
      } catch {
        return false;
      }
    })
  );
  purged = results.filter(Boolean).length;

  if (purged !== recordIds.length) {
    return NextResponse.json({ ok: false, purged, purgedIds }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged, purgedIds });
}


