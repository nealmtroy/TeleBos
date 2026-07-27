# Strix Security Assessment Instructions - TeleBos

Please perform a targeted security assessment on the TeleBos application focusing on the following vulnerability classes and abuse vectors:

## 1. Concurrency and Race Conditions (Double Spending)
- Test for race conditions and concurrency vulnerabilities on all endpoints that modify the user's wallet balance.
- Specifically evaluate order placement (`/api/v1/orders/*`), marketplace purchases, and voucher redemptions (`/api/v1/redeem`).
- Check if sending multiple parallel concurrent HTTP requests can bypass balance validation, allowing a user to spend more than their active balance or drive the account balance into negative values.

## 2. Sensitive Data Leakage
- Verify that highly sensitive information, such as Fernet-encrypted Telegram session strings, decrypted session bytes, active login OTP codes, or 2FA passwords, is never leaked in:
  - JSON API response payloads (e.g., account details, lists, or logs).
  - Error messages, tracebacks, or server response headers.

## 3. WebSocket Authorization and Hijacking
- Inspect all real-time WebSocket endpoints, including `/ws/chats/{account_id}` and `/ws/broadcast/{job_id}`.
- Test if an unauthenticated or unauthorized connection can successfully subscribe to or read message streams, dialogs, or active broadcast progress events of another user's account.

## 4. Privilege Escalation and RBAC Bypass
- Validate the strict boundary enforcement between `basic`, `pro`, `premium`, and `owner` roles.
- Test if users with lower privileges can access admin-only API routes (e.g., `/api/v1/admin/*`, price settings, or prefix rules) or manipulate resources (broadcast jobs, invite lists, folders) belonging to other users.

## 5. Rate Limiter Bypass (IP Spoofing)
- Test the resilience of rate limiters on critical endpoints (such as OTP requests, login attempts, auto-reply actions, and 2FA configuration).
- Attempt to bypass the IP-based rate limiting limits by manipulating HTTP headers typically forwarded by reverse proxies or CDNs, such as `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, or `True-Client-IP`.
