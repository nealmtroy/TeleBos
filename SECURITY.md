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
                              └── [Redis] (Queue, Pub/Sub, rate limit, ephemeral only)
```

- **Between browser and backend**: The primary trust boundary. Better Auth session token validation (via `x-better-auth-token` header or cookies) is enforced on all protected endpoints.
- **Between backend and Telegram**: Telethon MTProto is encrypted. Session strings are the credential — treat them as such.
- **Between services**: PostgreSQL and Redis run on internal Docker network, no TLS between services.

## Current Security Controls

### Authentication & Authorization
- **Better Auth Integration**: Registration, login, logout, and token refresh are handled via Better Auth in the Next.js frontend (supporting email/password and Google OAuth 2.0 with automatic account linking). Replaces legacy custom JWT (`python-jose`).
- **Session Transport Security**: Browser requests send the session token to the FastAPI backend via the `x-better-auth-token` HTTP header (injected by client fetch interceptors) or the `better-auth.session_token` / `__Secure-better-auth.session_token` cookie for same-origin navigation and WebSockets.
- **SHA-256 Session Token Hashing at Rest**: Better Auth stores session tokens in PostgreSQL. To mitigate token theft from database read leaks or SQL snapshots, every token is hashed via SHA-256 (`token_hash = sha256(token)`). The FastAPI `get_current_user` dependency queries the `session` table by `token_hash`, ensuring plaintext session tokens are never compared directly or stored unprotected at rest.
- **Dual User Model Synchronization Security (`user` vs `users`)**:
  - **Account Takeover Prevention**: Sesi Better Auth mengaitkan ID string ke UUID `users.id` secara langsung (bukan berdasarkan email yang bisa berubah), mencegah eksploitasi takeover akun.
  - **Pre-Registration Defense**: Hook `user.create.before` memeriksa tabel `"user"` dan `users` secara serentak untuk mencegah duplikasi pendaftaran email.
  - **Creation Synchronization**: Hook `user.create.after` secara otomatis menyisipkan data profil ke tabel `users` dengan peran default `freetrial` dan masa kedaluwarsa 5 jam.
  - **Profile Name Synchronization**: Hook `user.update.after` menyelaraskan perubahan nama profil Better Auth ke kolom `users.full_name`.
  - **Ban & Suspension Synchronization**: Helper `restore_user_if_ban_expired` (`dependencies.py`) memeriksa masa suspensi pada saat request ingress dan melakukan sinkronisasi status aktif dan ban reason pada kedua tabel secara atomik tanpa premature commit.
- **Password Hashing**: Kelolaan kata sandi pengguna ditangani oleh Better Auth menggunakan bcrypt di dalam tabel `"account"`. Kolom legacy `users.password_hash` bersifat nullable dan tidak lagi digunakan untuk autentikasi aktif.
- **Account Ownership Check**: Setiap endpoint account/device/chat memverifikasi kecocokan `user_id` terhadap pengguna terotentikasi sebelum mengembalikan data atau mengeksekusi aksi.
- **Role System**: `User.role` memiliki nilai `freetrial`, `basic`, `pro`, `premium`, dan `owner` (dipetakan pada tier etalase sebagai Free Trial, Starter, Pro, Business, dan Owner Access sesuai `docs/subscription_plans_monthly_yearly.md`). `require_role()` menegakkan daftar peran terotorisasi pada endpoint terproteksi.

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
User → POST /broadcast/start → Creates BroadcastJob → Enqueued to Redis Queue
                                                           │
                                                     Async Worker daemon consumes job
                                                     Decrypts session string
                                                     Connects TelegramClient
                                                     Iterates groups, sends messages
                                                     Publishes logs & WS events
```

**Risks**: Decrypted session string lives in worker memory for the job duration. Consider zeroing the variable after use (though Python garbage collection makes this advisory only).

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
