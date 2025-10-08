import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Privacy Policy",
    description: "How CarClout collects, uses, and protects your data.",
    path: "/privacy",
    keywords: ["privacy policy", "data", "security", "carclout privacy"],
  }),
};

export default function PrivacyPage() {
  const lastUpdated = new Date().toISOString().split("T")[0];
  return (
    <div className="w-full py-[3rem] md:py-[4rem]">
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
          <div className="relative z-10 p-[1.25rem] md:p-[1.75rem]">
            <h1 className="text-[1.8rem] md:text-[2.2rem] font-semibold mb-[0.75rem]">Privacy Policy</h1>
            <p className="text-sm text-[color:var(--muted-foreground)] mb-[1.25rem]">Last updated: {lastUpdated}</p>

            <div className="prose prose-invert max-w-none">
              <p>
                This Privacy Policy explains how CarClout (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your
                information when you use our website, apps, and services (the &quot;Service&quot;).
              </p>

              <h2>1. Information we collect</h2>
              <ul>
                <li>Account info: email, username/handle, profile details you choose to provide.</li>
                <li>Content: images, videos, prompts, templates, and metadata you upload.</li>
                <li>Usage data: device, browser, IP address, pages viewed, interactions, referring URLs.</li>
                <li>Payment data: processed by our payment providers (e.g., Stripe). We do not store full card details.</li>
              </ul>

              <h2>2. How we use information</h2>
              <ul>
                <li>Provide, operate, and improve the Service (including model processing and content generation).</li>
                <li>Authenticate you, prevent fraud/abuse, and maintain security.</li>
                <li>Personalize experiences, recommendations, and product communications.</li>
                <li>Process payments, billing, and account management.</li>
                <li>Comply with legal obligations and enforce our <Link href="/terms" className="underline underline-offset-4">Terms</Link>.</li>
              </ul>

              <h2>3. Sharing</h2>
              <ul>
                <li>Vendors and processors: hosting, storage, analytics, payments, email, and support tools.</li>
                <li>Legal: to comply with law, protect rights, or respond to lawful requests.</li>
                <li>Business transfers: as part of a merger, acquisition, or asset sale, subject to this Policy.</li>
              </ul>

              <h2>4. Retention</h2>
              <p>
                We retain information for as long as needed to provide the Service and for legitimate business or legal
                purposes. You may request deletion where applicable.
              </p>

              <h2>5. Security</h2>
              <p>
                We use reasonable technical and organizational measures to protect information. No method of transmission
                or storage is 100% secure.
              </p>

              <h2>6. International transfers</h2>
              <p>
                Your information may be stored and processed in countries other than your own. Where required, we use
                safeguards such as standard contractual clauses.
              </p>

              <h2>7. Your choices</h2>
              <ul>
                <li>Access, update, or delete certain data in your account settings.</li>
                <li>Opt out of non‑essential emails via unsubscribe links.</li>
                <li>Cookies: adjust browser settings to limit cookies; some features may not work without them.</li>
              </ul>

              <h2>8. Children</h2>
              <p>
                The Service is not directed to children under 13. If you believe we have collected data from a child,
                contact us to request deletion.
              </p>

              <h2>9. Changes</h2>
              <p>
                We may update this Policy. If changes are material, we will provide notice. Continued use means you accept
                the updated Policy.
              </p>

              <h2>10. Contact</h2>
              <p>
                Questions or requests? Email <a href="mailto:privacy@carclout.io">privacy@carclout.io</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


