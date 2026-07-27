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

## 4. Roles and Entitlements

The current product role vocabulary is `basic`, `pro`, `premium`, and `owner`.

| Capability | Basic | Pro | Premium | Owner |
| --- | :---: | :---: | :---: | :---: |
| Connect and manage accounts | Limited | Yes | Yes | Yes |
| Real-time chats | Yes | Yes | Yes | Yes |
| Contacts and advanced account operations | No | Yes | Yes | Yes |
| Broadcast workflows | Limited | Yes | Yes | Yes |
| Auto-reply and bulk invites | No | Yes | Yes | Yes |
| Marketplace and SMM ordering | Yes | Yes | Yes | Yes |
| Voucher, service, price, and user administration | No | No | No | Yes |

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
