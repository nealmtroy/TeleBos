# TeleBos — Multi-Account Telegram Manager

TeleBos is a web dashboard for managing multiple Telegram accounts from one workspace. It combines account onboarding, real-time chats, broadcasts, bulk invites, account/profile controls, spam appeals, marketplace transactions, SMM ordering, vouchers, and subscriptions.

## Capabilities

- **Account operations** — OTP and session-string onboarding, profile/privacy/2FA/device controls, account folders, and statistics.
- **Chats** — real-time conversation updates, message operations, media, polls, pins, reactions, forwarding, stickers, and GIFs.
- **Automation** — broadcast campaigns, bulk invitations, auto-replies, adaptive flood control, and delivery logs.
- **Commerce** — account marketplace, SMM orders, redeem codes, subscriptions, and administration.
- **Security** — Better Auth sessions, encrypted Telegram-sensitive data, ownership checks, and role-gated privileged actions.
- **Localization** — English and Indonesian interfaces.

## Documentation

| Document | Use it for |
| --- | --- |
| [`PRD.md`](PRD.md) | Product requirements, user workflows, roles, and acceptance criteria. |
| [`SECURITY.md`](SECURITY.md) | Verified security controls, gaps, deployment, and incident response. |
| [`PRODUCT.md`](PRODUCT.md) | Product positioning and brand intent. |
| [`DESIGN.md`](DESIGN.md) | Visual design system and component rules. |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code architecture, commands, engineering invariants, and API capability map. |
| [`AGENTS.md`](AGENTS.md) | Compatibility entry point for other coding agents. |
| [`docs/security/strix-assessment-instructions.md`](docs/security/strix-assessment-instructions.md) | Targeted security-assessment procedure. |

For exact first-party request/response contracts, start the backend and open:

- Interactive FastAPI docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- OpenAPI schema: [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json)

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, React Query, Zustand |
| Backend | FastAPI, Python 3.12, Telethon, Celery |
| Database | PostgreSQL 16 via asyncpg |
| Cache / queue | Redis 7 |
| Real-time | Native FastAPI WebSockets |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Telegram API credentials from [my.telegram.org](https://my.telegram.org/apps)

### Docker setup

1. Configure the backend environment:

   ```bash
   cd TeleBos
   cp .env.example backend/.env
   ```

2. Set at least the Telegram API credentials and strong application/encryption secrets in `backend/.env`:

   ```env
   TELEGRAM_API_ID=12345678
   TELEGRAM_API_HASH=your_api_hash_here
   ```

   Generate a Fernet key when needed:

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

3. Start the stack:

   ```bash
   docker-compose up -d
   ```

4. Open the services:

   - Frontend: [http://localhost:3000](http://localhost:3000)
   - API docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
   - Health check: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

### Local development

**Backend**

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Run the Celery worker in a separate terminal:

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

For local development, ensure PostgreSQL and Redis are available and configure `DATABASE_URL` and `DATABASE_URL_SYNC` in `backend/.env`.

### Quality checks

The initial automated suite is deterministic and mocks infrastructure boundaries; it does not require PostgreSQL, Redis, Telegram credentials, or Docker Compose.

```bash
# Backend
cd backend
python -m pytest
ruff check app tests
ruff format --check tests

# Frontend
cd frontend
npm run lint
npm run typecheck
npm run test
npm run format:check
```

## Repository Map

```text
TeleBos/
├── backend/       FastAPI application, services, models, schemas, workers, tests
├── frontend/      Next.js application, components, hooks, libraries, stores, tests
├── docs/security/ Targeted security-review instructions
├── PRD.md         Versioned product requirements
├── SECURITY.md    Security posture and deployment guidance
└── docker-compose.yml
```

## License

GPL-3.0. See [`LICENSE`](LICENSE).
