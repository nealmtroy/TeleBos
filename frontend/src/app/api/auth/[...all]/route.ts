import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const handlers = toNextJsHandler(auth.handler);
const originalPost = handlers.POST;

/**
 * Wrapped POST handler that normalizes forget-password responses to prevent
 * user email enumeration (vuln-0006).
 *
 * The /forget-password endpoint is a legacy path that Better Auth's rate
 * limiter watches but that has no registered route handler — the router
 * returns 404 for unknown emails.  However, the rate limiter may return 429
 * for valid emails that hit thresholds, creating an observable difference.
 *
 * This wrapper also covers the canonical /request-password-reset endpoint
 * as defense-in-depth: even though Better Auth v1.6+ already returns a
 * uniform message, this ensures the HTTP status code is always 200.
 */
async function safePost(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);

  // Normalize both legacy (/forget-password) and canonical
  // (/request-password-reset) password-reset paths.
  if (
    url.pathname.endsWith("/forget-password") ||
    url.pathname.endsWith("/request-password-reset")
  ) {
    // Let Better Auth process the request — it sends the email only when the
    // account exists.  We ignore the response (which varies based on whether
    // the email was found) and always return a uniform 200.
    try {
      await originalPost(req);
    } catch {
      // Some edge cases (e.g. body parse failures) may throw.  Swallow
      // everything — the client must not learn whether the email exists.
    }

    return NextResponse.json(
      {
        message:
          "If an account with this email exists, a password reset link has been sent.",
      },
      { status: 200 },
    );
  }

  return originalPost(req);
}

export const { GET } = handlers;
export const POST = safePost;
