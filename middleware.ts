import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.AUTH_URL ||
  "";

export const middleware = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isAuthPage = pathname === "/auth/signin" || pathname === "/auth/signup";

  // If already authenticated and visiting auth pages, redirect to dashboard
  if (isAuthPage) {
    if (req.auth) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  // Protect matched routes: redirect unauthenticated users to sign in
  if (!req.auth) {
    const signInUrl = BASE_URL ? new URL("/auth/signin", BASE_URL) : new URL("/auth/signin", req.nextUrl);
    signInUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/community/:path*", "/workspace/:path*", "/auth/signin", "/auth/signup"],
};


