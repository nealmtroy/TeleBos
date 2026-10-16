# CLAUDE.md

## TeleBos

TeleBos is a multi-account Telegram management application. It supports Telegram account onboarding, real-time chats, broadcasts, bulk invites, profile/privacy controls, auto-replies, spam appeals, account marketplace transactions, SMM orders, vouchers, and subscriptions.

## Documentation map

Use one detailed owner per topic; do not copy long specifications between documents.

| When working on… | Read… |
| --- | --- |
| Product behavior, roles, state machines, acceptance criteria | `PRD.md` |
| How money enters, pricing, margins, entitlements, and verified revenue bugs | `BUSSINESS_LOGIC.md` |
| Authentication, secrets, encryption, authorization, upload, WebSocket, or deployment security | `SECURITY.md` |
| UI/product positioning | `PRODUCT.md` |
| UI components, tokens, accessibility, and visual decisions | `DESIGN.md` and `.impeccable/design.json` |
| Cross-agent compatibility | `AGENTS.md` |
| Full request/response API contract | `/api/docs` and `/api/openapi.json` on a running backend |
| Database schema, tables, constraints, and relationships | `docs/database_schema.md` |

## Stack and architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, React Query, Zustand |
| Backend | FastAPI, Python 3.12, async SQLAlchemy, Telethon |
| Workers | Dedicated Async Worker with Redis Queue & Pub/Sub |
| Storage | PostgreSQL 16 via asyncpg |
| Authentication | Better Auth backed by PostgreSQL sessions |
| Payment Gateway | KlikQRIS Dynamic QRIS with HMAC-SHA256 Webhook Verification |
| External SMM | BuzzerPanel API Integration |
| Real time | Native FastAPI WebSockets with Redis Pub/Sub bridge |

- `backend/app/api/` holds thin request handlers; validate there and delegate business rules to `backend/app/services/`.
- `backend/app/models/` holds SQLAlchemy models; `backend/app/schemas/` holds Pydantic v2 request/response models.
- `backend/app/workers/` contains the dedicated async worker daemon (`async_worker.py`) processing broadcast and invite background jobs independently from the webserver.
- `frontend/src/app/` contains routes, `components/` UI, `hooks/` React Query/WebSocket integrations, `lib/` clients/utilities, and `store/` Zustand state.

### Authentication architecture: Better Auth & Dual User Model

TeleBos utilizes **Better Auth** (TypeScript / Next.js 14) for identity management and session state, replacing legacy custom JWT (`python-jose`):

- **Session transport:** Browser requests pass the session token to the FastAPI backend via the `x-better-auth-token` HTTP header (injected by client fetch interceptors) or the `better-auth.session_token` / `__Secure-better-auth.session_token` cookie.
- **Token hashing at rest:** Session tokens in the `session` table are hashed via SHA-256 (`token_hash`). The backend dependency `get_current_user` (`dependencies.py`) hashes incoming tokens before querying `session`, preventing token exposure from database read leaks.
- **Dual User Model Architecture:**
  - **`"user"` (Better Auth):** Owned by Better Auth; uses `TEXT` ID and camelCase columns (`"emailVerified"`, `"banReason"`, `"banned"`). Manages email verification, password credentials in `"account"`, and Google OAuth.
  - **`users` (SQLAlchemy / FastAPI):** Owned by the core application; uses `UUID` ID and snake_case columns (`balance`, `is_active`, `role`, `ban_reason`, `ban_expires`). All domain tables (`telegram_accounts`, `orders`, `wallet_ledgers`) link foreign keys to `users.id`.
- **Bidirectional synchronization:**
  - **Signup/Creation:** `auth.ts` `user.create.before` validates email uniqueness across both `"user"` and `users`. The `after` hook automatically inserts a corresponding row into `users` (`ON CONFLICT (id) DO NOTHING`) with default `freetrial` role and 5-hour trial expiry.
  - **Profile updates:** `auth.ts` `user.update.after` propagates name changes from `"user".name` to `users.full_name`.
  - **Session resolution:** FastAPI resolves `session."userId"` directly to `users.id` by UUID casting (`UUID(row.user_id)`), eliminating duplicate-email account takeover vulnerabilities.
  - **Account suspension/unban:** `dependencies.py` helper `restore_user_if_ban_expired` synchronizes active status, ban reason, and expiry across both `"user"` and `users` atomically.

### External payment gateway: KlikQRIS

TeleBos integrates **KlikQRIS** (`https://klikqris.com/api`) for automated, real-time user balance top-up:

- **Client service:** `backend/app/services/klikqris_service.py` provides `create_qris_transaction()`, `check_qris_status()`, and `verify_signature()`.
- **Transaction model:** Stored in `wallet_transactions` table with status progression (`pending` -> `approved` or `rejected`).
- **Webhook contract:** `POST /api/v1/wallet/webhook/klikqris` processes asynchronous callback payloads:
  - **Signature verification:** Validates incoming payload `signature` against stored `tx.signature` via constant-time HMAC check (`verify_signature`).
  - **Idempotency:** Rejects redundant mutations cleanly if status is no longer `pending`.
  - **Atomic fulfillment:** Calls `fulfill_wallet_transaction()`, crediting user balance and generating an immutable credit record in `wallet_ledgers`.
  - **Fail-safe retry:** Throws HTTP 500 on internal database inconsistency so KlikQRIS automatically retries unfulfilled valid payments.
