import Link from "next/link";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export default function FAQSection() {
  return (
    <section id="faq" className="w-full py-[3rem] md:py-[4rem]">
      <div className="text-center space-y-[0.6rem] mb-[1.5rem]">
        <h2 className="text-[1.6rem] md:text-[2rem] font-semibold">Frequently asked questions</h2>
        <p className="text-[color:var(--foreground)]/80 text-[0.95rem] md:text-[1.05rem]">Everything you need to know to get started with confidence.</p>
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
                What makes Ignition different from other content tools?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Make your car page unskippable. Ignition is your creative engine for planning, generating, and publishing high-performing car content in seconds—not hours. Unlike generic editing tools, we&apos;re built specifically for automotive content creators who need professional results without the professional price tag.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="worth-it" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Is this really worth it compared to doing it myself?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Think about it this way: professional photo shoots cost $500-$2,000+ each time. Photoshop and editing skills take months to master. Ignition gives you pro-level results in 2 clicks for $1 to try. You&apos;re not just saving money—you&apos;re saving dozens of hours you could spend actually growing your page. The question isn&apos;t whether it&apos;s worth it. It&apos;s how much longer you want to do this the hard way.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="results" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Will this actually help me get more engagement and followers?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Here&apos;s what we know: high-quality visuals stop the scroll. Our users consistently report better engagement when they post Ignition-enhanced content vs. raw phone pics. We can&apos;t guarantee you&apos;ll go viral—no one can—but we can guarantee your content will look professional enough to compete with accounts that have actual production budgets. The rest is up to your consistency and captions.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="payments" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Is my payment information secure?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                100%. All payments are handled by Stripe, the same payment processor trusted by Amazon, Google, and millions of businesses worldwide. We never see or store your payment details. Manage subscriptions and one-time top-ups from your Billing page—no extra accounts, no hassle.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="storage" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Do you own my content or can you use it?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Your images live in your personal workspace and remain 100% yours. They&apos;re private to you, and you can download them anytime. We will never use, share, or claim ownership of your content. Period.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="mobile" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Can I create on my phone or do I need a computer?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Ignition works beautifully on any device—phone, tablet, or desktop. Create your viral posts from anywhere. For heavy batch work or detailed editing sessions, we recommend desktop for the best experience, but you&apos;re never locked out on mobile.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="cancel" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What if I want to cancel? Am I locked in?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Zero lock-in. Upgrade, downgrade, or cancel anytime from your Billing page. Changes take effect immediately. We only want customers who are getting real value—if we&apos;re not delivering that, you shouldn&apos;t be paying us.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="support" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What if I get stuck or need help?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                We&apos;ve got your back. Reach us anytime via <Link href="/contact" className="underline underline-offset-[0.2em] decoration-[color:var(--border)] hover:text-[color:var(--primary)]">contact</Link> or email support@nytforge.com. Pro members also get direct access to community admins for faster, personalized support. Real humans, real help. We&apos;re here to make sure you succeed, not just to collect your subscription.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="speed" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                How long does it take to generate images?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Most generations complete in seconds. High-resolution upscales may take a bit longer depending on size, but we&apos;ll keep you updated with real-time progress in your workspace. You&apos;re never left wondering.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="credits" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                How do credits work and will I run out?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Credits meter generation and processing so you only pay for what you actually use. A single image generation is typically about 6 credits. The Minimum plan ($1) gives you 5 generations to try it out risk-free. Pro users get significantly more value per dollar and can create consistently. You&apos;ll always see your credit balance before generating, so there are never any surprises.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="topups" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What if I need more credits but don&apos;t want to upgrade?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                No problem. Top-ups start at just $5 and work with any plan. On Minimum, $5 gets you about 250 credits. On Pro, that same $5 gets you roughly 500 credits—2× more value per dollar.
                <div className="mt-2 text-xs rounded px-2 py-1 inline-block bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">
                  Pro members get 2× more credits per dollar across all purchases.
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="rollover" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Will I lose my credits if I don&apos;t use them right away?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Never. Credits don&apos;t expire on a timer and stay in your balance until you use them. Even if you cancel your plan, your remaining credits stay available. We don&apos;t believe in punishing you for taking a break.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="run-out" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What happens if I run out of credits mid-project?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                You&apos;ll be prompted to top up instantly from your Billing page. Add credits in seconds and continue exactly where you left off. Your work is never lost, and you&apos;re never stuck mid-creation.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </section>
  );
}

