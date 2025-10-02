import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import Facebook from "next-auth/providers/facebook";
import { CarCloutSurrealAdapter } from "@/lib/customAdapter";
import { getBaseUrl, getEnvBaseUrl } from "@/lib/base-url";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      id?: string;
      role?: "admin" | "user";
      plan?: "base" | "premium" | "ultra" | null;
      xp?: number;
    };
  }
}

// Resend custom verification email (styled)
async function sendVerificationRequest({
  identifier: email,
  url,
  provider,
  request,
}: {
  identifier: string;
  url: string;
  provider: { apiKey?: string; from?: string };
  request?: Request;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: provider.from,
      to: email,
      subject: `Sign in to Nytforge CarClout`,
      html: createEmail({ url, email, request }),
      text: `Sign in to Nytforge CarClout\n\nClick this link to sign in: ${url}\n\nIf you did not request this email, you can ignore it.`,
    }),
  });
  if (!res.ok) {
    throw new Error("Resend error: " + JSON.stringify(await res.json()));
  }
}

function createEmail({ url, email, request }: { url: string; email: string; request?: Request }) {
  const baseUrl = request ? getBaseUrl(request) : getEnvBaseUrl();
  return `
  <div style="background:#0b1020;padding:1rem;margin:0">
    <div style="font-family:Roboto,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:36rem;margin:0 auto;background:#111a36;color:#e7ecff;border-radius:0.75rem;border:1px solid #263166;padding:1.5rem;">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;color:#aab4ff;font-size:0.75rem;letter-spacing:.14em;text-transform:uppercase">
        <img src="${baseUrl}/favicon.ico" style="border-radius:0.25rem;width:1.25rem;height:1.25rem" alt="Nytforge" />
        <span>NYTFORGE CARCLOUT</span>
      </div>
      <h1 style="font-size:1.375rem;line-height:1.3;margin:0 0 0.5rem">Sign in to Nytforge CarClout</h1>
      <p style="margin:0 0 1rem;color:#cfd7ff">We received a request to sign in as <b>${email}</b>. Click the button below to continue.</p>
      <a href="${url}" style="display:inline-block;background:#5b6cff;color:#0a0d1a;padding:0.75rem 1rem;border-radius:0.5rem;font-weight:700;text-decoration:none">Sign in</a>
      <p style="margin:1rem 0 0;color:#b8c0ff;font-size:0.8125rem">If you didn’t request this, you can safely ignore this email.</p>
    </div>
  </div>`;
}

// Create a deferred promise so Surreal connection is only attempted when adapter is actually used
export const authOptions: NextAuthConfig = {
  adapter: CarCloutSurrealAdapter(),
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY!,
      from: process.env.EMAIL_FROM || "support@carclout.io",
      sendVerificationRequest,
    }),
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
      authorization: {
        params: {
          // Scopes needed for Instagram Graph API publishing and insights
          scope:
            [
              "email",
              "public_profile",
              "pages_show_list",
              "pages_read_engagement",
              "instagram_basic",
              "instagram_manage_insights",
              "instagram_content_publish",
              "business_management",
            ].join(","),
        },
      },
    }),
  ],
  callbacks: {
    async session({ token, session }: { token: Record<string, unknown>; session: import('next-auth').Session }) {
      if (session.user) {
        if (typeof token.sub === 'string') session.user.id = token.sub;
        session.user.role = (typeof token.role === 'string' ? (token.role as "admin" | "user") : undefined) || "user";
        session.user.plan = (typeof token.plan === 'string' ? (token.plan as "base" | "premium" | "ultra") : undefined) || null;
        session.user.xp = (typeof token.xp === 'number' ? token.xp : 0);
      }
      return session;
    },
    async jwt({ token, user }: { token: Record<string, unknown>; user?: unknown }) {
      if (user && typeof user === 'object') {
        const u = user as { role?: unknown; plan?: unknown; xp?: unknown };
        const roleVal = typeof u.role === 'string' ? u.role : 'user';
        const planVal = typeof u.plan === 'string' ? u.plan : null;
        const xpVal = typeof u.xp === 'number' ? u.xp : 0;
        token.role = roleVal as unknown as string;
        token.plan = planVal as unknown as string | null;
        token.xp = xpVal as unknown as number;
      }
      return token as unknown as Record<string, unknown>;
    },
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);


