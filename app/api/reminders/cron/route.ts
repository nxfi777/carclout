import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "support@carclout.io";
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
      const subject = row.title || "Time to post your build 🚗";
      const caption = (row.caption || "").trim();
      const bodyText = `${subject}\n\n${caption ? `Your caption is ready:\n\n${caption}\n\n` : ""}Take 2 minutes right now:\n\n1. Open Instagram\n2. Post your build\n3. Watch the engagement roll in\n\nYour audience is waiting.\n\n— CarClout Team`;
      const bodyHtml = `<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:36rem;margin:0 auto;\"><div style=\"background:#111a36;color:#e7ecff;border-radius:0.75rem;border:1px solid #263166;padding:1.5rem;\"><h2 style=\"margin:0 0 0.75rem;font-size:1.375rem;line-height:1.3;color:#fff\">${subject}</h2>${caption ? "<div style=\"background:#0b1020;border:1px solid #263166;border-radius:0.5rem;padding:1rem;margin:0 0 1rem\"><p style=\"margin:0 0 0.5rem;color:#aab4ff;font-size:0.75rem;letter-spacing:.1em;text-transform:uppercase\">YOUR CAPTION</p><p style=\"margin:0;color:#cfd7ff;line-height:1.5\">" + caption.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>") + "</p></div>" : ""}<p style=\"margin:0 0 1rem;color:#cfd7ff;font-size:1rem\"><b>Take 2 minutes right now:</b></p><ol style=\"margin:0 0 1rem;padding-left:1.5rem;color:#cfd7ff;line-height:1.6\"><li>Open Instagram</li><li>Post your build</li><li>Watch the engagement roll in</li></ol><p style=\"margin:0;color:#b8c0ff;font-size:0.9375rem\">Your audience is waiting. 🔥</p></div></div>`;
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


