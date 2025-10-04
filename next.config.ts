import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "https://dev.nytforge.com",
    "https://dev.nytforge.com:443",
    "http://dev.nytforge.com",
    "http://dev.nytforge.com:3000",
    "https://dev.nytforge.com:3000",
  ],
  
  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },
  
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'recharts',
    ],
  },
  
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
      // Public CDN domains
      {
        protocol: "https",
        hostname: "r2.carcloutcdn.com",
      },
      {
        protocol: "https",
        hostname: "storage.nytforge.com",
      },
      {
        protocol: "https",
        hostname: "storage.carclout.io",
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache TTL for signed URLs (presigned URLs now expire after 24 hours)
    minimumCacheTTL: 60 * 60 * 12, // 12 hours
    // Configure allowed quality values (required in Next.js 16+)
    qualities: [75, 85, 90, 100],
  },
  
  // Compression and optimization
  // Disable Next.js compression - Cloudflare handles Brotli/gzip at edge
  compress: false,
  
  // Production source maps (can be disabled for smaller builds)
  productionBrowserSourceMaps: false,
  
  // Webpack optimizations (production builds only, dev uses Turbopack)
  webpack: (config, { dev, isServer }) => {
    // Only apply custom webpack config in production builds
    // Development uses Turbopack (faster)
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for node_modules
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunk for shared code
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
            // Separate chunks for heavy libraries
            ffmpeg: {
              name: 'ffmpeg',
              test: /[\\/]node_modules[\\/]@ffmpeg[\\/]/,
              priority: 30,
            },
            framerMotion: {
              name: 'framer-motion',
              test: /[\\/]node_modules[\\/](framer-motion|motion)[\\/]/,
              priority: 30,
            },
            radix: {
              name: 'radix',
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              priority: 30,
            },
          },
        },
      };
    }
    return config;
  },
};

export default bundleAnalyzer(nextConfig);
