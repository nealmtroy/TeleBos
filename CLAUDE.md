# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeleBos is a multi-account Telegram manager web app. It lets users add unlimited Telegram accounts via OTP or session string upload, manage profiles/privacy, view chats in real time, manage chat folders, and broadcast messages to groups/channels with configurable delays and looping.

**Companion guides:** Read `PRD.md` for detailed product requirements and feature specifications. Read `AGENTS.md` for agent-specific operational guidance (patterns for adding endpoints, modifying the broadcast system, working with Telethon clients, common gotchas). Read `SECURITY.md` for the threat model and security controls.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS 3, shadcn/ui, React Query, Zustand, Recharts |
| Backend | FastAPI (Python 3.12), Telethon, SQLAlchemy 2.0 (async), Groq Cloud API (Llama 3.1) |
| Workers | Celery (Redis broker) |
| Database | PostgreSQL 16 (async via asyncpg) |
| Cache/Queue | Redis 7 |
| Real-time | Native WebSocket (FastAPI, no Socket.IO) |

## Architecture

### Backend (`backend/`)

Layered architecture following FastAPI conventions:

- **`app/api/`** — Route handlers (thin controllers that validate via Pydantic, delegate to services)
- **`app/services/`** — Business logic layer (account_service, auth_service, broadcast_service, chat_service, device_service, settings_service, telegram_client, session_manager, event_relay, appeal_service, invite_service, smm_service, admin_smm_service, redeem_service, order_service, contact_service, profile_sync_service, user_account_price_service)
- **`app/models/`** — SQLAlchemy ORM models (User, TelegramAccount, BroadcastJob, BroadcastLog, GroupList, TextList, ChatFolder, AutoReplyLog, InviteJob, InviteLog, Order, RedeemCode, RedeemLog, SmmService, SmmSetting, TelegramChat, UserAccountPrice, AccountFolder, AccountFolderMember)
- **`app/schemas/`** — Pydantic v2 request/response schemas
- **`app/workers/`** — Celery task definitions (broadcast_worker runs broadcast jobs asynchronously)
- **`app/utils/`** — Encryption (Fernet), rate limiter, flood control, Telegram error classification, session converter
- **`app/main.py`** — FastAPI app creation, lifespan (DB migrations, auto-reconnect accounts, pending logins background cleanup), CORS, router registration
- **`app/database.py`** — Async SQLAlchemy engine + session factory
- **`app/dependencies.py`** — JWT auth dependency (`get_current_user`)
- **`app/config.py`** — Pydantic Settings (env-based config, including Groq keys rotation)

### Frontend (`frontend/`)

- **`src/app/`** — Next.js App Router pages (login, register, forgot-password, reset-password, dashboard, accounts, chats, broadcast, auto-reply, invite, orders, redeem, subscriptions, settings, admin)
- **`src/components/`** — shadcn/ui primitives (button, card, badge, avatar, skeleton, toast) + custom components (account-card, broadcast-progress, sidebar, navbar, account-switcher, language-switcher)
- **`src/hooks/`** — React Query hooks (use-accounts, use-chats, use-broadcast, use-auth) + WebSocket hooks (use-socket)
- **`src/lib/`** — Axios client with JWT interceptor (api.ts), native WebSocket client (socket.ts), utilities, i18n (en.ts, id.ts)
- **`src/store/`** — Zustand stores (auth-store: user session; app-store: UI state)

### Key Data Flow

#### Authentication
1. User registers/logs in via Better Auth endpoints on frontend Next.js (e.g. `/api/auth/*`) → session token created
2. Frontend stores/reads token via cookies, Axios interceptor injects `x-better-auth-token` header
3. FastAPI backend validates the token by querying PostgreSQL `session` table directly
4. Expiration is verified against the database session's `expiresAt` timestamp

#### Telegram Account Login (OTP flow)
1. `POST /send-code` creates an unauth Telethon client, sends OTP, and stores it in the in-memory map `_pending_logins` (user_id -> phone -> (client, created_at)) in `backend/app/api/accounts.py`. Expired flows (older than 5 minutes) are disconnected and cleaned up by `clean_pending_logins_task` to prevent memory leaks.
2. `POST /verify-code` signs in with OTP (and optional 2FA), saves encrypted session string to DB
3. After verification, `event_relay.attach()` registers Telethon event handlers for real-time updates
4. On server startup, `session_manager.reconnect_all()` reconnects all active accounts

