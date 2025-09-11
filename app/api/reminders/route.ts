import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

type ReminderRow = {
  id?: unknown;
  user?: unknown;
  title?: string;
  caption?: string;
  scheduled_at?: string;
  created_at?: string;
  sent_at?: string | null;
};

function toIdString(id: unknown): string | undefined {
  try {
    if (!id) return undefined;
    if (id instanceof RecordId) return id.toString();
    return String(id);
  } catch {
    return undefined;
  }
}

export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "20")));

  const db = await getSurreal();
  // Resolve the user's RecordId
  const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown } | undefined) : undefined;
  const idStr = toIdString(urow?.id);
  const rid = urow?.id instanceof RecordId ? (urow.id as RecordId) : (idStr ? new RecordId("user", idStr) : undefined);
  if (!rid) return NextResponse.json({ reminders: [] });

  const q = `SELECT id, title, caption, scheduled_at, created_at, sent_at
    FROM reminder WHERE user = $rid ORDER BY scheduled_at ASC LIMIT ${limit};`;
  const res = await db.query(q, { rid });
  const list = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as ReminderRow[]) : [];
  const reminders = list.map((r) => ({
    id: toIdString(r.id),
    title: r.title || null,
    caption: r.caption || "",
    scheduled_at: r.scheduled_at || null,
    created_at: r.created_at || null,
    sent_at: r.sent_at || null,
  }));
  return NextResponse.json({ reminders });
}

export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => ({}));
  const caption: string = typeof (body as { caption?: unknown })?.caption === "string" ? (body as { caption?: string }).caption! : "";
  const title: string | undefined =
    typeof (body as { title?: unknown })?.title === "string" ? (body as { title?: string }).title! : undefined;
  const whenIso: string | undefined =
    typeof (body as { scheduledAt?: unknown })?.scheduledAt === "string"
      ? (body as { scheduledAt?: string }).scheduledAt!
      : undefined;
  if (!whenIso) return NextResponse.json({ error: "Missing scheduledAt" }, { status: 400 });

  const when = new Date(whenIso);
  if (isNaN(when.getTime())) return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });

  const now = new Date();
  if (when.getTime() < now.getTime() - 60_000) return NextResponse.json({ error: "Time must be in the future" }, { status: 400 });

  const db = await getSurreal();
  const ures = await db.query("SELECT id FROM user WHERE email = $email LIMIT 1;", { email: session.user.email });
  const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { id?: unknown } | undefined) : undefined;
  const idStr2 = toIdString(urow?.id);
  const rid = urow?.id instanceof RecordId ? (urow.id as RecordId) : (idStr2 ? new RecordId("user", idStr2) : undefined);
  if (!rid) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const createdIso = new Date().toISOString();
  const doc = await db.create("reminder", {
    user: rid,
    title: title || "Post on Instagram",
    caption,
    scheduled_at: `d\"${when.toISOString()}\"`,
    created_at: `d\"${createdIso}\"`,
  });
  const row = (Array.isArray(doc) ? doc[0] : doc) as ReminderRow | undefined;
  return NextResponse.json({ reminder: row ? {
    id: toIdString(row.id),
    title: row.title || null,
    caption: row.caption || "",
    scheduled_at: row.scheduled_at || when.toISOString(),
    created_at: row.created_at || createdIso,
    sent_at: row.sent_at || null,
  } : null });
}


