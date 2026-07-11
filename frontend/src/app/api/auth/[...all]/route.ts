import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import {
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  getUserName,
} from "@/lib/brute-force";
import {
  sendEmail,
  getAccountLockedEmailHtml,
  getSuspiciousLoginActivityEmailHtml,
} from "@/lib/email";

const handlers = toNextJsHandler(auth.handler);
const originalPost = handlers.POST;

/**
 * Fire-and-forget email delivery.  Errors are logged but never thrown —
 * sending a notification must not block or fail the sign-in response.
 */
async function fireAndForgetEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  sendEmail({ to, subject, html }).catch((err) =>
    console.error("[brute-force] Email delivery failed:", err),
  );
}

/**
 * Notify the user if the account just became locked or if suspicious
 * activity crosses the 3-attempt early-warning threshold.
 */
async function maybeNotify(email: string, failResult: {
  failedAttempts: number;
  isNowLocked: boolean;
  lockDuration: number | null;
}): Promise<void> {
  const name = await getUserName(email);

  if (failResult.isNowLocked && failResult.lockDuration) {
    const lockedUntil = new Date(Date.now() + failResult.lockDuration * 1000);
    const html = getAccountLockedEmailHtml(
      name,
      email,
      lockedUntil,
      failResult.failedAttempts,
    );
    fireAndForgetEmail(email, "Akun Anda Dikunci Sementara - TeleBos", html);
    return;
  }

  if (failResult.failedAttempts === 3) {
    const html = getSuspiciousLoginActivityEmailHtml(
      name,
      email,
      failResult.failedAttempts,
    );
    fireAndForgetEmail(email, "Peringatan: Aktivitas Login Mencurigakan - TeleBos", html);
  }
}

/**
 * Wrapped POST handler that:
 *
 * 1. Normalizes forget-password responses to prevent email enumeration (vuln-0006).
 * 2. Enforces account-level brute-force protection on sign-in (vuln-0007):
 *    - Pre-checks account lockout before forwarding to Better Auth.
 *    - Records failed attempts after an error response.
 *    - Resets the counter after a successful sign-in.
 *    - Sends email notifications for lockouts and suspicious activity.
 */
async function safePost(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);

  // ── vuln-0006: Normalize password-reset paths ──────────────────────────
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

  // ── vuln-0007: Account-level brute-force protection for sign-in ─────────
  if (url.pathname.endsWith("/sign-in/email")) {
    // Clone the request so we can read the body for email extraction before
    // forwarding the original to Better Auth (which also consumes the body).
    let email: string | null = null;
    try {
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : null;
    } catch {
      // Body parse failure — fall through and let Better Auth handle it
    }

    if (email) {
      // ── Pre-check: is this account locked? ─────────────────────────────
      const lockoutResult = await checkLockout(email);
      if (lockoutResult.locked) {
        const minutes = Math.max(
          1,
          Math.ceil((lockoutResult.remainingSeconds || 60) / 60),
        );
        return NextResponse.json(
          {
            message: `Akun dikunci sementara karena terlalu banyak percobaan login. Coba lagi dalam ${minutes} menit.`,
            code: "ACCOUNT_LOCKED",
            retryAfterMinutes: minutes,
          },
          { status: 429 },
        );
      }

      // ── Forward to Better Auth ─────────────────────────────────────────
      let response: Response;
      try {
        response = await originalPost(req);
      } catch (err) {
        // Handler threw — treat as a failed attempt
        const failResult = await recordFailedAttempt(email);
        maybeNotify(email, failResult);
        throw err;
      }

      if (response.ok) {
        // Successful sign-in — reset the counter
        resetFailedAttempts(email).catch((err) =>
          console.error("[brute-force] resetFailedAttempts error:", err),
        );
      } else {
        // Failed sign-in — increment the counter and maybe notify
        const failResult = await recordFailedAttempt(email);
        maybeNotify(email, failResult);
      }

      return response;
    }
  }

  return originalPost(req);
}

export const { GET } = handlers;
export const POST = safePost;
