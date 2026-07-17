# AGENTS.md

Guidance for AI coding agents (Claude Code, etc.) working on TeleBos.

This file complements `CLAUDE.md` and `PRD.md` — read `PRD.md` for detailed product requirements and feature specifications, `CLAUDE.md` for project architecture and commands, then use this file for agent-specific operational guidance.

## Agent Principles

1. **Read before you write** — Understand existing patterns before adding new code. This project follows strong conventions (async service layer, Pydantic schemas, Zustand stores, React Query hooks). Match them.

2. **No circular imports** — The backend is sensitive to circular imports between services and API modules. Use deferred imports (`from app.workers.broadcast_worker import run_broadcast_job` inside the function body) when crossing layers that may cause cycles.

3. **Async consistency** — The backend is fully async. Never add sync database access or sync Telethon calls. Celery tasks bridge this by calling `asyncio.run()`.

4. **Encryption is mandatory** — Any new field storing Telegram-sensitive data (session strings, auth tokens, passwords) must use `app.utils.encryption.encrypt()`/`decrypt()`. Do not store raw session strings.

5. **Production secret guards** — `app/config.py` enforces that `APP_SECRET_KEY` and `ENCRYPTION_KEY` are not left at their insecure defaults. Any new secret should follow this pattern — add a guard in `get_settings()`.

## Agent Workflows

### Adding a new API endpoint

1. Define the Pydantic schema in `backend/app/schemas/` (request/response models with `model_config = {"from_attributes": True}` for ORM responses)
2. Add or extend the SQLAlchemy model in `backend/app/models/` if needed
3. Export the new model in `backend/app/models/__init__.py`
4. Write business logic in `backend/app/services/` — keep API routes thin
5. Add the route handler in `backend/app/api/` — validate via Depends on schemas, delegate to service
6. Register the router in `backend/app/main.py` (import + `app.include_router()`)
7. Add the corresponding React Query hook in `frontend/src/hooks/`
8. Wire it into a page component

### Adding a new frontend page

1. Create the page file under `frontend/src/app/` following the existing naming pattern
   - Auth pages: `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx`
   - Dashboard pages: `frontend/src/app/(dashboard)/<section>/page.tsx`
   - Dynamic routes: `frontend/src/app/(dashboard)/<section>/[id]/page.tsx`
   - Static/public pages: `frontend/src/app/help/`, `frontend/src/app/privacy/`, `frontend/src/app/tos/`
2. Create a React Query hook in `frontend/src/hooks/` if the page fetches data
3. Add the navigation link in `frontend/src/components/layout/sidebar.tsx`
4. Use shadcn/ui components from `frontend/src/components/ui/` for consistency

### Adding i18n translations

Translations live in `frontend/src/lib/i18n/` with a Zustand store as the runtime. Two locales exist: `en.ts` and `id.ts`.

1. Add the new key to the `Dict` type in `frontend/src/lib/i18n/types.ts`
2. Add translations for the key in both `en.ts` and `id.ts`
3. Use the `useT()` hook in components: `const t = useT(); t('yourKey')`

### Working with profile photos

Profile photo endpoints are in `backend/app/api/accounts.py`:
- `POST /api/v1/accounts/{id}/photo` — upload (validates `content_type.startswith("image/")`, size not strictly enforced)
- `GET /api/v1/accounts/{id}/photo` — view/download (uses signed URLs via `app/utils/signed_url.py` — short-lived HMAC tokens scoped to account+user, default 5-min TTL)
- `DELETE /api/v1/accounts/{id}/photo` — delete

Frontend hooks are in `frontend/src/hooks/use-accounts.ts` (`useAccountPhoto`, `useDeleteAccountPhoto`). The account detail page at `frontend/src/app/(dashboard)/accounts/[id]/page.tsx` shows the photo with upload/delete actions.

The `profile_sync_service.py` background task (runs every 5 minutes) detects profile photo changes made directly on Telegram and updates the local cache automatically using `profile_photo_id` for change detection.

### Modifying the broadcast system

The broadcast system is the most complex subsystem in this project. Key files:

- `backend/app/services/broadcast_service.py` — core execution loop (pause/resume/stop, looping, flood control, multi-account rotation)
- `backend/app/services/broadcast_log_sender.py` — sends per-cycle summary reports to a configurable Telegram destination via the broadcasting account
- `backend/app/services/broadcast_worker.py` — Celery task entry point (bridges async)
- `backend/app/api/broadcast.py` — REST + WebSocket endpoints
- `backend/app/utils/flood_control.py` — adaptive delay on rate limits
- `backend/app/utils/telegram_errors.py` — error classification (9 error types)
- `backend/app/models/broadcast_job.py` — job state machine
- `backend/app/api/ws.py` — WebSocket ConnectionManager

