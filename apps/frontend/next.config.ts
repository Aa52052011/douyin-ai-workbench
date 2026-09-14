import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Next 16 proxy clones /api rewrite bodies; default 10MB truncates library MP4 uploads.
  experimental: {
    proxyClientMaxBodySize: "128mb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
  /**
   * Minimal low-risk security headers for Web V1 RC (PUBLIC_HTTPS and LOCAL_RC).
   * Intentionally no complex CSP — avoid breaking Next.js / inline styles.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
