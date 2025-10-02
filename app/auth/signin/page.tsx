import type { Metadata } from "next";
import { createMetadata, NO_INDEX_ROBOTS } from "@/lib/seo";
import SignInPageClient from "./_components/signin-page-client";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Sign in to CarClout",
    description: "Log in with your email to access the CarClout creator workspace.",
    path: "/auth/signin",
    keywords: ["carclout login", "nytforge sign in", "creator dashboard"],
    robots: NO_INDEX_ROBOTS,
  }),
};

export default function SignInPage() {
  return <SignInPageClient />;
}


