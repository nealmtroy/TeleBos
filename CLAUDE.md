# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeleBos is a multi-account Telegram manager web app. It lets users add unlimited Telegram accounts via OTP or session string upload, manage profiles/privacy, view chats in real time, manage chat folders, broadcast messages to groups/channels with configurable delays and looping, bulk invite users, and buy/sell accounts on an integrated marketplace.

**Companion guides:** Read `PRD.md` for detailed product requirements and feature specifications. Read `AGENTS.md` for agent-specific operational guidance (patterns for adding endpoints, modifying the broadcast system, working with Telethon clients, common gotchas). Read `SECURITY.md` for the threat model and security controls.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS 3, shadcn/ui, React Query, Zustand, Recharts |
| Backend | FastAPI (Python 3.12), Telethon, SQLAlchemy 2.0 (async), Groq Cloud API (Llama 3.1) |
| Auth | Better Auth (Next.js server, PostgreSQL adapter, email/password + 2FA via TOTP) |
| Workers | Celery (Redis broker) |
| Database | PostgreSQL 16 (async via asyncpg) |
| Cache/Queue | Redis 7 (token blacklist, rate limiting, auto-reply cooldowns) |
| Real-time | Native WebSocket (FastAPI, no Socket.IO) |

## Architecture

### Backend (`backend/`)

Layered architecture following FastAPI conventions:

- **`app/api/`** — Route handlers (thin controllers that validate via Pydantic, delegate to services): `auth`, `accounts`, `chats`, `contacts`, `devices`, `settings`, `broadcast`, `invite`, `orders`, `marketplace`, `redeem`, `admin`, `admin_smm`, `admin_account_prices`, `account_folders`, `ws`, `system`
- **`app/services/`** — Business logic layer: `account_service`, `auth_service`, `broadcast_service`, `broadcast_log_sender`, `broadcast_worker`, `chat_service`, `contact_service`, `device_service`, `settings_service`, `telegram_client`, `session_manager`, `event_relay`, `appeal_service`, `invite_service`, `smm_service`, `admin_smm_service`, `marketplace_service`, `redeem_service`, `order_service`, `profile_sync_service`, `stats_service`, `uptimerobot_status`, `user_account_price_service`
- **`app/models/`** — SQLAlchemy ORM models: `User`, `TelegramAccount`, `BroadcastJob`, `BroadcastLog`, `GroupList`, `TextList`, `ChatFolder`, `AutoReplyLog`, `InviteJob`, `InviteLog`, `Order`, `RedeemCode`, `RedeemLog`, `SmmService`, `SmmSetting`, `TelegramChat`, `AccountAuditLog`, `TelegramIdPrefixPrice` (aliased as `UserAccountPrice`), `AccountFolder`, `AccountFolderMember`
- **`app/schemas/`** — Pydantic v2 request/response schemas: `account`, `account_folder`, `account_stats`, `admin_smm`, `auth`, `broadcast`, `chat`, `contact`, `device`, `invite`, `log`, `marketplace`, `order`, `redeem`, `settings`, `user_account_price`
- **`app/workers/`** — Celery task definitions: `broadcast_worker` (bridges async), `celery_app`
- **`app/utils/`** — Encryption (Fernet), rate limiter (in-memory), Redis helpers (token blacklist, auto-reply rate limit), flood control, Telegram error classification, session converter, device spoofing (iOS fingerprint), signed URL (HMAC photo tokens), spambot helper (keyword-based response parsing)
- **`app/main.py`** — FastAPI app creation, lifespan (DB migrations, auto-reconnect accounts, broadcast job resume, background tasks), middleware stack (CORS, security headers, trusted host, real IP), router registration
- **`app/database.py`** — Async SQLAlchemy engine + session factory
- **`app/dependencies.py`** — Better Auth session validation (`get_current_user`), role-based access (`require_role`), auto-subscription-downgrade
- **`app/config.py`** — Pydantic Settings (env-based config, Groq keys rotation, UptimeRobot, SMM panel, broadcast defaults, rate limit config)

### Frontend (`frontend/`)

