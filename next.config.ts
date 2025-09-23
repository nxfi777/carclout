import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow optimized remote images from R2 signed URLs
    remotePatterns: [
      // Signed URL via accountId.r2.cloudflarestorage.com/bucket/key?... or path-style
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      // If endpoint is custom (e.g., CDN or custom domain), allow any subdomains
      {
        protocol: "https",
        hostname: "**.cloudflarestorage.com",
      },
      // Fallback for direct bucket endpoints if used
      {
        protocol: "https",
        hostname: "r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
