import type { Metadata } from "next";
import { Roboto, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import HeaderGate from "@/components/header-gate";
import SiteFooter from "@/components/site-footer";
import FooterGate from "@/components/footer-gate";
import { Toaster } from "@/components/ui/sonner";
import SessionProviderWrapper from "@/components/session-provider";

export const dynamic = "force-dynamic";

const roboto = Roboto({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.AUTH_URL ||
  "https://ignition.nytforge.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Ignition — Make Your Car Page Unskippable",
    template: "%s | Ignition",
  },
  description: "The content engine built for car creators.",
  applicationName: "Ignition",
  authors: [{ name: "Nytforge" }],
  creator: "Nytforge",
  keywords: [
    "Ignition",
    "Nytforge",
    "car content",
    "automotive",
    "social media",
    "AI tools",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Ignition",
    url: "/",
    title: "Ignition — Make Your Car Page Unskippable",
    description: "The content engine built for car creators.",
    images: [
      {
        url: "/nytforge.png",
        width: 1200,
        height: 630,
        alt: "Ignition by Nytforge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ignition — Make Your Car Page Unskippable",
    description: "The content engine built for car creators.",
    images: ["/nytforge.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/nytforge.png" }],
  },
  category: "technology",
  robots: {
    index: process.env.NODE_ENV === "production",
    follow: process.env.NODE_ENV === "production",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${roboto.className} ${roboto.variable} ${geistMono.variable} antialiased flex flex-col min-h-dvh min-h-[100svh] bg-background text-foreground overflow-x-hidden`}>
        <SessionProviderWrapper>
          <HeaderGate>
            <SiteHeader />
          </HeaderGate>
          <main className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 w-full px-2 md:px-3 flex flex-col">
              {children}
            </div>
          </main>
          <FooterGate>
            <SiteFooter />
          </FooterGate>
          <Toaster />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
