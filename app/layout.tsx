import type { Metadata } from "next";
import { Roboto, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import HeaderGate from "@/components/header-gate";
import SiteFooter from "@/components/site-footer";
import FooterGate from "@/components/footer-gate";
import { Toaster } from "@/components/ui/sonner";
import SessionProviderWrapper from "@/components/session-provider";
import DailyBonusDrawer from "@/components/daily-bonus-drawer";
import UmamiTracker from "@/components/umami-tracker";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/seo";

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

export const metadata: Metadata = {
  metadataBase: new URL("/", "http://localhost"),
  title: {
    default: "Ignition — Make Your Car Page Unskippable",
    template: "%s | Ignition",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/nytforge.png" }],
  },
  ...createMetadata({
    title: "Ignition — Make Your Car Page Unskippable",
    description: "The content engine built for car creators.",
    path: "/",
  }),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="en">
      <body className={`${roboto.className} ${roboto.variable} ${geistMono.variable} antialiased flex flex-col min-h-dvh min-h-[100svh] bg-background text-foreground overflow-x-hidden`}>
        <SessionProviderWrapper session={session}>
          <UmamiTracker session={session} />
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
          <DailyBonusDrawer />
          <Toaster />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
