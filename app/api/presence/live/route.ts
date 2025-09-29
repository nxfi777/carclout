import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId, Uuid } from "surrealdb";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function unwrapLiveResult(candidate: unknown): Record<string, unknown> | null {
  if (!isRecord(candidate)) return null;
  if (isRecord(candidate.after)) return unwrapLiveResult(candidate.after);
  if (isRecord(candidate.data)) return unwrapLiveResult(candidate.data);
  return candidate;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  return null;
}

function toMaybeString(value: unknown): string | undefined {
  if (value instanceof RecordId) return value.toString();
  if (typeof value === "string" && value.length) return value;
  return undefined;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Start a LIVE SELECT; returns UUID (string or Uuid)
        const res = await db.query("LIVE SELECT * FROM user;");
        const idRaw = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        try {
          liveId = idRaw instanceof Uuid ? idRaw : new Uuid(String(idRaw));
        } catch {
          liveId = null;
        }
        if (!liveId) throw new Error("live id parse failed");
        await db.subscribeLive(liveId, (first: unknown, second?: unknown) => {
          try {
            let actionRaw: string | undefined;
            let resultRaw: unknown = undefined;

            if (typeof first === "string") {
              actionRaw = first;
              resultRaw = second;
            } else if (isRecord(first)) {
              actionRaw = typeof first.action === "string" ? first.action : (typeof first.type === "string" ? first.type : undefined);
              resultRaw = first.result ?? first.record ?? first.after ?? first.data ?? second;
            } else {
              resultRaw = second ?? first;
            }

            const action = (actionRaw ?? "update").toLowerCase();
            if (action === "close") return;

            const userRecord = unwrapLiveResult(resultRaw);
            if (!userRecord) return;

            const payload = {
              op: action,
              user: {
                email: toMaybeString(userRecord.email),
                name: toMaybeString(userRecord.name),
                image: toMaybeString(userRecord.image),
                presence_status: toMaybeString(userRecord.presence_status),
                presence_updated_at: toIsoOrNull(userRecord.presence_updated_at),
                last_seen: toIsoOrNull(userRecord.last_seen),
                role: toMaybeString(userRecord.role),
                plan: toMaybeString(userRecord.plan),
              },
            };

            controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {}
        });
      } catch {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId); } catch {}
    },
  });

  const signal = (request as unknown as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId); } catch {} });
  }

  return new NextResponse(stream as unknown as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


