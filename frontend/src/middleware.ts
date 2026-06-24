import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Paths that don't require authentication ─────────────────────────────────
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/privacy",
  "/tos",
  "/help",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/health",
  "/_next/static",
  "/favicon.ico",
  "/og-image.png",
];

// ── Middleware ──────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for auth_session cookie
  const authSession = request.cookies.get("auth_session")?.value;

  if (!authSession) {
    // Not authenticated — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Cookie exists — let the request through.
  // The backend API validates the actual JWT on every request.
  return NextResponse.next();
}

// ── Matcher ─────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // Match all routes except static files, _next, and public API
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
