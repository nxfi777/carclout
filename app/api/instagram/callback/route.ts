import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getSurreal } from "@/lib/surrealdb";
import { RecordId } from "surrealdb";

export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user) return NextResponse.redirect(new URL("/auth/signin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const c = await cookies();
  const expected = c.get("fb_oauth_state")?.value || "";
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/dashboard/instagram?error=oauth_state", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
  const clientId = process.env.FACEBOOK_CLIENT_ID || "";
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET || "";
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/instagram/callback`;
  // Exchange code for access token
  const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`);
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/dashboard/instagram?error=token_exchange", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }
  const tokenJson = await tokenRes.json();
  const access_token = tokenJson.access_token as string;
  // Persist to next-auth account table equivalent: create/update account with provider 'facebook'
  try {
    const db = await getSurreal();
    const uid = String((session as any)?.user?.id || "");
    await db.query(
      `LET $u = $user; IF $acc = (SELECT id FROM account WHERE userId = $u AND provider = 'facebook' LIMIT 1) THEN
         UPDATE $acc[0].id SET access_token = $token
       ELSE CREATE account SET userId = $u, provider = 'facebook', providerAccountId = $u, access_token = $token, type = 'oauth'
       END;`,
      { user: new RecordId("user", uid), token: access_token }
    );
  } catch {}
  return NextResponse.redirect(new URL("/dashboard/instagram?linked=1", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}


