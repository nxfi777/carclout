import PlanSelector from "@/components/plan-selector";
import { auth } from "@/lib/auth";
import PageBottomBlur from "@/components/page-bottom-blur";
import { createMetadata } from "@/lib/seo";
import FAQSection from "@/components/faq-section";

export const metadata = createMetadata({
  title: "Pricing",
  description: "Simple pricing for CarClout. Pick the plan that fits. Upgrade or cancel anytime.",
  path: "/pricing",
});

// ISR: Regenerate page every 30 minutes (pricing rarely changes)
export const revalidate = 1800;

export default async function PricingPage() {
  const session = await auth();
  const user = session?.user;
  const ctaLabel = user ? "Subscribe" : "Get Started";

  return (
    <main className="page-glow">
      <PageBottomBlur />
      
      {/* Hero Section */}
      <section className="w-full pt-[3rem] md:pt-[4rem] pb-[2rem] text-center px-[1rem]">
        <div className="space-y-[1rem] max-w-3xl mx-auto">
          <h1 className="text-[clamp(2rem,5vw,3rem)] font-semibold leading-tight">
            Simple <span className="text-[color:var(--primary)]">Pricing</span>
          </h1>
          <p className="text-[color:var(--foreground)]/85 text-[1.05rem] leading-relaxed max-w-2xl mx-auto">
            Pick the plan that fits. Upgrade or cancel anytime. No hidden fees, no surprises.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="w-full py-[2rem] md:py-[3rem]">
        <div className="max-w-6xl mx-auto px-[1rem]">
          <PlanSelector ctaLabel={ctaLabel} />
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />
    </main>
  );
}
