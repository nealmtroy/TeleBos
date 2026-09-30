const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    instrumentationHook: true,
  },
  async rewrites() {
    const apiTarget =
      process.env.API_PROXY_TARGET || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
      {
        source: "/api/public/v1/:path*",
        destination: `${apiTarget}/api/public/v1/:path*`,
      },
      // Better Auth API ditangani oleh Next.js langsung (tidak di-proxy ke FastAPI)
      // Route /api/auth/* tidak boleh di-proxy karena Better Auth ada di Next.js
      {
        source: "/ws/:path*",
        destination: `${apiTarget}/ws/:path*`,
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Create a proxy API route to bypass ad-blockers
  tunnelRoute: "/monitoring",

  // Suppress source map upload logs in non-CI environments
  silent: !process.env.CI,
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);

