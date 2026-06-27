import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Paths that don't require authentication ─────────────────────────────────
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/tos",
  "/help",
  "/api/auth",
  "/api/v1/accounts/send-code",     // OTP flow — unauthenticated
  "/api/v1/accounts/verify-code",
  "/api/v1/health",
  "/_next/static",
  "/favicon.ico",
  "/og-image.png",
];

// ── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
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

  // Check Better Auth session via the session cookie.
  // We check both the standard cookie name and the secure-prefixed name (used in HTTPS/production).
  // This avoids issues in reverse proxy / Cloudflare environments where the proxy communicates with
  // Next.js via HTTP internally (causing getSessionCookie to incorrectly expect the non-secure cookie name).
  const sessionCookie =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  if (!sessionCookie) {
    // Not authenticated — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Cookie exists — let the request through.
  // The backend API validates the actual session on every request.
  return NextResponse.next();
}

// ── Matcher ─────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // Match all routes except static files, _next, and public API
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
