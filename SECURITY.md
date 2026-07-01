# SECURITY.md

Security documentation for TeleBos — a multi-account Telegram manager.

## Threat Model

### Assets

| Asset | Location | Risk if Compromised |
|-------|----------|---------------------|
| Telegram session strings | `telegram_accounts.session_string` (encrypted) | Full Telegram account access — messages, contacts, groups |
| 2FA passwords | `telegram_accounts.twofa_password` (encrypted) | Telegram account takeover, 2FA lockout |
| Better Auth Session Secret | `BETTER_AUTH_SECRET` env var (frontend) | Forging session tokens, web app takeover |
| App Secret Key | `APP_SECRET_KEY` env var (backend) | Forging HMAC signatures / photo URLs |
| Encryption key | `ENCRYPTION_KEY` env var | Decrypt all stored session strings and 2FA passwords |
| Groq API keys | `GROQ_API_KEY_1/2/3` env vars | Unauthorised usage, quota consumption |
| User passwords | PostgreSQL `account` table (hashed) | Web account takeover |
| Session tokens | Cookie / Header `x-better-auth-token` | Session hijacking (expires based on Better Auth configuration) |

### Trust Boundaries

```
[Browser] ←── HTTPS ──→ [FastAPI Backend] ←── Telethon MTProto ──→ [Telegram]
                              │
                              ├── [PostgreSQL] (encrypted session data at rest)
                              └── [Redis] (Celery broker, ephemeral only)
```

- **Between browser and backend**: The primary trust boundary. Better Auth session token validation (via `x-better-auth-token` header or cookies) is enforced on all protected endpoints.
- **Between backend and Telegram**: Telethon MTProto is encrypted. Session strings are the credential — treat them as such.
- **Between services**: PostgreSQL and Redis run on internal Docker network, no TLS between services.

## Current Security Controls

### Authentication & Authorization
- **Better Auth Integration**: Registration, login, logout, and token refresh are handled via Better Auth in the Next.js frontend.
- **`get_current_user` dependency**: Validates the Better Auth session token against the database's `session` table directly in FastAPI backend, verifying expiration and linking to an active user.
- **Password hashing**: Password hashes are managed securely by Better Auth in the PostgreSQL database.
- **Account ownership check**: Every account/device/chat endpoint verifies `user_id` matches the authenticated user before returning data
- **Role system**: `User.role` field (default `"operator"`) — currently stored but not enforced in route guards

### Data Protection
- **Session encryption**: All Telegram session strings encrypted with Fernet symmetric cipher before DB storage
- **2FA password encryption**: Stored encrypted in the same manner for auto-login during reconnection
- **Key fallback behavior**: If `ENCRYPTION_KEY` is invalid/missing, a new key is auto-generated — this will make existing encrypted data unreadable (logged as warning)
- **No plaintext secrets in code**: `.env` files are gitignored; `.env.example` contains placeholder values

### Transport Security
- **CORS restricted**: Default `CORS_ORIGINS=["http://localhost:3000"]` — only the Next.js frontend origin
- **Next.js rewrite**: `/api/*` and `/ws/*` proxied through Next.js to the backend (in production, terminate TLS at the reverse proxy)
- **WebSocket same-origin**: WS connections go through the Next.js rewrite path in production

### Broadcast Safety
- **Flood control**: `FloodController` detects Telegram rate limits, auto-escalates delays (1.5× multiplier, max 5 min pause)
- **Pause/Stop**: Broadcast jobs check `job.status` each iteration via `db.refresh()` and respect pause/cancel within 1 second
- **Error classification**: Telegram RPC errors classified into 9+ types for audit logging (flood, banned, admin_only, slowmode, etc.)
- **Per-group logging**: Every delivery attempt logged with status, error type, duration, and text preview

### WebSocket Security
- **WebSocket Authentication**: Connections to `/ws/broadcast/{job_id}`, `/ws/chats/{account_id}`, and `/ws/invite/{job_id}` must authenticate by sending a Better Auth session token as the first WS message or via cookies (`better-auth.session_token`).
- **Ownership Verification**: After authenticating, the backend enforces an ownership check verifying that the authenticated user owns the respective job or account.
- **Connection Limits**: Limits the number of concurrent connections per channel to prevent socket exhaustion.
- **Mitigation**: Channel IDs are UUIDs (unguessable).

## Security Gaps & Recommendations

### High Priority

1. **Rate limiting on auth endpoints** — `/send-code` and login/registration routes have no brute-force protection. Add IP-based or account-based rate limiting.

2. **Encryption key backup** — The fallback auto-generation of a new encryption key silently corrupts existing data. Document that `ENCRYPTION_KEY` must be backed up. Consider validating it at startup and refusing to start if DB contains encrypted data that the current key cannot decrypt.

