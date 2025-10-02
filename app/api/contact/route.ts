import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const { name, email, message } = (await request.json()) as { name?: string; email?: string; message?: string };
    const safeName = String(name || "").trim();
    const safeEmail = String(email || "").trim();
    const safeMessage = String(message || "").trim();
    if (!safeName || !safeEmail || !safeMessage) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    const emailRegex = /.+@.+\..+/;
    if (!emailRegex.test(safeEmail)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const subject = `Contact form: ${safeName}`;
    const text = `From: ${safeName} <${safeEmail}>
\nMessage:\n${safeMessage}`;
    const escaped = safeMessage
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    const html = `<div style=\"font-family:Arial,Helvetica,sans-serif\"><h3 style=\"margin:0 0 .5rem\">New contact message</h3><p style=\"margin:.25rem 0;color:#444\"><b>From:</b> ${safeName} &lt;${safeEmail}&gt;</p><div style=\"margin-top:.5rem;padding:.75rem;border:1px solid #ddd;border-radius:8px;background:#fafafa;color:#222\">${escaped}</div></div>`;
    await sendEmail({ to: "support@carclout.io", subject, html, text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { console.error("Contact POST error", e); } catch {}
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}


