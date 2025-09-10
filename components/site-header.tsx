import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
// Avatar components were unused
import { auth } from "@/lib/auth";
import DashboardCta from "@/components/dashboard-cta";
import ProfileDialog from "@/components/profile-dialog";
import { getSurreal } from "@/lib/surrealdb";
import HeaderUser from "./header-user";
import BillingDialog from "@/components/billing-dialog";
import DailyBonusDialog from "@/components/daily-bonus-dialog";
import HeaderDock from "./header-dock";
import HeaderDockMenu from "./header-dock-menu";
import ProUpsellDialog from "./pro-upsell-dialog";
import HeaderNavLink from "./header-nav-link";
import HeaderCredits from "./header-credits";
import HeaderNotifications from "@/components/header-notifications";
import { Home } from "lucide-react";
import { Suspense } from "react";

export default async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  let dbName: string | undefined;
  let dbImage: string | undefined;
  let dbPlan: string | undefined;
  if (user?.email) {
    try {
      const db = await getSurreal();
      const res = await db.query("SELECT name, image, plan FROM user WHERE email = $email LIMIT 1;", { email: user.email as string });
      const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { name?: unknown; image?: unknown; plan?: unknown } | null) : null;
      dbName = typeof row?.name === 'string' ? row.name : undefined;
      dbImage = typeof row?.image === 'string' ? row.image : undefined;
      dbPlan = typeof row?.plan === 'string' ? row.plan : undefined;
    } catch {}
  }
  const displayName = dbName || user?.name || user?.email || "";
  const displayImage = dbImage || (user?.image as string | undefined);
  let userPlanFromSession: string | undefined;
  try {
    const maybeUser = user as Record<string, unknown> | null | undefined;
    if (maybeUser && typeof maybeUser.plan === 'string') userPlanFromSession = maybeUser.plan;
  } catch {}
  const displayPlan = (dbPlan || userPlanFromSession) || null;
  const initials = (displayName || user?.email || "U").split(" ").map((s) => s[0]).join("")?.slice(0,2).toUpperCase() || "U";

  return (
    <header className="py-4">
      <div className="px-2 md:px-3 relative">
        {/* Desktop floating dock */}
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <HeaderDock />
          </Suspense>
        </div>
        <div className="w-full h-16 rounded-full border border-[color:var(--border)] bg-[var(--popover)]/70 backdrop-blur grid grid-cols-[auto_1fr_auto] items-center px-3 md:px-4 relative overflow-visible">
          {/* subtle primary-tinted gradient wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-60"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--primary) 14%, transparent), transparent 35%, color-mix(in srgb, var(--primary) 14%, transparent))",
            }}
          />
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/nytforge.webp" alt="Nytforge" width={28} height={28} />
              <span className="text-xs sm:text-sm uppercase tracking-widest text-[color:var(--foreground)]/80">IGNITION</span>
            </Link>
          </div>
          <div className="justify-self-center hidden sm:flex items-center gap-3 md:gap-4">
            <HeaderNavLink href="/#pricing">PRICING</HeaderNavLink>
            <HeaderNavLink href="/contact">CONTACT</HeaderNavLink>
          </div>
          <div className="flex items-center gap-2 justify-self-end relative">
            {user ? (
              <DashboardCta>
                <Button asChild size="icon" variant="ghost" className="h-9 w-9 rounded-full border border-[color:var(--border)] bg-[color:var(--popover)]/70 hover:bg-[color:var(--popover)]/90">
                  <Link href="/dashboard" aria-label="Open dashboard">
                    <Home className="h-5 w-5" />
                  </Link>
                </Button>
              </DashboardCta>
            ) : (
              <Link href="/auth/signin"><Button size="sm" variant="outline" className="h-9 px-4 text-sm border-[color:var(--border)] bg-[color:var(--popover)]/70">Get Started</Button></Link>
            )}
            {user ? (
              <>
                {/* Notifications bell */}
                <HeaderNotifications />
                {/* Mobile burger to open vertical dock */}
                <div className="block md:hidden">
                  <Suspense fallback={null}>
                    <HeaderDockMenu />
                  </Suspense>
                </div>
                {/* Show credits inline only on md+; on smaller screens, credits will render inside profile menu */}
                <div className="hidden md:block">
                  <HeaderCredits />
                </div>
                {/* Single profile trigger across breakpoints; dialogs only on md+ */}
                <div className="flex items-center gap-2">
                  <HeaderUser name={displayName} email={user.email!} image={displayImage} plan={displayPlan} initials={initials} />
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <ProfileDialog />
                  <BillingDialog />
                  <DailyBonusDialog />
                </div>
              </>
            ) : null}
          </div>
        </div>
        {/* Global dialogs */}
        <ProUpsellDialog />
      </div>
    </header>
  );
}