#### Broadcast System
1. User creates Group Lists (target groups/channels) and Text Lists (message templates)
2. `POST /broadcast/start` creates a `BroadcastJob` record and pushes a Celery task
3. Celery worker bridges to async via `asyncio.run()` — connects via Telethon, iterates groups, sends messages
4. Per-group progress pushed to WebSocket (`/ws/broadcast/{job_id}`) in real time
5. Flood control (`FloodController`) auto-adjusts delays when Telegram rate-limits are hit (1.5× multiplier, max 5 min pause)
6. Looping mode re-runs broadcasts on a cycle with configurable `delay_after_all`

**Job state machine:** `pending` → `running` ↔ `paused` → `cancelled` / `completed` / `failed`
- Only terminal-status jobs can be deleted or retried
- Looping jobs never auto-complete; they stay `running` until cancelled
- `db.refresh(job)` is called each iteration to pick up pause/cancel commands

#### Real-Time Event Relay
- `TelegramEventRelay` attaches Telethon event handlers per account on startup/login
- Events (new messages, edits, reads, typing, chat actions) pushed via WebSocket `ConnectionManager`
- Each account has its own WebSocket channel: `/ws/chats/{account_id}`
- Frontend `useChatSocket` / `useBroadcastSocket` hooks subscribe to these channels
- ConnectionManager is in `backend/app/api/ws.py`

#### Auto-Reply System
- Per-account and global auto-reply settings stored in `TelegramAccount` model fields
- `AutoReplyLog` model tracks which users have been replied to (dedup)
- `settings_service.py` handles read/write of auto-reply configuration
- Frontend UI at `frontend/src/app/(dashboard)/auto-reply/page.tsx`

#### Spam Appeal System
- Integrated Groq API using rotated API keys (`GROQ_API_KEY_1`/`2`/`3`) to generate reasons with Llama 3.1
- Supports custom appeal reason writing or pre-configured "AI-Generated" default presets
- Frontend handles status check (e.g. "limited" accounts) and appeals via dialog box at `frontend/src/components/accounts/spam-appeal-dialog.tsx`

#### SMM & Marketplace System
- Multi-tier pricing structure for SMM services and buying/selling accounts
- Order logging and verification (`Order`, `RedeemCode`, `RedeemLog` models)
- Admin interface for adding services, modifying price structures, and viewing redemption logs

#### Bulk Invite System
- Celery-backed execution loop for bulk inviting Telegram users to groups/channels
- Handles task status tracking (`InviteJob`) and individual invite status logging (`InviteLog`)

#### Database Encryption
- Telegram session strings and 2FA passwords stored encrypted (Fernet, `cryptography` library)
- `ENCRYPTION_KEY` in env — auto-generates a new one if invalid/missing (logs a warning; will corrupt existing encrypted data)
- Always use `app.utils.encryption.encrypt()`/`decrypt()` for any new Telegram-sensitive fields

### API Endpoints

| Prefix | Purpose |
|--------|---------|
| `POST /api/v1/auth/*` | Register, login, token refresh, change password |
| `GET/POST /api/v1/accounts/*` | Telegram account management (supports page/search/status filters) |
| `PUT /api/v1/accounts/{id}/profile` | Update Telegram profile (name, username, bio) |
| `POST /api/v1/accounts/{id}/photo` | Upload profile photo |
| `GET/PUT /api/v1/accounts/{id}/privacy` | Privacy visibility settings |
| `GET/POST /api/v1/accounts/{id}/2fa` | Two-factor authentication |
| `GET/DELETE /api/v1/accounts/{id}/devices` | Device session management |
| `GET /api/v1/accounts/{id}/chats` | Chat list (paginated) |
| `GET/POST /api/v1/accounts/{id}/folders` | Chat folder management |
| `CRUD /api/v1/account-folders/*` | Folder groupings for Telegram accounts |
| `POST /api/v1/accounts/{id}/appeal` | Submit spam appeal using AI generated reasons |
| `CRUD /api/v1/group-lists` | Broadcast group lists |
| `CRUD /api/v1/text-lists` | Broadcast text templates |
| `POST /api/v1/broadcast/*` | Start, pause, resume, cancel, or retry broadcast jobs |
| `GET /api/v1/broadcast/*/logs` | View & export delivery logs |
| `POST /api/v1/invite/start` | Start bulk invitation jobs |
| `GET /api/v1/invite/*/logs` | View bulk invitation logs |
| `CRUD /api/v1/orders/*` | SMM services order management |
| `POST /api/v1/redeem` | Redeem voucher codes |
| `GET /api/v1/marketplace/*` | SMM services and user pricing |
| `GET/POST /api/v1/contacts/*` | Telegram contacts sync/retrieval |
| `GET/POST /api/v1/admin/*` | Admin panel management (SMM, prices, logs) |
| `WS /ws/broadcast/{job_id}` | Real-time broadcast progress |
| `WS /ws/chats/{account_id}` | Real-time chat updates |

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