- **`src/app/`** — Next.js App Router pages:
  - Auth: `login`, `register`, `forgot-password`, `reset-password`
  - Dashboard: `(dashboard)/dashboard`, `accounts`, `accounts/[id]`, `accounts/add`, `chats`, `broadcast`, `auto-reply`, `invite`, `groups-channels`, `contacts`, `orders`, `redeem`, `subscriptions`, `settings`
  - Admin: `(dashboard)/admin` (overview), `admin/smm`, `admin/users`, `admin/account-prices`, `admin/redeem-codes`, `admin/redeem-logs`
  - Public: `help`, `help/[slug]`, `privacy`, `tos`, `llms.txt`
  - SEO: `robots.ts`, `sitemap.ts`, `not-found.tsx`
- **`src/app/api/auth/[...all]/`** — Better Auth catch-all API route handler
- **`src/components/`** — shadcn/ui primitives (button, card, badge, avatar, skeleton, toast) + custom components:
  - `accounts/`: `account-card`, `account-avatar`, `spam-appeal-dialog`, `folder-manager-dialog`, `folder-filter-bar`
  - `broadcast/`: `broadcast-progress`, `cycle-accordion`
  - `layout/`: `sidebar`, `navbar`, `account-switcher`, `language-switcher`, `announcement-banner`
  - `orders/`: order-related components
- **`src/hooks/`** — React Query hooks: `use-accounts`, `use-account-folders`, `use-account-stats`, `use-broadcast`, `use-chats`, `use-contacts`, `use-invite`, `use-marketplace`, `use-orders`, `use-subscriptions`, `use-admin`, `use-admin-smm`, `use-admin-redeem`, `use-auth` + WebSocket hooks: `use-socket`
- **`src/lib/`** — Axios client with Better Auth token interceptor (`api.ts`), Better Auth server (`auth.ts`) and client (`auth-client.ts`), native WebSocket client (`socket.ts`), utilities (`utils.ts`), email templates (`email.ts`), SMM service filter (`services-filter.ts`), i18n (`i18n/en.ts`, `i18n/id.ts`)
- **`src/store/`** — Zustand stores: `auth-store` (user session, token management), `app-store` (UI state)

### Key Data Flow

#### Authentication
1. User registers/logs in via Better Auth endpoints on frontend Next.js (`/api/auth/[...all]/*`) → session token created
2. Frontend reads `better-auth.session_token` cookie, Axios interceptor injects `x-better-auth-token` header
3. FastAPI backend validates the token by querying PostgreSQL `session` table directly (in `app/dependencies.py`)
4. Expiration is verified against the database session's `expiresAt` timestamp
5. Email verification is required for registration (sent via configured SMTP in `frontend/src/lib/email.ts`)
6. 2FA (TOTP) support via Better Auth's `twoFactor` plugin

#### Telegram Account Login (OTP flow)
1. `POST /send-code` creates an unauth Telethon client (with iOS device spoofing), sends OTP, and stores it in the in-memory map `_pending_logins` (user_id -> phone -> (client, created_at)) in `backend/app/api/accounts.py`. Expired flows (older than 5 minutes) are disconnected and cleaned up by `clean_pending_logins_task` to prevent memory leaks.
2. `POST /verify-code` signs in with OTP (and optional 2FA), saves encrypted session string to DB
3. After verification, `event_relay.attach()` registers Telethon event handlers for real-time updates
4. On server startup, `session_manager.reconnect_all()` reconnects all active accounts

#### Broadcast System
1. User creates Group Lists (target groups/channels) and Text Lists (message templates)
2. `POST /broadcast/start` creates a `BroadcastJob` record and pushes a Celery task
3. Celery worker bridges to async via `asyncio.run()` — connects via Telethon, iterates groups, sends messages
4. **Multi-account rotation:** Jobs can use multiple accounts (`account_ids` JSONB array); the loop rotates through them
5. Per-group progress pushed to WebSocket (`/ws/broadcast/{job_id}`) in real time
6. Flood control (`FloodController`) auto-adjusts delays when Telegram rate-limits are hit (1.5× multiplier, max 5 min pause)
7. Looping mode re-runs broadcasts on a cycle with configurable `delay_after_all`
8. **Cycle summary reports:** `broadcast_log_sender.py` sends formatted HTML summaries to a configurable Telegram destination after each cycle
9. Running broadcast jobs are auto-resumed on server restart

**Job state machine:** `pending` → `running` ↔ `paused` → `cancelled` / `completed` / `failed`
- Only terminal-status jobs can be deleted or retried
- Looping jobs never auto-complete; they stay `running` until cancelled
- `db.refresh(job)` is called each iteration to pick up pause/cancel commands

