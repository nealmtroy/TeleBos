# CLAUDE.md

## TeleBos

TeleBos is a multi-account Telegram management application. It supports Telegram account onboarding, real-time chats, broadcasts, bulk invites, profile/privacy controls, auto-replies, spam appeals, account marketplace transactions, SMM orders, vouchers, and subscriptions.

## Documentation map

Use one detailed owner per topic; do not copy long specifications between documents.

| When working on… | Read… |
| --- | --- |
| Product behavior, roles, state machines, acceptance criteria | `PRD.md` |
| Authentication, secrets, encryption, authorization, upload, WebSocket, or deployment security | `SECURITY.md` |
| UI/product positioning | `PRODUCT.md` |
| UI components, tokens, accessibility, and visual decisions | `DESIGN.md` and `.impeccable/design.json` |
| Cross-agent compatibility | `AGENTS.md` |
| Full request/response API contract | `/api/docs` and `/api/openapi.json` on a running backend |
| Targeted security assessment | `docs/security/strix-assessment-instructions.md` |

## Stack and architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, React Query, Zustand |
| Backend | FastAPI, Python 3.12, async SQLAlchemy, Telethon |
| Workers | Celery with Redis |
| Storage | PostgreSQL 16 via asyncpg |
| Authentication | Better Auth backed by PostgreSQL sessions |
| Real time | Native FastAPI WebSockets |

- `backend/app/api/` holds thin request handlers; validate there and delegate business rules to `backend/app/services/`.
- `backend/app/models/` holds SQLAlchemy models; `backend/app/schemas/` holds Pydantic v2 request/response models.
- `backend/app/workers/` contains Celery task entry points; workers bridge to async with `asyncio.run()` and create their own database sessions.
- `frontend/src/app/` contains routes, `components/` UI, `hooks/` React Query/WebSocket integrations, `lib/` clients/utilities, and `store/` Zustand state.

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
| Broadcast and invite jobs | `/broadcast/*`, `/invite/*` | `api/broadcast.py`, `api/invite.py` |
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
celery -A app.workers.celery_app worker --loglevel=info
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

- **Async boundaries:** never add synchronous database or Telethon access to async application paths. Celery is the only sync-to-async bridge.
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

A knowledge graph exists at `graphify-out/`. For codebase questions, run `graphify query "<question>"` first when `graphify-out/graph.json` exists; use `path`/`explain` for focused navigation. **Do not modify or regenerate `graphify-out/` in this documentation-cleanup task.**