Key env vars: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, `DATABASE_URL` (async), `DATABASE_URL_SYNC` (for Alembic), `REDIS_URL`, `CELERY_BROKER_URL`, `CORS_ORIGINS`, `DEBUG`.

### Database Migrations

Tables are auto-created on startup via `Base.metadata.create_all`. Alembic is configured in `backend/alembic/` for production migrations. Alembic uses `DATABASE_URL_SYNC` (sync driver, set separately from the async `DATABASE_URL`):

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Health Check

### Testing

*Note: Automated tests are not currently configured. When adding them, use `pytest-asyncio` for the backend and `vitest` for the frontend.*

```bash
curl http://localhost:8000/api/v1/health
```

## Key Patterns & Conventions

- **Async everywhere**: Backend uses async/await throughout (FastAPI + SQLAlchemy async + Telethon async). Never add sync database access or sync Telethon calls. Celery tasks bridge this by calling `asyncio.run()`.
- **Service layer isolation**: API endpoints are thin; business logic lives in `app/services/`
- **No circular imports**: Backend is sensitive to circular imports between services and API modules. Use deferred imports (`from app.workers.broadcast_worker import run_broadcast_job` inside the function body) when crossing layers that may cause cycles.
- **Singleton managers**: `client_pool` (TelegramClientPool), `session_manager` (SessionManager), `event_relay` (TelegramEventRelay), `flood_controller` (FloodController), `rate_limiter` (InMemoryRateLimiter) — all module-level singletons
- **Frontend state**: Zustand for auth/app state; React Query hooks for server data; native WebSocket client for real-time
- **Pydantic v2**: All schemas use `model_config = {"from_attributes": True}` for ORM mode
- **Encryption**: Fernet symmetric encryption for Telegram session strings stored in DB
- **Error classification**: Telegram RPC errors classified into consistent types: `flood`, `banned`, `admin_only`, `slowmode`, `invalid_username`, `invalid_link`, `not_member`, `flood_join`, `private_channel`
- **PostgreSQL UUID columns**: SQLAlchemy models use `UUID(as_uuid=True)` with `default=uuid.uuid4`. Always pass UUID objects, not strings, for foreign keys at the ORM level.
- **Celery + async bridge**: Celery tasks run sync functions. The broadcast worker uses `asyncio.run()`; within the async function, create a fresh DB session — don't reuse one from the request scope.
- **CORS**: Backend allows origins from `CORS_ORIGINS` env var (default `["http://localhost:3000"]`). Frontend rewrites `/api/*` and `/ws/*` to the backend via `next.config.js`.
- **Frontend WS URL**: Set `NEXT_PUBLIC_WS_URL` (default `ws://localhost:8000`). The WebSocket client connects directly to the backend, not through the Next.js rewrite.
- **Encryption key rotation**: Changing `ENCRYPTION_KEY` will break existing session strings. Keys are auto-generated if invalid, which would corrupt data. Always back up the key.
- **i18n**: Two locales (en, id) in `frontend/src/lib/i18n/` using a Zustand store. Use the `useT()` hook for translations.
- **Error classification file**: `backend/app/utils/telegram_errors.py` — extend this when adding new error types.

## Design Context

This project has a formal visual design system defined in two files at the project root:

- **`PRODUCT.md`** — Strategic: register (product), users, brand personality, anti-references, design principles.
- **`DESIGN.md`** — Visual: color palette (dark-primary identity, Tool Blue accent), typography (Inter single-family), components, elevation philosophy, Do's and Don'ts.

Refer to these before any UI work. The companion `.impeccable/design.json` sidecar carries tonal ramps and component HTML/CSS snippets for the live variant panel.

Key identity signals: dark-mode first, flat/tonal layering (no shadows at rest), surgical blue accent ≤15%, neutral surfaces are truly neutral (no warm tint), Inter for all text — hierarchy expressed through weight/size alone.