#### Real-Time Event Relay
- `TelegramEventRelay` attaches Telethon event handlers per account on startup/login
- Events (new messages, edits, reads, typing, chat actions, **profile changes**) pushed via WebSocket `ConnectionManager`
- Profile change detection via `UpdateUserName`, `UpdateUserPhone`, `UpdateUser` TL types
- Each account has its own WebSocket channel: `/ws/chats/{account_id}`
- Frontend `useChatSocket` / `useBroadcastSocket` hooks subscribe to these channels
- ConnectionManager is in `backend/app/api/ws.py` (max 10 connections per channel)

#### Profile Sync System
- `profile_sync_service.py` polls `client.get_me()` every 5 minutes for each connected account
- Detects changes to name, username, phone, bio, and profile photo
- Photo change detection uses `profile_photo_id` to avoid unnecessary re-downloads
- Updates are pushed via WebSocket to connected clients

#### Auto-Reply System
- Per-account and global auto-reply settings stored in `TelegramAccount` model fields
- `AutoReplyLog` model tracks which users have been replied to (dedup)
- Redis-based rate limiting: 30 replies/hour, 5-second cooldown
- `settings_service.py` handles read/write of auto-reply configuration
- Frontend UI at `frontend/src/app/(dashboard)/auto-reply/page.tsx`

#### Spam Check & Appeal System
- SpamBot response parsing via `spambot_helper.py` with multilingual keyword matching (`spambot_keywords.json`)
- Integrated Groq API using rotated API keys (`GROQ_API_KEY_1`/`2`/`3`) to generate appeal reasons with Llama 3.1
- Supports custom appeal reason writing or pre-configured "AI-Generated" default presets
- Frontend handles status check (e.g. "limited" accounts) and appeals via dialog box at `frontend/src/components/accounts/spam-appeal-dialog.tsx`

#### SMM & Marketplace System
- Multi-tier pricing structure for SMM services and buying/selling accounts
- Account marketplace: `marketplace_service.py` — buy/sell with country detection, audit logging
- Order logging and verification (`Order`, `RedeemCode`, `RedeemLog`, `AccountAuditLog` models)
- Admin interface for adding services, modifying price structures, and viewing redemption logs
- Telegram ID prefix-based pricing (`TelegramIdPrefixPrice` model)
- Background tasks: service sync (12h), order status poll (60s)

#### Bulk Invite System
- Celery-backed execution loop for bulk inviting Telegram users to groups/channels
- **Multi-account rotation** via `account_ids` JSONB array
- Handles task status tracking (`InviteJob`) and individual invite status logging (`InviteLog`)
- WebSocket channel: `/ws/invite/{job_id}` for real-time progress

#### Stats System
- Background daily refresh of dialog statistics (contacts, groups, channels) per account
- `stats_service.py` calls `get_dialog_stats()` and writes results to `TelegramAccount` model
- 60-second inter-account delay to avoid Telegram flood limits
- Frontend hook: `use-account-stats.ts`

#### Database Encryption
- Telegram session strings and 2FA passwords stored encrypted (Fernet, `cryptography` library)
- `ENCRYPTION_KEY` in env — startup guard rejects insecure defaults (raises `RuntimeError`)
- `APP_SECRET_KEY` used for HMAC-signed photo URLs and other operations — also guarded at startup
- Always use `app.utils.encryption.encrypt()`/`decrypt()` for any new Telegram-sensitive fields

### API Endpoints

