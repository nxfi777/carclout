import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import type { Uuid } from "surrealdb";

const CALL_ID = "ignite-global";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await db.query("LIVE SELECT * FROM livestream_status WHERE callId = $callId", { callId: CALL_ID });
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id as unknown as Uuid;
        await db.subscribeLive(liveId as Uuid, (...args: unknown[]) => {
          try {
            const evt = args[0];
            const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
            let raw: unknown = evt;
            if (isObj(evt)) {
              if ('result' in evt) raw = (evt as { result?: unknown }).result;
              else if ('record' in evt) raw = (evt as { record?: unknown }).record;
              else if ('data' in evt) raw = (evt as { data?: unknown }).data;
            }
            let after: unknown = raw;
            if (isObj(raw) && 'after' in raw) {
              after = (raw as { after?: unknown }).after;
            }
            const payload = {
              isLive: isObj(after) ? !!(after as { isLive?: unknown }).isLive : false,
              sessionSlug: isObj(after) ? ((after as { sessionSlug?: unknown }).sessionSlug ?? null) : null,
              updated_at: isObj(after) ? ((after as { updated_at?: unknown }).updated_at ?? null) : null,
              started_at: isObj(after) ? ((after as { started_at?: unknown }).started_at ?? null) : null,
              ended_at: isObj(after) ? ((after as { ended_at?: unknown }).ended_at ?? null) : null,
            };
            controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {}
        });
        // Emit current snapshot
        try {
          const r = await db.query("SELECT * FROM livestream_status WHERE callId = $callId LIMIT 1;", { callId: CALL_ID });
          const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as Record<string, unknown>) : null;
          const payload = {
            isLive: !!(row as { isLive?: unknown })?.isLive,
            sessionSlug: (row as { sessionSlug?: unknown })?.sessionSlug || null,
            updated_at: (row as { updated_at?: unknown })?.updated_at || null,
            started_at: (row as { started_at?: unknown })?.started_at || null,
            ended_at: (row as { ended_at?: unknown })?.ended_at || null,
          };
          controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {}
      } catch {
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: 'live_failed' })}\n\n`));
      }
    },
    async cancel() { try { if (liveId) await db.kill(liveId as Uuid); } catch {} },
  });

  const res = new NextResponse(stream as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  const signal = (request as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId as Uuid); } catch {} });
  }

  return res;
}


