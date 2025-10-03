import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import PageBottomBlur from "@/components/page-bottom-blur";
import { getSurreal } from "@/lib/surrealdb";

// Lazy load heavy components
const PhoneWithCarParallax = dynamic(() => import("@/components/phone-with-car"), {
  ssr: true,
  loading: () => <div className="min-h-[22rem] sm:min-h-[26rem] md:min-h-[28rem]" />,
});
const BrandMarquee = dynamic(() => import("@/components/brand-marquee"), { ssr: true });
const HowItWorksCarousel = dynamic(() => import("@/components/how-it-works-carousel"), { ssr: true });
const BentoFeatures = dynamic(() => import("@/components/bento-features"), { ssr: true });
const PlatformsMarquee = dynamic(() => import("@/components/platforms-marquee"), { ssr: true });
const TestimonialsSection = dynamic(() => import("@/components/testimonials-section"), { ssr: true });
const PaymentProcessorsMarquee = dynamic(() => import("@/components/payment-processors-marquee"), { ssr: true });
const FAQSection = dynamic(() => import("@/components/faq-section"), { ssr: true });
const PlanSelector = dynamic(() => import("@/components/plan-selector"), { ssr: true });
const FoundersGuarantee = dynamic(() => import("@/components/founders-guarantee"), { ssr: true });

