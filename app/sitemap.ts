import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://ignition.nytforge.com";

  const publicRoutes = [
    "/",
    "/contact",
    "/live",
    "/car-news",
    "/scheduler",
    "/auth/signin",
    "/auth/signup",
    "/auth/verify",
  ];

  const now = new Date().toISOString();

  return publicRoutes.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}


