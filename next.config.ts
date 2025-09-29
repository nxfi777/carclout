import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "https://dev.nytforge.com",
    "https://dev.nytforge.com:443",
    "http://dev.nytforge.com",
    "http://dev.nytforge.com:3000",
    "https://dev.nytforge.com:3000",
  ],
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
      // Public CDN domain serving signed previews (NEXT_PUBLIC_R2_PUBLIC_BASE)
      {
        protocol: "https",
        hostname: "r2.ignitecdn.com",
      },
    ],
  },
};

export default nextConfig;
