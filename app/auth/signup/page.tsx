import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import SignUpPageClient from "./_components/signup-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Create your CarClout account",
    description: "Sign up for CarClout to access AI-assisted car content creation.",
    path: "/auth/signup",
    keywords: ["carclout sign up", "registration", "join carclout"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function SignUpPage() {
  return <SignUpPageClient />;
}


