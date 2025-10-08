import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import dynamic from "next/dynamic";

const FAQSection = dynamic(() => import("@/components/faq-section"), { ssr: true });

export const metadata: Metadata = {
  ...createMetadata({
    title: "Frequently Asked Questions",
    description: "Answers to common questions about plans, credits, and using CarClout.",
    path: "/faq",
    keywords: ["faq", "questions", "help", "carclout faq"],
  }),
};

export default function FAQPage() {
  return (
    <div className="w-full py-[2rem] md:py-[3rem]">
      <div className="max-w-6xl mx-auto px-[1rem]">
        <FAQSection />
      </div>
    </div>
  );
}


