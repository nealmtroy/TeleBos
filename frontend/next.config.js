/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // Allow dev server access from external IPs/domains (e.g. AWS EC2, Codespaces)
    allowedDevOrigins: ["*"],
  },
  async rewrites() {
    const apiTarget =
      process.env.API_PROXY_TARGET || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
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

module.exports = nextConfig;
