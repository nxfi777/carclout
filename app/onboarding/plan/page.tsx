import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import OnboardingPlanPageClient from "./_components/onboarding-plan-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Finish joining Ignition",
    description: "Pick an Ignition plan to activate your creator workspace after onboarding.",
    path: "/onboarding/plan",
    keywords: ["onboarding plan", "ignition enrollment", "complete signup"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function PlanPage() {
  return <OnboardingPlanPageClient />;
}


