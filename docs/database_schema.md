# TeleBos Database Schema Documentation

**Target Database:** PostgreSQL 16 (via `asyncpg` & SQLAlchemy 2.0 Async Engine) + Better Auth (Next.js)  
**Terakhir Diperbarui:** September 2026  
**Status Schema:** Production (29 Tabel: 6 Better Auth + 23 Core Application)

---

## 1. Arsitektur Basis Data & Ringkasan

Persistensi data TeleBos dibagi menjadi dua layer utama:
1. **Layer Autentikasi (Better Auth)**: Mengelola kredensial web, sesi login, 2FA (TOTP), dan rate limiting. Dikelola melalui DDL migrasi idempotent di [`frontend/setup-db.mjs`](file:///d:/PROJECT/Telegram/TeleBos/frontend/setup-db.mjs) dan database hooks di [`frontend/src/lib/auth.ts`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/auth.ts).
2. **Layer Domain Aplikasi (FastAPI / SQLAlchemy)**: Mengelola akun Telegram, sesi Telethon, otomatisasi broadcast/invite, order marketplace/SMM, daftar kontak/teks, dan billing. Model didefinisikan di [`backend/app/models/`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models) dan dimigrasikan via Alembic ([`backend/alembic/`](file:///d:/PROJECT/Telegram/TeleBos/backend/alembic)) serta migrator runtime [`backend/app/database_migrator.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/database_migrator.py).

### Dual User Model: `"user"` (Better Auth) vs `users` (App)
* Tabel `"user"` menyimpan data autentikasi Next.js (`id` tipe `TEXT`, berformat UUID string).
* Tabel `users` menyimpan profil bisnis aplikasi (`id` tipe `UUID`, `balance`, `role`, `subscription_expires_at`).
* **Relasi:** 1-to-1 secara logis di mana `users.id == UUID("user".id)`. Backend FastAPI memvalidasi token sesi melalui tabel `session` lalu memetakan `session."userId"` ke `users.id`.

---

## 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    %% Auth Domain
    USER["user (Better Auth)"] ||--o{ SESSION["session"] : "has"
    USER ||--o{ ACCOUNT["account (Credentials)"] : "has"
    USER ||--o| TWO_FACTOR["twoFactor (TOTP)"] : "configures"

    %% App Domain
    USERS["users (App Profile)"] ||--o{ TELEGRAM_ACCOUNTS["telegram_accounts"] : "owns"
    USERS ||--o{ ORDERS["orders"] : "places"
    USERS ||--o{ BROADCAST_JOBS["broadcast_jobs"] : "creates"
    USERS ||--o{ INVITE_JOBS["invite_jobs"] : "creates"
    USERS ||--o{ GROUP_LISTS["group_lists"] : "owns"
    USERS ||--o{ TEXT_LISTS["text_lists"] : "owns"
    USERS ||--o{ ACCOUNT_FOLDERS["account_folders"] : "creates"
    USERS ||--o{ API_KEYS["api_keys"] : "owns"
    USERS ||--o{ NOTIFICATIONS["notifications"] : "receives"
    USERS ||--o{ REDEEM_LOGS["redeem_logs"] : "claims"

    %% Telegram Accounts & Chats
    TELEGRAM_ACCOUNTS ||--o{ TELEGRAM_CHATS["telegram_chats"] : "caches"
    TELEGRAM_ACCOUNTS ||--o{ CHAT_FOLDERS["chat_folders"] : "has"
    TELEGRAM_ACCOUNTS ||--o{ AUTO_REPLY_LOGS["auto_reply_logs"] : "records"
    TELEGRAM_ACCOUNTS ||--o{ ACCOUNT_AUDIT_LOGS["account_audit_logs"] : "logs"
    TELEGRAM_ACCOUNTS }o--o{ ACCOUNT_FOLDER_MEMBERS["account_folder_members"] : "categorized in"
    ACCOUNT_FOLDERS ||--o{ ACCOUNT_FOLDER_MEMBERS : "contains"

    %% Broadcast & Invite Jobs
    BROADCAST_JOBS ||--o{ BROADCAST_LOGS["broadcast_logs"] : "produces"
    BROADCAST_JOBS }o--o| GROUP_LISTS : "targets"
    BROADCAST_JOBS }o--o| TEXT_LISTS : "sends"
    INVITE_JOBS ||--o{ INVITE_LOGS["invite_logs"] : "produces"

    %% Monetization & Marketplace
    REDEEM_CODES["redeem_codes"] ||--o{ REDEEM_LOGS : "tracks"
    ORDERS }o--o| SMM_SERVICES["smm_services"] : "references"
```

---

## 3. Kamus Data Lengkap (Data Dictionary)

### Domain A: Autentikasi & Sesi (Better Auth)

#### 1. `"user"`
Tabel profil otentikasi Better Auth di Next.js.
* **File Referensi:** [`frontend/setup-db.mjs`](file:///d:/PROJECT/Telegram/TeleBos/frontend/setup-db.mjs)
* **Primary Key:** `id` (TEXT)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `TEXT` | ❌ | - | UUID string unik dari Better Auth |
| `name` | `TEXT` | ❌ | - | Nama lengkap user |
| `email` | `TEXT` | ❌ | - | Email unik untuk login |
| `emailVerified` | `BOOLEAN` | ❌ | `FALSE` | Status verifikasi email |
| `image` | `TEXT` | ✔️ | `NULL` | Avatar URL |
| `twoFactorEnabled` | `BOOLEAN` | ❌ | `FALSE` | Status aktif 2FA TOTP |
| `failedLoginAttempts` | `INTEGER` | ❌ | `0` | Counter brute force login |
| `lockedUntil` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu kunci akun jika kena lockout |
| `lastFailedLoginAt` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu percobaan login gagal terakhir |
| `createdAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp pembuatan akun |
| `updatedAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp update akun |

* **Constraints & Indexes:**
  - `PRIMARY KEY (id)`
  - `UNIQUE (email)`

---

#### 2. `"session"`
Tabel session token aktif.
* **Primary Key:** `id` (TEXT)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `TEXT` | ❌ | - | Session identifier |
| `expiresAt` | `TIMESTAMPTZ` | ❌ | - | Masa berlaku token sesi |
| `token` | `TEXT` | ❌ | - | Plaintext session token |
| `token_hash` | `TEXT` | ✔️ | `NULL` | SHA-256 hash dari token (digunakan backend FastAPI) |
| `ipAddress` | `TEXT` | ✔️ | `NULL` | IP address klien saat sesi dibuat |
| `userAgent` | `TEXT` | ✔️ | `NULL` | User Agent browser klien |
| `userId` | `TEXT` | ❌ | - | FK ke `"user".id` (`ON DELETE CASCADE`) |
| `createdAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu login |
| `updatedAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu aktivitas terakhir |

* **Constraints & Indexes:**
  - `FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`
  - `UNIQUE (token)`
  - `INDEX idx_session_userId ("userId")`
  - `INDEX idx_session_token_hash (token_hash)`

---

#### 3. `"account"`
Penyimpan kredensial otentikasi (Password / OAuth Provider).
* **Primary Key:** `id` (TEXT)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `TEXT` | ❌ | - | Identifier kredensial |
| `accountId` | `TEXT` | ❌ | - | ID dari provider (atau ID user jika credential) |
| `providerId` | `TEXT` | ❌ | - | Nama provider (`credential`, `google`, dll.) |
| `userId` | `TEXT` | ❌ | - | FK ke `"user".id` (`ON DELETE CASCADE`) |
| `password` | `TEXT` | ✔️ | `NULL` | Scrypt/Bcrypt password hash |
| `accessToken` | `TEXT` | ✔️ | `NULL` | OAuth token |
| `refreshToken` | `TEXT` | ✔️ | `NULL` | OAuth refresh token |
| `idToken` | `TEXT` | ✔️ | `NULL` | OpenID ID Token |
| `accessTokenExpiresAt` | `TIMESTAMPTZ` | ✔️ | `NULL` | Expiry OAuth access token |
| `refreshTokenExpiresAt` | `TIMESTAMPTZ` | ✔️ | `NULL` | Expiry OAuth refresh token |
| `scope` | `TEXT` | ✔️ | `NULL` | OAuth permissions |
| `createdAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp dibuat |
| `updatedAt` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp diperbarui |

* **Constraints & Indexes:**
  - `FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`
  - `INDEX idx_account_userId ("userId")`

---

#### 4. `"verification"` & `"twoFactor"` & `"rateLimit"`
* **`verification`**: Tabel verifikasi email (`id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`).
* **`twoFactor`**: Tabel plugin Better Auth 2FA (`id`, `secret`, `backupCodes`, `userId` FK, `verified`, `createdAt`, `updatedAt`).
* **`rateLimit`**: Tabel in-database rate limiter Better Auth (`id`, `key` UNIQUE, `count`, `lastRequest`).

---

### Domain B: Pengguna & Profil Aplikasi (App Domain)

#### 5. `users`
Tabel profil aplikasi TeleBos untuk transaksi, saldo, lisensi, dan role.
* **File Referensi:** [`backend/app/models/user.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/user.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | User ID (sama dengan `"user".id` Better Auth) |
| `email` | `VARCHAR(255)` | ❌ | - | Alamat email terdaftar |
| `password_hash` | `VARCHAR(255)` | ✔️ | `NULL` | Legacy password hash (fallback) |
| `full_name` | `VARCHAR(255)` | ✔️ | `NULL` | Nama lengkap tampilan |
| `is_active` | `BOOLEAN` | ❌ | `TRUE` | Status aktif user |
| `role` | `VARCHAR(20)` | ❌ | `'basic'` | Role: `basic`, `pro`, `premium`, `owner` |
| `balance` | `BIGINT` / `INTEGER` | ❌ | `0` | Saldo kredit aplikasi (Rupiah/Poin) |
| `subscription_expires_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Expiry langganan paket berbayar |
| `telegram_chat_id` | `BIGINT` | ✔️ | `NULL` | Chat ID Telegram untuk notifikasi bot |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp pembuatan |
| `updated_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Timestamp perubahan |

* **Constraints & Indexes:**
  - `PRIMARY KEY (id)`
  - `UNIQUE (email)`
  - `UNIQUE (telegram_chat_id)`
  - `CHECK (balance >= 0)` (name: `chk_user_balance_positive`)
  - `INDEX ix_users_email (email)`

---

#### 6. `api_keys`
API Keys untuk integrasi REST server-to-server pihak ketiga.
* **File Referensi:** [`backend/app/models/api_key.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/api_key.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Primary Key |
| `user_id` | `UUID` | ❌ | - | FK ke `users.id` (`ON DELETE CASCADE`) |
| `name` | `VARCHAR(100)` | ❌ | - | Label nama API Key |
| `key_prefix` | `VARCHAR(32)` | ❌ | - | 8-12 karakter awal API Key |
| `key_hash` | `VARCHAR(64)` | ❌ | - | SHA-256 hash dari secret key |
| `scopes` | `JSONB` | ❌ | `'[]'::jsonb` | Daftar permission/scopes |
| `expires_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Masa kadaluarsa key |
| `revoked_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu pencabutan key |
| `last_used_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu request terakhir |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu pembuatan |
| `created_from_ip`| `VARCHAR(64)` | ✔️ | `NULL` | IP address pembuat key |

* **Constraints & Indexes:**
  - `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  - `UNIQUE (key_hash)`
  - `INDEX ix_api_keys_key_hash (key_hash)`
  - `INDEX ix_api_keys_key_prefix (key_prefix)`
  - `INDEX ix_api_keys_user_id (user_id)`

---

#### 7. `notifications`
Notifikasi in-app untuk pengguna (order selesai, akun terlogout, broadcast selesai).
* **File Referensi:** [`backend/app/models/notification.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/notification.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Notification ID |
| `user_id` | `UUID` | ❌ | - | FK ke `users.id` (`ON DELETE CASCADE`) |
| `event` | `VARCHAR(80)` | ❌ | - | Tipe event (misal: `order_completed`, `account_banned`) |
| `kind` | `VARCHAR(16)` | ❌ | `'info'` | Level: `info`, `warning`, `error`, `success` |
| `data` | `JSONB` | ❌ | `'{}'::jsonb` | Payload detail notifikasi |
| `href` | `VARCHAR(255)` | ✔️ | `NULL` | Link redirect di aplikasi frontend |
| `read_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu dibaca (NULL jika unread) |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu trigger notifikasi |

* **Indexes:**
  - `INDEX ix_notifications_user_created_at (user_id, created_at)`
  - `PARTIAL INDEX ix_notifications_user_unread (user_id) WHERE (read_at IS NULL)`

---

### Domain C: Akun Telegram & Komunikasi

#### 8. `telegram_accounts`
Penyimpanan sesi Telethon MTProto terenkripsi dan metadata akun Telegram.
* **File Referensi:** [`backend/app/models/telegram_account.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/telegram_account.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Account UUID |
| `user_id` | `UUID` | ❌ | - | FK ke `users.id` (`ON DELETE CASCADE`) |
| `phone` | `VARCHAR(20)` | ❌ | - | Nomor telepon akun (format internasional) |
| `telegram_id` | `BIGINT` | ✔️ | `NULL` | ID unik pengguna di Telegram |
| `session_string` | `TEXT` | ❌ | `""` | Telethon string session terenkripsi AES-GCM |
| `twofa_password` | `TEXT` | ❌ | `""` | Password 2FA cloud password terenkripsi |
| `first_name` | `VARCHAR(255)` | ✔️ | `NULL` | Nama depan |
| `last_name` | `VARCHAR(255)` | ✔️ | `NULL` | Nama belakang |
| `username` | `VARCHAR(255)` | ✔️ | `NULL` | Username `@handle` |
| `bio` | `TEXT` | ✔️ | `NULL` | Biografi akun |
| `profile_photo_path`| `VARCHAR(500)`| ✔️ | `NULL` | Path file lokal foto profil |
| `profile_photo_id` | `BIGINT` | ✔️ | `NULL` | Telegram photo ID |
| `photo_version` | `BIGINT` | ❌ | `0` | Versi foto untuk cache busting |
| `color_id` | `INTEGER` | ✔️ | `NULL` | ID warna avatar Telegram |
| `phone_verified` | `BOOLEAN` | ❌ | `FALSE` | Status validitas nomor |
| `twofa_enabled` | `BOOLEAN` | ❌ | `FALSE` | Apakah 2FA Telegram aktif |
| `twofa_has_recovery`| `BOOLEAN` | ✔️ | `NULL` | Status email pemulihan 2FA |
| `twofa_hint` | `VARCHAR(255)` | ✔️ | `NULL` | Hint password 2FA |
| `is_active` | `BOOLEAN` | ❌ | `TRUE` | Status aktif/login di client |
| `last_sync_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu sync terakhir ke server Telegram |
| `pts` | `BIGINT` | ✔️ | `NULL` | Persistent updates state (Peer Updates) |
| `qts` | `BIGINT` | ✔️ | `NULL` | Persistent updates state (Chat Updates) |
| `contacts_count` | `BIGINT` | ❌ | `0` | Jumlah kontak buku telepon |
| `total_groups` | `BIGINT` | ❌ | `0` | Jumlah grup yang diikuti |
| `owned_groups` | `BIGINT` | ❌ | `0` | Jumlah grup yang dimiliki sendiri |
| `total_channels` | `BIGINT` | ❌ | `0` | Jumlah channel yang diikuti |
| `owned_channels` | `BIGINT` | ❌ | `0` | Jumlah channel yang dimiliki sendiri |
| `spam_status` | `VARCHAR(50)` | ✔️ | `'unknown'` | Status SpamBot (`free`, `limited`, `unknown`) |
| `spam_detail` | `TEXT` | ✔️ | `NULL` | Respon teks detail dari SpamBot |
| `spam_last_checked_at`| `TIMESTAMPTZ`| ✔️ | `NULL` | Waktu check status spam terakhir |
| `for_sale` | `BOOLEAN` | ❌ | `FALSE` | Apakah akun dijual di marketplace |
| `is_sold` | `BOOLEAN` | ❌ | `FALSE` | Apakah akun sudah laku terjual |
| `sell_price` | `BIGINT` | ✔️ | `NULL` | Harga jual akun di marketplace |
| `seller_id` | `UUID` | ✔️ | `NULL` | FK ke `users.id` penjual (`ON DELETE SET NULL`) |
| `sold_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu transaksi pembelian selesai |
| `sale_listed_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu akun dimasukkan ke marketplace |
| `recovery_email` | `VARCHAR(255)` | ✔️ | `NULL` | Email login/recovery |
| `auto_reply_enabled`| `BOOLEAN` | ❌ | `FALSE` | Status aktif fitur auto reply pesan masuk |
| `auto_reply_text` | `TEXT` | ✔️ | `NULL` | Teks template auto reply |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu penambahan akun |
| `updated_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu update metadata |

* **Constraints & Indexes:**
  - `PRIMARY KEY (id)`
  - `UNIQUE (phone)` (name: `uq_telegram_account_phone`)
  - `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  - `FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL`
  - `INDEX ix_telegram_accounts_active_sync (is_active, last_sync_at)`
  - `INDEX ix_telegram_accounts_for_sale (for_sale)`

---

#### 9. `telegram_chats`
Cache percakapan dialog, grup, supergrup, dan channel akun Telegram.
* **File Referensi:** [`backend/app/models/telegram_chat.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/telegram_chat.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Chat row ID |
| `account_id` | `UUID` | ❌ | - | FK ke `telegram_accounts.id` (`ON DELETE CASCADE`) |
| `chat_id` | `BIGINT` | ❌ | - | Telegram Chat ID / Channel ID |
| `title` | `VARCHAR(255)` | ❌ | - | Judul chat / nama pengguna / nama grup |
| `username` | `VARCHAR(255)` | ✔️ | `NULL` | `@username` jika publik |
| `type` | `VARCHAR(50)` | ❌ | - | `group`, `supergroup`, `channel`, `user`, `bot` |
| `unread_count` | `INTEGER` | ❌ | `0` | Jumlah pesan belum terbaca |
| `last_message` | `TEXT` | ✔ | `NULL` | Cuplikan pesan terakhir |
| `last_message_date`| `TIMESTAMPTZ`| ✔️ | `NULL` | Waktu pesan terakhir |
| `photo_url` | `VARCHAR(500)` | ✔️ | `NULL` | Path avatar chat |
| `access_hash` | `BIGINT` | ✔️ | `NULL` | Telegram Access Hash MTProto |
| `is_active` | `BOOLEAN` | ❌ | `TRUE` | Status aktif percakapan |
| `is_creator` | `BOOLEAN` | ❌ | `FALSE` | Apakah akun ini owner/pembuat chat |
| `is_archived` | `BOOLEAN` | ❌ | `FALSE` | Apakah chat diarsipkan |
| `is_muted` | `BOOLEAN` | ❌ | `FALSE` | Apakah notifikasi di-mute |
| `is_pinned` | `BOOLEAN` | ❌ | `FALSE` | Apakah chat disematkan |
| `member_count` | `INTEGER` | ✔️ | `NULL` | Jumlah anggota (untuk grup/channel) |
| `online_count` | `INTEGER` | ✔️ | `NULL` | Anggota online saat sinkronisasi |
| `invite_link` | `VARCHAR(500)` | ✔️ | `NULL` | Link undangan percakapan |
| `color_id` | `INTEGER` | ✔️ | `NULL` | Kode warna profil chat |
| `photo_version` | `BIGINT` | ✔️ | `NULL` | Versi foto profil |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu sinkronisasi awal |
| `updated_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu sinkronisasi terakhir |

* **Constraints & Indexes:**
  - `UNIQUE (account_id, chat_id)` (name: `uq_telegram_chat_account_chat`)
  - `INDEX ix_telegram_chats_account_id (account_id)`
  - `INDEX ix_telegram_chats_chat_id (chat_id)`

---

#### 10. `account_folders` & `account_folder_members`
Pengorganisasian akun Telegram ke dalam folder buatan user (relasi Many-to-Many).
* **`account_folders`**: (`id`, `user_id` FK, `name`, `created_at`, `updated_at`).
* **`account_folder_members`**: (`id`, `folder_id` FK ke `account_folders.id`, `account_id` FK ke `telegram_accounts.id`, `UNIQUE (folder_id, account_id)`).

#### 11. `chat_folders`
Sinkronisasi folder chat bawaan Telegram per akun.
* **Kolom:** `id`, `account_id` FK, `folder_id`, `title`, `emoji`, `color`, `included_chat_ids` (JSONB), `excluded_chat_ids` (JSONB), `pinned_chat_ids` (JSONB).

#### 12. `auto_reply_logs` & `account_audit_logs`
* **`auto_reply_logs`**: Mencegah pembalasan pesan ganda (`id`, `account_id` FK, `sender_id`, `replied_at`, `UNIQUE (account_id, sender_id)`).
* **`account_audit_logs`**: Riwayat jual-beli akun (`id`, `user_id` FK, `account_id` FK, `action`, `price`, `phone`, `telegram_id`, `created_at`).

---

### Domain D: Otomasi (Broadcasting & Inviting)

#### 13. `broadcast_jobs`
Job eksekusi pengiriman pesan masal terjadwal / berulang.
* **File Referensi:** [`backend/app/models/broadcast_job.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/broadcast_job.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Broadcast Job ID |
| `user_id` | `UUID` | ❌ | - | FK ke `users.id` (`ON DELETE CASCADE`) |
| `account_ids` | `JSONB` | ❌ | `'[]'::jsonb` | Array ID akun Telegram yang dipakai blast (rotasi) |
| `group_list_id` | `UUID` | ✔️ | `NULL` | FK ke `group_lists.id` (`ON DELETE SET NULL`) |
| `text_list_id` | `UUID` | ✔️ | `NULL` | FK ke `text_lists.id` (`ON DELETE SET NULL`) |
| `mode` | `VARCHAR(20)` | ❌ | `'single_text'` | Mode pesan: `single_text`, `random_text`, `spintax` |
| `custom_text` | `TEXT` | ✔️ | `NULL` | Teks langsung (jika tidak pakai `text_list_id`) |
| `status` | `VARCHAR(20)` | ❌ | `'pending'` | Enum: `pending`, `running`, `paused`, `completed`, `cancelled`, `failed` |
| `progress` | `INTEGER` | ❌ | `0` | Persentase progres (0-100) |
| `total_groups` | `INTEGER` | ❌ | `0` | Total target grup yang akan diblast |
| `sent_count` | `INTEGER` | ❌ | `0` | Jumlah pesan sukses terkirim |
| `fail_count` | `INTEGER` | ❌ | `0` | Jumlah pesan gagal terkirim |
| `delay_per_group` | `INTEGER` | ❌ | `5` | Jeda antar target (detik) |
| `delay_after_all` | `INTEGER` | ❌ | `0` | Jeda setelah satu putaran selesai (detik) |
| `loop_enabled` | `BOOLEAN` | ❌ | `TRUE` | Mode looping (berputar terus) |
| `delay_randomized`| `BOOLEAN` | ❌ | `FALSE` | Pengacakan delay (anti flood-ban) |
| `log_destination` | `VARCHAR(255)`| ✔️ | `NULL` | Forwarding log real-time ke grup Telegram |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu pembuatan job |
| `updated_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu status update |
| `completed_at` | `TIMESTAMPTZ` | ✔️ | `NULL` | Waktu job selesai/berhenti |

* **Constraints & Indexes:**
  - `INDEX ix_broadcast_jobs_user_id_status (user_id, status)`
  - `INDEX ix_broadcast_jobs_status (status)`

---

#### 14. `broadcast_logs`
Detail log pengiriman per target grup.
* **Kolom:** `id`, `job_id` FK (`ON DELETE CASCADE`), `account_id_used` FK, `cycle_number` (INT), `group_identifier` (TEXT), `group_id` (BIGINT), `status` (`success`/`error`), `error_type`, `error_message`, `sent_text`, `sent_at`, `duration_ms`.
* **Index:** `INDEX ix_broadcast_logs_job_sent (job_id, sent_at)`.

---

#### 15. `invite_jobs` & `invite_logs`
* **`invite_jobs`**: Job migrasi/scrape & invite member masal (`id`, `user_id` FK, `account_ids` JSONB, `destination_group`, `destination_type`, `source_groups` JSONB, `status`, `total_members`, `invited_count`, `already_member_count`, `fail_count`, `skip_count`, `delay_per_invite`, `delay_per_batch`, `batch_size`).
* **`invite_logs`**: Log status per member yang diinvite (`id`, `job_id` FK, `user_id_tg`, `username`, `first_name`, `source_group`, `status`, `error_type`, `error_message`, `invited_at`, `account_id_used` FK).
* **Indexes:** `(job_id, invited_at)`, `(job_id, user_id_tg)`, `(job_id, status)`.

---

#### 16. `group_lists` & `text_lists`
Resource repository target dan template pesan:
* **`group_lists`**: (`id`, `user_id` FK, `name`, `items` JSONB array `[{"type": "link", "value": "..."}]`).
* **`text_lists`**: (`id`, `user_id` FK, `name`, `texts` JSONB array string `["pesan 1", "pesan 2"]`).

---

### Domain E: Marketplace, SMM Panel, & Billing

#### 17. `orders`
Transaksi pembelian layanan BuzzerPanel SMM atau akun Telegram.
* **File Referensi:** [`backend/app/models/order.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/models/order.py)
* **Primary Key:** `id` (UUID)

| Kolom | Tipe Data | Nullable | Default | Deskripsi |
| --- | --- | :---: | --- | --- |
| `id` | `UUID` | ❌ | `uuid.uuid4` | Order ID |
| `user_id` | `UUID` | ❌ | - | FK ke `users.id` |
| `smm_order_id` | `VARCHAR(50)` | ✔️ | `NULL` | ID order di panel upstream (BuzzerPanel) |
| `service_id` | `INTEGER` | ❌ | - | ID layanan SMM |
| `service_name` | `VARCHAR(255)` | ❌ | - | Nama layanan |
| `category` | `VARCHAR(100)` | ❌ | - | Kategori layanan |
| `data_target` | `TEXT` | ❌ | - | Target pesanan (Link grup/channel/post/username) |
| `quantity` | `BIGINT` | ❌ | `1` | Jumlah kuantitas pesanan |
| `price` | `BIGINT` | ❌ | `0` | Harga satuan |
| `total_price` | `BIGINT` | ❌ | `0` | Total biaya didebet dari saldo user |
| `status` | `VARCHAR(50)` | ❌ | `'Pending'` | Status: `Pending`, `Processing`, `In progress`, `Completed`, `Partial`, `Canceled`, `Failed` |
| `start_count` | `INTEGER` | ✔️ | `NULL` | Jumlah follower/member awal sebelum order |
| `remains` | `INTEGER` | ✔️ | `NULL` | Jumlah sisa pesanan yang belum terkirim |
| `is_mass_order` | `BOOLEAN` | ❌ | `FALSE` | Apakah bagian dari mass order |
| `mass_parent_id`| `UUID` | ✔️ | `NULL` | ID parent jika mass order |
| `note` | `TEXT` | ✔️ | `NULL` | Catatan pesanan |
| `created_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu transaksi dibuat |
| `updated_at` | `TIMESTAMPTZ` | ❌ | `NOW()` | Waktu update status |

* **Constraints & Indexes:**
  - `INDEX ix_orders_user_id_status (user_id, status)`
  - `INDEX ix_orders_smm_order_id (smm_order_id)`

---

#### 18. `smm_services` & `smm_settings`
* **`smm_services`**: Cache katalog layanan upstream (`id` = upstream service ID, `service_name`, `category`, `original_price`, `selling_price`, `min_qty`, `max_qty`, `is_active`, `is_visible`, `markup_percent`).
* **`smm_settings`**: Konfigurasi global Key-Value SMM (`key` VARCHAR(100) PK, `value` TEXT).

---

#### 19. `redeem_codes` & `redeem_logs`
Sistem voucher topup saldo atau upgrade subscription:
* **`redeem_codes`**: (`id`, `code` UNIQUE, `code_type` (`balance`/`subscription`), `plan` (`pro`/`premium`), `amount`, `max_uses`, `used_count`, `duration_days`, `expires_at`, `is_active`, `created_by` FK ke `users.id`).
* **`redeem_logs`**: Catatan klaim voucher (`id`, `code_id` FK, `user_id` FK, `detail`, `redeemed_at`).

---

#### 20. `telegram_id_prefix_prices` & `telegram_registration_datapoints`
* **`telegram_id_prefix_prices`**: Penyesuaian harga akun otomatis berdasarkan awalan angka ID Telegram (`id`, `id_prefix` UNIQUE, `sell_price`, `note`).
* **`telegram_registration_datapoints`**: Titik regresi estimasi umur akun Telegram (`telegram_id` PK, `registered_at`, `source`, `created_at`).

---

## 4. Konvensi Tipe Data & Standarisasi

1. **Primary Key**:
   - Seluruh tabel domain aplikasi menggunakan tipe `UUIDv4` (`postgresql.UUID(as_uuid=True)`).
   - Tabel Better Auth menggunakan `TEXT` berformat UUID string.
   - Tabel log dan data catalog SMM menggunakan `INTEGER` / `BIGINT`.
2. **Uang & Saldo**:
   - Disimpan dalam integer Rupiah utuh (`BIGINT` / `INTEGER`) tanpa angka desimal (cth: `5500` untuk Rp 5.500).
3. **Timestamp**:
   - Selalu menggunakan `TIMESTAMPTZ` (`DateTime(timezone=True)`) dengan `func.now()`.
4. **Data Koleksi / Fleksibel**:
   - Disimpan dalam kolom tipe `JSONB` (cth: `account_ids`, `source_groups`, `items`, `scopes`).
5. **Kunci Sesi Sensitif**:
   - String sesi Telegram (`session_string`) dan password 2FA (`twofa_password`) disimpan dalam bentuk terenkripsi (AES-256-GCM) di level aplikasi sebelum masuk ke database.

---

## 5. Hubungan dengan Dokumen Terkait

* **Celah & Audit Keamanan Database:** Lihat [`docs/database_audit_report.md`](file:///d:/PROJECT/Telegram/TeleBos/docs/database_audit_report.md) untuk perbaikan missing constraints dan optimasi indexing.
* **Spesifikasi API Endpoint:** Lihat `/api/docs` (Swagger UI) atau [`CLAUDE.md`](file:///d:/PROJECT/Telegram/TeleBos/CLAUDE.md).
* **Setup Database Otomatis:**
  - Inisialisasi Auth: `node frontend/setup-db.mjs`
  - Migrasi App: `alembic upgrade head`