| Prefix | Purpose |
|--------|---------|
| `POST /api/v1/auth/*` | Register, login, token refresh, change password |
| `GET/POST /api/v1/accounts/*` | Telegram account management (supports page/search/status filters) |
| `POST /api/v1/accounts/add/session` | Add account via session string (supports Telethon, GramJS, Pyrogram) |
| `PUT /api/v1/accounts/{id}/profile` | Update Telegram profile (name, username, bio) |
| `POST /api/v1/accounts/{id}/photo` | Upload profile photo |
| `GET /api/v1/accounts/{id}/photo` | View profile photo (signed URL) |
| `GET/PUT /api/v1/accounts/{id}/privacy` | Privacy visibility settings |
| `GET/POST /api/v1/accounts/{id}/2fa` | Two-factor authentication |
| `GET/DELETE /api/v1/accounts/{id}/devices` | Device session management |
| `GET /api/v1/accounts/{id}/chats` | Chat list (paginated) |
| `GET/POST /api/v1/accounts/{id}/folders` | Chat folder management |
| `POST /api/v1/accounts/{id}/appeal` | Submit spam appeal using AI generated reasons |
| `POST /api/v1/accounts/{id}/spam-check` | Check spam status via SpamBot |
| `CRUD /api/v1/account-folders/*` | Folder groupings for Telegram accounts |
| `CRUD /api/v1/group-lists` | Broadcast group lists |
| `POST /api/v1/group-lists/bulk` | Bulk import group targets |
| `CRUD /api/v1/text-lists` | Broadcast text templates |
| `POST /api/v1/broadcast/*` | Start, pause, resume, cancel, or retry broadcast jobs |
| `GET /api/v1/broadcast/*/logs` | View & export delivery logs |
| `POST /api/v1/invite/start` | Start bulk invitation jobs |
| `GET /api/v1/invite/*/logs` | View bulk invitation logs |
| `CRUD /api/v1/orders/*` | SMM services order management |
| `POST /api/v1/redeem` | Redeem voucher codes |
| `GET /api/v1/marketplace/*` | SMM services and user pricing |
| `GET/POST /api/v1/contacts/*` | Telegram contacts sync/retrieval |
| `GET/POST /api/v1/admin/*` | Admin panel management (users, logs, stats) |
| `CRUD /api/v1/admin/smm/*` | Admin SMM service management |
| `CRUD /api/v1/admin/account-prices/*` | Admin Telegram ID prefix pricing |
| `GET /api/v1/system/status` | UptimeRobot-based service status |
| `GET /api/v1/health` | Health check |
| `WS /ws/broadcast/{job_id}` | Real-time broadcast progress |
| `WS /ws/chats/{account_id}` | Real-time chat updates |
| `WS /ws/invite/{job_id}` | Real-time invite progress |

## Commands

### Docker (production-like)

```bash
docker-compose up -d          # Start all services (postgres, redis, backend, celery-worker, frontend)
docker-compose down           # Stop all services
docker-compose logs -f        # Follow logs
```

### Backend (development)

```bash
cd backend
pip install -r requirements.txt                    # Install dependencies
uvicorn app.main:app --reload --port 8000           # Run API server
celery -A app.workers.celery_app worker --loglevel=info  # Run Celery worker
```

### Frontend (development)

```bash
cd frontend
npm install                  # Install dependencies
npm run dev                  # Next.js dev server (port 3000)
npm run build                # Production build
npm run start                # Start production server
npm run lint                 # ESLint
```

### Environment Setup

```bash
cp backend/.env.example backend/.env   # Configure backend env
# Edit backend/.env with Telegram API credentials from my.telegram.org
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Copy output to ENCRYPTION_KEY in .env
```

Key env vars:
- **Core:** `APP_SECRET_KEY`, `ENCRYPTION_KEY`, `DATABASE_URL` (async), `DATABASE_URL_SYNC` (for Alembic + Better Auth), `REDIS_URL`, `CELERY_BROKER_URL`, `CORS_ORIGINS`, `DEBUG`, `PRODUCTION`
- **Telegram:** `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_BOT_TOKEN`
- **AI:** `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`
- **SMM:** `SMM_API_URL`, `SMM_API_KEY`, `SMM_SECRET_KEY`
- **Monitoring:** `UPTIMEROBOT_API_KEY`, `UPTIMEROBOT_MONITOR_IDS`
- **2Captcha:** `TWOCAPTCHA_API_KEY`
- **Broadcast:** `BROADCAST_DEFAULT_DELAY`, `BROADCAST_MAX_CONCURRENT`, `BROADCAST_FLOOD_WAIT_MULTIPLIER`, `BROADCAST_LOG_DEFAULT_DEST`
- **Rate limits:** `RATE_LIMIT_DEFAULT_MAX`, `RATE_LIMIT_2FA_MAX`, `RATE_LIMIT_PHOTO_MAX`, `RATE_LIMIT_WS_MAX`
- **Auth:** `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`

### Database Migrations

Tables are auto-created on startup via `Base.metadata.create_all`. Idempotent schema migrations run via `_run_migrations()` in `main.py`. Alembic is configured in `backend/alembic/` for production migrations. Alembic uses `DATABASE_URL_SYNC` (sync driver, set separately from the async `DATABASE_URL`):

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Health Check

