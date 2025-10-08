import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Check your email",
    description: "We sent a magic link to your inbox. Open it to finish signing into CarClout.",
    path: "/auth/verify",
    keywords: ["verify email", "magic link", "carclout login"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function VerifyPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-[1.5rem] py-[2rem]">
      <div className="relative overflow-hidden w-full max-w-lg border rounded-xl border-[color:var(--border)] bg-[color:var(--popover)]/70 backdrop-blur shadow-lg p-6 text-center space-y-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 z-0 rounded-xl"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--primary) 14%, transparent), transparent 35%, color-mix(in srgb, var(--primary) 14%, transparent))",
          }}
        />
        <div className="relative z-1">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-muted-foreground">We sent you a magic link to sign in.</p>
        </div>
      </div>
    </div>
  );
}


