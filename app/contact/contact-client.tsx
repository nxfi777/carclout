"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ContactPageClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill out all fields.");
      return;
    }
    const emailRegex = /.+@.+\..+/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && (data as { error?: string }).error) || "Failed to send message");
      toast.success("Message sent! We'll get back to you soon.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      try {
        console.error("Contact error", err);
      } catch {}
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-glow">
      <section className="max-w-2xl mx-auto pt-[1.5rem] pb-[3rem]">
        <div className="text-center mb-[1.25rem]">
          <h1 className="text-[clamp(1.6rem,4.5vw,2.4rem)] font-semibold tracking-tight">Contact Us</h1>
          <p className="text-[color:var(--foreground)]/80 mt-[0.5rem]">Have a question or need help? Send us a message.</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--popover)]/70 backdrop-blur p-[1rem] md:p-[1.25rem] space-y-[0.9rem]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[0.75rem]">
            <div className="space-y-[0.35rem]">
              <label htmlFor="name" className="text-sm text-[color:var(--foreground)]/80">
                Name
              </label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-10" required />
            </div>
            <div className="space-y-[0.35rem]">
              <label htmlFor="email" className="text-sm text-[color:var(--foreground)]/80">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10" required />
            </div>
          </div>
          <div className="space-y-[0.35rem]">
            <label htmlFor="message" className="text-sm text-[color:var(--foreground)]/80">
              Message
            </label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" className="min-h-[8rem]" required />
          </div>
          <div className="flex items-center justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Message"}
            </Button>
          </div>
          <p className="text-xs text-[color:var(--foreground)]/60">
            Or email us directly at
            <a className="underline hover:text-[color:var(--primary)]" href="mailto:support@carclout.io">
              support@carclout.io
            </a>
            .
          </p>
        </form>
      </section>
    </main>
  );
}


