import type { Metadata } from "next";
import { Roboto, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";
import HeaderGate from "@/components/header-gate";
import SiteFooter from "@/components/site-footer";
import FooterGate from "@/components/footer-gate";
import { Toaster } from "@/components/ui/sonner";
import SessionProviderWrapper from "@/components/session-provider";
import DailyBonusDrawer from "@/components/daily-bonus-drawer";
import LevelUpDrawer from "@/components/level-up-drawer";
import UmamiTracker from "@/components/umami-tracker";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
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
    default: "CarClout — Make Your Car Page Unskippable",
    template: "%s | CarClout",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/nytforge.png" }],
  },
  ...createMetadata({
    title: "CarClout — Make Your Car Page Unskippable",
    description: "The content engine built for car creators.",
    path: "/",
  }),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="en">
      <body className={`${poppins.className} ${poppins.variable} ${roboto.variable} ${geistMono.variable} antialiased flex flex-col min-h-dvh min-h-[100svh] bg-background text-foreground overflow-x-hidden`}>
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
          <LevelUpDrawer />
          <Toaster />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
