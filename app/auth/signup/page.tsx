"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SignUpPageInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const e = params.get("email");
    if (e) setEmail(e);
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const paramsPlan = params.get("plan");
      const handle = sanitizeInstagramHandle(name);
      const search = new URLSearchParams();
      if (handle) search.set("name", handle);
      if (paramsPlan) search.set("plan", paramsPlan);
      await signIn("resend", { email, callbackUrl: `/welcome${search.toString() ? `?${search.toString()}` : ""}`, redirect: true });
    } finally {
      setLoading(false);
    }
  }

  function sanitizeInstagramHandle(input: string): string {
    const withoutAt = input.toLowerCase().replace(/^@+/, "");
    const filtered = withoutAt.replace(/[^a-z0-9._]/g, "");
    return filtered.slice(0, 30);
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
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">@</span>
                <Input
                  className="pl-7"
                  placeholder="nytforge"
                  value={name}
                  onChange={(e) => setName(sanitizeInstagramHandle(e.target.value))}
                  pattern="^[a-z0-9._]{1,30}$"
                  maxLength={30}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="text-xs text-muted-foreground">Letters, numbers, periods, and underscores only (max 30). The @ is shown for clarity and isn’t saved.</div>
            </div>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending..." : "Send magic link"}</Button>
            <div className="mt-3 text-center text-sm text-muted-foreground">
              Already have an account? <Link href="/auth/signin" className="text-[color:var(--primary)] hover:underline">Sign in</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}>
      <SignUpPageInner />
    </Suspense>
  );
}


