# Product Requirements Document — TeleBos

TeleBos is a professional multi-account Telegram management platform for teams and power users who need centralized account operations, real-time communication, workflow automation, and Telegram-adjacent commercial services.

## Related documents

- Architecture and engineering constraints: [`CLAUDE.md`](CLAUDE.md)
- Security requirements and current controls: [`SECURITY.md`](SECURITY.md)
- Product positioning: [`PRODUCT.md`](PRODUCT.md)
- Visual design system: [`DESIGN.md`](DESIGN.md)

## 1. Product Objective

TeleBos reduces the operational burden of managing many Telegram accounts by providing one web workspace for account lifecycle management, chat operations, controlled automation, and commercial workflows.

### Primary outcomes

1. **Operational efficiency** — users can manage connected Telegram accounts and related workflows without manually operating multiple Telegram clients.
2. **Reliable automation** — broadcasts and invitations provide progress, logs, resumable lifecycle states, account rotation, and adaptive handling of Telegram limits.
3. **Account recovery support** — users can inspect spam status and submit an assisted appeal when Telegram restricts an account.
4. **Integrated commerce** — eligible users can transact through account marketplace, SMM, voucher, balance, and subscription workflows.

## 2. Target Users

- **Telegram marketers** coordinating campaigns across multiple accounts and target communities.
- **Social-media agencies** operating separate client account pools and fulfillment workflows.
- **SMM providers** selling Telegram-oriented services such as membership, views, or reactions.
- **Account brokers and sellers** who need an auditable lifecycle for listing and transferring eligible accounts.

## 3. Functional Requirements

### 3.1 Account lifecycle and controls

Users must be able to:

- connect Telegram accounts through OTP verification or supported session-string import;
- search and filter accounts, organize them into account folders, and see relevant status;
- edit account profile data, profile photo, privacy settings, 2FA, and active Telegram devices;
- monitor account profile changes and refresh relevant data without manually reloading;
- view account-level contacts, groups, channels, and statistics according to their entitlement.

Sensitive Telegram credentials must never be displayed as plaintext after submission. Detailed controls and trust boundaries are specified in `SECURITY.md`.

### 3.2 Chats and real-time communication

Users must be able to select an account, browse its chats, read and search message history, and receive relevant real-time updates. The chat experience must support the operations expected from an account manager, including sending, editing, deleting, scheduling, forwarding, reacting, pinning, voting in polls, media/voice handling, stickers, GIFs, and shared-media access.

Chat lists must keep pinned chats visibly prioritized and refresh ordering when message activity changes. Real-time communication should recover from transient connectivity loss without requiring a full page reload.

### 3.3 Broadcast automation

Users must be able to create reusable target-group lists and text lists, then start a campaign with one or more sending accounts.

A broadcast job must support:

- configurable per-target and post-cycle delays;
- single-text and multi-template selection modes;
- optional looping after all targets are processed;
- account rotation when multiple senders are selected;
- real-time progress and per-target logs;
- pause, resume, cancel, retry, filtering, and export for authorized users.

#### Broadcast lifecycle

```text
pending → running ↔ paused → cancelled / completed / failed
```

Only terminal jobs may be deleted or retried. Looping jobs remain running until cancelled. Interrupted running jobs should resume safely after an application restart when their stored state permits it.

### 3.4 Bulk invitations

Users with the appropriate entitlement must be able to create invitation jobs using source and destination communities, one or more sending accounts, a batch configuration, and safe delays. They must see progress and individual outcomes in real time.

Invitation jobs rotate eligible accounts when configured and log each outcome so users can distinguish limits, privacy restrictions, duplicate membership, and other delivery failures.

### 3.5 Auto-reply

Users must be able to enable a global or per-account automatic reply and configure reply text. The system must avoid repeatedly replying to the same contact and must apply configured cooldown/rate protections.

### 3.6 Spam status and appeals

Users must be able to request a SpamBot-based status check and see a comprehensible result. For supported restricted states, users may choose a prepared AI-assisted reason or enter a custom reason before submitting an appeal. If a challenge cannot be completed automatically, the product must present an actionable manual path instead of silently failing.

