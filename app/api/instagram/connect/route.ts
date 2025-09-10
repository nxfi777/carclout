import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth().catch(() => null);
  if (!session?.user) {
    // Require user to be signed in via magic link first
    return NextResponse.redirect(new URL("/auth/signin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
  const clientId = process.env.FACEBOOK_CLIENT_ID || "";
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/instagram/callback`;
  const scope = [
    "email",
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_insights",
    "instagram_content_publish",
    "business_management",
  ].join(",");
  const state = (typeof crypto !== "undefined" && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const c = await cookies();
  c.set("fb_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}


