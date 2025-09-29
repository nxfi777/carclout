import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { isRecord } from "@/lib/records";
import { RecordId, Uuid } from "surrealdb";
import { auth } from "@/lib/auth";

function toStringOrUndefined(value: unknown): string | undefined {
  if (value instanceof RecordId) return value.toString();
  if (typeof value === "string" && value.length) return value;
  return undefined;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toAttachments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length) out.push(item);
  }
  return out;
}

function normalizeMessage(record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record) return null;
  return {
    id: toStringOrUndefined(record.id),
    text: typeof record.text === "string" ? record.text : toStringOrUndefined(record.text) ?? "",
    dmKey: toStringOrUndefined(record.dmKey),
    created_at: toIsoOrNull(record.created_at),
    senderEmail: toStringOrUndefined(record.senderEmail),
    recipientEmail: toStringOrUndefined(record.recipientEmail),
    attachments: toAttachments(record.attachments),
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth().catch(() => null);
  const me = session?.user?.email as string | undefined;
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const other = searchParams.get("user") || "";
  if (!other) return NextResponse.json({ error: "Missing user" }, { status: 400 });

  const a = String(me).toLowerCase();
  const b = String(other).toLowerCase();
  const key = a <= b ? `${a}|${b}` : `${b}|${a}`;

  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const subscriptionId = await db.live<Record<string, unknown>>("dm_message", (actionRaw, resultRaw) => {
          Promise.resolve().then(() => {
            try {
              const action = typeof actionRaw === "string" ? actionRaw.toLowerCase() : "update";
              if (action === "close") return;

              const record = isRecord(resultRaw) ? resultRaw : null;
              const normalized = normalizeMessage(record);
              if (!normalized) return;
              const dmKey = typeof normalized.dmKey === "string" ? normalized.dmKey.toLowerCase() : "";
              if (dmKey !== key) return;

              const payload: Record<string, unknown> = { action, after: normalized };
              controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch {}
          });
        });
        liveId = subscriptionId instanceof Uuid ? subscriptionId : new Uuid(String(subscriptionId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'live_failed';
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: message })}\n\n`));
      }
    },
    async cancel() {
      try { if (liveId) await db.kill(liveId as Uuid); } catch {}
    },
  });

  const signal = (request as unknown as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => { try { if (liveId) await db.kill(liveId as Uuid); } catch {} });
  }

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

