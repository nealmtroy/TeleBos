# TeleBos — Multi-Account Telegram Manager

Manage multiple Telegram accounts from a single web dashboard.  
Broadcast messages, manage chats, sync folders, and control security settings — all through a responsive Next.js interface with Python FastAPI + Telethon backend.

> **For AI coding agents:** see `CLAUDE.md` (architecture + commands), `AGENTS.md` (operational patterns), and `SECURITY.md` (threat model).

## Features

- **Multi-Account**: Add unlimited Telegram accounts via OTP or session string upload
- **Profile Management**: Edit name, username, bio, profile photo (upload/view/delete)
- **Privacy & Security**: Set visibility rules (phone, photo, status, last seen, forwards, voice messages), enable/disable 2FA, manage recovery email
- **Device Management**: View and terminate active Telegram sessions
- **Chat Viewer (Telegram Web K inspired)**: Standalone immersive 100vh chat interface with independent CSS variable theming, scalable Account Switcher (100-250+ accounts with search & live WS status), strict Telegram sorting (pinned chats locked on top, unpinned sorted by latest message), right-column cover photo zoom animation, username/invite link cards, and shared links extraction.
- **Chat Folders & Groups**: View, sync, create, edit, and delete Telegram folders. Organize Telegram accounts into custom folders.
- **Broadcast System**:
  - Manage group lists (username, invite link, or group ID targets) with bulk import
  - Manage text lists (message template collections)
  - Two broadcast modes: Multi Random and Single Text
  - Configurable delays per group and after all groups
  - Looping mode with configurable cycle delay
  - Real-time progress tracking with pause/resume/stop
- **Auto-Reply**: Per-account and global auto-reply rules with deduplication logging
- **Spam Appeal System**: Appeal spam restrictions on Telegram accounts using AI-generated reasons powered by Groq (rotating key support) or default presets.
- **SMM & Marketplace**: Buy/sell Telegram accounts, manage SMM panel configurations, order logs, and voucher codes.
- **Bulk Invite System**: Bulk invite members to target groups/channels asynchronously using client sessions.
- **Detailed Logging**: Per-group delivery results with error classification (flood, banned, admin-only, slowmode, invalid username, etc.), cycle tracking
- **Export**: Broadcast logs to CSV or JSON
- **Authentication**: Secure web login powered by session tokens (via Better Auth)
- **Session Encryption**: Fernet-encrypted session strings in the database
- **Adaptive Flood Control**: Automatically adjusts delays when Telegram rate limits are hit
- **i18n**: English and Indonesian language support

## Tech Stack

