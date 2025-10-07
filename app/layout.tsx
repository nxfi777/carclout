import type { Metadata, Viewport } from "next";
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
import WelcomeToProDrawer from "@/components/welcome-to-pro-drawer";
import UmamiTracker from "@/components/umami-tracker";
import { WebVitals } from "@/app/web-vitals";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/seo";
import { DrawerQueueProvider } from "@/lib/drawer-queue";
import InstagramBrowserPrompt from "@/components/instagram-browser-prompt";
import { ChatNotificationListener } from "@/components/chat-notification-listener";
import { headers } from "next/headers";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "600", "700"], // Reduced weights
  display: "swap",
  preload: true,
  fallback: ['system-ui', 'arial'],
  adjustFontFallback: true,
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"], // Reduced weights (removed 300 and italic)
  display: "swap",
  preload: true,
  fallback: ['system-ui', 'arial'],
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false, // Only preload critical fonts
  fallback: ['monospace'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Prevents auto-zoom on iOS when focusing inputs
  userScalable: false, // Prevents pinch-to-zoom (optional, remove if you want users to zoom)
};

export const metadata: Metadata = {
  metadataBase: new URL("/", "http://localhost"),
  title: {
    default: "CarClout — Make Your Car Page Unskippable",
    template: "%s | CarClout",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/carcloutfilled.webp" }],
  },
  ...createMetadata({
    title: "CarClout — Make Your Car Page Unskippable",
    description: "The content engine built for car creators.",
    path: "/",
  }),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const isMaintenancePage = pathname === "/maintenance";
  
  // For maintenance page, render minimal layout without header/footer
  if (isMaintenancePage) {
    return (
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        </head>
        <body className={`${poppins.className} ${poppins.variable} ${roboto.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
          {children}
        </body>
      </html>
    );
  }
  
  // Normal layout with header and footer
  return (
    <html lang="en">
      <head>
        {/* Preconnect to critical domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DNS prefetch for external resources */}
        <link rel="dns-prefetch" href="https://cdn.sanity.io" />
      </head>
      <body className={`${poppins.className} ${poppins.variable} ${roboto.variable} ${geistMono.variable} antialiased flex flex-col min-h-dvh min-h-[100svh] bg-background text-foreground overflow-x-hidden`}>
        <SessionProviderWrapper session={session}>
          <DrawerQueueProvider>
            <InstagramBrowserPrompt />
            <ChatNotificationListener />
            <WebVitals />
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
            <WelcomeToProDrawer />
            <Toaster />
          </DrawerQueueProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
