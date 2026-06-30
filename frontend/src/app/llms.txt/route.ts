export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_URL || "https://telebos.app";
  const cleanUrl = siteUrl.replace(/\/$/, "");

  const content = `# llms.txt — TeleBos
# ${cleanUrl}
#
# This file helps LLMs understand the TeleBos web application.
# More info: https://llmstxt.org/

## About TeleBos

TeleBos is a powerful multi-account Telegram manager web app. It lets users add unlimited Telegram accounts via OTP or session string upload, manage profiles/privacy, view chats in real time, manage chat folders, and broadcast messages to groups/channels with configurable delays and looping.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), Tailwind CSS 3, shadcn/ui, React Query, Zustand, Recharts
- **Backend:** FastAPI (Python 3.12), Telethon, SQLAlchemy 2.0 (async)
- **Workers:** Celery (Redis broker)
- **Database:** PostgreSQL 16 (async via asyncpg)
- **Cache/Queue:** Redis 7
- **Real-time:** Native WebSocket (FastAPI)

## Key Features

### Multi-Account Management
Add unlimited Telegram accounts via OTP or session string. Switch between accounts seamlessly without logging out.

### Smart Broadcast
Send messages to thousands of groups/channels with automatic delay and anti-flood protection. Supports configurable delays and looping cycles.

### Real-Time Chat Monitoring
View incoming chats, sent messages, and account activity in real time via WebSocket.

### Auto-Reply
Configure automatic replies per account or globally with deduplication tracking.

### Chat Folders
Organize Telegram chats into custom folders for easier management.

## Links

- **Main website:** ${cleanUrl}
- **Help center:** ${cleanUrl}/help
- **Privacy policy:** ${cleanUrl}/privacy
- **Terms of service:** ${cleanUrl}/tos
- **Telegram channel:** https://t.me/telebos_official
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
