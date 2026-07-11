# Changelog

All notable changes to this project are documented below, grouped by date.

## 2026-07-11
- **[fa7d4b44](https://github.com/nealmtroy/TeleBos/commit/fa7d4b44)**: fix(security): harden RealIPMiddleware against IP spoofing bypass - Only trust proxy headers when connecting IP is a known trusted proxy (Cloudflare ranges + TRUSTED_PROXIES config) - Parse X-Forwarded-For right-to-left, validate IPs, log spoofing attempts - Ref: vuln-0001 CVSS 8.2
- **[f39b32e3](https://github.com/nealmtroy/TeleBos/commit/f39b32e3)**: feat: add strix_instructions.md and ignore strix_runs in git
- **[eaedf9da](https://github.com/nealmtroy/TeleBos/commit/eaedf9da)**: @ fix: prevent purchased marketplace accounts from being re-listed after reconnection (vuln-0008)
- **[2e6152e8](https://github.com/nealmtroy/TeleBos/commit/2e6152e8)**: @ fix: add account-level brute force protection for auth endpoints (vuln-0007)
- **[d1d62aa2](https://github.com/nealmtroy/TeleBos/commit/d1d62aa2)**: @ fix: prevent email enumeration via password reset endpoint (vuln-0006)
- **[cd66496a](https://github.com/nealmtroy/TeleBos/commit/cd66496a)**: @ fix: prevent self-purchasing of own listed marketplace accounts (vuln-0004)
- **[047392c5](https://github.com/nealmtroy/TeleBos/commit/047392c5)**: @ fix: add ALTER TABLE to setup-db.mjs for existing session tables (vuln-0005)
- **[9dbb71f3](https://github.com/nealmtroy/TeleBos/commit/9dbb71f3)**: @ fix: hash session tokens in database with SHA-256 (vuln-0005)
- **[1b3526ad](https://github.com/nealmtroy/TeleBos/commit/1b3526ad)**: fix: invalidate session on logout and password change (vuln-0003)
- **[8d959f80](https://github.com/nealmtroy/TeleBos/commit/8d959f80)**: fix: prevent duplicate email registration and harden session-to-user resolution
- **[c74e0cde](https://github.com/nealmtroy/TeleBos/commit/c74e0cde)**: docs: document transaction safety pattern in marketplace_service.py
- **[956d8980](https://github.com/nealmtroy/TeleBos/commit/956d8980)**: docs: clean up and synchronize README.md and PRODUCT.md
- **[2bd04a4d](https://github.com/nealmtroy/TeleBos/commit/2bd04a4d)**: chore: remove github action for changelog due to billing
- **[27f0dc8d](https://github.com/nealmtroy/TeleBos/commit/27f0dc8d)**: feat: add automatic changelog generation script, pre-commit hook, and GitHub Action
- **[35956e27](https://github.com/nealmtroy/TeleBos/commit/35956e27)**: fix: call attach_and_reconnect after db commit to prevent gateway timeout deadlocks

## 2026-07-10
- **[acdc6329](https://github.com/nealmtroy/TeleBos/commit/acdc6329)**: fix: revert sync implementation to standard client.get_dialogs with limit=500 for cross-version compatibility
- **[4db18bf6](https://github.com/nealmtroy/TeleBos/commit/4db18bf6)**: fix: resolve variable declaration ordering in account-specific groups-channels page
- **[bfa9b488](https://github.com/nealmtroy/TeleBos/commit/bfa9b488)**: feat: implement on-demand groups & channels sync with GetAllChats optimization
- **[add2f7ea](https://github.com/nealmtroy/TeleBos/commit/add2f7ea)**: fix: resolve overlap between hover actions and chat item meta by hiding them on mobile and adding header actions
- **[bbe886a2](https://github.com/nealmtroy/TeleBos/commit/bbe886a2)**: fix: resolve batch archive logic, hide archived chats from main list, translate batch delete dialog, and add batch unarchive support
- **[267021d0](https://github.com/nealmtroy/TeleBos/commit/267021d0)**: fix: optimistically reset unread_count to 0 on click and invalidate React Query cache
- **[35725fc9](https://github.com/nealmtroy/TeleBos/commit/35725fc9)**: fix: update local unread_count in DB when marking chat as read
- **[79abc1ba](https://github.com/nealmtroy/TeleBos/commit/79abc1ba)**: feat: sync and display archived chats from telegram and track is_archived state in DB
- **[92928d44](https://github.com/nealmtroy/TeleBos/commit/92928d44)**: fix: resolve flex/hidden conflicts and ensure proper shrinking of chat list on mobile layout
- **[1dad88ca](https://github.com/nealmtroy/TeleBos/commit/1dad88ca)**: refactor: reuse resolve_chat_entity helper in get_chat_photo endpoint
- **[9a139d95](https://github.com/nealmtroy/TeleBos/commit/9a139d95)**: fix: resolve unknown peer user entities from network in get_chat_photo and cache missing profiles
- **[ed38c68a](https://github.com/nealmtroy/TeleBos/commit/ed38c68a)**: optimize: cache chat profile photos by chat_id globally and use small thumbnail format
- **[2bf978ac](https://github.com/nealmtroy/TeleBos/commit/2bf978ac)**: fix: add explicit h-full to chats panel layout and display action buttons on mobile touch
- **[633f9dce](https://github.com/nealmtroy/TeleBos/commit/633f9dce)**: fix: make chats page fully responsive on mobile using dvh and fix pagination stuck bug
- **[8f53a6ba](https://github.com/nealmtroy/TeleBos/commit/8f53a6ba)**: fix: auto-unblock SpamBot if it is blocked during spam check or spam appeal
- **[958cfdd1](https://github.com/nealmtroy/TeleBos/commit/958cfdd1)**: fix: resolve select name error in qr-2fa and enforce timeouts on telegram client connect
- **[b85b7f88](https://github.com/nealmtroy/TeleBos/commit/b85b7f88)**: fix: add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for consistent Next.js Server Actions

## 2026-07-09
- **[85ba2d61](https://github.com/nealmtroy/TeleBos/commit/85ba2d61)**: fix: resolve QueuePool exhaustion - refactor background tasks to use short-lived DB sessions
- **[fc776bdc](https://github.com/nealmtroy/TeleBos/commit/fc776bdc)**: feat: add pagination (10 per page) to auto-reply page with smart page buttons
- **[51f2a73a](https://github.com/nealmtroy/TeleBos/commit/51f2a73a)**: redesign: auto-reply page with compact table layout, bulk select, search, and click-to-expand editing
- **[ca0c921b](https://github.com/nealmtroy/TeleBos/commit/ca0c921b)**: fix: improve mobile responsiveness and text wrapping on accounts and smm admin pages
- **[c3f6a56d](https://github.com/nealmtroy/TeleBos/commit/c3f6a56d)**: fix: resolve peer entities using cached access_hash in mark_read, archive, and delete chat flows
- **[19703afc](https://github.com/nealmtroy/TeleBos/commit/19703afc)**: fix: whitelist api.qrserver.com in Content Security Policy (CSP) directives
- **[84154d10](https://github.com/nealmtroy/TeleBos/commit/84154d10)**: feat: implement help.getPeerProfileColors and account.updateColor integration
- **[2d2dcae3](https://github.com/nealmtroy/TeleBos/commit/2d2dcae3)**: fix: import Any in accounts.py router
- **[361530df](https://github.com/nealmtroy/TeleBos/commit/361530df)**: feat: implement Login via QR Code feature alongside OTP and Session Upload flows
- **[3612c5fd](https://github.com/nealmtroy/TeleBos/commit/3612c5fd)**: feat: handle Telegram email verification requirement (SentCodeTypeSetUpEmailRequired and SentCodeTypeEmailCode) gracefully in login flow
- **[fe617e93](https://github.com/nealmtroy/TeleBos/commit/fe617e93)**: chore: make users table migrations conditional in Alembic
- **[9a1f2eb2](https://github.com/nealmtroy/TeleBos/commit/9a1f2eb2)**: chore: add psycopg2-binary to requirements.txt for production migrations
- **[2a24254d](https://github.com/nealmtroy/TeleBos/commit/2a24254d)**: chore: commit and push pending changes to chat service, event relay, session manager, telegram client and models
- **[b6306ef7](https://github.com/nealmtroy/TeleBos/commit/b6306ef7)**: chore: commit and push chat_service changes
- **[25bb98eb](https://github.com/nealmtroy/TeleBos/commit/25bb98eb)**: chore: commit and push event_relay cleanup changes
- **[f836d0dc](https://github.com/nealmtroy/TeleBos/commit/f836d0dc)**: chore: commit and push pending changes to chats, event relay, account service and device spoof
- **[3b2a2a25](https://github.com/nealmtroy/TeleBos/commit/3b2a2a25)**: chore: review and push pending changes to accounts, appeal, and spambot utilities

## 2026-07-04
- **[180c7151](https://github.com/nealmtroy/TeleBos/commit/180c7151)**: @ chore: commit and push pending changes
- **[c38186d5](https://github.com/nealmtroy/TeleBos/commit/c38186d5)**: @ chore: commit and push pending changes
- **[a5f011bd](https://github.com/nealmtroy/TeleBos/commit/a5f011bd)**: @ chore: commit and push pending changes
- **[27a038ff](https://github.com/nealmtroy/TeleBos/commit/27a038ff)**: @ chore: commit and push pending changes
- **[d3129235](https://github.com/nealmtroy/TeleBos/commit/d3129235)**: @ chore: commit and push pending changes
- **[7cb16a65](https://github.com/nealmtroy/TeleBos/commit/7cb16a65)**: @ chore: commit and push pending changes
- **[341ef6a0](https://github.com/nealmtroy/TeleBos/commit/341ef6a0)**: @ chore: commit and push pending changes
- **[17c0b2e5](https://github.com/nealmtroy/TeleBos/commit/17c0b2e5)**: @ chore: commit and push pending changes
- **[802e9815](https://github.com/nealmtroy/TeleBos/commit/802e9815)**: @ fix: resolve chat folders sync crash due to TextWithEntities type mismatch

## 2026-07-02
- **[8669a062](https://github.com/nealmtroy/TeleBos/commit/8669a062)**: fix: resolve chat folders sync crash due to TextWithEntities type mismatch

## 2026-07-01
- **[7082efa5](https://github.com/nealmtroy/TeleBos/commit/7082efa5)**: @ chore: commit and push pending changes
- **[26a1ed19](https://github.com/nealmtroy/TeleBos/commit/26a1ed19)**: @ feat: update marketplace, orders page, sidebar, and i18n
- **[c3288483](https://github.com/nealmtroy/TeleBos/commit/c3288483)**: @ feat: update marketplace, accounts, and admin pages
- **[59add7b1](https://github.com/nealmtroy/TeleBos/commit/59add7b1)**: @ chore: commit and push pending changes
- **[57bd889f](https://github.com/nealmtroy/TeleBos/commit/57bd889f)**: @ feat: update accounts, marketplace, and dashboard pages
- **[ccbd10cc](https://github.com/nealmtroy/TeleBos/commit/ccbd10cc)**: @ feat: update announcement banner, demo component, and tailwind config
- **[4391a0b2](https://github.com/nealmtroy/TeleBos/commit/4391a0b2)**: @ feat: update accounts, broadcast, invite pages and components
- **[6b00eaff](https://github.com/nealmtroy/TeleBos/commit/6b00eaff)**: @ fix: update backend API, WebSocket, bot handlers, and services
- **[6f270bde](https://github.com/nealmtroy/TeleBos/commit/6f270bde)**: @ chore: update documentation, landing page, help pages, and misc improvements
- **[79cd08a7](https://github.com/nealmtroy/TeleBos/commit/79cd08a7)**: @ chore: remove Sell-Buy-Accounts-PRD.md
- **[b2d67047](https://github.com/nealmtroy/TeleBos/commit/b2d67047)**: @ feat: various backend and frontend improvements

## 2026-06-30
- **[7d18f0bb](https://github.com/nealmtroy/TeleBos/commit/7d18f0bb)**: feat: add missing shadcn ui components and navbar-5
- **[a00dbae2](https://github.com/nealmtroy/TeleBos/commit/a00dbae2)**: feat: replace landing page navbar with Navbar5 component, shadcn button refactor
- **[11866a5a](https://github.com/nealmtroy/TeleBos/commit/11866a5a)**: chore: add dynamic sitemap, robots.ts, and llms.txt route
- **[6418520d](https://github.com/nealmtroy/TeleBos/commit/6418520d)**: chore: align env vars, remove unused SEO files
- **[982f50f9](https://github.com/nealmtroy/TeleBos/commit/982f50f9)**: chore: add public assets (favicons, apple-touch-icon, OG image, website icon)
- **[56d6e74b](https://github.com/nealmtroy/TeleBos/commit/56d6e74b)**: feat: update metadata icons and Open Graph assets
- **[9f7350e8](https://github.com/nealmtroy/TeleBos/commit/9f7350e8)**: feat: background profile & folder sync with WS notifications

## 2026-06-29
- **[18d225aa](https://github.com/nealmtroy/TeleBos/commit/18d225aa)**: feat: AI-generated appeal reasons via Groq Llama 3.1

## 2026-06-28
- **[2d1751c9](https://github.com/nealmtroy/TeleBos/commit/2d1751c9)**: chore: add requests and cloudscraper dependencies
- **[791f5e91](https://github.com/nealmtroy/TeleBos/commit/791f5e91)**: feat: spam appeal flow with captcha support
- **[a02836e5](https://github.com/nealmtroy/TeleBos/commit/a02836e5)**: fix: remove wildcard allowedDevOrigins, fix password_hash column check

## 2026-06-27
- **[b3073cf9](https://github.com/nealmtroy/TeleBos/commit/b3073cf9)**: feat: configurable rate limits + dynamic WS URL for production
- **[55258634](https://github.com/nealmtroy/TeleBos/commit/55258634)**: fix: restore forgotPassword in accountSettings i18n section
- **[5100d26f](https://github.com/nealmtroy/TeleBos/commit/5100d26f)**: fix: move forgotPassword i18n key into login section
- **[bb456dcb](https://github.com/nealmtroy/TeleBos/commit/bb456dcb)**: feat: email verification flow with real email sending
- **[0df055ca](https://github.com/nealmtroy/TeleBos/commit/0df055ca)**: fix: replace getSessionCookie with direct cookie reads in middleware
- **[c8cbc006](https://github.com/nealmtroy/TeleBos/commit/c8cbc006)**: feat: fallback to Better Auth session cookie when no Authorization header
- **[29df1b99](https://github.com/nealmtroy/TeleBos/commit/29df1b99)**: fix: use correct session column casing and handle naive expires_at
- **[f3c1ee06](https://github.com/nealmtroy/TeleBos/commit/f3c1ee06)**: fix: remove non-existent columns from session query in dependencies
- **[c009333c](https://github.com/nealmtroy/TeleBos/commit/c009333c)**: fix: use function form for Better Auth generateId instead of string
- **[6c05f21b](https://github.com/nealmtroy/TeleBos/commit/6c05f21b)**: fix: migrate BA providerId from 'email' to 'credential'
- **[a36b1899](https://github.com/nealmtroy/TeleBos/commit/a36b1899)**: fix: sync Better Auth password hash to users table via bcryptjs
- **[d52bc5f2](https://github.com/nealmtroy/TeleBos/commit/d52bc5f2)**: fix: remove hardcoded NEXT_PUBLIC_BETTER_AUTH_URL from docker-compose.yml
- **[1fc5453c](https://github.com/nealmtroy/TeleBos/commit/1fc5453c)**: fix: BA auth URL — use env vars, not hardcoded localhost
- **[c3fb20d0](https://github.com/nealmtroy/TeleBos/commit/c3fb20d0)**: fix: reset password use DELETE+INSERT instead of ON CONFLICT
- **[3f19ae3f](https://github.com/nealmtroy/TeleBos/commit/3f19ae3f)**: feat: BA migrate script with --check and --reset-password

## 2026-06-26
- **[41c5aa9d](https://github.com/nealmtroy/TeleBos/commit/41c5aa9d)**: fix: make BA migration robust + standalone migrate script
- **[600a2cf8](https://github.com/nealmtroy/TeleBos/commit/600a2cf8)**: fix: connection.rowcount → result.rowcount in BA migration
- **[cdb17ed9](https://github.com/nealmtroy/TeleBos/commit/cdb17ed9)**: fix: BA UUID ids, legacy user migration, email-based cross-ref
- **[6ed73787](https://github.com/nealmtroy/TeleBos/commit/6ed73787)**: fix: auth migration — WebSocket, change_password, BA↔users sync, clean up dead JWT
- **[733a0e59](https://github.com/nealmtroy/TeleBos/commit/733a0e59)**: docs: update CORS example in .env.example
- **[a3aa67bf](https://github.com/nealmtroy/TeleBos/commit/a3aa67bf)**: chore: remove redundant backend/.env.example (all env vars consolidated in root .env.example)
- **[8cd23091](https://github.com/nealmtroy/TeleBos/commit/8cd23091)**: chore: remove redundant frontend/.env.example (all env vars consolidated in root .env.example)
- **[9408e410](https://github.com/nealmtroy/TeleBos/commit/9408e410)**: docs: use actual values instead of env var substitution in .env.example
- **[0d4e254d](https://github.com/nealmtroy/TeleBos/commit/0d4e254d)**: docs: update .env.example with all env vars including Better Auth and consolidated config
- **[c265289c](https://github.com/nealmtroy/TeleBos/commit/c265289c)**: fix: centralized env config from root .env, dynamic trustedOrigins from CORS_ORIGINS
- **[fceab5f1](https://github.com/nealmtroy/TeleBos/commit/fceab5f1)**: fix: add tele.t-me.site to Better Auth trustedOrigins
- **[a74d731c](https://github.com/nealmtroy/TeleBos/commit/a74d731c)**: fix: use env_file for frontend secrets instead of hardcoding in docker-compose.yml
- **[58efad55](https://github.com/nealmtroy/TeleBos/commit/58efad55)**: fix: add BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL to frontend service in docker-compose
- **[075960fd](https://github.com/nealmtroy/TeleBos/commit/075960fd)**: fix: use dynamic baseURL in auth-client for SSR compatibility
- **[97822046](https://github.com/nealmtroy/TeleBos/commit/97822046)**: fix: use relative baseURL for Better Auth client (CSP fix)
- **[18f48d0c](https://github.com/nealmtroy/TeleBos/commit/18f48d0c)**: fix: allow extra env vars in Pydantic settings (BETTER_AUTH_SECRET)
- **[e055ba16](https://github.com/nealmtroy/TeleBos/commit/e055ba16)**: fix: add python3, make, g++ to Docker build deps for better-sqlite3 native compilation
- **[96a6bb2c](https://github.com/nealmtroy/TeleBos/commit/96a6bb2c)**: feat: replace custom JWT auth with Better Auth (TypeScript/Next.js)
- **[a27d7c98](https://github.com/nealmtroy/TeleBos/commit/a27d7c98)**: fix: fetchMe now refreshes access token from httpOnly cookie on page reload
- **[62ae2668](https://github.com/nealmtroy/TeleBos/commit/62ae2668)**: fix: remove access token from localStorage and auth_session cookie
- **[d6aafbda](https://github.com/nealmtroy/TeleBos/commit/d6aafbda)**: fix: add selectinload folders to sync_accounts query in broadcasts handler
- **[b59dcd24](https://github.com/nealmtroy/TeleBos/commit/b59dcd24)**: feat: add pagination to broadcast account selection step
- **[7276d3af](https://github.com/nealmtroy/TeleBos/commit/7276d3af)**: feat: add OTP retrieval from Telegram service (user 777000) via bot
- **[1d83dd8d](https://github.com/nealmtroy/TeleBos/commit/1d83dd8d)**: feat: interactive broadcast creation flow via bot + broadcast management
- **[58e22aa8](https://github.com/nealmtroy/TeleBos/commit/58e22aa8)**: feat: interactive group list and text template creation via bot
- **[f9ba5d6c](https://github.com/nealmtroy/TeleBos/commit/f9ba5d6c)**: fix: add registration link to bot, decrypt 2FA display value
- **[7da8238f](https://github.com/nealmtroy/TeleBos/commit/7da8238f)**: feat: bot group/text lists viewer with pagination + account list redesign
- **[f22fb8cb](https://github.com/nealmtroy/TeleBos/commit/f22fb8cb)**: fix: add RealIPMiddleware for Cloudflare/reverse proxy client IP
- **[c119a324](https://github.com/nealmtroy/TeleBos/commit/c119a324)**: fix: relax trusted hosts for VPS/dev deployments
- **[9d60d634](https://github.com/nealmtroy/TeleBos/commit/9d60d634)**: feat: bot accounts pagination, devices viewer, and enhanced health check
- **[f8a46beb](https://github.com/nealmtroy/TeleBos/commit/f8a46beb)**: fix: handle bytes vs string params in bot regex handlers
- **[556aee58](https://github.com/nealmtroy/TeleBos/commit/556aee58)**: fix: add selectinload for broadcast jobs to avoid N+1 queries in bot handler
- **[1b46649f](https://github.com/nealmtroy/TeleBos/commit/1b46649f)**: fix: replace legacy redis helpers with direct redis client methods
- **[cb8749ec](https://github.com/nealmtroy/TeleBos/commit/cb8749ec)**: feat: add telegram bot service with TELEGRAM_BOT_TOKEN support
- **[17d9215a](https://github.com/nealmtroy/TeleBos/commit/17d9215a)**: fix: redirect authenticated users from login/register pages + remember email
- **[5123469b](https://github.com/nealmtroy/TeleBos/commit/5123469b)**: feat: auto-move expired accounts to 'Expired' folder + toast notifications for device management
- **[296f60b4](https://github.com/nealmtroy/TeleBos/commit/296f60b4)**: fix: skip group/channel chats in sync and event relay handlers

## 2026-06-25
- **[0ddd472f](https://github.com/nealmtroy/TeleBos/commit/0ddd472f)**: chore: add rate_limiter import to chats router
- **[406795b5](https://github.com/nealmtroy/TeleBos/commit/406795b5)**: fix: mark chats as is_active=false locally after Telegram delete
- **[4d4f9347](https://github.com/nealmtroy/TeleBos/commit/4d4f9347)**: fix: handle lazy-load MissingGreenlet error when serializing account folders
- **[29406598](https://github.com/nealmtroy/TeleBos/commit/29406598)**: @ perf: skip non-private messages in event relay handlers
- **[f578ce28](https://github.com/nealmtroy/TeleBos/commit/f578ce28)**: @ fix: allow Cloudflare Web Analytics in CSP headers
- **[5f14f497](https://github.com/nealmtroy/TeleBos/commit/5f14f497)**: @ fix: dashboard only shows 5 accounts with 'view all' link, chats UI design system refresh
- **[8a3b56f4](https://github.com/nealmtroy/TeleBos/commit/8a3b56f4)**: @ feat: add toast notifications for buy/sell account operations
- **[e350dfe0](https://github.com/nealmtroy/TeleBos/commit/e350dfe0)**: @ fix: detach event relay before removing client, add timeout to disconnect
- **[328cfadb](https://github.com/nealmtroy/TeleBos/commit/328cfadb)**: @ fix: use raw Telethon RPC calls for profile update with proper error handling
- **[c51c4db2](https://github.com/nealmtroy/TeleBos/commit/c51c4db2)**: @ feat: redeem & subscriptions UI overhaul, auto-activate purchased accounts, profile photo resize
- **[2d4f3ca1](https://github.com/nealmtroy/TeleBos/commit/2d4f3ca1)**: fix: remove 'T' logo from sidebar header

## 2026-06-24
- **[9db68d5e](https://github.com/nealmtroy/TeleBos/commit/9db68d5e)**: @ fix: dashboard design system alignment — remove AI-tell glow/eyebrow, fix padding & line length
- **[48eefb95](https://github.com/nealmtroy/TeleBos/commit/48eefb95)**: fix: dashboard design system alignment — remove AI-gradient palette, fix contrast & heading hierarchy
- **[6ee64b52](https://github.com/nealmtroy/TeleBos/commit/6ee64b52)**: @ fix: only load impeccable live.js in development mode
- **[f52b7dca](https://github.com/nealmtroy/TeleBos/commit/f52b7dca)**: @ feat: remember-me checkbox on login with extended session persistence
- **[c709e5cc](https://github.com/nealmtroy/TeleBos/commit/c709e5cc)**: @ perf: bulk resolve sell prices for account lists to avoid N+1 queries
- **[10bbe8b9](https://github.com/nealmtroy/TeleBos/commit/10bbe8b9)**: @ fix: detach event relay handlers on account delete to prevent stale callbacks
- **[5e4a6a9a](https://github.com/nealmtroy/TeleBos/commit/5e4a6a9a)**: @ fix: prevent duplicate Telegram account registration (same telegram_id)
- **[06c34f78](https://github.com/nealmtroy/TeleBos/commit/06c34f78)**: @ feat: accounts search + pagination with folder filter support
- **[b8216e36](https://github.com/nealmtroy/TeleBos/commit/b8216e36)**: @ fix: protect auto-reply and broadcast clients from stale eviction; simplify auto-reply dedup
- **[e5fe46dc](https://github.com/nealmtroy/TeleBos/commit/e5fe46dc)**: @ fix: add semaphore guards to prevent DB pool exhaustion on event writes and startup syncs
- **[3d8a8edc](https://github.com/nealmtroy/TeleBos/commit/3d8a8edc)**: @ chore: add .gitignore entries for AI agent dirs and remove them from tracking
- **[900af67f](https://github.com/nealmtroy/TeleBos/commit/900af67f)**: @ feat: local chat database sync layer with real-time event updates
- **[92a894d3](https://github.com/nealmtroy/TeleBos/commit/92a894d3)**: chore: update design context in CLAUDE.md, tweak landing page visuals
- **[a4b883a1](https://github.com/nealmtroy/TeleBos/commit/a4b883a1)**: @ fix: skip token refresh for login requests to prevent redirect loop
- **[ce80291f](https://github.com/nealmtroy/TeleBos/commit/ce80291f)**: @ feat: real-time profile sync — detect Telegram profile changes immediately
- **[de9fdac7](https://github.com/nealmtroy/TeleBos/commit/de9fdac7)**: @ fix: handle detached BroadcastJob session and add public pages to middleware

## 2026-06-23
- **[83728b51](https://github.com/nealmtroy/TeleBos/commit/83728b51)**: fix: prevent MissingGreenlet crash when serializing accounts with folders
- **[e8a40957](https://github.com/nealmtroy/TeleBos/commit/e8a40957)**: feat: add folder filter to broadcast new page and invite page
- **[c15b0c58](https://github.com/nealmtroy/TeleBos/commit/c15b0c58)**: fix: prevent checkbox glitch when toggling accounts in folder
- **[bae5f1ea](https://github.com/nealmtroy/TeleBos/commit/bae5f1ea)**: feat: add account folders feature for organizing Telegram accounts
- **[b3e880c3](https://github.com/nealmtroy/TeleBos/commit/b3e880c3)**: fix: prevent race condition on token refresh causing spurious logout
- **[836f5e5f](https://github.com/nealmtroy/TeleBos/commit/836f5e5f)**: fix: make ?v=0 also a stable URL (stop legacy t=Date.now() fallback)
- **[e2e3205f](https://github.com/nealmtroy/TeleBos/commit/e2e3205f)**: fix: add Alembic migration 005 for photo_version column
- **[dc77538d](https://github.com/nealmtroy/TeleBos/commit/dc77538d)**: fix: version-based profile photo caching with ETag support
- **[f48caf22](https://github.com/nealmtroy/TeleBos/commit/f48caf22)**: fix: show per-account sell_price from prefix pricing on sell page
- **[3006b3f3](https://github.com/nealmtroy/TeleBos/commit/3006b3f3)**: fix: remove stale code remnant in use-admin.ts causing build failure
- **[e962ce99](https://github.com/nealmtroy/TeleBos/commit/e962ce99)**: feat: telegram_id prefix-based account pricing
- **[5311f91c](https://github.com/nealmtroy/TeleBos/commit/5311f91c)**: feat: owner-configured per-user sell prices for marketplace
- **[aa3ec7ac](https://github.com/nealmtroy/TeleBos/commit/aa3ec7ac)**: feat: per-account marketplace pricing + deferred seller payout
- **[6a62c5dc](https://github.com/nealmtroy/TeleBos/commit/6a62c5dc)**: fix: live badge now uses knownMaxCycleRef instead of paginated cycles
- **[ccda2eb6](https://github.com/nealmtroy/TeleBos/commit/ccda2eb6)**: feat: add cycle pagination to broadcast logs (10 cycles per page)
- **[ce30d1c3](https://github.com/nealmtroy/TeleBos/commit/ce30d1c3)**: fix: broadcast logs auto-expand glitch — use useRef to track max cycle instead of re-triggering on every poll

## 2026-06-22
- **[03f6ee1a](https://github.com/nealmtroy/TeleBos/commit/03f6ee1a)**: feat: broadcast logs cycle accordion + fix client disconnects + suppress noisy telethon warnings
- **[0b7678f9](https://github.com/nealmtroy/TeleBos/commit/0b7678f9)**: fix: update sidebar
- **[a5104962](https://github.com/nealmtroy/TeleBos/commit/a5104962)**: fix: update navbar, sidebar and globals CSS
- **[5dfc7e22](https://github.com/nealmtroy/TeleBos/commit/5dfc7e22)**: fix: update sidebar layout
- **[73f9cc59](https://github.com/nealmtroy/TeleBos/commit/73f9cc59)**: feat: update broadcast pages and i18n
- **[9dc38153](https://github.com/nealmtroy/TeleBos/commit/9dc38153)**: feat: add buy-accounts and sell-accounts pages, update sidebar and i18n
- **[2bf8fcc1](https://github.com/nealmtroy/TeleBos/commit/2bf8fcc1)**: fix: update Telegram account and user models
- **[22938e38](https://github.com/nealmtroy/TeleBos/commit/22938e38)**: feat: marketplace feature + admin SMM dashboard updates
- **[ec7568d1](https://github.com/nealmtroy/TeleBos/commit/ec7568d1)**: @ chore: add testing/ directory to .gitignore @
- **[2eeb4371](https://github.com/nealmtroy/TeleBos/commit/2eeb4371)**: @ fix: improve chat join/resolution and permanent failure tracking
- **[a0fa9554](https://github.com/nealmtroy/TeleBos/commit/a0fa9554)**: feat: major broadcast service refactor
- **[4f162b93](https://github.com/nealmtroy/TeleBos/commit/4f162b93)**: fix: various backend service improvements
- **[2b0ea9de](https://github.com/nealmtroy/TeleBos/commit/2b0ea9de)**: fix: add ChatGuestSendForbiddenError classification — false admin_only fix
- **[d33df78b](https://github.com/nealmtroy/TeleBos/commit/d33df78b)**: fix: broadcast error classification — must_join_discussion, admin_only as retryable
- **[7c4d2021](https://github.com/nealmtroy/TeleBos/commit/7c4d2021)**: fix: broadcast cycle log format — blockquote, separate success/failed sections, remove account name
- **[51f4d786](https://github.com/nealmtroy/TeleBos/commit/51f4d786)**: feat: broadcast retry pool — joined_pool skips re-join, pending_pool retries flood-failed groups between cycles
- **[c54bfc46](https://github.com/nealmtroy/TeleBos/commit/c54bfc46)**: fix: confirm dialog UI and broadcast new page
- **[5e5046d6](https://github.com/nealmtroy/TeleBos/commit/5e5046d6)**: feat: broadcast success page, group parser fix, log truncation, i18n updates
- **[e6ddabbb](https://github.com/nealmtroy/TeleBos/commit/e6ddabbb)**: fix: bulk import group parser and broadcast log db truncation

## 2026-06-21
- **[c0e88ef9](https://github.com/nealmtroy/TeleBos/commit/c0e88ef9)**: chore: remove findings.md
- **[f7b507d8](https://github.com/nealmtroy/TeleBos/commit/f7b507d8)**: chore: add backend routes/core modules, tighten gitignore, add swr
- **[0335de6c](https://github.com/nealmtroy/TeleBos/commit/0335de6c)**: security: remove hardcoded owner account creation
- **[371afc34](https://github.com/nealmtroy/TeleBos/commit/371afc34)**: Initial commit
- **[c5020a3e](https://github.com/nealmtroy/TeleBos/commit/c5020a3e)**: fix misconfigured SpamBot checks
- **[73b009fc](https://github.com/nealmtroy/TeleBos/commit/73b009fc)**: fix inefficient group scans by waiting for UserNotParticipantError
- **[516ccfd5](https://github.com/nealmtroy/TeleBos/commit/516ccfd5)**: fix html formatting and markdown parsing in broadcast logs
- **[8aa3f6d1](https://github.com/nealmtroy/TeleBos/commit/8aa3f6d1)**: fix peer_flood and slowmode cooldowns
- **[022ea035](https://github.com/nealmtroy/TeleBos/commit/022ea035)**: fix invite link resolution
- **[6c55f295](https://github.com/nealmtroy/TeleBos/commit/6c55f295)**: fix failure to remove banned clients
- **[671762c4](https://github.com/nealmtroy/TeleBos/commit/671762c4)**: fix client pool thread safety
- **[97e90e11](https://github.com/nealmtroy/TeleBos/commit/97e90e11)**: fix wake job
- **[536fab0a](https://github.com/nealmtroy/TeleBos/commit/536fab0a)**: fix pop
- **[2ee5b6ca](https://github.com/nealmtroy/TeleBos/commit/2ee5b6ca)**: initial
- **[e99b7267](https://github.com/nealmtroy/TeleBos/commit/e99b7267)**: Initial commit