### 3.7 SMM, marketplace, orders, vouchers, and subscriptions

The platform must support:

- browsing, pricing, creating, and tracking SMM orders when balance and entitlement permit;
- listing eligible Telegram accounts for sale and purchasing available accounts with a clear transaction result;
- retaining an audit trail for marketplace transfers and redemption activity;
- redeeming balance or subscription vouchers;
- administrating services, price rules, vouchers, and relevant order/user data through owner-only controls.

When an account is listed for sale, the seller's automation activity and personally identifying profile presentation must be cleared or made safe before transfer. A buyer must not receive a stale seller configuration as part of the expected marketplace experience.

### 3.8 Wallet, payment gateway (KlikQRIS), and withdrawals

The platform must support:

- **Automated dynamic QRIS deposits:** Integration with the KlikQRIS payment gateway generating dynamic, time-bounded QRIS invoices and QR payloads with real-time payment status polling.
- **HMAC-verified webhook callbacks:** Secure payment confirmation via `POST /api/v1/wallet/webhook/klikqris`, validating HMAC-SHA256 signatures, checking idempotency, and crediting balances atomically.
- **Double-entry ledger journaling:** Every balance credit, debit, or refund is recorded in an immutable append-only ledger (`wallet_ledgers`) protected against deletion (`ON DELETE RESTRICT`).
- **Withdrawals with 2FA OTP:** User fund withdrawals protected by email one-time passwords (OTP) and destination bank/e-wallet accounts encrypted at rest (`user_bank_accounts`).
- **Administrative audit & settlement:** Owner workflows for approving or rejecting withdrawal requests, with automated ledger refunding on rejected disbursements.

## 4. Roles and Entitlements

The product defines a unified commercial and technical tier structure where commercial plans map directly to database role primitives:

**Naming Structure:** `Free Trial` (`freetrial`) → `Starter` (`basic`) → `Pro` (`pro`) → `Business` (`premium`) → `Owner Access` (`owner`).

The canonical product role hierarchy is `freetrial` < `basic` < `pro` < `premium` < `owner`.

### 4.1 Free Trial Policy (5-Hour Anti-Abuse Window)

- **Initial Tier & Auto-Provisioning:** Every new user account is automatically assigned the `freetrial` role upon registration via the Better Auth creation hook.
- **5-Hour Lifetime Invariant:** The trial duration is strictly set to **5 hours** from registration (`subscription_expires_at = NOW() + INTERVAL '5 hours'`). This bounded window acts as an essential platform anti-abuse defense, preventing automated disposable bot accounts from exploiting cloud broadcast queues and proxy bandwidth without commercial commitment.
- **Trial Scope:** Users during the 5-hour trial can connect 1 Telegram account, test real-time direct chats, and evaluate the auto-reply responder engine. Heavy mass automation (broadcast campaigns, auto-join queues, bulk invitation) is gated and requires upgrading to `basic` (Starter), `pro` (Pro), or `premium` (Business).
- **Expiration & Downgrade Behavior:** When the 5-hour trial expires (`subscription_expires_at < NOW()`), active automation is suspended until an upgrade is completed. Similarly, when a paid subscription (`basic`, `pro`, `premium`) expires without renewal, the system automatically downgrades the role back to `freetrial` (`services/redeem_service.py:344`).

### 4.2 Entitlements & Pricing Matrix

Reference specification: `docs/subscription_plans_monthly_yearly.md` and `frontend/src/data/plans.ts`.

