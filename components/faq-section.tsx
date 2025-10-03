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
            <AccordionItem value="editing-skills" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Do I need editing skills to use CarClout?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Nope. Just upload your car photo, choose a template, and hit generate. It&apos;s designed for car guys who want results, not tutorials.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="card-details" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Why do you need my card details for the $1 plan?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Your $1 payment locks in your founding member spot and lifetime pricing. It also prevents bots from taking spots. Cancel anytime in one click if it&apos;s not for you.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="after-trial" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What happens after my $1 trial?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                After your trial, you can upgrade to Pro for $25/month to unlock unlimited edits, video generation, the designer, and all community features.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="credits" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                How do credits work?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                <p className="mb-2">Every AI edit uses credits:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>100 credits = 1 image</li>
                  <li>1350 credits = 1 video</li>
                </ul>
                <p className="mt-2">Pro members get monthly credit packs, plus bonus credits from XP, streaks, and the community leaderboard.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="starter-vs-pro" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What&apos;s the difference between Starter ($1) and Pro ($25)?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                <p className="mb-2"><strong>Starter:</strong> limited credits, 1 edit, basic community access.</p>
                <p><strong>Pro:</strong> unlimited photo credits, monthly video credits, daily feature requests, designer, XP leaderboard, and exclusive templates.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="waitlist-payment" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                Why do I have to pay $1 to join the waitlist?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                It keeps the bots and tire kickers out. This is for builders who actually care about their rides, not people chasing free stuff. The $1 locks in your spot and guarantees your price stays at $1 forever — no increases as long as you stay active.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="after-1000-spots" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What happens after the first 1,000 spots are gone?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                The Founder&apos;s price disappears forever. After that, CarClout membership will be $25/month. The only way to keep it at $1 is to join now.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="change-mind" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                What if I change my mind?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                You can cancel anytime with one click. But if you do, you&apos;ll lose your Founder status and you&apos;ll never get it back.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="access" className="border-none">
              <AccordionTrigger className="cursor-pointer px-[1rem] md:px-[1.25rem] py-[1rem]">
                When do I get access?
              </AccordionTrigger>
              <AccordionContent className="px-[1rem] md:px-[1.25rem]">
                Instantly. As soon as you claim your spot, you&apos;re in. Start editing your builds the same day and stack up XP before the rest of the crew shows up.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </section>
  );
}

