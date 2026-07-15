/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
      {
        source: "/api/docs",
        destination: `${apiTarget}/docs`,
      },
      {
        source: "/api/redoc",
        destination: `${apiTarget}/redoc`,
      },
      {
        source: "/api/openapi.json",
        destination: `${apiTarget}/openapi.json`,
      },
      // FastAPI's generated Swagger/ReDoc HTML references /openapi.json.
      // Proxy that asset too so the docs work from the frontend origin.
      {
        source: "/openapi.json",
        destination: `${apiTarget}/openapi.json`,
      },
    ];
  },
};

module.exports = nextConfig;
