import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import PlanPageClient from "./_components/plan-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Choose your CarClout plan",
    description: "Compare CarClout plans and pick the subscription that fits your automotive content workflow.",
    path: "/plan",
    keywords: ["carclout pricing", "plans", "subscription"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function PlanPage() {
  return <PlanPageClient />;
}


