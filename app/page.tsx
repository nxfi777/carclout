import Link from "next/link";
import PlanSelector from "@/components/plan-selector";
import FutureButton from "@/components/nurui/future-button";
import { auth } from "@/lib/auth";
import PageBottomBlur from "@/components/page-bottom-blur";
import PhoneWithCarParallax from "@/components/phone-with-car";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  const ctaLabel = user ? "Dashboard" : "Get Started";
  const ctaHref = user ? "/dashboard" : "/auth/signup";
  return (
    <main className="page-glow">
      <PageBottomBlur />
      <section className="w-full pt-[0.5rem] md:pt-[1rem] pb-[4rem] grid grid-cols-1 lg:grid-cols-2 gap-[2rem] items-start relative z-[1] px-[1rem] sm:px-[1.75rem]">
        <div className="ml-0 sm:ml-[1.25rem] lg:ml-[3rem] space-y-[1.2rem] text-center lg:text-left">
          {/* badge removed per request */}
          <h1 className="leading-tight font-semibold text-balance text-[clamp(2.4rem,6vw,4rem)] mt-[0.5em]">
            <span className="block">Make Your Car Page</span>
            <span className="block text-[color:var(--primary)] scribble-underline">
              Unskippable
              <svg className="scribble-underline-svg" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
                {/* top stroke, slightly shorter and subtly slanted */}
                <path d="M80 135 L920 130" pathLength={1000} style={{ ['--stroke-length' as unknown as string]: '1000' }} />
                {/* diagonal back then bottom stroke to create a stretched 'Z' */}
                <path d="M920 138 L140 175 L900 178" pathLength={1000} style={{ ['--stroke-length' as unknown as string]: '1000' }} />
              </svg>
            </span>
          </h1>
          <p className="text-[color:var(--foreground)]/85 max-w-[42rem] text-[1.05rem] leading-relaxed mx-auto lg:mx-0">
          The content engine built for car creators.
          </p>
          <div className="flex items-center gap-[1rem] justify-center lg:justify-start">
            <Link href={ctaHref}><FutureButton className="mb-0 py-[0.9rem] min-w-[12rem] text-base">{ctaLabel}</FutureButton></Link>
          </div>
          {/* Desktop-only toolkit (kept under hero copy) */}
          <div className="hidden lg:block mt-[2rem] rounded-2xl border border-[color:var(--border)] bg-[var(--popover)]/60 p-[1rem] max-w-[28rem]">
            {/*<div className="text-sm opacity-80">Toolkit</div>*/}
            <ul className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.5rem] text-[0.95rem]">
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Personal Workspace</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Templates</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Hooks</li>
              {/* Livestreams temporarily hidden */}
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Community</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Tutorials</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Photography</li>
              <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Ebooks</li>
            </ul>
          </div>
        </div>
        <div className="relative overflow-visible md:mt-[0.5rem] lg:mt-[1rem]">
          <PhoneWithCarParallax />
        </div>
        {/* Mobile-only toolkit (placed after phone) */}
        <div className="mt-[2rem] rounded-2xl border border-[color:var(--border)] bg-[var(--popover)]/60 p-[1rem] max-w-[28rem] mx-auto lg:hidden">
          {/*<div className="text-sm opacity-80">Toolkit</div>*/}
          <ul className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.5rem] text-[0.95rem]">
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Personal Workspace</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Templates</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Hooks</li>
            {/* Livestreams temporarily hidden */}
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Community</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Tutorials</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Photography</li>
            <li className="flex items-center gap-[0.5rem]"><span className="inline-block h-[0.35rem] w-[0.35rem] rounded-full bg-[color:var(--primary)]"></span>Ebooks</li>
          </ul>
        </div>
      </section>
      <section id="pricing" className="w-full py-[3rem] md:py-[4rem]">
        <div className="text-center space-y-[0.6rem] mb-[1.5rem]">
          <h2 className="text-[1.6rem] md:text-[2rem] font-semibold">Simple pricing</h2>
          <p className="text-[color:var(--foreground)]/80 text-[0.95rem] md:text-[1.05rem]">Pick the plan that fits. Upgrade or cancel anytime.</p>
        </div>
        <div className="max-w-6xl mx-auto px-[1rem]">
          <PlanSelector ctaLabel="Get started" />
        </div>
      </section>
      <section id="faq" className="w-full py-[3rem] md:py-[4rem]">
        <div className="text-center space-y-[0.6rem] mb-[1.5rem]">
          <h2 className="text-[1.6rem] md:text-[2rem] font-semibold">Frequently asked questions</h2>
          <p className="text-[color:var(--foreground)]/80 text-[0.95rem] md:text-[1.05rem]">Everything you need to know about plans, credits, and using Ignition.</p>
        </div>
        <div className="max-w-3xl mx-auto px-[1rem]">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--popover)]/70 backdrop-blur relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--primary) 10%, transparent), transparent 40%, color-mix(in srgb, var(--primary) 10%, transparent))",
              }}
            />
            <Accordion type="single" collapsible className="w-full relative">
              <AccordionItem value="what-is-ignition" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  What is Ignition?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Make your car page unskippable. Ignition is your creative engine for planning, generating, and publishing high performing car content, fast.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="credits" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  How do credits work?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Credits meter generation and processing so you only pay for what you use. As a guide, a single image generation is typically about 6 credits, and costs increase with image size. Upscaling is available up to a 6 MP limit. You can&apos;t upscale an image that has already been upscaled.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="topups" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  Can I top up credits without changing my plan?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Yes. Top-ups start at $5. On Minimum, $5 is about 250 credits. On Pro, $5 is about 500 credits.
                  <div className="mt-2 text-xs rounded px-2 py-1 inline-block bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">
                    Pro gives roughly 2× more credits per dollar.
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="rollover" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  Do credits expire or roll over?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Credits don&apos;t expire on a timer and remain in your balance until used. If you cancel a plan, your remaining credits stay available.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="run-out" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  What happens if I run out of credits?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  You&apos;ll be prompted to top up during generation. Add credits instantly from Billing and continue where you left off.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="payments" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  How do I pay? Is it secure?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  All payments are handled by Stripe. Manage your subscription and one-time top-ups from Billing. No extra accounts required.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="storage" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  Where is my content saved?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Your images live in your personal workspace. They remain private to you, and you can download them anytime.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="mobile" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  Does Ignition work on mobile?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Yes. Ignition is responsive and works great on mobile. For heavy editing or batch work, we recommend desktop.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="speed" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  How fast are generations?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Most generations complete in seconds. Larger upscales depend on resolution, but we’ll keep you updated in the workspace.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="support" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  How do I get help?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Reach us any time via <Link href="/contact" className="underline underline-offset-[0.2em] decoration-[color:var(--border)] hover:text-[color:var(--primary)]">contact us</Link> or email support@nytforge.com. We&apos;re here to help you create.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="cancel" className="border-none">
                <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                  Can I cancel or switch plans any time?
                </AccordionTrigger>
                <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                  Yes. You can upgrade, downgrade, or cancel at any time from Billing. Changes take effect immediately for new sessions.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
    </main>
  );
}
