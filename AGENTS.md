# AGENTS.md

Guidance for AI coding agents (Claude Code, etc.) working on TeleBos.

This file complements `CLAUDE.md` — read that first for project architecture and commands, then use this for agent-specific operational guidance.

## Agent Principles

1. **Read before you write** — Understand existing patterns before adding new code. This project follows strong conventions (async service layer, Pydantic schemas, Zustand stores, React Query hooks). Match them.

2. **No circular imports** — The backend is sensitive to circular imports between services and API modules. Use deferred imports (`from app.workers.broadcast_worker import run_broadcast_job` inside the function body) when crossing layers that may cause cycles.

3. **Async consistency** — The backend is fully async. Never add sync database access or sync Telethon calls. Celery tasks bridge this by calling `asyncio.run()`.

4. **Encryption is mandatory** — Any new field storing Telegram-sensitive data (session strings, auth tokens, passwords) must use `app.utils.encryption.encrypt()`/`decrypt()`. Do not store raw session strings.

## Agent Workflows

### Adding a new API endpoint

1. Define the Pydantic schema in `backend/app/schemas/` (request/response models with `model_config = {"from_attributes": True}` for ORM responses)
2. Add or extend the SQLAlchemy model in `backend/app/models/` if needed
3. Write business logic in `backend/app/services/` — keep API routes thin
4. Add the route handler in `backend/app/api/` — validate via Depends on schemas, delegate to service
5. Register the router in `backend/app/main.py`
6. Add the corresponding React Query hook in `frontend/src/hooks/`
7. Wire it into a page component

### Adding a new frontend page

1. Create the page file under `frontend/src/app/` following the existing naming pattern
   - Auth pages: `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx`
   - Dashboard pages: `frontend/src/app/(dashboard)/<section>/page.tsx`
   - Dynamic routes: `frontend/src/app/(dashboard)/<section>/[id]/page.tsx`
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
- `GET /api/v1/accounts/{id}/photo` — view/download
- `DELETE /api/v1/accounts/{id}/photo` — delete

Frontend hooks are in `frontend/src/hooks/use-accounts.ts` (`useAccountPhoto`, `useDeleteAccountPhoto`). The account detail page at `frontend/src/app/(dashboard)/accounts/[id]/page.tsx` shows the photo with upload/delete actions.

### Modifying the broadcast system

The broadcast system is the most complex subsystem in this project. Key files:

- `backend/app/services/broadcast_service.py` — core execution loop (pause/resume/stop, looping, flood control)
- `backend/app/workers/broadcast_worker.py` — Celery task entry point (bridges async)
- `backend/app/api/broadcast.py` — REST + WebSocket endpoints
- `backend/app/utils/flood_control.py` — adaptive delay on rate limits
- `backend/app/utils/telegram_errors.py` — error classification (9 error types)
- `backend/app/models/broadcast_job.py` — job state machine
- `backend/app/api/ws.py` — WebSocket ConnectionManager

**Job state machine:** `pending` → `running` ↔ `paused` → `cancelled` / `completed` / `failed`
- Only terminal status jobs can be deleted or retried
- Looping jobs never auto-complete; they stay `running` until cancelled

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

### Working with Telethon clients

- `TelegramClientPool` (`backend/app/services/telegram_client.py`) manages an in-memory dict of connected clients
- Session strings are decrypted from the DB before use
- After creating or verifying an account, always call `event_relay.attach()` to register event handlers
- The `SessionManager` health check runs every 30 seconds — don't duplicate this
- To convert session strings from other formats (GramJS, Pyrogram, raw), use `backend/app/utils/session_converter.py`

### Debugging real-time events

- WebSocket events are pushed via `ConnectionManager` in `backend/app/api/ws.py`
- Each account gets a `chats:{account_id}` channel; each broadcast job gets a `broadcast:{job_id}` channel
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

## Testing & Validation

This project does not currently have automated tests. When adding tests:

- **Backend**: Use `pytest` with `pytest-asyncio` for async tests. Mock Telethon clients with `unittest.mock` or a dedicated mock pool.
- **Frontend**: Use `vitest` or `jest` with `@testing-library/react`. Mock API calls via MSW or by mocking the axios client.
- **Manual verification**: Start the full stack with Docker Compose and test via the UI at `localhost:3000`.

## Common Gotchas

- **PostgreSQL UUID columns** — SQLAlchemy models use `UUID(as_uuid=True)` with `default=uuid.uuid4`. Always pass UUID objects, not strings, for foreign keys at the ORM level.
- **Celery + async** — Celery tasks run sync functions. The broadcast worker bridges this with `asyncio.run()`. Within the async function, create a fresh DB session — don't reuse one from the request scope.
- **CORS** — Backend allows origins from `CORS_ORIGINS` env var (default `["http://localhost:3000"]`). Frontend rewrites `/api/*` and `/ws/*` to the backend via Next.js rewrites in `next.config.js`.
- **Frontend WS URL** — Set `NEXT_PUBLIC_WS_URL` (default `ws://localhost:8000`). The WebSocket client connects directly to the backend, not through the Next.js rewrite.
- **Encryption key rotation** — Changing `ENCRYPTION_KEY` will break existing session strings. Keys are auto-generated if invalid, which would corrupt data. Always back up the key.
- **Datetime freshness** — Python `datetime.now()` calls across different services (backend, Celery worker) may skew if system time isn't synced. Consider using `datetime.utcnow()` consistently.
- **OTP flow memory** — `_pending_logins` dict in `account_service.py` has no TTL — abandoned OTP flows leak memory.

## Security Considerations

- JWT tokens expire (access: 60 min, refresh: 7 days). Token refresh is automatic via Axios interceptor.
- Fernet encryption keys must be kept secret and backed up. Loss = all Telegram sessions invalidated.
- Session strings grant full Telegram access — treat them like passwords.
- User passwords are bcrypt-hashed (72-byte truncation applied internally).
- The `is_active` flag on both User and TelegramAccount models controls access across the app.
- WebSocket endpoints (`/ws/broadcast/{job_id}`, `/ws/chats/{account_id}`) currently have no JWT verification — channel IDs are UUIDs as mitigation.
- The `User.role` field (default `"operator"`) is stored but not enforced in route guards.
