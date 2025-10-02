"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPageClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn("resend", { email, callbackUrl: "/dashboard", redirect: true });
    } catch (err) {
      console.error("Sign-in error", err);
      setError("Failed to send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-[1.5rem] py-[2rem]">
      <Card className="relative overflow-hidden w-full max-w-md border-[color:var(--border)] bg-[color:var(--popover)]/70 backdrop-blur shadow-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 z-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--primary) 14%, transparent), transparent 35%, color-mix(in srgb, var(--primary) 14%, transparent))",
          }}
        />
        <CardHeader className="relative z-10">
          <CardTitle>Access CarClout</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send magic link"}
            </Button>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </form>
          <div className="mt-3 text-center text-sm text-muted-foreground">
            Don’t have an account? <Link href="/auth/signup" className="text-[color:var(--primary)] hover:underline">Sign up</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
