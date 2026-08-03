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
- **Role system**: `User.role` defaults to `basic`; supported role values are `basic`, `pro`, `premium`, and `owner`. `require_role()` enforces allowed-role lists on privileged endpoints, including owner-only administration and pro/premium/owner account operations.

### Data Protection
- **Session encryption**: All Telegram session strings encrypted with Fernet symmetric cipher before DB storage
- **2FA password encryption**: Stored encrypted in the same manner for auto-login during reconnection
- **Fail-closed key handling**: Known default secrets are rejected by `get_settings()`. An invalid or missing Fernet key raises `RuntimeError` when cipher setup is attempted; the application does not silently generate a replacement key.
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
- **WebSocket Authentication**: Connections to `/ws/broadcast/{job_id}`, `/ws/chats/{account_id}`, and `/ws/invite/{job_id}` authenticate with a Better Auth session token as the first WS message or via the `better-auth.session_token` cookie.
- **Ownership Verification**: After authentication, the backend verifies that the user owns the requested job or account.
- **Connection Limits**: Per-channel limits reduce socket exhaustion risk.

### Account-Scoped API Authorization
- Dashboard requests authenticate through Better Auth. Privileged routes use `require_role()`; owner-only administration and pro/premium/owner operations are guarded by allowed-role lists.
- Account-scoped message, media, forwarding, reaction, pin, poll, sticker, and GIF operations resolve the requested account against the authenticated user before calling Telethon-backed services.
- Some download routes accept the documented alternate token/header mechanism. Avoid placing long-lived credentials in URLs.
- **Public exceptions**: account and chat-photo retrieval routes are currently public/cached. They are not proof that every photo route validates ownership or a signed token; treat their exposure as an explicit design/security decision.

### API Documentation Boundaries
- Browser/dashboard traffic uses Better Auth session credentials.
- The interactive API documentation and OpenAPI schema are served at `/api/docs` and `/api/openapi.json`; consult the running backend for the current published contract.

## Security Gaps & Recommendations

### High Priority

1. **Encryption key backup and rotation** — `ENCRYPTION_KEY` is intentionally fail-closed, so it must be backed up securely. Rotating it still requires a planned re-encryption migration for stored session strings.

2. **Structured audit coverage** — Expand dedicated audit events for sensitive actions such as account login, 2FA changes, profile edits, and broadcast starts so incident review is not limited to operational logs.

3. **Public photo-route exposure** — Some account/chat photo retrieval routes are intentionally public and cached. The signed-token utility exists, but public route behavior must not be represented as universal ownership enforcement. Decide whether these routes should remain public or require validated short-lived tokens before expanding photo exposure.

### Medium Priority

4. **Service-to-service transport** — PostgreSQL and Redis are unencrypted on the internal Docker network. This is acceptable for a single-host deployment; multi-host deployments should use TLS or an equivalent protected network boundary.

5. **Upload hardening review** — Keep validating uploaded image content, size limits, and safe serving behavior as supported formats evolve; reject executable/script content and avoid treating client MIME types as sufficient proof of safety.

6. **Task parameter validation** — Keep authorization and ownership validation at the request/service boundary before broadcast or invite jobs are queued; add regression coverage when new task parameters are introduced.

### Low Priority

7. **Session and token lifecycle review** — Periodically verify Better Auth session/refresh-token behavior against the configured plugin/version and rotate/revoke credentials through the documented incident process.

8. **Authorization coverage review** — `require_role()` is active for privileged routes; periodically audit new owner/pro/premium endpoints to ensure they use both role and account-ownership dependencies where applicable.

## Data Flow Security

### Telegraph Session Login (OTP)

```
User → Frontend → POST /send-code → Backend creates unauth Telethon client, sends OTP
                                           │
                        Client, phone-code hash, and metadata stay in short-lived server memory
                        Browser receives only an opaque, owner-scoped login ID and safe display metadata
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