```bash
curl http://localhost:8000/api/v1/health
```

### Testing

*Note: Automated tests are not currently configured. When adding them, use `pytest-asyncio` for the backend and `vitest` for the frontend.*

## Key Patterns & Conventions

- **Async everywhere**: Backend uses async/await throughout (FastAPI + SQLAlchemy async + Telethon async). Never add sync database access or sync Telethon calls. Celery tasks bridge this by calling `asyncio.run()`.
- **Service layer isolation**: API endpoints are thin; business logic lives in `app/services/`
- **No circular imports**: Backend is sensitive to circular imports between services and API modules. Use deferred imports (`from app.workers.broadcast_worker import run_broadcast_job` inside the function body) when crossing layers that may cause cycles.
- **Singleton managers**: `client_pool` (TelegramClientPool), `session_manager` (SessionManager), `event_relay` (TelegramEventRelay), `flood_controller` (FloodController), `rate_limiter` (InMemoryRateLimiter), `uptimerobot_service` (UptimeRobotService), `redis_client` (aioredis) — all module-level singletons
- **Frontend state**: Zustand for auth/app state; React Query hooks for server data; native WebSocket client for real-time
- **Pydantic v2**: All schemas use `model_config = {"from_attributes": True}` for ORM mode
- **Encryption**: Fernet symmetric encryption for Telegram session strings stored in DB
- **Error classification**: Telegram RPC errors classified into consistent types: `flood`, `banned`, `admin_only`, `slowmode`, `invalid_username`, `invalid_link`, `not_member`, `flood_join`, `private_channel`
- **PostgreSQL UUID columns**: SQLAlchemy models use `UUID(as_uuid=True)` with `default=uuid.uuid4`. Always pass UUID objects, not strings, for foreign keys at the ORM level.
- **Celery + async bridge**: Celery tasks run sync functions. The broadcast worker uses `asyncio.run()`; within the async function, create a fresh DB session — don't reuse one from the request scope.
- **CORS**: Backend allows origins from `CORS_ORIGINS` env var (default `["http://localhost:3000"]`). Frontend rewrites `/api/*` and `/ws/*` to the backend via `next.config.js`.
- **Frontend WS URL**: Auto-detected from `window.location` (localhost → port 8000, production → same host). Override with `NEXT_PUBLIC_WS_URL`. The WebSocket client connects directly to the backend, not through the Next.js rewrite.
- **Encryption key rotation**: Changing `ENCRYPTION_KEY` will break existing session strings. `get_settings()` enforces non-default keys at startup.
- **i18n**: Two locales (en, id) in `frontend/src/lib/i18n/` using a Zustand store. Use the `useT()` hook for translations.
- **Error classification file**: `backend/app/utils/telegram_errors.py` — extend this when adding new error types.
- **Multi-account JSONB**: Both `BroadcastJob` and `InviteJob` use `account_ids` (JSONB array) for multi-account rotation. Each log record tracks `account_id_used`.
- **Device spoofing**: All Telethon clients connect with randomized iOS device fingerprints via `app/utils/device_spoof.py`.
- **Middleware stack**: `RealIPMiddleware` → `SecurityHeadersMiddleware` → `TrustedHostMiddleware` (implied) → `CORSMiddleware`. Security headers include CSP, HSTS (long max-age in prod), X-Frame-Options: DENY.
- **Role-based access**: `require_role()` dependency in `app/dependencies.py` enforces role checks. Roles: `basic` (default), `operator`, `admin`, `owner`.
- **BigInteger for money**: All monetary/count columns use `BigInteger` to handle large SMM prices.

## Design Context

This project has a formal visual design system defined in two files at the project root:

- **`PRODUCT.md`** — Strategic: register (product), users, brand personality, anti-references, design principles.
- **`DESIGN.md`** — Visual: color palette (dark-primary identity, Tool Blue accent), typography (Inter single-family), components, elevation philosophy, Do's and Don'ts.

Refer to these before any UI work. The companion `.impeccable/design.json` sidecar carries tonal ramps and component HTML/CSS snippets for the live variant panel.

Key identity signals: dark-mode first, flat/tonal layering (no shadows at rest), surgical blue accent ≤15%, neutral surfaces are truly neutral (no warm tint), Inter for all text — hierarchy expressed through weight/size alone.
