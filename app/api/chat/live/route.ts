import { NextResponse } from "next/server";
import { getSurreal } from "@/lib/surrealdb";
import { checkChannelRead, getSessionLite, type ChannelLike } from "@/lib/chatPerms";
import { isRecord } from "@/lib/records";
import { RecordId, Uuid } from "surrealdb";

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
    channel: toStringOrUndefined(record.channel),
    created_at: toIsoOrNull(record.created_at),
    userEmail: toStringOrUndefined(record.userEmail),
    userName: typeof record.userName === "string" ? record.userName : toStringOrUndefined(record.userName),
    user: toStringOrUndefined(record.user),
    attachments: toAttachments(record.attachments),
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || "general";
  const channelLower = channel.toLowerCase();
  if (channel === "request-a-feature") {
    return new Response(null, { status: 204 });
  }

  const session = await getSessionLite();
  const db = await getSurreal();
  const te = new TextEncoder();
  let liveId: Uuid | null = null;

  try {
    const cres = await db.query("SELECT * FROM channel WHERE slug = $slug LIMIT 1;", { slug: channel });
    const crow: ChannelLike | null = Array.isArray(cres) && Array.isArray(cres[0]) ? ((cres[0][0] as ChannelLike) || null) : null;
    if (crow && !checkChannelRead(session, crow)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {}

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const subscriptionId = await db.live<Record<string, unknown>>("message", (actionRaw, resultRaw) => {
          Promise.resolve().then(() => {
            try {
              const actionLower = typeof actionRaw === "string" ? actionRaw.toLowerCase() : "update";
              if (actionLower === "close") return;

              const record = isRecord(resultRaw) ? resultRaw : null;
              const normalized = normalizeMessage(record);
              if (!normalized) return;
              const channelValue = typeof normalized.channel === "string" ? normalized.channel : "";
              if (channelValue.toLowerCase() !== channelLower) return;

              const payload: Record<string, unknown> = { action: actionLower, after: normalized };
              controller.enqueue(te.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch {}
          });
        });
        liveId = subscriptionId instanceof Uuid ? subscriptionId : new Uuid(String(subscriptionId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "live_failed";
        controller.enqueue(te.encode(`event: error\n` + `data: ${JSON.stringify({ error: message })}\n\n`));
      }
    },
    async cancel() {
      try {
        if (liveId) await db.kill(liveId);
      } catch {}
    },
  });

  const signal = (request as unknown as { signal?: AbortSignal }).signal;
  if (signal) {
    signal.addEventListener("abort", async () => {
      try {
        if (liveId) await db.kill(liveId);
      } catch {}
    });
  }

  return new NextResponse(stream as unknown as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

