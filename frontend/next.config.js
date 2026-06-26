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
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${apiTarget}/ws/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
