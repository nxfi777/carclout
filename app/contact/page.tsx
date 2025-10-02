import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Contact CarClout Support",
    description: "Reach the CarClout team for support, product questions, or partnership inquiries.",
    path: "/contact",
    keywords: ["support", "contact", "carclout help", "nytforge contact"],
  }),
};

// ISR: Regenerate page every 1 hour (contact form rarely changes)
export const revalidate = 3600;

import ContactPageClient from "./contact-client";

export default function ContactPage() {
  return <ContactPageClient />;
}


