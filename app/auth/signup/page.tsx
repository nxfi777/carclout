import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import SignUpPageClient from "./_components/signup-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Create your Ignition account",
    description: "Sign up for Ignition to access AI-assisted car content creation.",
    path: "/auth/signup",
    keywords: ["ignition sign up", "nytforge registration", "join ignition"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function SignUpPage() {
  return <SignUpPageClient />;
}


