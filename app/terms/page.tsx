import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Terms of Service",
    description: "The rules of using CarClout — subscriptions, credits, acceptable use, and disclaimers.",
    path: "/terms",
    keywords: ["terms of service", "tos", "legal", "carclout terms"],
  }),
};

export default function TermsPage() {
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
            <h1 className="text-[1.8rem] md:text-[2.2rem] font-semibold mb-[0.75rem]">Terms of Service</h1>
            <p className="text-sm text-[color:var(--muted-foreground)] mb-[1.25rem]">Last updated: {lastUpdated}</p>

            <div className="prose prose-invert max-w-none">
              <p>
                Welcome to CarClout. By accessing or using our website, apps, or services (collectively, the
                &quot;Service&quot;), you agree to these Terms of Service. If you do not agree, do not use the Service.
              </p>

              <h2>1. Your account</h2>
              <ul>
                <li>You must be at least 13 years old to use CarClout.</li>
                <li>Provide accurate information and keep your account secure; you are responsible for activity on your account.</li>
                <li>We may suspend or terminate accounts that violate these Terms.</li>
              </ul>

              <h2>2. Subscriptions, credits, and billing</h2>
              <ul>
                <li>We offer plans with monthly or yearly billing. Subscriptions auto‑renew until you cancel.</li>
                <li>AI edits consume credits. Because credits fund compute that is immediately consumed, <strong>credit purchases and used credits are non‑refundable</strong>.</li>
                <li>Trials or promos may convert to paid plans unless cancelled before renewal.</li>
                <li>You can cancel anytime in your dashboard; access continues until the end of the current billing period.</li>
              </ul>

              <h2>3. Acceptable use</h2>
              <p>Do not misuse the Service. Prohibited behaviors include:</p>
              <ul>
                <li>Uploading unlawful, infringing, hateful, or sexually explicit content.</li>
                <li>Impersonation, harassment, or violating others’ privacy or rights.</li>
                <li>Reverse engineering, scraping, or abusing API limits or platform security.</li>
                <li>Using outputs to deceive (e.g., deepfakes) or violate any law or platform policy.</li>
              </ul>

              <h2>4. Your content and license</h2>
              <ul>
                <li>You retain ownership of the content you upload.</li>
                <li>You grant CarClout a worldwide, non‑exclusive license to host, process, and display your content solely to operate the Service.</li>
                <li>You represent you have the rights to upload and process the content.</li>
              </ul>

              <h2>5. Intellectual property</h2>
              <p>
                The Service, templates, and software are owned by CarClout and its licensors. Except for your content, you
                may not copy, modify, or create derivative works without permission.
              </p>

              <h2>6. Disclaimers</h2>
              <p>
                The Service is provided “as‑is” and “as available.” To the fullest extent permitted by law, CarClout disclaims
                all warranties, express or implied, including merchantability, fitness for a particular purpose, and
                non‑infringement. We do not guarantee uninterrupted or error‑free operation or that outputs will meet your
                expectations.
              </p>

              <h2>7. Limitation of liability</h2>
              <p>
                To the fullest extent permitted by law, CarClout and its affiliates shall not be liable for any indirect,
                incidental, special, consequential, exemplary, or punitive damages, or any loss of profits, revenues, data,
                or goodwill. Our aggregate liability for any claim is limited to the greater of $100 or the amounts you paid
                to CarClout for the Service in the 3 months before the claim.
              </p>

              <h2>8. Indemnification</h2>
              <p>
                You agree to indemnify and hold CarClout harmless from claims arising out of your content, your use of the
                Service, or your violation of these Terms or applicable law.
              </p>

              <h2>9. Changes</h2>
              <p>
                We may update these Terms. If changes are material, we will provide notice (e.g., in‑app or email). Continued
                use after changes means you accept the updated Terms.
              </p>

              <h2>10. Governing law</h2>
              <p>
                These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict of law rules.
                Venue and jurisdiction lie in Delaware courts.
              </p>

              <h2>11. Contact</h2>
              <p>
                Questions? Email <a href="mailto:support@carclout.io">support@carclout.io</a>.
              </p>

              <p className="mt-[1rem] text-sm text-[color:var(--muted-foreground)]">
                See our <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link> to understand how we handle data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