// ISR: Regenerate page every 10 minutes
export const revalidate = 600;

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  
  // Determine CTA text and href based on user state
  let ctaHref = "/auth/signup";
  let ctaText = "Try Your First Edit for $1";
  let ctaTextFinal = "👉 Start For $1 Today";
  
  if (user?.email) {
    // User is signed in - check onboarding and subscription status
    let onboardingCompleted = false;
    let userPlan: string | null = null;
    
    try {
      const db = await getSurreal();
      const res = await db.query(
        "SELECT onboardingCompleted, plan FROM user WHERE email = $email LIMIT 1;",
        { email: user.email }
      );
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { onboardingCompleted?: boolean; plan?: string | null } | null) : null;
      onboardingCompleted = !!row?.onboardingCompleted;
      userPlan = row?.plan || null;
    } catch {
      // If query fails, fall back to session plan
      const maybeUser = user as Record<string, unknown>;
      if (typeof maybeUser.plan === 'string') {
        userPlan = maybeUser.plan;
      }
    }
    
    // Check if user is subscribed
    const isSubscribed = userPlan === "minimum" || userPlan === "basic" || userPlan === "pro";
    
    if (onboardingCompleted && isSubscribed) {
      // User is fully set up - show dashboard CTA
      ctaHref = "/dashboard";
      ctaText = "Go to Dashboard";
      ctaTextFinal = "👉 Go to Dashboard";
    } else if (!onboardingCompleted) {
      // User hasn't completed onboarding
      ctaHref = "/onboarding";
    } else {
      // User completed onboarding but not subscribed
      ctaHref = "/plan";
    }
  }
  return (
    <main className="page-glow -mx-2 md:-mx-3">
      <PageBottomBlur />
      <section className="w-full pt-[1rem] md:pt-[2rem] pb-[4rem] grid grid-cols-1 lg:grid-cols-2 gap-[2rem] items-start relative z-[1] px-[1rem] sm:px-[1.75rem] overflow-visible">
        <div className="ml-0 sm:ml-[1.25rem] lg:ml-[3rem] space-y-[1.2rem] text-center lg:text-left mt-[1rem] md:mt-[2rem] lg:mt-[4.5rem]">
          {/* badge removed per request */}
          <h1 className="leading-tight font-semibold text-[clamp(2.4rem,6vw,4rem)]">
            Turn Your Car Pics Into Viral Posts<br />in <span className="text-[color:var(--primary)] font-bold">2 Clicks<span className="text-[color:var(--primary)]">.</span></span>
          </h1>
          <p className="text-[color:var(--foreground)]/85 max-w-[42rem] text-[1.05rem] leading-relaxed mx-auto lg:mx-0">
          No editing. No skills. Just upload <span className="text-[color:var(--border)]">•</span> Generate <span className="text-[color:var(--border)]">•</span> Post
          </p>
          <div className="flex items-center gap-[1rem] justify-center lg:justify-start">
            <Button asChild size="lg" className="text-[1.1rem] px-[2.5rem] py-[1.25rem] h-auto font-bold bg-[color:var(--primary)] hover:bg-[color:var(--primary)] rounded-full shadow-[0_0_25px_rgba(91,108,255,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_0_35px_rgba(91,108,255,0.7),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:brightness-110">
              <Link href={ctaHref}>{ctaText}</Link>
            </Button>
          </div>
          {/* Desktop-only toolkit (kept under hero copy) */}
          {/* <div className="hidden lg:block mt-[2rem] rounded-2xl border border-[color:var(--border)] bg-[var(--popover)]/60 p-[1rem] max-w-[28rem]">
            <ul className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.5rem] text-[0.95rem]">
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Personal Workspace</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Templates</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Hooks</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Community</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Tutorials</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Photography</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Ebooks</li>
            </ul>
          </div> */}
        </div>
        <div className="relative overflow-visible mt-[0.5rem] md:mt-[1rem] lg:mt-[1.5rem]">
          <PhoneWithCarParallax />
        </div>
        {/* Mobile-only toolkit (placed after phone) */}
        {/* <div className="mt-[2rem] rounded-2xl border border-[color:var(--border)] bg-[var(--popover)]/60 p-[1rem] max-w-[28rem] mx-auto lg:hidden">
          <ul className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.5rem] text-[0.95rem]">
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Personal Workspace</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Templates</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Hooks</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Community</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Tutorials</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Photography</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Ebooks</li>
          </ul>
        </div> */}
      </section>

      {/* Brand Marquee */}
      <BrandMarquee />

      {/* How It Works */}
      <HowItWorksCarousel />

      {/* Platforms Marquee */}
      <PlatformsMarquee />

      {/* Bento Features */}
      <BentoFeatures />

      {/* Testimonials */}
      <TestimonialsSection />

      {/* Payment Processors Marquee */}
      <PaymentProcessorsMarquee />

      <section id="pricing" className="w-full py-[3rem] md:py-[4rem]">
        <div className="text-center space-y-[0.6rem] mb-[1.5rem]">
          <h2 className="text-[1.6rem] md:text-[2rem] font-semibold">Simple pricing</h2>
          <p className="text-[color:var(--foreground)]/80 text-[0.95rem] md:text-[1.05rem]">Pick the plan that fits. Upgrade or cancel anytime.</p>
        </div>
        <div className="max-w-6xl mx-auto px-[1rem]">
          <PlanSelector ctaLabel="Get started" />
        </div>
      </section>
      <FAQSection />

      {/* Founders Guarantee */}
      <FoundersGuarantee />

      {/* Final CTA */}
      <section className="w-full py-[4rem] md:py-[5rem] px-[1rem]">
        <div className="max-w-[50rem] mx-auto text-center space-y-[1.5rem]">
          <h2 className="text-[2rem] md:text-[2.75rem] font-bold leading-tight">
            Ready To Make Your Car Pics Unskippable?
          </h2>
          <p className="text-[color:var(--foreground)]/80 text-[1.05rem] md:text-[1.15rem] leading-relaxed max-w-[40rem] mx-auto">
            Stop scrolling. Stop editing. Start posting viral car content in 2 clicks.
          </p>
          <div className="pt-[1rem]">
            <Button asChild size="lg" className="text-[1.15rem] px-[2.75rem] py-[1.4rem] h-auto font-bold bg-[color:var(--primary)] hover:bg-[color:var(--primary)] rounded-full shadow-[0_0_25px_rgba(91,108,255,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_0_35px_rgba(91,108,255,0.7),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:brightness-110">
              <Link href={ctaHref}>{ctaTextFinal}</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
