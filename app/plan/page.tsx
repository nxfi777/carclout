import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import PlanPageClient from "./_components/plan-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Choose your Ignition plan",
    description: "Compare Ignition plans and pick the subscription that fits your automotive content workflow.",
    path: "/plan",
    keywords: ["ignition pricing", "plans", "nytforge subscription"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function PlanPage() {
  return <PlanPageClient />;
}


