import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "ignite@nytforge.com";
  if (!apiKey) throw new Error("Missing Resend API key");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) throw new Error("Resend error: " + (await res.text()));
}

export async function POST() {
  const session = await auth().catch(() => null);
  const role = session?.user?.role || "user";
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = await getSurreal();
  const nowIso = new Date().toISOString();
  const res = await db.query<[
    { id: unknown; user: RecordId<"user"> | string; title?: string; caption?: string; scheduled_at?: string; sent_at?: string | null }[]
  ]>(
    `SELECT id, user, title, caption, scheduled_at, sent_at FROM reminder WHERE (sent_at = NONE OR sent_at = NULL) AND scheduled_at <= d"${nowIso}" ORDER BY scheduled_at ASC LIMIT 200;`
  );
  const rows = res[0] || [];

  let sent = 0;
  for (const row of rows) {
    try {
      const userRid = row.user instanceof RecordId ? row.user : new RecordId("user", String(row.user));
      // Look up user email and name for personalization
      const ures = await db.query<[{ email?: string; name?: string }[]]>(
        "SELECT email, name FROM user WHERE id = $rid LIMIT 1;",
        { rid: userRid }
      );
      const urow = Array.isArray(ures) && Array.isArray(ures[0]) ? (ures[0][0] as { email?: string; name?: string } | undefined) : undefined;
      const email = String(urow?.email || "");
      if (!email) continue;
      const subject = row.title || "Your scheduled Instagram post";
      const caption = (row.caption || "").trim();
      const bodyText = `Reminder: ${subject}\n\n${caption ? `Caption:\n${caption}\n\n` : ""}Open Instagram and post.\n\n— Ignition`;
      const bodyHtml = `<div style=\"font-family:Arial,Helvetica,sans-serif;\"><h2 style=\"margin:0 0 .5rem\">Reminder: ${subject}</h2><p style=\"margin:.2rem 0\">${caption ? "<b>Caption:</b><br/>" + caption.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>") : ""}</p><p style=\"margin:1rem 0 0;color:#555\">Open Instagram and post. ✨</p></div>`;
      await sendEmail({ to: email, subject, html: bodyHtml, text: bodyText });
      const ridString = ((): string => {
        const anyId = row.id as unknown;
        if (anyId && typeof (anyId as { toString?: () => string }).toString === 'function') {
          return (anyId as { toString: () => string }).toString();
        }
        return String(anyId);
      })();
      await db.merge(ridString, { sent_at: nowIso });
      sent++;
    } catch {}
  }

  return NextResponse.json({ ok: true, sent });
}


