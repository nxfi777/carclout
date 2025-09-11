import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { Uuid } from "surrealdb";

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
        await db.subscribeLive(liveId, (...args: unknown[]) => {
          try {
            const ev = (args?.[0] ?? {}) as Record<string, unknown>;
            const action = (typeof ev.action === 'string' ? ev.action : (typeof ev.type === 'string' ? ev.type : 'update')) as string;
            const raw = (ev as { result?: unknown; record?: unknown }).result ?? (ev as { record?: unknown }).record ?? ev;
            let user: unknown = raw;
            try {
              const maybeEmail = (raw as { email?: unknown } | undefined)?.email;
              if (!maybeEmail) {
                user = (raw as { after?: unknown } | undefined)?.after ?? (raw as { data?: unknown } | undefined)?.data ?? raw;
              }
            } catch {}
            const u = user as Record<string, unknown> | undefined;
            const payload = { op: String(action).toLowerCase(), user: { email: u?.email as string | undefined, name: u?.name as string | undefined, image: u?.image as string | undefined, presence_status: u?.presence_status as string | undefined, role: u?.role as string | undefined, plan: u?.plan as string | undefined } };
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