**Job state machine:** `pending` → `running` ↔ `paused` → `cancelled` / `completed` / `failed`
- Only terminal status jobs can be deleted or retried
- Looping jobs never auto-complete; they stay `running` until cancelled
- Running broadcast jobs are auto-resumed on server startup via `resume_running_broadcasts_on_startup()`

**Multi-account broadcasting:** Jobs store `account_ids` (JSONB array) instead of a single `account_id`. The broadcast loop rotates through accounts. Each `BroadcastLog` tracks `account_id_used` to record which account sent each message.

**Randomized delays:** `delay_randomized` flag enables random delay variation per group.

**Broadcast log destination:** `log_destination` field (optional) specifies a Telegram chat/channel/bot where cycle summaries are sent. Defaults to `BROADCAST_LOG_DEFAULT_DEST` config.

**Broadcast logs track per-cycle results.** Each `BroadcastLog` record has a `cycle_number` field. When modifying the broadcast loop, ensure:
- `db.refresh(job)` is called each iteration to pick up pause/cancel commands
- WebSocket push failures are caught (log warning, don't crash)
- Flood control is consulted before each group delay
- Cycle number is incremented in the log when looping

**Group list bulk import** is available via `POST /api/v1/group-lists/bulk` — accepts a list of group targets (username, invite link, or group ID) in a single request.

### Working with the auto-reply system

Auto-reply configuration is stored on the `TelegramAccount` model (per-account fields + a global toggle). Data flow:

1. Frontend: `frontend/src/app/(dashboard)/auto-reply/page.tsx` — settings form
2. Hook: `frontend/src/hooks/use-accounts.ts` — `useAutoReply()`, `useUpdateAutoReply()`
3. Backend: `PUT /api/v1/accounts/{id}/auto-reply` in `backend/app/api/settings.py`
4. Service: `backend/app/services/settings_service.py` — read/write config
5. Logging: `backend/app/models/auto_reply_log.py` — tracks which users have been replied to (dedup key)
6. Rate limiting: Redis-based rate limiter in `app/utils/redis.py` — MAX_REPLIES_PER_HOUR=30, COOLDOWN_SECONDS=5

### Working with Spam Check & Appeals

**Spam checking:**
- SpamBot interaction helper: `backend/app/utils/spambot_helper.py` — parses SpamBot responses using keyword matching from `backend/app/utils/spambot_keywords.json`
- Keywords file supports multiple languages: English, Indonesian, Malay
- Status categories: `clean`, `temporary_limit`, `appeal_submitted`, `appeal_flow_active`, `permanent_limit`
- Spam status fields on `TelegramAccount`: `spam_status`, `spam_detail`, `spam_last_checked_at`

**Spam appeals:**
1. Backend Service: `backend/app/services/appeal_service.py` handles reason generation.
2. It uses Groq API keys `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, and `GROQ_API_KEY_3` in a rotating sequence for resilience/rate limit dodging, falling back gracefully if any key is missing or fails.
3. Default presets include "AI Generated" presets in both English and Indonesian. Custom reasons are allowed.
4. Route handler: `POST /api/v1/accounts/{id}/appeal` in `backend/app/api/accounts.py`.
5. Frontend component: `frontend/src/components/accounts/spam-appeal-dialog.tsx`.

### Working with SMM & Marketplace

1. Backend Service: `backend/app/services/smm_service.py` and `admin_smm_service.py` for service and pricing administration.
2. Marketplace service: `backend/app/services/marketplace_service.py` — buy/sell Telegram accounts, manage stock, country detection from phone prefix.
3. Orders are placed via `order_service.py` and logs/vouchers are handled in `redeem_service.py`.
4. Database Models: `Order`, `RedeemCode`, `RedeemLog`, `SmmService`, `SmmSetting`, `AccountAuditLog` (tracks buy/sell actions), `TelegramIdPrefixPrice` (per-prefix sell pricing).
5. Admins can refresh all pending orders with `refresh_all_pending_smart()` which connects to the external SMM APIs.
6. Background tasks: SMM services sync every 12 hours; pending order status poll every 60 seconds.
7. User pricing: `backend/app/services/user_account_price_service.py` and `backend/app/api/admin_account_prices.py` for Telegram ID prefix-based pricing.
8. User model fields: `balance`, `subscription_expires_at`, `telegram_chat_id` for payment/subscription support.
9. Auto-downgrade: `redeem_service.auto_downgrade_if_expired()` is called in the auth dependency to auto-downgrade expired subscriptions.

### Working with the Bulk Invite System

1. Backend Service: `backend/app/services/invite_service.py` manages invitation loops and member imports.
2. Celery-backed worker starts invite jobs asynchronously.
3. **Multi-account support:** Jobs store `account_ids` (JSONB array). The invite loop rotates through accounts. Each `InviteLog` tracks `account_id_used`.
4. Database Models: `InviteJob` (state machine tracking progress and status) and `InviteLog` (tracks outcomes of individual invitation attempts).
5. Route handler: `POST /api/v1/invite/start`.
6. WebSocket channel: `/ws/invite/{job_id}` for real-time invite progress.

### Working with Telethon clients

- `TelegramClientPool` (`backend/app/services/telegram_client.py`) manages an in-memory dict of connected clients
- `TelethonPool` (`backend/app/utils/telethon_pool.py`) — lower-level pool utility for creating/reconnecting clients from encrypted session strings
- **Device spoofing:** `backend/app/utils/device_spoof.py` — makes Telethon clients appear as iPhone devices (randomized model, iOS version, app version) to reduce ban risk
- Session strings are decrypted from the DB before use
- After creating or verifying an account, always call `event_relay.attach()` to register event handlers
- The `SessionManager` health check runs every 30 seconds — don't duplicate this
- To convert session strings from other formats (GramJS, Pyrogram, raw), use `backend/app/utils/session_converter.py`
- `TelegramAccount` model stores `pts`, `qts`, `date` fields for Telegram state sync

### Working with the Chat UI system (Telegram Web K inspired)

The `/chats` page is built as a standalone, immersive Telegram Web K-inspired interface:

1. **Layout Isolation:** `frontend/src/app/(dashboard)/shell.tsx` conditionally hides the global dashboard navbar, sidebar, and banners when `/chats` is active, allowing full 100vh viewport usage.
2. **Independent CSS Theme System:** `frontend/src/components/chat/chat.css` defines scoped CSS custom properties (`--tg-*`) under `.tg-chat-root` and `.tg-chat-root.tg-dark`. Theme toggle is saved in `localStorage` (`tg-chat-theme`) independently of the global TeleBos theme.
3. **Scalable Account Switcher:** `frontend/src/components/chat/AccountSwitcher.tsx` handles 100-250+ accounts with instant search, avatar color gradients, spam status check (`limited`, `temporary_limit`, `permanent_limit`), and live WS connection status.
4. **Strict Telegram Chat Sorting:** `ChatsContent.tsx` enforces Telegram sorting rules:
   - Pinned chats (`is_pinned === true`) are locked at the very top.
   - Unpinned chats are sorted dynamically by `last_message_time` descending (newest first).
   - Realtime WebSocket `new_message` / `outgoing_message` events update timestamps and trigger instant list reordering.
5. **Left Column Row & Badges:** `ChatLeftColumn.tsx` uses 72px row height and 54px avatars with distinct badges for Saved Messages (Bookmark icon), Official Telegram (ShieldCheck icon), Bot (`BOT` tag), Group, and Channel entities.
6. **Right Column Cover Photo & Cards:** `ChatRightColumn.tsx` features:
   - Cover photo zoom animation on scroll (`scrollTop === 0` expands cover photo with bottom gradient overlay and white title/subtitle).
   - Info cards for Username/Invite Link (with Copy & QR actions) and Notifications toggle switch.
   - Segmented pill tabs (`Media`, `Docs`, `Links` with automatic URL extraction from message history).
7. **Message Bubble Linkification:** `MessageBubble.tsx` (`renderFormattedText`) automatically converts URLs into clickable `<a>` links with `var(--tg-accent)` color and `target="_blank"`.
8. **Interactive Popups & Focus:** `EmojiPicker.tsx` handles `onMouseDown={(e) => e.preventDefault()}` on buttons to preserve textarea focus during emoji selection.

### Working with account folders

Account folders let users organize their Telegram accounts into groups (different from Telegram chat folders).

- Backend models: `AccountFolder` and `AccountFolderMember` (many-to-many)
- API: `backend/app/api/account_folders.py` — CRUD operations on `/api/v1/account-folders/*`
- Frontend: `frontend/src/hooks/use-account-folders.ts` and `frontend/src/components/accounts/folder-manager-dialog.tsx`, `folder-filter-bar.tsx`

### Working with the profile sync system

The profile sync system detects changes made directly on Telegram and updates the local DB:

1. **Periodic polling:** `backend/app/services/profile_sync_service.py` runs every 5 minutes, calling `client.get_me()` for each connected account
2. **Real-time detection:** `backend/app/services/event_relay.py` listens for `UpdateUserName`, `UpdateUserPhone`, `UpdateUser` TL events for self-profile changes
3. **Photo change detection:** Uses `profile_photo_id` on `TelegramAccount` to detect photo changes without re-downloading every sync
4. **WebSocket push:** Profile changes are pushed to connected clients via the `chats:{account_id}` channel

### Working with the stats system

Background service for caching Telegram dialog statistics (contacts, groups, channels):

1. Service: `backend/app/services/stats_service.py` — `refresh_account_stats()` and `refresh_all_accounts()`
2. Background task: `background_stats_updater()` runs every 24 hours (with 60s startup delay)
3. Cached on `TelegramAccount` model: `contacts_count`, `total_groups`, `owned_groups`, `total_channels`, `owned_channels`, `stats_updated_at`
4. Frontend hook: `frontend/src/hooks/use-account-stats.ts`
5. Inter-account delay of 60s between refreshes to avoid Telegram flood limits

### Working with UptimeRobot status

Service status monitoring via UptimeRobot API:

1. Service: `backend/app/services/uptimerobot_status.py` — fetches and caches monitor status
2. Background refresh: Runs every 10 minutes; all users read the same cached data
3. API: `GET /api/v1/system/status` in `backend/app/api/system.py`
4. Config: `UPTIMEROBOT_API_KEY`, `UPTIMEROBOT_MONITOR_IDS`, `UPTIMEROBOT_API_URL`

### Debugging real-time events

- WebSocket events are pushed via `ConnectionManager` in `backend/app/api/ws.py`
- Each account gets a `chats:{account_id}` channel; each broadcast job gets a `broadcast:{job_id}` channel; each invite job gets `invite:{job_id}`
- WS auth uses Better Auth session tokens — frontend sends `{"type": "auth", "token": "<session_token>"}` as first message
- Connection limits: max 10 concurrent WebSocket connections per channel
- The frontend `socket.ts` implements a custom `ReconnectingWebSocket` with 3s reconnect and 25s ping keepalive
- For debugging, check browser console `[WS]` logs and backend logs for `WS push failed` warnings

### Docker Compose architecture

The `docker-compose.yml` defines 5 services:
- **postgres** (16-alpine) — persistent volume `postgres_data`
- **redis** (7-alpine)
- **backend** — FastAPI, health check on `/api/v1/health`, depends on postgres + redis
- **celery-worker** — same image as backend but runs Celery, depends on redis
- **frontend** — Next.js, depends on backend

Environment overrides in `docker-compose.yml` set `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, `CORS_ORIGINS`. The frontend uses `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` pointing at the backend container.

## Background Tasks (Lifespan)

The following background tasks are spawned in `app/main.py` lifespan and cancelled on shutdown:

| Task | Interval | Purpose |
|------|----------|---------|
| `clean_pending_logins_task` | Continuous | Cleans up expired OTP login flows (>5 min) from `_pending_logins` |
| `background_stats_updater` | 24 hours | Refreshes cached dialog stats for all accounts |
| `_profile_sync_loop` | 5 minutes | Detects profile changes made on Telegram |
| `_smm_services_sync_loop` | 12 hours | Syncs SMM services from external panel API |
| `_smm_orders_poll_loop` | 60 seconds | Auto-refreshes pending SMM order statuses |
| `uptimerobot_service.start_background_refresh` | 10 minutes | Caches UptimeRobot monitor status |
| `resume_running_broadcasts_on_startup` | Once (startup) | Re-queues any broadcast jobs that were `running` when the server stopped |

## Testing & Validation

This project does not currently have automated tests. When adding tests:

- **Backend**: Use `pytest` with `pytest-asyncio` for async tests. Mock Telethon clients with `unittest.mock` or a dedicated mock pool.
- **Frontend**: Use `vitest` or `jest` with `@testing-library/react`. Mock API calls via MSW or by mocking the axios client.
- **Manual verification**: Start the full stack with Docker Compose and test via the UI at `localhost:3000`.

## Common Gotchas

- **PostgreSQL UUID columns** — SQLAlchemy models use `UUID(as_uuid=True)` with `default=uuid.uuid4`. Always pass UUID objects, not strings, for foreign keys at the ORM level.
- **Celery + async** — Celery tasks run sync functions. The broadcast worker bridges this with `asyncio.run()`. Within the async function, create a fresh DB session — don't reuse one from the request scope.
- **CORS** — Backend allows origins from `CORS_ORIGINS` env var (default `["http://localhost:3000"]`). Frontend rewrites `/api/*` and `/ws/*` to the backend via Next.js rewrites in `next.config.js`.
- **Frontend WS URL** — Set `NEXT_PUBLIC_WS_URL` (default auto-detected from `window.location`). The WebSocket client connects directly to the backend, not through the Next.js rewrite. In production it routes through the reverse proxy on the same host.
- **Encryption key rotation** — Changing `ENCRYPTION_KEY` will break existing session strings. Keys must not be the insecure default — `get_settings()` enforces this at startup.
- **Datetime freshness** — Python `datetime.now()` calls across different services (backend, Celery worker) may skew if system time isn't synced. Use `datetime.now(timezone.utc)` consistently.
- **OTP flow memory** — Pending OTP login flows are cached in `_pending_logins` within `backend/app/api/accounts.py` and are cleaned up after 5 minutes by the background task `clean_pending_logins_task`. When creating other temporary flows, always ensure a similar TTL mechanism is in place to prevent memory leaks.
- **Multi-account JSONB arrays** — Both `BroadcastJob` and `InviteJob` store `account_ids` as JSONB arrays (not a single FK). Migrations handle the migration from the old single `account_id` column.
- **Schema migrations** — `_run_migrations()` in `main.py` runs idempotent ALTER TABLE migrations on startup. For new columns, follow the existing pattern of checking `if "column_name" not in columns`.
- **Better Auth ↔ legacy users sync** — Startup migrations sync users bidirectionally between the BA `"user"` table and the legacy `"users"` table. BA uses text IDs; legacy uses UUID. Email is the cross-reference key.
- **BigInteger columns** — SMM prices and order amounts can exceed 32-bit INTEGER range. Use `BigInteger` for any monetary/count columns.
- **Rate limiting** — The `InMemoryRateLimiter` in `app/utils/rate_limiter.py` and Redis-based rate limiting in `app/utils/redis.py` are used across WS, photo, 2FA, and auto-reply endpoints. Rate limit config is in `app/config.py`.

## Security Considerations

- Better Auth sessions manage user tokens and lifetimes. Token management is automatic via the Better Auth client. The server-side config is in `frontend/src/lib/auth.ts`; client-side in `frontend/src/lib/auth-client.ts`.
- Fernet encryption keys must be kept secret and backed up. Loss = all Telegram sessions invalidated.
- Session strings grant full Telegram access — treat them like passwords.
- User passwords are managed and hashed securely by Better Auth (bcryptjs, compatible with legacy passlib bcrypt hashes).
- The `is_active` flag on both User and TelegramAccount models controls access across the app.
- WebSocket endpoints (`/ws/broadcast/{job_id}`, `/ws/chats/{account_id}`, `/ws/invite/{job_id}`) require token-based authentication and ownership validation, with max 10 connections per channel.
- The `User.role` field (default `"basic"`) supports `"basic"`, `"operator"`, `"admin"`, `"owner"`. Role-based access is enforced via `require_role()` dependency in `app/dependencies.py`.
- **Middleware stack:** `RealIPMiddleware` (Cloudflare/proxy IP extraction), `SecurityHeadersMiddleware` (X-Content-Type-Options, X-Frame-Options, CSP, HSTS), `TrustedHostMiddleware` (Host header validation), `CORSMiddleware`.
- **Signed photo URLs:** `app/utils/signed_url.py` generates short-lived HMAC tokens scoped to (account_id, user_id) for photo access, replacing raw JWT query parameters.
- **Device spoofing:** `app/utils/device_spoof.py` randomizes iOS device fingerprints per Telethon client to reduce detection risk.
- **Production config guards:** `get_settings()` raises `RuntimeError` if `APP_SECRET_KEY` or `ENCRYPTION_KEY` are left at defaults.
