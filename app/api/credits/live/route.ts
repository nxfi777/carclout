import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import type { Uuid } from "surrealdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email || "";
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Subscribe to credits changes for this user
        const res = await db.query(
          "LIVE SELECT * FROM user WHERE email = $email",
          { email }
        );
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? (res[0] as unknown[])[0] : res[0]) : res;
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
            const credits = isObj(after) && typeof (after as { credits_balance?: unknown }).credits_balance === 'number'
              ? Number((after as { credits_balance: number }).credits_balance)
              : null;
            if (credits != null) {
              controller.enqueue(te.encode(`data: ${JSON.stringify({ credits })}\n\n`));
            }
          } catch {}
        });
        // Emit current value immediately
        try {
          const r = await db.query("SELECT credits_balance FROM user WHERE email = $email LIMIT 1;", { email });
          const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as { credits_balance?: unknown } | null) : null;
          const credits = typeof row?.credits_balance === "number" ? Number(row.credits_balance) : 0;
          controller.enqueue(te.encode(`data: ${JSON.stringify({ credits })}\n\n`));
        } catch {}
      } catch {
        controller.enqueue(te.encode(
          `event: error\n` + `data: ${JSON.stringify({ error: "live_failed" })}\n\n`
        ));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId as Uuid); } catch {}
    },
  });

  const res = new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  const signal = (request as unknown as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => {
      try { if (liveId) await db.kill(liveId as Uuid); } catch {}
    });
  }

  return res;
}


