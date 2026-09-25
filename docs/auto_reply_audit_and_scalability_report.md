# Audit & Analysis Report: Fitur Auto-Reply & Analisis Skalabilitas 1.000 Akun

**Proyek:** TeleBos  
**Komponen:** Auto-Reply System & Broadcast Automation Interaction  
**Tanggal:** 25 September 2026  
**Status:** Selesai Diperbaiki & Diuji (100% Fixed & Verified - 25 September 2026)

---

## Daftar Isi
1. [Arsitektur & Komponen Fitur Auto-Reply](#1-arsitektur--komponen-fitur-auto-reply)
2. [Temuan Audit (Security, Logic, Data Integrity) - Status Perbaikan](#2-temuan-audit-security-logic-data-integrity---status-perbaikan)
3. [Analisis Skenario Ekstrem: 1.000 Akun Menyalakan Auto-Reply & Broadcast Bersamaan](#3-analisis-skenario-ekstrem-1000-akun-menyalakan-auto-reply--broadcast-bersamaan)
4. [Matrix Dampak Kegagalan Sistem (Failure Cascade)](#4-matrix-dampak-kegagalan-sistem-failure-cascade)
5. [Rekomendasi Arsitektural & Rencana Perbaikan](#5-rekomendasi-arsitektural--rencana-perbaikan)
6. [Status Ringkasan Implementasi Perbaikan (Verification Matrix)](#6-status-ringkasan-implementasi-perbaikan-verification-matrix)

---

## 1. Arsitektur & Komponen Fitur Auto-Reply

Sistem Auto-Reply di TeleBos diimplementasikan sebagai responder pesan pertama (*welcome message*) untuk chat pribadi (DM).

### File & Komponen Terkait:
- **Database Model:** [`backend/app/models/telegram_account.py`](../backend/app/models/telegram_account.py) (`auto_reply_enabled`, `auto_reply_text`), [`backend/app/models/auto_reply_log.py`](../backend/app/models/auto_reply_log.py) (`account_id`, `sender_id`, `replied_at`).
- **Core Event Handler:** [`backend/app/services/event_relay.py`](../backend/app/services/event_relay.py) (`_on_new_message`).
- **Session Lifecycle:** [`backend/app/services/session_manager.py`](../backend/app/services/session_manager.py) (`_check_connections`, `ensure_connected_on_demand`, `on_job_completed`).
- **Rate Limiting & Lock:** [`backend/app/utils/redis.py`](../backend/app/utils/redis.py) (`check_auto_reply_rate_limit`, `record_auto_reply_sent`, `get_auto_reply_config`, `set_auto_reply_config`, `invalidate_auto_reply_config`, `is_auto_reply_sent_to_user`, `mark_auto_reply_sent_to_user`).
- **API Endpoints:** [`backend/app/api/accounts.py`](../backend/app/api/accounts.py) (`PUT /{account_id}/auto-reply`, `POST /auto-reply/bulk`).
- **Admin Endpoint:** [`backend/app/api/admin.py`](../backend/app/api/admin.py) (`GET /admin/auto-replies`).
- **Telegram Bot:** [`backend/app/bot/handlers/autoreply.py`](../backend/app/bot/handlers/autoreply.py).
- **Frontend Dashboard:** [`frontend/src/app/(dashboard)/auto-reply/page.tsx`](../frontend/src/app/(dashboard)/auto-reply/page.tsx) & [`frontend/src/components/accounts/auto-reply-editor.tsx`](../frontend/src/components/accounts/auto-reply-editor.tsx).

---

## 2. Temuan Audit (Security, Logic, Data Integrity) - Status Perbaikan

### [CRITICAL-01] [FIXED] Bug Silent Inactivity saat Auto-Reply Diaktifkan
- **Lokasi:** `backend/app/api/accounts.py:674, 715` & `backend/app/bot/handlers/autoreply.py:141`
- **Deskripsi:** Ketika user mengaktifkan auto-reply via API atau bot, akun yang sebelumnya idle/disconnected langsung disambungkan kembali secara on-demand.
- **Status Perbaikan:** ✅ **FIXED**
  - Pemanggilan `session_manager.ensure_connected_on_demand(account_id)` telah dipasang di single API update (`update_auto_reply`), bulk API update (`bulk_update_auto_reply`), dan Telegram Bot callback handler (`auto_reply_toggle_handler`).
  - Redis cache `set_auto_reply_config()` langsung disinkronkan saat status atau teks berubah.

### [CRITICAL-02] [FIXED] Kebocoran Data Penjual saat Transfer Akun di Marketplace
- **Lokasi:** `backend/app/services/marketplace_service.py:180-184, 465-470`
- **Deskripsi:** Saat akun dijual atau dipindahkan di marketplace, konfigurasi auto-reply dibersihkan menyeluruh.
- **Status Perbaikan:** ✅ **FIXED**
  - Pada saat listing (`list_accounts_for_sale`) dan pembelian (`buy_account`), sistem mengeksekusi `account.auto_reply_enabled = False`, `account.auto_reply_text = None`, membersihkan riwayat pesan di database via `delete(AutoReplyLog)`, dan memanggil `invalidate_auto_reply_config(account.id)` untuk menghapus cache di Redis.
  - Pembeli akun baru dijamin menerima akun yang bersih 100% tanpa sisa template maupun catatan penerima penjual.

### [HIGH-01] [FIXED] Kehilangan Pesan Masuk (Starvation) Akibat Cooldown Per-Akun Tanpa Antrean
- **Lokasi:** `backend/app/utils/redis.py:30-65` & `backend/app/services/event_relay.py:320-390`
- **Deskripsi:** Cooldown dan deduplikasi diperbaiki agar per-sender independen dan anti-starvation.
- **Status Perbaikan:** ✅ **FIXED**
  - Cooldown 5 detik diterapkan per `sender_id` (`autoreply:cooldown:{account_id}:{sender_id}`), dengan burst guard 1 detik di level akun. User baru tidak akan di-drop akibat aktivitas chat user lain.
  - Cache deduplikasi per-sender disimpan di Redis selama 30 hari (`autoreply:replied:{account_id}:{sender_id}`).
  - Pengecekan rate limit hanya terjadi pada first contact baru tanpa mengunci atau men-drop antrean chat secara permanen.

### [HIGH-02] [FIXED] Balasan ke Akun Resmi Telegram (Service Notifications 777000)
- **Lokasi:** `backend/app/services/event_relay.py:318-326`
- **Deskripsi:** Proteksi pengiriman balasan ke akun internal Telegram.
- **Status Perbaikan:** ✅ **FIXED**
  - Filter sender ditambahkan untuk: ID `777000` (Telegram Notifications), `42777` (DC2 Notifications), `178220800` (SpamBot), username `SpamBot` / `Telegram`, akun bot (`bot=True`), serta pesan diri sendiri (`is_self` atau sender ID sama dengan ID akun TeleBos).

### [HIGH-03] [FIXED] Ketiadaan Dukungan Format Rich Text (Markdown/HTML: Bold, Monospace, Quote) & Ketiadaan Emoji Picker
- **Lokasi Backend:** `backend/app/services/event_relay.py:365-385`
- **Lokasi Frontend:** `frontend/src/app/(dashboard)/auto-reply/page.tsx:334, 555` & `frontend/src/components/accounts/auto-reply-editor.tsx`
- **Deskripsi:** Dukungan menyeluruh untuk rich text HTML dan Emoji Picker.
- **Status Perbaikan:** ✅ **FIXED**
  - **Backend Engine:** `send_message` kini menggunakan parameter `parse_mode="html"` dengan mekanisme fallback otomatis ke plain text (`parse_mode=None`) jika format HTML tidak valid/malformed, mencegah kegagalan pengiriman total.
  - **Frontend UI:** Komponen textarea mentah telah digantikan oleh `AutoReplyEditor` lengkap dengan toolbar formatting (Bold `<b>`, Italic `<i>`, Monospace `<code>`, Blockquote `<blockquote>`, Spoiler `<tg-spoiler>`, Link `<a href="...">`), modal Emoji Picker dengan kategori & pencarian emoji, penghitung karakter limit 4096, serta tab Live Telegram Bubble Preview.

### [MEDIUM-01] [FIXED] Validasi Panjang Teks Hilang (Payload Vulnerability)
- **Lokasi:** `backend/app/schemas/account.py:183, 189`
- **Deskripsi:** Validasi batas maksimal 4096 karakter pada schema.
- **Status Perbaikan:** ✅ **FIXED**
  - Pydantic models `AutoReplyUpdateRequest` dan `BulkAutoReplyUpdateRequest` telah dipasangi validator `Field(None, max_length=4096)`.
  - Frontend `AutoReplyEditor` secara visual menandai peringatan merah jika karakter melebihi 4096 karakter.

---

## 3. Analisis Skenario Ekstrem: 1.000 Akun Menyalakan Auto-Reply & Broadcast Bersamaan

Pertanyaan: **"Bagaimana jika ada 1.000 akun yang mengaktifkan auto-reply DAN menyalakan broadcast secara bersamaan?"**

Berikut analisis rantai kegagalan (*failure cascade*) yang akan terjadi pada sistem saat ini:

### 3.1. Konflik Kepemilikan Sesi (Session Hijacking & Auto-Reply Mati Total)
TeleBos memiliki aturan keamanan sesi: Satu session string Telethon **tidak boleh** terhubung dari dua proses bersamaan (Webserver dan Async Worker) untuk mencegah `AuthKeyDuplicated` dan korupsi socket.

Di `backend/app/services/session_manager.py:344-348, 495-497`:
```python
if await self.is_account_in_active_job(db, account_id):
    logger.info("disconnecting account %s (claimed by active worker job)", account_id)
    await event_relay.detach(account_id)
    await client_pool.remove(account_id)
    return False
```
**Akibat Fatal:**
1. Saat 1.000 akun dimasukkan ke dalam Broadcast Job di worker daemon, Webserver **SECARA OTOMATIS MEMUTUS SEMUA 1.000 KONEKSI TERSEBUT** dari `TelegramClientPool` dan mencabut `event_relay`.
2. Async worker (`async_worker.py`) **TIDAK MEMILIKI** event listener `event_relay` untuk auto-reply. Worker hanya melakukan loop pengiriman broadcast keluar.
3. **Hasil:** **Selama broadcast berjalan, Auto-Reply untuk 1.000 akun tersebut 100% MATI TOTAL!**
4. **Lebih parah lagi:** Ketika job broadcast selesai (`completed`), `session_manager` di webserver **tidak menerima sinyal apa pun** untuk me-reconnect 1.000 akun tersebut. Akun-akun tersebut akan **terputus permanen** sampai server di-restart atau admin membuka tab chat akun satu per satu.

---

### 3.2. Ledakan Koneksi Database (Connection Pool Exhaustion)
Konfigurasi database di `backend/app/database.py:12-13`:
```python
pool_size=20,
max_overflow=30  # Maksimal TOTAL koneksi = 50 koneksi
```
Beban yang terjadi secara simultan:
1. **Worker Broadcast (1.000 akun):** Menulis log progres pengiriman target ke tabel `broadcast_logs` ribuan kali per menit.
2. **Webserver Inbound Chat:** Jika kebetulan ada akun yang masih mendengarkan pesan masuk, setiap pesan masuk membuka DB session:
   - `SELECT telegram_accounts` (cek setting auto-reply)
   - `SELECT auto_reply_logs` (cek deduplikasi)
   - `INSERT auto_reply_logs`
3. **Hasil:**
   Antrean koneksi database akan langsung melampaui limit **50 koneksi**. Terjadi error:
   `QueuePool limit of size 20 overflow 30 reached, connection timed out, timeout 30.00`
   Seluruh API backend (dashboard, auth, chat, orders) akan mengalami **HTTP 500 Internal Server Error** dan hang.

---

### 3.3. Bottleneck Memori & Socket OS (RAM & File Descriptors)
- **Koneksi MTProto:** 1.000 akun di worker (mengirim broadcast) + 1.000 akun di web (jika mencoba reconnect) = **2.000 koneksi TLS/TCP simultan**.
- **Konsumsi RAM:** Client Telethon rata-rata memakan 10–15 MB RAM untuk menampung cache entity, access hash, dan buffer socket.
  $$1.000 \times 12\text{ MB} \approx 12\text{ GB RAM}$$
  Hanya untuk menampung koneksi Telegram, di luar Redis dan Postgres.
- **Socket File Descriptors:** Di OS Windows, loop default `asyncio` dapat mengalami masalah handle socket jika melebihi batas 512–1024 concurrent descriptors tanpa Proactor loop yang di-tune.

---

### 3.4. Bencana FloodWait & Ban Massal Telegram (SpamBot Trigger)
Pola lalu lintas yang terjadi:
1. Akun memuntahkan ratusan pesan broadcast ke grup/pengguna asing secara simultan.
2. Target yang menerima broadcast mulai membalas pesan.
3. Jika auto-reply aktif, akun tersebut langsung menembakkan pesan balasan instan dalam selang milidetik setelah menerima chat.
4. **Respon Sistem Telegram:**
   Kombinasi *outbound spam* (broadcast) ditambah *immediate automated replies* (auto-reply) dari IP server yang sama adalah indikator paling kuat bagi sistem AI Anti-Spam Telegram untuk menandai akun sebagai bot farm.
   - Akun akan terkena `PeerFloodError`.
   - Akun terkena `FloodWaitError` ratusan hingga ribuan detik.
   - Akun mengalami **Permanent Restriction (SpamBot Mute)** atau sesi di-revoke otomatis oleh Telegram.

---

## 4. Matrix Dampak Kegagalan Sistem (Failure Cascade)

| Komponen | Beban Normal (10 Akun) | Beban Ekstrem (1.000 Akun AR + Broadcast) | Status & Dampak |
| :--- | :--- | :--- | :---: |
| **Auto-Reply Service** | Berfungsi normal | **Mati Total** (ter-detach oleh rule broadcast isolation) | 🔴 CRITICAL |
| **PostgreSQL Pool** | 3–8 koneksi aktif | **Exhausted** (>50 koneksi antre $\rightarrow$ Timeout) | 🔴 CRITICAL |
| **RAM Usage** | ~350 MB | **8 – 15 GB RAM** | 🟠 HIGH |
| **Redis Throughput** | ~20 ops/sec | ~1.500 ops/sec (aman, Redis sanggup) | 🟢 STABLE |
| **Telegram Account Health** | Sehat | **Ban Massal / FloodWait Wave** | 🔴 CRITICAL |
| **Status Reconnect Pasca-Job** | Berjalan | **Tidak Reconnect** (tetap disconnected selamanya) | 🔴 CRITICAL |

---

## 5. Rekomendasi Arsitektural & Rencana Perbaikan (Status Implementasi)

Untuk mendukung skala ratusan hingga ribuan akun secara stabil, seluruh rekomendasi perbaikan telah diimplementasikan:

### 1. Unified Sesi & Background Job Architecture ✅ [IMPLEMENTED]
- **Implementasi:** Mekanisme Redis Pub/Sub channel `telebos:jobs:completed` telah diintegrasikan di `broadcast_service.py` dan `invite_service.py`. Saat broadcast atau invite job selesai/gagal/berhenti, event completion dipancarkan ke Redis.
- `session_manager.on_job_completed(account_ids)` di webserver menerima sinyal via `redis_ws_bridge.py` dan langsung me-reconnect akun yang memiliki `auto_reply_enabled = True` atau tab WebSocket aktif tanpa perlu intervensi manual atau restart server.

### 2. In-Memory / Redis Caching untuk Auto-Reply ✅ [IMPLEMENTED]
- **Implementasi:** Konfigurasi auto-reply disimpan dalam Redis hash `account:autoreply:{id}` dengan TTL 24 jam melalui `get_auto_reply_config()` dan `set_auto_reply_config()`.
- Pada `_on_new_message` di `event_relay.py`, sistem terlebih dahulu memeriksa Redis cache (0 ms latensi, 0 koneksi DB). Jika `enabled == 0`, sistem langsung keluar tanpa query PostgreSQL.
- Riwayat pengiriman first DM disimpan di Redis selama 30 hari via `is_auto_reply_sent_to_user()` dan `mark_auto_reply_sent_to_user()`.
- Pengaksesan PostgreSQL dibatasi secara ketat oleh semaphore `self._db_sem = asyncio.Semaphore(10)`, mencegah kelaparan koneksi pool saat ribuan pesan masuk bersamaan.

### 3. Antrean Balasan & Cooldown Anti-Starvation ✅ [IMPLEMENTED]
- **Implementasi:** Cooldown 5 detik kini diterapkan secara terisolasi per `sender_id` (`autoreply:cooldown:{account_id}:{sender_id}`), dengan burst guard 1 detik di level akun.
- Ditambahkan distributed lock atomik Redis `lock:autoreply:{account_id}:{sender_id}` berdurasi 60 detik untuk mencegah balasan ganda pada event pesan bersamaan.

### 4. Database Connection Pool & Tunings ✅ [IMPLEMENTED]
- **Implementasi:** Di `backend/app/database.py`, kapasitas engine SQLAlchemy telah ditingkatkan dari `pool_size=20, max_overflow=30` menjadi `pool_size=50, max_overflow=50` (kapasitas total 100 koneksi simultan).

### 5. Dukungan Formatting Rich Text (HTML/Markdown) & Emoji Picker ✅ [IMPLEMENTED]
- **Backend:** `event.client.send_message` menggunakan `parse_mode="html"` secara default dengan fallback otomatis ke plain text jika terjadi sintaks markup tidak beraturan.
- **Frontend:** Komponen `AutoReplyEditor` dipasang di [`frontend/src/app/(dashboard)/auto-reply/page.tsx`](../frontend/src/app/(dashboard)/auto-reply/page.tsx) baik pada mode bulk maupun individual expanded row. Dilengkapi toolbar Rich Formatting (`<b>`, `<i>`, `<code>`, `<blockquote>`, `<tg-spoiler>`, `<a href="...">`), modal Emoji Picker interaktif, penghitung 4096 karakter, dan Telegram Chat Bubble Live Preview.

---

## 6. Status Ringkasan Implementasi Perbaikan (Verification Matrix)

| ID Temuan | Komponen / File | Status Perbaikan | Verifikasi / Pengujian |
| :--- | :--- | :---: | :--- |
| **CRITICAL-01** | `api/accounts.py`, `bot/handlers/autoreply.py` | ✅ FIXED | `session_manager.ensure_connected_on_demand` dipanggil saat enable AR |
| **CRITICAL-02** | `services/marketplace_service.py` | ✅ FIXED | `AutoReplyLog` dibersihkan & Redis cache diinvalider saat list / buy |
| **HIGH-01** | `utils/redis.py`, `services/event_relay.py` | ✅ FIXED | Cooldown per-sender + Redis dedup cache 30 hari |
| **HIGH-02** | `services/event_relay.py` | ✅ FIXED | Filter sender ID `777000`, `42777`, `178220800`, `SpamBot`, `Telegram`, self |
| **HIGH-03** | `services/event_relay.py`, `auto-reply/page.tsx` | ✅ FIXED | Backend `parse_mode="html"` + fallback; Frontend `AutoReplyEditor` |
| **MEDIUM-01** | `schemas/account.py`, `auto-reply-editor.tsx` | ✅ FIXED | Schema validator max 4096 char + frontend counter & alert |
| **RECOM-01** | `services/session_manager.py`, `redis_ws_bridge.py` | ✅ IMPLEMENTED | Redis Pub/Sub `jobs:completed` auto-reconnects accounts |
| **RECOM-02** | `utils/redis.py`, `services/event_relay.py` | ✅ IMPLEMENTED | In-memory Redis caching (`account:autoreply:{id}`) + `_db_sem` bound |
| **RECOM-04** | `database.py` | ✅ IMPLEMENTED | SQLAlchemy pool diperbesar: `pool_size=50, max_overflow=50` |

### Hasil Pengujian Unit Test:
- Suite: [`backend/tests/unit/test_auto_reply_scalability.py`](../backend/tests/unit/test_auto_reply_scalability.py)
  - `test_redis_auto_reply_config_caching`: **PASSED**
  - `test_redis_user_replied_dedup_cache`: **PASSED**
  - `test_service_notification_sender_filtering`: **PASSED**
  - `test_spambot_sender_filtering`: **PASSED**
  - `test_database_connection_pool_settings`: **PASSED**
  - `test_session_manager_on_job_completed`: **PASSED**
- Suite: [`backend/tests/unit/test_marketplace_service.py`](../backend/tests/unit/test_marketplace_service.py): **6 PASSED**
- Linting: `ruff check`: **All checks passed!**
- Graphify: Knowledge graph updated (`graphify update .`) -> 4,241 nodes, 11,024 edges.


