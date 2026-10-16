import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Paths that don't require authentication ─────────────────────────────────
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy-policy",
  "/terms-of-service",
  "/privacy",
  "/tos",
  "/help",
    "/pricing",
    "/api/auth",
  "/api/v1/health",
  "/_next/static",
  "/favicon.ico",
  "/og-image.png",
  "/monitoring",
  "/401",
  "/403",
  "/404",
  "/500",
  "/500-error",
  "/503",
];

// ── Locale negotiation ──────────────────────────────────────────────────────
//
// The page has no navigator on the server, so it cannot detect a visitor's
// language and every SSR response rendered English. That produced two visible
// problems: crawlers and chat previews only ever saw the English copy, and
// first paint flashed English before LanguageSync hydrated the stored or
// detected locale.
//
// This reads Accept-Language and forwards the result as a request header, so
// server-rendered markup already matches what the client will settle on.
//
// Indonesian is checked as a language prefix rather than an exact match:
// "id-ID", "id", and "in-ID" (the legacy ISO code some Android browsers still
// send) all resolve to Indonesian. The user's explicit choice, when they have
// made one, lives in telebo_locale and takes priority over this.

function negotiateLocale(acceptLanguage: string | null): "en" | "id" {
  if (!acceptLanguage) return "en";

  // Ranked list, honouring q-values: "fr;q=0.8, id-ID;q=0.9" -> id wins.
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((r) => r.tag && !Number.isNaN(r.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
      const lang = tag.split("-")[0];
      // "in" is the deprecated ISO 639-1 code for Indonesian.
      if (lang === "id" || lang === "in") return "id";
    }

    // English is the only other locale, so anything else falls through to it.
    return "en";
  }

  // ── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Detect /id subpath prefix for Indonesian localized routes
  const isIdSubpath = pathname === "/id" || pathname.startsWith("/id/");
  const unlocalizedPath = isIdSubpath
    ? pathname === "/id"
      ? "/"
      : pathname.slice(3)
    : pathname;

  // Legacy redirects under /id
  if (isIdSubpath) {
    if (unlocalizedPath === "/privacy") {
      const url = request.nextUrl.clone();
      url.pathname = "/id/privacy-policy";
      return NextResponse.redirect(url, 301);
    }
    if (unlocalizedPath === "/tos") {
      const url = request.nextUrl.clone();
      url.pathname = "/id/terms-of-service";
      return NextResponse.redirect(url, 301);
    }
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if target is a public path
  const isPublic =
    unlocalizedPath === "/" ||
    PUBLIC_PATHS.some((p) => unlocalizedPath.startsWith(p));

  if (isPublic) {
    return handleLocalizedRoute(request, isIdSubpath, unlocalizedPath);
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
    url.pathname = isIdSubpath ? "/id/login" : "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Cookie exists — let the request through.
  // The backend API validates the actual session on every request.
  return handleLocalizedRoute(request, isIdSubpath, unlocalizedPath);
}

function handleLocalizedRoute(
  request: NextRequest,
  isIdSubpath: boolean,
  unlocalizedPath: string
) {
  const requestHeaders = new Headers(request.headers);
  const stored = request.cookies.get("telebo_locale")?.value;

  // For public pages, the URL path is the absolute source of truth:
  // - /id and /id/* are always Indonesian (hreflang='id' canonical).
  // - Root / and /* are always English (hreflang='en' & 'x-default' canonical).
  // For protected dashboard pages, user choice (cookie) or browser Accept-Language is used.
  const isPublicRoute =
    unlocalizedPath === "/" ||
    PUBLIC_PATHS.some((p) => unlocalizedPath.startsWith(p));

  const locale = isPublicRoute
    ? isIdSubpath
      ? "id"
      : "en"
    : stored === "id" || stored === "en"
    ? stored
    : negotiateLocale(request.headers.get("accept-language"));

  requestHeaders.set("x-telebos-locale", locale);
  requestHeaders.set("x-telebos-pathname", request.nextUrl.pathname);

  if (isIdSubpath) {
    // Rewrite internally to the base path while preserving /id in the browser URL
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = unlocalizedPath;
    const response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
    response.cookies.set("telebo_locale", "id", {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

// ── Matcher ─────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // Match all routes except static files, _next, and public API
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
