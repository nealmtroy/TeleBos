# SECURITY.md

Security documentation for TeleBos — a multi-account Telegram manager.

## Threat Model

### Assets

| Asset | Location | Risk if Compromised |
|-------|----------|---------------------|
| Telegram session strings | `telegram_accounts.session_string` (encrypted) | Full Telegram account access — messages, contacts, groups |
| 2FA passwords | `telegram_accounts.twofa_password` (encrypted) | Telegram account takeover, 2FA lockout |
| JWT secret key | `JWT_SECRET_KEY` env var | Forged auth tokens, full web app access |
| Encryption key | `ENCRYPTION_KEY` env var | Decrypt all stored session strings and 2FA passwords |
| User passwords | `users.password_hash` (bcrypt) | Web account takeover |
| Access tokens | Frontend localStorage (memory + storage) | Session hijacking (short-lived: 60 min) |
| Refresh tokens | Frontend localStorage | Persistent session hijacking (7-day window) |

### Trust Boundaries

```
[Browser] ←── HTTPS ──→ [FastAPI Backend] ←── Telethon MTProto ──→ [Telegram]
                              │
                              ├── [PostgreSQL] (encrypted session data at rest)
                              └── [Redis] (Celery broker, ephemeral only)
```

- **Between browser and backend**: The primary trust boundary. JWT auth enforced on all endpoints except `/auth/register` and `/auth/login`.
- **Between backend and Telegram**: Telethon MTProto is encrypted. Session strings are the credential — treat them as such.
- **Between services**: PostgreSQL and Redis run on internal Docker network, no TLS between services.

## Current Security Controls

### Authentication & Authorization
- **JWT-based auth**: Access tokens (60 min) + refresh tokens (7 days) with HS256 signing
- **`get_current_user` dependency**: Decodes JWT, validates `sub` matches an active user — applied to all protected routes
- **Password hashing**: bcrypt via passlib (`CryptContext(schemes=["bcrypt"])`)
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
- **No auth on WS endpoints**: `/ws/broadcast/{job_id}` and `/ws/chats/{account_id}` currently have no JWT verification
- **Mitigation**: Channel IDs are UUIDs (unguessable); broadcast channels require knowing the `job_id`

## Security Gaps & Recommendations

### High Priority

1. **WebSocket authentication** — Add JWT token verification as a query parameter or during the WebSocket handshake. Without it, anyone who discovers a job_id or account_id can listen to real-time events. Suggested approach: validate a `?token=` query parameter in the WebSocket endpoint before accepting the connection.

2. **Rate limiting on auth endpoints** — `/auth/login` and `/send-code` have no brute-force protection. Add IP-based or account-based rate limiting (the existing `InMemoryRateLimiter` can be extended, or use a Redis-based sliding window for production).

3. **Encryption key backup** — The fallback auto-generation of a new encryption key silently corrupts existing data. Document that `ENCRYPTION_KEY` must be backed up. Consider validating it at startup and refusing to start if DB contains encrypted data that the current key cannot decrypt.

### Medium Priority

4. **Session invalidation on logout** — There is no token blacklist. A logged-out user's JWT remains valid until expiry. Implement a denylist (Redis) for revoked tokens.

5. **Audit logging** — No logging of sensitive actions (account login, 2FA changes, profile edits, broadcast starts). Add structured audit events to a dedicated table for compliance and incident response.

6. **Input validation on file uploads** — Profile photo upload checks `content_type.startswith("image/")` but doesn't validate file size, dimensions, or re-encode the image. Malicious images (e.g., SVG with JS, zip bombs) could be uploaded.

7. **Celery task authentication** — Broadcast jobs are accepted from any authenticated user. Ensure task parameters are validated server-side (currently done in `start_broadcast` service).

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

**Risks**: The in-memory `_pending_logins` dict has no TTL — abandoned OTP flows leak memory. Mitigation: add a background cleanup task for flows older than 5 minutes.

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

1. **Revoke all JWT tokens** — Change `JWT_SECRET_KEY` in `.env` and restart the backend. All users will be forced to re-login.
2. **Rotate encryption key** — Change `ENCRYPTION_KEY` and re-encrypt all session strings. This invalidates all stored Telegram sessions; users must re-add their accounts.
3. **Terminate active Telegram sessions** — Use the device management endpoints or Telethon directly to terminate all unauthorized sessions.
4. **Audit broadcast logs** — Check `broadcast_logs` for anomalous activity (messages sent to unexpected groups, unusual volumes).

## Environment Variables

| Variable | Sensitivity | Notes |
|----------|-------------|-------|
| `JWT_SECRET_KEY` | Critical | Must be random, >32 chars. Rotate on compromise. |
| `ENCRYPTION_KEY` | Critical | 32-byte base64-encoded Fernet key. BACK THIS UP. |
| `TELEGRAM_API_ID` | Medium | Public app identifier (not secret, but paired with hash) |
| `TELEGRAM_API_HASH` | High | Telegram API secret. Do not share or commit. |
| `DATABASE_URL` | Medium | Contains credentials in plaintext |
| `REDIS_URL` | Low | Local Redis, no auth by default |
| `CORS_ORIGINS` | Low | Frontend origin whitelist |

## Secure Deployment Checklist

- [ ] Generate a strong `ENCRYPTION_KEY` and back it up securely
- [ ] Generate a strong `JWT_SECRET_KEY` (not the default)
- [ ] Set `DEBUG=False` in production
- [ ] Terminate TLS at the reverse proxy (nginx/Caddy/Traefik in front of the stack)
- [ ] Restrict `CORS_ORIGINS` to the actual frontend domain
- [ ] Set `POSTGRES_PASSWORD` to a strong value in `docker-compose.yml`
- [ ] Enable Redis password authentication in production
- [ ] Use environment-specific `.env` files — never commit real secrets
- [ ] Set up database backups (includes encrypted session strings)
- [ ] Configure log rotation to prevent disk exhaustion
- [ ] Run `docker-compose` services as non-root users where possible
