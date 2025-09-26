import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || "https://ignition.nytforge.com";

  const isProd = process.env.NODE_ENV === "production";

  return {
    rules: isProd
      ? {
          userAgent: "*",
          allow: "/",
          disallow: ["/admin", "/dashboard", "/api"],
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}