| Dimension / Capability | Free Trial (`freetrial`) | Starter (`basic`) | Pro (`pro`) | Business (`premium`) | Owner (`owner`) |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Monthly Price** | Gratis | Rp5.000/bulan | Rp10.000/bulan | Rp20.000/bulan | Internal |
| **Yearly Price (Hemat 16,7%)** | — | Rp50.000/tahun | Rp100.000/tahun | Rp200.000/tahun | Internal |
| **Yearly Equivalent** | — | Rp4.167/bulan | Rp8.333/bulan | Rp16.667/bulan | Internal |
| **Connected Accounts** | 1 Account | 1 Account | Up to 3 | Up to 5 | Unlimited |
| **Broadcast Watermark** | ✅ Ya | ✅ Ya | ❌ Tidak | ❌ Tidak | ❌ Tidak |
| **Age Checker** | ❌ Tidak | ❌ Tidak | ✅ Ya | ✅ Ya | ✅ Ya |
| **Public Index Groups & Channels** | ❌ Tidak | ❌ Tidak | ✅ Ya | ✅ Ya | ✅ Ya |
| **Auto Join Groups & Channels** | ❌ Tidak | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya |
| **Auto Reply Responder** | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya |
| **Member Inviter & Scraping** | ❌ Tidak | ❌ Tidak | ✅ Ya | ✅ Ya | ✅ Ya |
| **Real-time Chats & Obrolan** | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya |
| **Contacts & VCF Export/Import** | ❌ Tidak | ❌ Tidak | ✅ Ya | ✅ Ya | ✅ Ya |
| **Marketplace & SMM Ordering** | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya |
| **Top Up & Withdraw Balance** | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya | ✅ Ya |
| **System & User Administration** | ❌ Tidak | ❌ Tidak | ❌ Tidak | ❌ Tidak | ✅ Ya |

### Broadcast free-tier rules

Accounts on the `basic` (Starter) plan broadcast under two additional constraints, both
owner-configurable:

- **Watermark.** Every outgoing message is stamped with the configured
  watermark template. The default resolves `{official}` to the official
  channel handle. Paid roles (`pro`, `premium`) are never watermarked.
- **Daily send-time budget.** The free tier may consume a bounded amount of
  broadcast send time per UTC day (5 hours by default). Only time actually
  spent delivering a message is charged, so configured delays and flood-wait
  backoff do not consume the budget. The budget is refused at job start, with
  an explanation, rather than failing mid-run.

### Marketplace pricing

Account pricing is configured per `telegram_id` prefix, with both sides of the
trade set together: `sell_price` (what the seller receives) and `buy_price`
(what the buyer pays). The difference is the platform margin. The longest
matching prefix wins, and the global prices act only as fallbacks. A listing
stores its resolved prices, so an administrative price change never reprices an
account that is already on the market, and the buy price is never allowed to
fall below the sell price.

### Account transfer safety

Before an account is listed, every Telegram session other than the one TeleBos
drives is revoked, so a seller cannot retain access after the sale. If Telegram
refuses the revocation, the listing is aborted rather than completed.

This table is the product entitlement target. Source-verified authorization controls and any implementation gaps are owned by `SECURITY.md`.

## 5. Nonfunctional Requirements

### Reliability and job safety

- Long-running broadcast and invitation workflows must not crash the user experience when Telegram returns temporary limits or a transient network failure occurs.
- Users must receive timely state/progress feedback for active jobs.
- Automation must favor safe throttling and explain failure classifications in logs.

### Real-time experience

- Relevant new messages, edits, activity changes, job progress, and profile updates should reach connected clients promptly.
- A transient socket interruption should reconnect automatically and restore an operable UI.

### Data protection

- Telegram session strings and 2FA credentials are encrypted at rest.
- Account-scoped actions must observe authenticated ownership boundaries except where a route is explicitly documented as public.
- Secrets must be supplied through environment configuration and never committed.

### Localization and accessibility

- Every user-facing feature must provide English and Indonesian copy.
- User interfaces must follow the accessibility and design requirements in `DESIGN.md`.

## 6. Acceptance Criteria

TeleBos meets the initial product baseline when:

1. connected-account actions are available only to the appropriate authenticated user and supported role;
2. a broadcast or invitation job produces observable progress and durable per-target outcomes without crashing on recoverable Telegram errors;
3. Telegram-sensitive values are persisted encrypted rather than plaintext;
4. real-time chat and job updates reach the interface without a manual refresh under normal connectivity;
5. marketplace and SMM actions reject insufficient balance without partially applying a transaction;
6. a spam appeal either completes, reports a meaningful outcome, or presents a manual challenge path;
7. all user-facing additions ship with English and Indonesian translations and conform to the design system.