### Medium Priority

3. **Audit logging** — No logging of sensitive actions (account login, 2FA changes, profile edits, broadcast starts). Add structured audit events to a dedicated table for compliance and incident response.

4. **Input validation on file uploads** — Profile photo upload checks `content_type.startswith("image/")` but doesn't validate file size, dimensions, or re-encode the image. Malicious images (e.g., SVG with JS, zip bombs) could be uploaded.

5. **Celery task authentication** — Broadcast/invite jobs are accepted from any authenticated user. Ensure task parameters are validated server-side (currently done in services).

### Low Priority

8. **TLS between services** — PostgreSQL and Redis connections are unencrypted on the internal Docker network. Acceptable for single-host deployments. For multi-host, add client certificates or TLS.

9. **Admin vs operator separation** — The `role` field exists on `User` but isn't enforced. Implement role-based access for administrative actions (viewing all users, system-wide settings).

10. **Refresh token rotation** — Refresh tokens don't rotate on each use. If a refresh token is stolen, it can be used repeatedly for 7 days. Implement refresh token rotation (issue a new refresh token each time and invalidate the old one).

11. **Key rotation** — No support for encryption key rotation. Rotating `ENCRYPTION_KEY` requires re-encrypting all stored session strings.

## Data Flow Security

### Telegraph Session Login (OTP)

```
User → Frontend → POST /send-code → Backend creates unauth Telethon client, sends OTP
                                           │
                                    Client stored in memory map (phone → client)
                                           │
User enters code → POST /verify-code → Backend signs in, encrypts session string, saves to DB
                                           │
                                    In-memory OTP client discarded
                                    Session string encrypted at rest in PostgreSQL
```

**Risks**: Abandoned OTP flows could leak memory if kept indefinitely. Mitigation: A background cleanup task (`clean_pending_logins_task`) runs every 60 seconds and disconnects/clears pending login clients older than 5 minutes.

### Broadcast Execution

```
User → POST /broadcast/start → Creates BroadcastJob → Celery task queued
                                                           │
                                                     Worker decrypts session string
                                                     Connects TelegramClient
                                                     Iterates groups, sends messages
                                                     Logs per-group results
```

**Risks**: Decrypted session string lives in Celery worker memory for the job duration. Consider zeroing the variable after use (though Python garbage collection makes this advisory only).

## Incident Response

If a security incident is detected:

1. **Revoke all Better Auth sessions** — Clear the `session` table in the PostgreSQL database, or change `BETTER_AUTH_SECRET` in the frontend env and restart the services.
2. **Rotate encryption key** — Change `ENCRYPTION_KEY` and re-encrypt all session strings. This invalidates all stored Telegram sessions; users must re-add their accounts.
3. **Terminate active Telegram sessions** — Use the device management endpoints or Telethon directly to terminate all unauthorized sessions.
4. **Audit broadcast logs** — Check `broadcast_logs` for anomalous activity (messages sent to unexpected groups, unusual volumes).

## Environment Variables

| Variable | Sensitivity | Notes |
|----------|-------------|-------|
| `BETTER_AUTH_SECRET` | Critical | Better Auth secret key (configured on frontend/Next.js). |
| `APP_SECRET_KEY` | Critical | Backend application secret (used for HMAC / signed URLs). |
| `ENCRYPTION_KEY` | Critical | 32-byte base64-encoded Fernet key. BACK THIS UP. |
| `GROQ_API_KEY_1/2/3`| Medium | Groq Cloud API keys. Rotated for AI appeals. |
| `TELEGRAM_API_ID` | Medium | Public app identifier (not secret, but paired with hash). |
| `TELEGRAM_API_HASH` | High | Telegram API secret. Do not share or commit. |
| `DATABASE_URL` | Medium | Contains credentials in plaintext. |
| `REDIS_URL` | Low | Local Redis, no auth by default. |
| `CORS_ORIGINS` | Low | Frontend origin whitelist. |

## Secure Deployment Checklist

- [ ] Generate a strong `ENCRYPTION_KEY` and back it up securely
- [ ] Generate a strong `BETTER_AUTH_SECRET` and `APP_SECRET_KEY` (do not use defaults)
- [ ] Set `DEBUG=False` in production
- [ ] Terminate TLS at the reverse proxy (nginx/Caddy/Traefik in front of the stack)
- [ ] Restrict `CORS_ORIGINS` to the actual frontend domain
- [ ] Set `POSTGRES_PASSWORD` to a strong value in `docker-compose.yml`
- [ ] Enable Redis password authentication in production
- [ ] Use environment-specific `.env` files — never commit real secrets
- [ ] Set up database backups (includes encrypted session strings and user tables)
- [ ] Configure log rotation to prevent disk exhaustion
- [ ] Run `docker-compose` services as non-root users where possible
