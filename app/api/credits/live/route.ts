import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email || "";
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: any;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Subscribe to credits changes for this user
        const res = await db.query(
          "LIVE SELECT * FROM user WHERE email = $email",
          { email }
        );
        const id = Array.isArray(res) && res[0] ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
        liveId = id;
        await db.subscribeLive(liveId, (...args: unknown[]) => {
          try {
            const e = args[0] as any;
            const raw = e?.result || e?.record || e?.data || e;
            const after = raw?.after || raw;
            const credits = typeof after?.credits_balance === "number" ? after.credits_balance : null;
            if (credits != null) {
              controller.enqueue(te.encode(`data: ${JSON.stringify({ credits })}\n\n`));
            }
          } catch {}
        });
        // Emit current value immediately
        try {
          const r = await db.query("SELECT credits_balance FROM user WHERE email = $email LIMIT 1;", { email });
          const row = Array.isArray(r) && Array.isArray(r[0]) ? (r[0][0] as any) : null;
          const credits = typeof row?.credits_balance === "number" ? Number(row.credits_balance) : 0;
          controller.enqueue(te.encode(`data: ${JSON.stringify({ credits })}\n\n`));
        } catch {}
      } catch (e) {
        controller.enqueue(te.encode(
          `event: error\n` + `data: ${JSON.stringify({ error: "live_failed" })}\n\n`
        ));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId); } catch {}
    },
  });

  const res = new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  const signal = (request as any).signal as AbortSignal | undefined;
  if (signal) {
    signal.addEventListener("abort", async () => {
      try { if (liveId) await db.kill(liveId); } catch {}
    });
  }

  return res;
}


