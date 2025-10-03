import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/base-url";
import { getSurreal } from "@/lib/surrealdb";

export const middleware = auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const isAuthPage = pathname === "/auth/signin" || pathname === "/auth/signup";
  const isOnboardingPage = pathname.startsWith("/onboarding");
  const isPlanPage = pathname === "/plan";

  // If already authenticated and visiting auth pages, check onboarding/plan status
  if (isAuthPage) {
    if (req.auth?.user?.email) {
      // Check user's onboarding and plan status
      try {
        const db = await getSurreal();
        const res = await db.query(
          "SELECT onboardingCompleted, plan FROM user WHERE email = $email LIMIT 1;",
          { email: req.auth.user.email }
        );
        const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { onboardingCompleted?: boolean; plan?: string | null } | null) : null;
        const onboardingCompleted = !!row?.onboardingCompleted;
        const userPlan = row?.plan || null;
        const isSubscribed = userPlan === "minimum" || userPlan === "basic" || userPlan === "pro";

        // Redirect based on user state
        if (!onboardingCompleted) {
          return NextResponse.redirect(new URL("/onboarding", req.nextUrl));
        } else if (!isSubscribed) {
          return NextResponse.redirect(new URL("/plan", req.nextUrl));
        } else {
          return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
        }
      } catch (error) {
        console.error("Middleware: Failed to check user status", error);
        // On error, redirect to dashboard as fallback
        return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
      }
    }
    return NextResponse.next();
  }

  // Protect matched routes: redirect unauthenticated users to sign in
  if (!req.auth) {
    const baseUrl = getBaseUrl(req);
    const signInUrl = new URL("/auth/signin", baseUrl);
    signInUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(signInUrl);
  }

  // User is authenticated, check if they can access protected routes
  const email = req.auth.user?.email;
  if (!email) {
    const baseUrl = getBaseUrl(req);
    const signInUrl = new URL("/auth/signin", baseUrl);
    signInUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(signInUrl);
  }

  try {
    const db = await getSurreal();
    const res = await db.query(
      "SELECT onboardingCompleted, plan FROM user WHERE email = $email LIMIT 1;",
      { email }
    );
    const row = Array.isArray(res) && Array.isArray(res[0]) ? (res[0][0] as { onboardingCompleted?: boolean; plan?: string | null } | null) : null;
    const onboardingCompleted = !!row?.onboardingCompleted;
    const userPlan = row?.plan || null;
    const isSubscribed = userPlan === "minimum" || userPlan === "basic" || userPlan === "pro";

    // Allow access to onboarding and plan pages if not fully set up
    if (isOnboardingPage || isPlanPage) {
      return NextResponse.next();
    }

    // For dashboard and other protected routes, ensure user is fully onboarded and subscribed
    if (!onboardingCompleted) {
      return NextResponse.redirect(new URL("/onboarding", req.nextUrl));
    }
    
    if (!isSubscribed) {
      return NextResponse.redirect(new URL("/plan", req.nextUrl));
    }
  } catch (error) {
    console.error("Middleware: Failed to check user status", error);
    // On error, allow through to avoid blocking legitimate users
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/community/:path*", "/workspace/:path*", "/auth/signin", "/auth/signup", "/onboarding/:path*", "/plan"],
};