- **Environment variables:**
  - `KLIKQRIS_API_KEY`: API key passed in `x-api-key` header.
  - `KLIKQRIS_ID_MERCHANT`: Merchant identifier passed in `id_merchant` header.
  - `KLIKQRIS_BASE_URL`: Base API endpoint (default: `https://klikqris.com/api`).
  - `KLIKQRIS_CALLBACK_URL`: Webhook URL passed during invoice creation.
  - `KLIKQRIS_ALLOWED_IPS`: Comma-separated IP whitelist for webhook sender verification.

## API capability inventory

All API routes use `/api/v1`; use `/api/docs` for exact schemas, methods, parameters, and response codes.

| Capability | Representative paths | Source ownership |
| --- | --- | --- |
| Accounts, folders, profile, privacy, devices, 2FA | `/accounts/*`, `/account-folders/*` | `api/accounts.py`, `api/account_folders.py` |
| Core chat/messages and search | `/accounts/{account_id}/chats/{chat_id}/messages`, `/chats/search` | `api/messages.py`, `services/message_service.py` |
| Scheduling, edits, and deletion | `/messages/scheduled`, `/messages/{msg_id}`, `/messages/batch-delete` | `api/messages.py` |
| Attachments and shared media | `/media`, `/voice`, `/messages/{message_id}/media`, `/video/stream`, `/shared-media` | `api/media.py` |
| Forwarding | `/messages/forward` | `api/forward.py`, `services/forward_service.py` |
| Reactions and pins | `/messages/{msg_id}/reaction`, `/messages/{msg_id}/pin`, `/pinned` | `api/reactions.py`, `api/pins.py` |
| Polls and votes | `/polls`, `/messages/{message_id}/votes` | `api/polls.py` |
| Stickers and GIFs | `/stickers/*`, `/gifs/*`, `/chats/{chat_id}/stickers`, `/chats/{chat_id}/gifs` | `api/stickers.py`, `api/gifs.py` |
| Broadcast, invite, and auto-join jobs | `/broadcast/*`, `/invite/*`, `/auto-join/*` | `api/broadcast.py`, `api/invite.py`, `api/auto_join.py` |
| Wallet, KlikQRIS, withdraw, bank accounts | `/wallet/topup`, `/wallet/withdraw`, `/wallet/webhook/klikqris`, `/wallet/transactions/*`, `/wallet/bank-accounts/*` | `api/wallet/*`, `services/klikqris_service.py`, `services/ledger_service.py` |
| Marketplace, SMM, orders, redeem, administration | `/marketplace/*`, `/orders/*`, `/redeem`, `/admin/*` | corresponding API/service modules |

Except for the intentionally public chat-photo endpoint, account-scoped chat/message operations validate ownership before calling the Telethon-backed service. Download routes may use the documented alternate token/header authentication path.

## Commands

### Docker

```bash
docker-compose up -d
docker-compose down
docker-compose logs -f
```

### Backend

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
python -m app.workers.async_worker
python -m pytest
ruff check app tests
ruff format --check tests
```

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run format:check
```

### Database and health

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
curl http://localhost:8000/api/v1/health
```

## Engineering invariants

- **Async boundaries:** never add synchronous database or Telethon access to async application paths. All background workers run natively on asyncio.
- **Layering:** keep API controllers thin; put business behavior in services. Avoid circular imports; deferred imports are acceptable when crossing sensitive layers.
- **Encryption:** use `app.utils.encryption.encrypt()`/`decrypt()` for new Telegram-sensitive values. Never store session strings or 2FA passwords in plaintext.
- **Security:** read `SECURITY.md` before changing authentication, roles, keys, uploads, token formats, WebSockets, or deployment behavior.
- **Database:** ORM foreign keys use UUID objects, not strings. Use `BigInteger` for money/counts that can exceed 32-bit limits. Keep schema changes in a migration path.
- **Frontend state:** use React Query for server state, Zustand for client state, and the existing native socket client for real-time events.
- **i18n:** add every user-facing key to `frontend/src/lib/i18n/types.ts`, `en.ts`, and `id.ts`; use `useT()` in client components.
- **Tests:** backend tests must mock infrastructure; frontend tests must reset singleton Zustand/localStorage state and mock API boundaries. See the documented quality commands above.

## Common change workflows

### Add an API capability

1. Define or extend Pydantic schemas in `backend/app/schemas/`.
2. Update models only when persistence changes are necessary; expose new models through `models/__init__.py` when required.
3. Implement business rules in `backend/app/services/`.
4. Add a thin handler in `backend/app/api/` and register its router in `backend/app/main.py`.
5. Add/extend the frontend React Query hook, page/component, translations, tests, and API documentation where appropriate.

### Add a frontend page

1. Follow App Router placement under `frontend/src/app/` (`(dashboard)` for dashboard pages, `[id]` for dynamic routes).
2. Reuse shadcn primitives and existing feature components before creating new UI patterns.
3. Add a React Query hook when server data is involved and update `sidebar.tsx` when navigation must expose the page.
4. Read `PRODUCT.md` and `DESIGN.md` before UI work.

## Design and graph rules

For UI changes, read `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` first.

A knowledge graph exists at `graphify-out/`. For codebase questions, run `graphify query "<question>"` first when `graphify-out/graph.json` exists; use `path`/`explain` for focused navigation.
