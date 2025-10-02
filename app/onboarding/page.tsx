import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import OnboardingPageClient from "./_components/onboarding-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Complete your CarClout onboarding",
    description: "Add your Instagram handle, vehicles, and photos to unlock the CarClout workspace.",
    path: "/onboarding",
    keywords: ["carclout onboarding", "setup", "creator profile"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function OnboardingPage() {
  return <OnboardingPageClient />;
}


