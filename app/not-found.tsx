import Link from "next/link";
import { Button } from "@/components/ui/button";
import ElectricBorder from "@/components/electric-border";
import { Compass, Home, Mail } from "lucide-react";

export default function NotFound() {
  return (
    <div className="w-full flex items-center justify-center py-[6rem] px-3 page-glow">
      <div className="relative max-w-2xl w-full">
        <ElectricBorder color="#5b6cff" thickness={2} className="rounded-2xl">
          <div className="rounded-2xl bg-[color:var(--popover)]/70 border border-[color:var(--border)] backdrop-blur p-6 md:p-8 text-center">
            <div className="mb-1 text-[clamp(2.2rem,8vw,3.6rem)] font-extrabold leading-none tracking-tight bg-[linear-gradient(135deg,var(--primary)_0%,#8aa1ff_60%,#c8d0ff_100%)] text-transparent bg-clip-text">
              404
            </div>
            <h1 className="text-lg md:text-xl font-semibold tracking-wide mb-2">Page not found</h1>
            <p className="text-sm md:text-base text-[color:var(--foreground)]/80 mb-6 leading-relaxed">
              The page you’re looking for doesn’t exist or has moved. Try one of these helpful links.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
              <Button asChild className="h-9 px-5">
                <Link href="/">
                  <Home className="mr-1.5" />
                  Go home
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-9 px-5">
                <Link href="/dashboard">
                  <Compass className="mr-1.5" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild variant="link" className="h-9 px-3">
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button asChild variant="link" className="h-9 px-3">
                <Link href="/contact">
                  <Mail className="mr-1.5" />
                  Contact
                </Link>
              </Button>
            </div>
          </div>
        </ElectricBorder>

        {/* ambient hero-like glow */}
        <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 -top-24 h-[18rem]">
          <div
            className="mx-auto max-w-xl h-full rounded-[2.5rem] opacity-60"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 30%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 65%)",
              filter: "blur(60px)",
            }}
          />
        </div>
      </div>
    </div>
  );
}


