# TeleBos — Business Logic

Deep-dive of how TeleBos makes money, what it refuses to do, and where the
revenue actually lands. Every claim cites `file:line` in the repository.

> **Scope note.** This document describes *what the code does today*, not what
> `PRD.md` says the product should do. Where the two disagree, the code wins and
> the divergence is called out explicitly in [Gaps Between PRD and Code](#gaps-between-prd-and-code).

- Generated: 2026-10-03
- Commit audited: `a23e1aa6`
- Scope: `backend/app` (FastAPI + Telethon), `frontend/src` (Next.js 14)
- Money unit: **IDR**, stored as an integer. There is no minor-unit or decimal representation anywhere.

---

## Table of Contents

1. [The One-Paragraph Version](#the-one-paragraph-version)
2. [Revenue Model](#revenue-model)
3. [Pricing Rules](#pricing-rules)
4. [Where the Margin Goes](#where-the-margin-goes)
5. [Marketplace Trust Mechanics](#marketplace-trust-mechanics)
6. [Balance and Atomicity](#balance-and-atomicity)
7. [Entitlements and Upsell Levers](#entitlements-and-upsell-levers)
8. [Rate Limits and Quotas](#rate-limits-and-quotas)
9. [Deliberate Constraints](#deliberate-constraints)
10. [Verified Bugs and Revenue Leaks](#verified-bugs-and-revenue-leaks)
11. [Dead Code](#dead-code)
12. [Gaps Between PRD and Code](#gaps-between-prd-and-code)
13. [Open Questions](#open-questions)

---

## The One-Paragraph Version

TeleBos has **no payment gateway**. Money enters only when the owner
denominates a voucher by hand and hands it to a customer out-of-band. Once
inside, that balance buys exactly three things: a subscription role, SMM service
resold at a markup, and player-to-player Telegram accounts sold at a spread. The
platform's real revenue is that spread and that markup — but the spread is
realized *by omission* (the difference simply never reaches any `User` row)
rather than by an explicit credit entry, and the markup defaults to **zero** if
nobody seeds the setting. Subscription pricing does not exist in the repository
at all.

---

## Revenue Model

Money enters the system in **exactly four ways**. Verified: grep for
`qris|midtrans|xendit|stripe|payment_gateway|withdraw` across `backend/app`
returns no production hits.

### 1. Redeem / voucher codes — the primary money-in

Owner issues codes; users redeem them for balance or a role.

| Property | Value | Source |
|---|---|---|
| Create | owner-only | `services/redeem_service.py:26` |
| Redeem | `POST /redeem` | `api/redeem.py:23` |
| Types | `balance` \| `subscription` — **mutually exclusive**, the unused fields are force-nulled | `services/redeem_service.py:33-42` |
| Unit | integer IDR credits | `bot/utils.py:82` renders as `Rp` |
| Sellable plans | `pro`, `premium` only | `schemas/redeem.py:25` |

`basic` is **not** sellable via voucher. It is the default role
(`models/user.py:26`) and the expiry downgrade target
(`services/redeem_service.py:244-245`).

Schema bounds: `amount ≥ 1`, `max_uses` 1–9999, `duration_days` 1–36500,
`code` ≤ 50 chars, `custom_code` matches `^[a-zA-Z0-9_-]+$`
(`schemas/redeem.py:22-31`).

Upgrade rules, both enforced at `services/redeem_service.py:136-140`:

- a voucher can never grant `owner`;
- `premium` is never downgraded to `pro` by a weaker code.

Face value is credited **1:1** — no voucher margin.

### 2. SMM service orders (resale of BuzzerPanel.id)

| Property | Value | Source |
|---|---|---|
| Place | `POST /orders`, `POST /orders/mass` | `api/orders.py:134`, `:191` |
| Pricing unit | **per 1000** | `services/order_service.py:436-443` |
| Allowlist | 106 IDs | `app/smm_service_ids.py:16-36` |
| Cost basis | `original_price`, cached from upstream on sync | `models/smm_service.py:23-24` |

The allowlist rejects an unknown ID **before** pricing runs, **before** the
balance is touched, and **before** the provider is called, on all four paths:
the single endpoint (`api/orders.py:156-160`), the batch endpoint
(`api/orders.py:213-218`), `place_order` (`services/order_service.py:118-119`),
and `_get_effective_price` (`services/order_service.py:60`) which the batch path
resolves prices through.

Enforcement is proven by `tests/unit/test_smm_allowlist.py`, which asserts a
rejected order never awaits `db.commit` or `db.execute`.

### 3. Account marketplace (P2P — this is where the margin is)

| Property | Value | Source |
|---|---|---|
| Sell | `POST /marketplace/sell` | `api/marketplace.py:54` |
| Buy | `POST /marketplace/buy/{account_id}` | `api/marketplace.py:111` |
| Unit | IDR per account, flat | — |
| Price | per-`telegram_id`-prefix, longest match wins | below |
| Margin | `buy_price − sell_price` | `services/marketplace_service.py:509-513` |

### 4. Subscription entitlement

Plans gate features; they do not generate a price of their own. **Plan pricing
does not exist in the repository** — vouchers are hand-denominated, so the
Pro/Premium price lives entirely outside the codebase. See
[Open Questions](#open-questions) #1.

---

## Pricing Rules

### A. SMM effective price — 3-tier precedence

`order_service.py:77-87`, duplicated verbatim in `api/orders.py:64-71`,
`api/orders.py:109-116`, and `admin_smm_service.py:213-220`:

1. `selling_price` set → use it verbatim.
2. Else `markup = svc.markup_percent if svc.markup_percent else global_markup`
   (per-service wins, but a falsy `0` falls through to global).
3. `markup > 0` → `max(1, (original_price * (100 + markup)) // 100)`.
4. `markup ≤ 0` → `original_price`.
5. `effective_price <= 0` → hard `ValueError`.

**Worked example.** `global_markup = 20`, service `original_price = 3000`,
`markup_percent = 0`, quantity 5000:

```
effective = 3000 * (100 + 20) // 100 = 360000 // 100 = 3600
total     = max(1, 3600 * 5000 // 1000) = 18000
```

The `// 1000` floor silently undercharges small quantities: quantity 1 costs
`max(1, 3) = 3` credits, not 3.6. `max(1, …)` guarantees a 1-credit minimum.

`global_markup_percent` defaults to `"0"` (`order_service.py:23`, `:71-74`).
**With no seed data the SMM margin is exactly zero.**

### B. Marketplace prefix pricing — longest-prefix wins

Rule rows in `telegram_id_prefix_prices` carry `sell_price` and a nullable
`buy_price` (`models/user_account_price.py:32-40`).

- Entries are sorted by prefix length descending (`user_account_price_service.py:76-84`)
  so the longest match early-exits (`_match_prefix:98-106`).
- No match → global `account_sell_price` / `account_buy_price`,
  defaults **sell 5500 / buy 7000** (`user_account_price_service.py:26-27`).
- `_effective_buy_price` (`:109-117`) computes
  `max(fallback_or_buy, sell_price)` — **buy can never be below sell, so margin
  ≥ 0 by construction.**

**Worked example.** Prefix `77` → sell 5000, buy 7000; globals 5500/7000:

| `telegram_id` | matched | sell | buy | margin |
|---|---|---|---|---|
| `7780645374` | `77` | 5000 | 7000 | **2000** |
| `812…` (no match) | — | 5500 | 7000 | **1500** |

Default global spread = 7000 − 5500 = **1500 IDR (~21.4% of sell price)**.

**Write-side validation.** `upsert_prefix_price` rejects `buy_price < sell_price`
with a 400 (`user_account_price_service.py:157-161`;
`api/admin_account_prices.py:65-67`). Sell price `≥ 1`
(`schemas/user_account_price.py:25`); prefix 1–20 chars (`:12-17`).

**Cache.** Rules plus both fallbacks are cached in-process for **300 s**
(`_CACHE_TTL = 300.0`, `user_account_price_service.py:35`). Owner edits invalidate
explicitly (`:183`, `:202`); `update_global_settings` also invalidates when the
account prices change, with the comment that a 5-minute stale default would
misprice live listings (`admin_smm_service.py:569-574`).

---

## Where the Margin Goes

| Stream | Platform take | Mechanism |
|---|---|---|
| SMM resale | `global_markup_percent` (default **0**) or per-service markup | `order_service.py:77-87` |
| Marketplace | `buy_price − sell_price`, floored at 0 | `marketplace_service.py:509-513` |
| Vouchers / subscription | **0%** — face value only | `redeem_service.py:124` |

**Margin is realized by omission** (`marketplace_service.py:489-513`):

```python
sell_price = account.sell_price or 7000
buy_price  = max(getattr(account, "buy_price", None) or sell_price, sell_price)
buyer.balance  -= buy_price    # :509
seller.balance += sell_price   # :513  — NOT buy_price
```

The difference never touches a `User` row. It is not lost — it simply never
enters any ledger. The one place the code says so out loud is when the seller row
is gone: `"keeping balance as platform revenue"` (`:517-521`).

---

## Marketplace Trust Mechanics

**There is no escrow, no held funds, no dispute flow, and no refund for a
completed sale.** `grep -rni "dispute|refund"` hits only `order_service.py`
(SMM failure refunds) — nothing in the marketplace.

State is derived from five columns on `telegram_accounts`
(`models/telegram_account.py:55-63`): `for_sale`, `is_sold`, `sell_price`,
`buy_price`, `seller_id` (plus `sale_listed_at`, `sold_at`).

| Transition | Guard | Money effect |
|---|---|---|
| `list_for_sale` | not already listed, `phone_verified`, `is_active` (`marketplace_service.py:136-142`) | none — **seller is not paid at listing** |
| `sell` on buy | `for_sale AND not is_sold` + `FOR UPDATE` (`:460-476`); `buyer != seller` (`:483-484`) | buyer −`buy_price`, seller +`sell_price` (`:509-513`) |
| `cancel_sale` | seller or current owner (`:626`); must still be listed (`:623`) | none |
| `listing_invalid` | Telegram session dead (`:303-305`) | none — auto-delisted, **seller not notified of any money consequence** |

**What genuinely protects the trade:**

- **Price freeze.** Both prices are written onto the listing row (`:220-221`),
  so a later admin reprice cannot affect a live listing
  (`marketplace_service.py:178-186`; `user_account_price_service.py:263-270`).
- **Deadlock-safe lock ordering.** Both user rows are locked in sorted UUID order
  to avoid a circular deadlock (`:493-495`).
- **Self-purchase blocked** (`:483-484`).
- **Forward-only sanitization.** Profile rewrite is fail-closed with a 45 s
  deadline and 12 username attempts
  (`marketplace_profile_service.py:23-28`, `:485-496`); the DB listing rolls
  back unless every account prepares cleanly (`marketplace_service.py:103-108`).
- **Sanitization on both sides.** Auto-reply logs deleted on list and on buy
  (`:226`, `:540`); active jobs cancelled on listing (`:195-215`).
- **Three-state session validation.** `invalid` → auto-delist + 400.
  `unknown` → **fail-closed for purchase (503) but the listing is preserved**
  (`:277-305`; `api/marketplace.py:127-138`). A Telegram outage must not erase a
  seller's listing, but it must also not permit a purchase.

**The one failure path:** the pre-purchase session check. Once `buy_account`
commits, ownership transfer is irreversible and there is no reversal endpoint. A
post-purchase reconnect failure is logged and swallowed
(`api/marketplace.py:146-154`) — **the buyer has paid and the seller has been
credited even if the account cannot be reconnected.**

---

## Balance and Atomicity

**There is exactly one ledger.** `User.balance`, a `BigInteger`
(`models/user.py:27`), backed by a DB-level
`CheckConstraint("balance >= 0", name="chk_user_balance_positive")`
(`user.py:16`). No `credits`, `points`, or `balance_history` table exists.

| Operation | Lock | Transaction shape |
|---|---|---|
| SMM single order | `FOR UPDATE` on user (`order_service.py:135-138`) | debit + **commit before network I/O** (`:146-147`), provider call, refund-on-failure under a fresh lock (`:154-159`, `:164-169`) |
| SMM mass order | `FOR UPDATE` (`:254-257`) | debit the whole `total_cost` + commit (`:265-266`), N external calls, single refund of `total_cost − successful_cost` (`:321-329`) |
| Redeem | `FOR UPDATE` on code (`:87-92`) **and** user (`:114-117`) | balance/role mutation + `RedeemLog` + `used_count += 1` in one flush (`:160-170`) |
| Marketplace buy | `FOR UPDATE` on the account, then both users in sorted order (`:460`, `:493-495`) | single atomic transaction, committed by the API caller (`api/marketplace.py:141`) |
| Admin balance edit | `FOR UPDATE` (`api/admin.py:496-499`) | clamped at 0, not rejected (`:503-505`) |

Committing the debit before the provider call is deliberate: it releases the row
write lock so a slow upstream HTTP request cannot hold the lock. The refund path
re-acquires it.

---

## Entitlements and Upsell Levers

Roles are `basic`, `pro`, `premium`, `owner` (`models/enums.py:20-25`). Expiry is
lazy — downgraded on read rather than by a cron job
(`redeem_service.py:240-247`, called from `api/redeem.py:50`).

**Lever 1 — account count** (`services/account_service.py:42-47`):

| Role | Accounts |
|---|---|
| `basic` | **1** |
| `pro` | **10** |
| `premium` | **100** |
| `owner` | 999999 |

Enforced by `check_account_limit` (`:50-61`) on every connection route.

**Lever 2 — broadcast metering** (`services/broadcast_entitlement.py`):

| Rule | Value |
|---|---|
| Unrestricted roles | `pro`, `premium`, `owner` (`:31`) |
| Free-tier daily budget | **18 000 s (5 h) of send-time per UTC day** (`:38`) |
| What is charged | `BroadcastLog.details[].send_ms` where `status == "success"` (`:117-124`) |
| What is *not* charged | the configured per-group delay and flood-wait sleeps — deliberately, because "summing it would charge the user for the throttle the product asked for" (`:89-96`) |
| Reset | 00:00 UTC (`:72-75`) |
| Enforcement point | before job creation (`broadcast_service.py:246-248`), never mid-run |

Watermark for free tier: default `"Bot by @{official}"`, `{official}` expands to
`telebos_official` (`:33-40`, `:60-69`). Paid roles are never watermarked.

**Lever 3 — feature gating by role:**

- Auto-reply: `pro+` (`api/accounts.py:694`, `:722`)
- Bulk invites: `pro+` (`api/invite.py:21`, `:36`, `:71`, `:81`, `:93`, `:110`, `:128`, `:145`, `:157`)
- Auto-join: `pro+` (`api/auto_join.py:30`, `:63`, `:72`, `:84`, `:103`, `:123`, `:142`)

SMM ordering and the marketplace are open to **all** roles including `basic`.

---

## Rate Limits and Quotas

Redis sliding-window limiter, **fails open** by default
(`utils/rate_limiter.py:50-53`, `:82-88`). Global default **30 requests / 60 s**
(`config.py:52-53`).

| Scope | Limit | Site |
|---|---|---|
| Order paths | `order:ip`, `order:user` | `api/orders.py:144`, `:149` |
| Mass orders | `order_mass:ip`, `order_mass:user` | `api/orders.py:201`, `:206` |
| Redeem | `redeem:ip`, `redeem:user` | `api/redeem.py:32`, `:34` |
| Photo upload | 10 / 60 s | `api/accounts.py:767` |
| Photo read | 300 / 60 s | `api/accounts.py:820-823` |
| Upload session | 300 / 60 s | `api/public.py:211` |
| WebSocket | 150 / 60 s | `api/ws.py:100`, `:213` |

**No tighter cap exists on ordering or marketplace buying** — both sit at the
global 30/60 s default.

**Input bounds** (`schemas/order.py:22-38`): quantity 1–1 000 000,
`data_target` 1–500, `comments`/`usernames` ≤ 10 000, **mass order ≤ 100 items**.
Provider `min_qty`/`max_qty` are re-validated in the service
(`order_service.py:125-130`, `:233-242`).
**Quantities are rejected, never silently clamped.**

**Idempotency:** `X-Idempotency-Key`, Redis TTL **120 s**
(`api/orders.py:185`, `:252`). Mass-order lookup failure is logged and proceeds
*without* dedup (`:237-245`), which can double-charge.

---

## Deliberate Constraints

Rules that look odd but are intentional, with the reasoning in the source:

1. **Broadcast is metered in send-time, not messages.** The free cap cannot be
   gamed by group count, and the user is never charged for the product's own
   throttling (`broadcast_entitlement.py:89-96`).
2. **`// 1000` per-1000 pricing exists** because SMM panels quote per 1k units
   (`order_service.py:439`). Not a bug, but it floors sub-1000 quantities.
3. **`markup_percent = 0` is falsy**, so a service cannot express a deliberate 0%
   markup while the global markup is positive (`order_service.py:80`).
4. **Buy price is floored at sell price in three independent places** — write
   validation (`user_account_price_service.py:157`), read resolution
   (`:109-117`), and settlement (`marketplace_service.py:490`). Defence in depth
   against negative margin.
5. **`is_mocked` must only come from real mock detection.** An earlier version set
   it inside an `except`, which "silently downgraded the pricing path AND forced
   buy_price == sell_price (zero platform margin)" on any production DB error
   (`marketplace_service.py:154-158`).
6. **Seller is paid only on sale, never on listing** — the listing is a promise,
   not a transaction (`api/marketplace.py:62-64`).
7. **Profile sanitization is forward-only.** Telegram profile changes are
   external side effects: they may remain applied if a later account in the batch
   fails (`marketplace_service.py:104-108`).
8. **`unknown` ≠ `invalid`** for session validation, on purpose
   (`marketplace_service.py:277-283`).
9. **`seller_id` is cleared on purchase** — leaving it made the new owner "look
   like they were still selling it" and kept `cancel_sell` open on a transferred
   account (`:530-535`).
10. **The allowlist is a single source of truth**, imported by both the API and
    service layer so they "can never disagree about what is sellable"
    (`smm_service_ids.py:9-10`). A typo surfaces at order time, not deploy time.
11. **Balance floors at 0 rather than erroring** on admin deduction
    (`api/admin.py:504-505`) — a silent clamp, but backed by the DB constraint.
12. **CSV export prefixes formula characters** to prevent injection when orders
    are opened in Excel (`api/admin_smm.py:250-254`).

---

## Verified Bugs and Revenue Leaks

These I confirmed by reading the source during this audit.

### 1. `get_smm_stats` revenue is always zero — confirmed

```python
select(func.sum(Order.total_price)).where(Order.status == "Success")
```
— `app/services/admin_smm_service.py:499`

`"Success"` **is not a member of `SMMStatus`**
(`models/enums.py:29-37`: `Pending`, `Processing`, `In progress`, `Completed`,
`Partial`, `Failed`, `Canceled`). `place_order` writes `"Pending"`
(`order_service.py:186`) and the mass path writes `"Pending"` or `"Failed"`
(`:294`). No code path ever writes `"Success"`.

**Impact:** the admin SMM revenue figure is structurally 0 regardless of trading
volume.

### 2. No withdrawal path, contradicting the PRD

`PRD.md:109` lists "Top up and withdraw balance" as available to **all** roles.
Top-up exists (voucher redemption). `grep -rn 'withdraw' app/api/*.py` returns
nothing. Balance is a closed system: users can spend but never cash out.

### 3. Marketplace margin has no aggregate reporting

`AccountAuditLog` stores both the sell-side price (`marketplace_service.py:545-553`)
and the buy-side price (`:555-563`), but **nothing sums the difference**. True
marketplace revenue cannot be read from the DB without diffing audit rows per
account — and those rows are `SET NULL`-able on account deletion
(`models/account_audit_log.py:22-24`).

### 4. `is_sold` has no write path

`grep -rn 'is_sold = True' app/` returns nothing. Only the DB migrator's reset sets
it (`database_migrator.py:253`). `buy_account` sets `sold_at` and resets
`is_sold = False` (`marketplace_service.py:526-527`). Meanwhile `is_resale` is
derived from `sold_at is not None` (`:430`) — the flag and the field disagree
semantically.

### 5. Partial SMM fills are never prorated

A `Partial` order's unused remainder is not refunded. Status is only ever
*refreshed* (`order_service.py:379-407`); balance is never adjusted. Whether the
upstream panel auto-refunds is outside this repository.

### 6. Mass-order idempotency can double-charge

If the Redis idempotency lookup fails, the request proceeds without dedup
(`api/orders.py:237-245`).

---

## Dead Code

Present, referenced nowhere:

| Symbol | Site |
|---|---|
| `MIN_MEANINGFUL_SEND_SECONDS = 1.0` | `broadcast_entitlement.py:44` |
| `check_account_hint` | `account_service.py:110-178` — issues a real `send_code_request`; schemas exist (`schemas/account.py:248-256`) but no route calls it |
| `RATE_LIMIT_2FA_MAX` / `_WINDOW` (5 / 300 s) | `config.py:54-55` — the intended 2FA limit is **not enforced** |
| `solver_selftest` | `captcha_solver.py:144-151` — no health check wires it in |
| `session_manager.reconnect_all` | `session_manager.py:665-688` — no caller |
| `sync_all_profiles` | `profile_sync_service.py:181-228` |
| `sync_all_accounts_reg_dates` | `telegram_reg_date_service.py:324` |
| `session_service.get_active_sessions` / `terminate_other_sessions` | `session_service.py` — `api/devices.py` uses `device_service` instead. The unclassified variant also passes **no `hash`** to `ResetAuthorizationRequest`, so it would be broken if wired up |

Consequence: **on startup no bulk reconnect happens.** Auto-reply accounts connect
only via the 30 s health loop or on demand.

---

## Gaps Between PRD and Code

| PRD claim | Reality |
|---|---|
| "Top up and withdraw balance" (`:109`) | Withdrawal does not exist |
| Marketplace has dispute handling (implied by "clear transaction result") | No dispute flow, no refund, no reversal after commit |
| Subscription plans are a product | No price data exists; owner denominations them by hand |
| Free tier "5 hours" broadcast budget | Matches — but `MIN_MEANINGFUL_SEND_SECONDS` suggests a sub-second filter was intended and never wired in |

---

## Open Questions

These cannot be answered from the repository and need an operator decision or a
production DB read.

1. **What do Pro and Premium actually cost?** No price table, no plan SKU, no
   currency conversion anywhere. The public `/pricing` page reads from
   `frontend/src/data/plans.ts`, which was derived from the in-app subscription
   screen — that file is UI copy, not a billing source of truth, and nothing
   charges against it.
2. **What are the live values of `global_markup_percent`, `account_sell_price`,
   and `account_buy_price` in production?** Only code defaults are known
   (`"0"`, 5500, 7000). Actual realized margin cannot be stated without reading
   `smm_settings`.
3. **Does `"Success"` ever appear from the panel?** The enum says `Completed`.
   If the panel really does emit `Success`, `place_order` stores the panel string
   on create; if it normalizes to `Completed`, the revenue query needs updating.
   The panel's real vocabulary is unverifiable here.
4. **Is the 2FA setup path intentionally absent?** `twofa_service.py` is
   read-only (`GetPasswordRequest`); no `UpdatePasswordRequest` anywhere, so
   TeleBos cannot *create* 2FA — `twofa_password` is only ever populated by the
   user typing it during login.
5. **Should post-purchase marketplace reconnect failure trigger a refund?** Today
   it is logged and swallowed (`api/marketplace.py:146-154`).
6. **Is `ENABLE_SPAM_CHECKS` set in production?** Absent from both `.env` and
   `.env.example`, so the sweep runs on the `config.py:78` default `True`.
7. **Sticky routing is assumed, not enforced.** `pending_login_service.py:29-33`
   requires it for multi-worker deployments; nothing detects a missed route, which
   would present as an unexplained 404 from `/verify-code`.
8. **Is the 5-model Groq fallback chain current?** `openai/gpt-oss-20b` and
   `groq/compound-mini` are hardcoded (`appeal_service.py:275-282`); a 404
   advances to the next model, so a fully stale chain degrades silently to the
   hardcoded preset text.

---

## Appendix — Source Files Read

**Firsthand during this audit:** `PRD.md`, `PRODUCT.md`, `CLAUDE.md`,
`services/broadcast_entitlement.py`, `services/order_service.py`,
`services/account_service.py`, `services/marketplace_service.py`,
`services/redeem_service.py`, `api/orders.py`, `api/redeem.py`,
`models/enums.py`, `models/user.py`, `models/redeem_code.py`,
`models/telegram_account.py`, `app/smm_service_ids.py`,
`workers/async_worker.py`, `schedulers/background_tasks.py`, `config.py`,
`docker-compose.yml`.

**Read by delegated deep-dive agents, findings reconciled against the above:**
`services/{marketplace_service,admin_smm_service,user_account_price_service,stats_service,smm_service,session_manager,session_service,telegram_client,twofa_service,twofa_sync_service,pending_login_service,device_service,appeal_service,captcha_solver,profile_sync_service,telegram_reg_date_service,broadcast_service,auto_join_service,invite_service,reaction_service,message_service,forward_service,poll_service,pin_service}.py`,
`api/{accounts,admin,admin_smm,admin_account_prices,marketplace,broadcast,invite,auto_join,reactions,messages,forward,polls,pins,group_admin,chats,media,gifs,stickers,contacts,ws,public,devices,account_folders}.py`,
`bot/{main.py,handlers/*.py}`, `models/*.py`, `schemas/*.py`,
`utils/{rate_limiter,flood_control,device_spoof,phone,account_ownership,telethon_cleanup,telegram_errors,url_security,spambot_helper,telethon_helpers}.py`,
`event_relay.py`, `database_migrator.py`, `.env`, `.env.example`.