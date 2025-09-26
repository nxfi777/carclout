import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import SchedulerPageClient from "./_components/scheduler-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Schedule social posts",
    description: "Plan when and where your automotive content goes live with Ignition's social scheduler.",
    path: "/scheduler",
    keywords: ["social scheduler", "content calendar", "ignition social"],
  }),
};

export default function SchedulerPage() {
  return <SchedulerPageClient />;
}