| Layer      | Technology                                  |
|------------|----------------------------------------------|
| Frontend   | Next.js 14, Tailwind CSS 3, shadcn/ui, React Query, Zustand, Recharts |
| Backend    | FastAPI (Python 3.12), Telethon, Celery      |
| Database   | PostgreSQL 16 (async via asyncpg)            |
| Cache/Queue| Redis 7                                      |
| Real-time  | WebSocket (FastAPI native, no Socket.IO)     |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- **Telegram API credentials** from [my.telegram.org](https://my.telegram.org/apps)

### Setup

1. **Clone and configure:**

```bash
cd TeleBos
cp .env.example backend/.env
```

2. **Edit `backend/.env`** with your Telegram API credentials:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_api_hash_here
```

3. **Generate a proper encryption key** (optional but recommended):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output into `ENCRYPTION_KEY` in `.env`.

4. **Start all services:**

```bash
docker-compose up -d
```

5. **Access the app:**

- Frontend: [http://localhost:3000](http://localhost:3000)
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

### Development (without Docker)

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Celery worker** (in a separate terminal):

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**Database:**
Ensure PostgreSQL and Redis are running. Update `DATABASE_URL` (async for the app) and `DATABASE_URL_SYNC` (for Alembic) in `.env` accordingly.

## Project Structure

```
TeleBos/
├── docker-compose.yml        # 5 services: postgres, redis, backend, celery-worker, frontend
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI route handlers (auth, accounts, chats, broadcast, settings, ws, invite, orders, redeem, marketplace, admin, etc.)
│   │   ├── models/           # SQLAlchemy ORM models (user, telegram_account, broadcast_job, broadcast_log, group_list, text_list, chat_folder, auto_reply_log, invite_job, invite_log, order, redeem_code, redeem_log, smm_service, smm_setting, etc.)
│   │   ├── schemas/          # Pydantic v2 request/response schemas
│   │   ├── services/         # Business logic layer (auth, account, broadcast, chat, device, settings, telegram_client, session_manager, event_relay, appeal, invite, smm, redeem, order, contact, etc.)
│   │   ├── workers/          # Celery tasks (broadcast_worker)
│   │   ├── utils/            # Encryption (Fernet), rate limiter, flood control, error classification, session format converter
│   │   ├── main.py           # App entrypoint with lifespan (DB init, reconnect accounts, pending logins task)
│   │   ├── config.py         # Pydantic Settings via environment variables
│   │   └── database.py       # Async SQLAlchemy engine + session factory
│   ├── alembic/              # DB migrations
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── app/              # Next.js App Router pages (login, register, forgot-password, dashboard/*, subscriptions, settings, admin, invite, orders, redeem)
    │   ├── components/       # shadcn/ui primitives + custom (sidebar, navbar, account-card, broadcast-progress)
    │   ├── hooks/            # React Query hooks + WebSocket hooks
    │   ├── lib/              # Axios client, WebSocket client, i18n (en/id), utilities
    │   └── store/            # Zustand (auth-store, app-store)
    ├── package.json
    └── Dockerfile
```

## API Overview

See detailed docs at `/docs` when the backend is running.

| Endpoint                          | Purpose                        |
|-----------------------------------|--------------------------------|
| `GET /api/v1/auth/me`             | Get current user profile (role, balance) |
| `POST /api/v1/auth/change-password` | Change user password |
| `POST /api/v1/accounts/send-code` | Send OTP to phone number       |
| `POST /api/v1/accounts/verify-code` | Verify OTP + optional 2FA     |
| `POST /api/v1/accounts/upload-session` | Upload Telethon/GramJS session string |
| `GET/PUT /api/v1/accounts/{id}/profile` | Get/update Telegram profile  |
| `POST /api/v1/accounts/{id}/photo` | Upload profile photo          |
| `DELETE /api/v1/accounts/{id}/photo` | Delete profile photo          |
| `GET/PUT /api/v1/accounts/{id}/privacy` | Privacy visibility settings |
| `GET/POST /api/v1/accounts/{id}/2fa` | Two-factor authentication    |
| `GET/DELETE /api/v1/accounts/{id}/devices` | Active device sessions     |
| `GET /api/v1/accounts/{id}/chats` | Chat list (paginated)          |
| `GET/POST /api/v1/accounts/{id}/folders` | Chat folder management     |
| `CRUD /api/v1/account-folders/*`  | Folder groupings for Telegram accounts |
| `POST /api/v1/accounts/{id}/appeal` | Submit spam appeal using AI generated reasons |
| `GET/PUT /api/v1/accounts/{id}/auto-reply` | Auto-reply configuration   |
| `CRUD /api/v1/group-lists`        | Broadcast group lists          |
| `CRUD /api/v1/text-lists`         | Broadcast text templates       |
| `POST /api/v1/broadcast/*`        | Start, pause, resume, cancel, or retry broadcast jobs |
| `GET /api/v1/broadcast/*/logs`    | View & export delivery logs    |
| `POST /api/v1/invite/start`       | Start bulk invitation jobs     |
| `GET /api/v1/invite/*/logs`       | View bulk invitation logs      |
| `CRUD /api/v1/orders/*`           | SMM services order management  |
| `POST /api/v1/redeem`             | Redeem voucher codes           |
| `GET /api/v1/marketplace/*`       | SMM services and user pricing  |
| `GET/POST /api/v1/contacts/*`     | Telegram contacts sync/retrieval |
| `GET/POST /api/v1/admin/*`         | Admin panel management (SMM, prices, logs) |
| `WS /ws/broadcast/{job_id}`       | Real-time broadcast progress   |
| `WS /ws/chats/{account_id}`       | Real-time chat updates         |

## Default Broadcast Workflow

1. Go to **Group Lists** → create a list with target groups/channels (supports bulk import)
2. Go to **Text Lists** → create message templates
3. Go to **New Broadcast** → select account, list, mode, delays → Start
4. Monitor real-time progress and pause/resume/stop as needed
5. Go to **Broadcast Logs** → filter and export results per cycle

### Job State Machine

```
pending → running ↔ paused → cancelled / completed / failed
```

- Only terminal-status jobs can be deleted or retried
- Looping jobs never auto-complete; they stay `running` until cancelled
- Pause/stop commands are picked up within ~1 second via periodic `db.refresh(job)`

## Error Classification

Broadcast logs classify errors into these types:

| Error Type         | Description                              |
|--------------------|------------------------------------------|
| `flood`            | Rate limited by Telegram (FloodWait)     |
| `banned`           | Account banned from the group            |
| `admin_only`       | Only admins can send messages            |
| `slowmode`         | Group has slow mode active               |
| `invalid_username` | Username doesn't exist                   |
| `invalid_link`     | Invite link expired or invalid           |
| `not_member`       | Account not a member of the group        |
| `flood_join`       | Too many group joins in short time       |
| `private_channel`  | Channel is private                       |

## License

Internal use. Modify and extend as needed.
