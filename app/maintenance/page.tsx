import Image from "next/image";
import { Wrench } from "lucide-react";

export const metadata = {
  title: "We're Upgrading",
  description: "CarClout is temporarily down for scheduled maintenance",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Gradient glow effect matching site theme */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 30%, rgba(91,108,255,0.18), transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      
      <div className="relative z-10 max-w-2xl w-full">
        {/* Logo and brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Image
            src="/carcloutlogo.webp"
            alt="CarClout"
            width={48}
            height={48}
            className="rounded-lg"
          />
          <span className="text-xl uppercase tracking-widest text-foreground/90 font-semibold">
            CARCLOUT
          </span>
        </div>

        {/* Main card */}
        <div className="relative rounded-2xl border border-border bg-card/70 backdrop-blur-xl p-8 md:p-12 text-center overflow-hidden">
          {/* Subtle gradient overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent 60%)",
            }}
          />

          <div className="relative z-10">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Wrench className="w-8 h-8 text-primary" />
            </div>

            {/* Heading */}
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              We&apos;re Building Something Better
            </h1>

            {/* Subheading */}
            <p className="text-lg md:text-xl text-foreground/70 mb-6 leading-relaxed">
              CarClout is temporarily down while we level up the platform.
            </p>

            {/* Body copy - using business library insights */}
            <div className="space-y-4 text-foreground/60 max-w-lg mx-auto">
              <p className="leading-relaxed">
                We&apos;re making upgrades that will make your content creation{" "}
                <span className="text-primary font-medium">faster</span>,{" "}
                <span className="text-primary font-medium">easier</span>, and even more{" "}
                <span className="text-primary font-medium">unskippable</span>.
              </p>
              
              <p className="leading-relaxed">
                This won&apos;t take long. We&apos;re adding the final touches to something 
                we think you&apos;re going to love.
              </p>

              <p className="text-sm text-foreground/50 italic mt-8">
                Check back in a few minutes — we&apos;ll be back before you know it.
              </p>
            </div>

            {/* Status indicator */}
            <div className="mt-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary animate-ping opacity-75" />
              </div>
              <span className="text-sm text-foreground/70 font-medium">
                Upgrades in progress
              </span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-foreground/40 mt-6">
          Questions? Email us at{" "}
          <a
            href="mailto:support@carclout.com"
            className="text-primary hover:text-primary/80 transition-colors underline"
          >
            support@carclout.com
          </a>
        </p>
      </div>
    </div>
  );
}
