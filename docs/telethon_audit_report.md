# Laporan Audit Arsitektur Telethon, Memory Leak, dan Stabilitas Koneksi TeleBos

**Tanggal:** 3 September 2026  
**Target:** Backend TeleBos (`FastAPI`, `Telethon`, `Celery`, `asyncio`)  
**Metodologi:** Pengecekan silang dokumentasi resmi Telethon (`docs.telethon.dev`), pemetaan relasi arsitektur menggunakan **Knowledge Graph (Graphify)**, dan penelusuran manual kode sumber (*static code analysis*).

---

## 1. Eksekutif & Analisis Akar Masalah (Root Cause Analysis)

### 1.1 Anatomi Error Log

```text
backend-1 | [WARNING] telethon.network.connection.connection: Server closed the connection: [Errno 104] Connection reset by peer
backend-1 | [ERROR] telethon.network.connection.connection: Unexpected exception in the send loop
backend-1 | Traceback (most recent call last):
backend-1 |   File "uvloop/handles/stream.pyx", line 675, in uvloop.loop.UVStream.write
backend-1 | RuntimeError: unable to perform operation on <TCPTransport closed=True reading=False 0x60dbd4e9b980>; the handler is closed
backend-1 | [WARNING] telethon.network.mtprotosender: Security error while unpacking a received message: Server replied with a wrong session ID (see FAQ for details)
```

Log di atas merupakan **efek berantai (*cascading failure*)** yang terdiri dari 3 peristiwa:

1. **`[Errno 104] Connection reset by peer`**  
   Server Telegram Data Center (DC) mengirimkan paket `TCP RST` untuk memutus sambungan. Pemicu utamanya adalah **konkurensi sesi (session reuse)**: Telegram mendeteksi adanya koneksi baru yang login menggunakan `auth_key` (`session_string`) yang sama, atau akun melakukan request terlalu cepat (*flood*).
2. **`RuntimeError: handler is closed` pada `uvloop`**  
   Uvicorn menggunakan `uvloop` secara default. Ketika Telegram memutuskan koneksi TCP, `uvloop` seketika menutup handle `TCPTransport`. Task `_send_loop` Telethon yang masih memiliki antrean paket mencoba menulis ke socket tersebut. `uvloop` melempar `RuntimeError`, yang ditangkap Telethon sebagai *unexpected exception*.
3. **`Server replied with a wrong session ID`**  
   Sesuai dokumentasi resmi di [FAQ Telethon](https://docs.telethon.dev/en/stable/quick-references/faq.html#what-does-server-replied-with-a-wrong-session-id-mean):
   > *"This error is a security feature to protect you against unwanted session reuse... The Telethon session is being used or has been used from somewhere else... You may be using multiple connections to the Telegram server, which seems to confuse Telegram."*  
   Ketika koneksi putus dan client mencoba reconnect (atau dibuat client baru), paket respon dari sesi koneksi lama yang baru tiba di server Telegram dikembalikan ke sesi baru. Karena ID sesi acak 64-bit pada MTProto tidak cocok, Telethon mendeteksi anomali keamanan.

---

## 2. Temuan Audit Kritis (Memory Leak & Bottlenecks)

### 🚨 Temuan 1 (P0 - Kritis): Event Handler Telethon Tidak Pernah Terlepas (*Definite Memory Leak*)
* **File Terkait:**
  * [`backend/app/services/telegram_client.py:L113-L140`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/telegram_client.py#L113)
  * [`backend/app/services/event_relay.py:L147-L155`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/event_relay.py#L147)
* **Deskripsi Masalah:**  
  Pada proses pembersihan client yang idle (`_cleanup_stale_clients`), akun di-`pop` dari dictionary `self._clients` **sebelum** fungsi `event_relay.detach(acc_id)` dipanggil.
  ```python
  # telegram_client.py:113
  for acc_id in stale_keys:
      data = self._clients.pop(acc_id, None)  # [1] DI-POP TERLEBIH DAHULU
      if data and data["client"]:
          await event_relay.detach(acc_id)    # [2] MEMANGGIL DETACH
  ```
  Di dalam `event_relay.detach(account_id)`:
  ```python
  # event_relay.py:147
  async def detach(self, account_id: str) -> None:
      client = (await client_pool.get_connected_clients()).get(account_id)  # [3] HASILNYA SELALU NONE
      if client:
          self.detach_client(account_id, client)  # TIDAK PERNAH DIJALANKAN!
          return
  ```
* **Dampak:**  
  Fungsi `client.remove_event_handler(...)` tidak pernah dieksekusi. Delapan lambda closure event handler tetap terikat di `client._event_builders`. Objek `TelegramClient` beserta seluruh memori dan socket-nya tertahan di RAM (*cyclic reference*) dan tidak bisa dibersihkan oleh Garbage Collector Python.

---

### 🚨 Temuan 2 (P0 - Kritis): Pool Duplikat `TelethonPool` Tanpa TTL & Eviction
* **File Terkait:**
  * [`backend/app/utils/telethon_pool.py:L16-L88`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/utils/telethon_pool.py#L16)
  * [`backend/app/services/broadcast_worker.py:L23, L120`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/broadcast_worker.py#L23)
* **Deskripsi Masalah:**  
  Terdapat dua implementasi pool berbeda di dalam codebase: `TelegramClientPool` (di `services/telegram_client.py`) dan `TelethonPool` (di `utils/telethon_pool.py`).  
  `TelethonPool` menyimpan instance client di `self._clients` tanpa ada mekanisme TTL, tanpa background cleanup loop, dan tanpa batas kapasitas. Selain itu, file ini memiliki fallback test `api_id` bernilai `2040`.
* **Dampak:**  
  Setiap akun yang diproses oleh `broadcast_worker.py` akan disimpan di memori selamanya. Socket TCP-nya tetap aktif dan tidak pernah ditutup, memicu duplikasi sesi dan pemborosan socket descriptor.

---

### ⚠️ Temuan 3 (P1 - Tinggi): Redundant Double Fetch (600 Dialog + 500 Iterasi) & Loop N+1 RPC
* **File Terkait:**
  * [`backend/app/main.py:L1127-L1139`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1127)
  * [`backend/app/services/chat_service.py:L109-L160`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/chat_service.py#L109)
  * [`backend/app/services/telegram_reg_date_service.py:L142`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/telegram_reg_date_service.py#L142)
* **Deskripsi Masalah:**  
  Background loop `_adaptive_sequential_sync_loop` berjalan setiap 15–30 detik dan melakukan:
  1. `sync_all_chats_to_db()`: Menarik 500 dialog (folder 0) + 100 dialog (folder 1) = **600 dialog Telegram ke RAM**. Telethon otomatis menyimpan semua user/grup ke `client._entity_cache`.
  2. Jika `skip_details=False`, melakukan iterasi dan memanggil `get_full_chat_details()` (RPC `GetFullChannelRequest`) satu per satu untuk setiap grup/channel.
  3. Langsung setelahnya, memanggil `reg_date_service.sync_datapoints_from_account()` yang mengeksekusi `async for dialog in client.iter_dialogs(limit=500)`: **menarik ulang 500 dialog untuk kedua kalinya dalam interval beberapa detik**.
* **Dampak:**  
  Lonjakan memori drastis pada `client._entity_cache`, pemborosan bandwidth, dan memicu `FloodWaitError` dari Telegram.

---

### ⚠️ Temuan 4 (P1 - Tinggi): Event Storm Spawning Task Tanpa Filter pada Raw Update
* **File Terkait:**
  * [`backend/app/services/event_relay.py:L107-L109, L825-L842`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/event_relay.py#L107)
* **Deskripsi Masalah:**  
  Handler raw profile didaftarkan menggunakan:
  ```python
  client.on(events.Raw(types=(UpdateUserName, UpdateUserPhone, UpdateUser)))(
      lambda event: asyncio.create_task(self._on_profile_change(account_id, event))
  )
  ```
  Telegram memancarkan `UpdateUser` setiap kali ada kontak atau anggota dari grup/channel mana pun yang diikuti akun mengalami perubahan status/nama.
* **Dampak:**  
  Jika akun tergabung di puluhan grup besar, tercipta ratusan `asyncio.Task` per menit hanya untuk memeriksa `if event.user_id != my_tg_id: return`. Ini menyebabkan *event loop queue thrashing* dan membebani alokasi task Python.

---

### ⚠️ Temuan 5 (P2 - Sedang): Timeout Disconnect Terlalu Sempit (2.0 Detik) Menyebabkan Zombie Socket
* **File Terkait:**
  * [`backend/app/services/telegram_client.py:L144, L230, L255, L302, L468`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/telegram_client.py#L144)
* **Deskripsi Masalah:**  
  Fungsi `disconnect()` dibatasi dengan timeout 2.0 detik:
  ```python
  await asyncio.wait_for(data["client"].disconnect(), timeout=2.0)
  ```
  Proses penutupan koneksi TLS MTProto ke Data Center Telegram seringkali membutuhkan waktu 1–3 detik. Ketika timeout tercapai, coroutine `disconnect()` dibatalkan paksa.
* **Dampak:**  
  Socket TCP tidak tertutup bersih di level kernel (*file descriptor leak*), dan loop internal Telethon (`_send_loop`, `_recv_loop`) tertinggal sebagai *zombie task*.

---

### ⚠️ Temuan 6 (P2 - Sedang): Polling `client.get_me()` Tiap 30 Detik di Health Loop
* **File Terkait:**
  * [`backend/app/services/session_manager.py:L449-L467`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/session_manager.py#L449)
* **Deskripsi Masalah:**  
  `SessionManager._health_loop` memanggil `await client.get_me()` ke seluruh akun setiap 30 detik.
* **Dampak:**  
  `get_me()` adalah RPC call penuh (`GetUsersRequest(InputUserSelf())`). Telethon sudah memiliki mekanisme *keep-alive* internal otomatis via paket `PingRequest`. Memanggil RPC berat tiap 30 detik memicu rate limit, dan jika terjadi *jitter* jaringan, akun salah didiagnosa sebagai terputus lalu di-reconnect paksa (memicu bentrokan sesi).

---

### 💾 Temuan 7 (P2 - Sedang): Akumulasi File Cache Media Tanpa Kebijakan Retensi (TTL/LRU)
* **File Terkait:**
  * [`backend/app/api/media.py:L161, L215, L250`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/media.py#L161)
* **Deskripsi Masalah:**  
  File media hasil download disimpan secara permanen di `uploads/message_media/{chat_id}/` tanpa batasan kuota disk atau pembersihan file usang.
* **Dampak:**  
  Volume storage Docker container membengkak tanpa batas dan berisiko mengalami *No space left on device*.

---

## 3. Matriks Rekomendasi Solusi & Rencana Perbaikan

| Prioritas | Masalah | Rencana Solusi | Status |
|---|---|---|---|
| **P0** | Event handler tidak terlepas | Ubah pemanggilan di `telegram_client.py`: panggil `event_relay.detach_client(acc_id, data["client"])` sebelum client di-pop dari dictionary. | ✅ **RESOLVED** (Fixed di `telegram_client.py` & `event_relay.py`) |
| **P0** | Duplikasi `telethon_pool.py` | Hapus file `telethon_pool.py` dan alihkan seluruh pemanggilan di `broadcast_worker.py` ke singleton `client_pool`. | ✅ **RESOLVED** (Didelegasikan ke `client_pool` & `get_active_client`) |
| **P1** | Redundant dialog fetching | Gabungkan ekstraksi data `reg_date_service` dari hasil dialog yang sudah diambil oleh `sync_all_chats_to_db` (hindari pemanggilan ganda 500 dialog). | ✅ **RESOLVED** (Dialogs dioper langsung & detail RPC dibatasi max 25) |
| **P1** | Event storm pada raw update | Pasang pengecekan ID secara sinkron di lambda handler sebelum membuat `asyncio.create_task()`. | ✅ **RESOLVED** (Filter sinkron `_on_raw_profile_filter` & channel check) |
| **P2** | Timeout disconnect pendek | Tingkatkan timeout `disconnect()` dari `2.0` detik menjadi minimal `5.0–10.0` detik. | ✅ **RESOLVED** (Naik ke 5.0s) |
| **P2** | Polling `get_me()` tiap 30s | Ganti pengecekan `get_me()` di health loop dengan property lokal `client.is_connected()`. | ✅ **RESOLVED** (Cek socket lokal tanpa RPC polling) |
| **P2** | Unbounded media storage | Tambahkan background task harian untuk menghapus cache media yang berusia lebih dari 24/48 jam. | ✅ **RESOLVED** (Modul `media_cleanup.py` & loop harian di lifespan) |

---

## 4. Referensi Dokumentasi Resmi Telethon
* [Telethon FAQ - Wrong Session ID](https://docs.telethon.dev/en/stable/quick-references/faq.html#what-does-server-replied-with-a-wrong-session-id-mean)
* [Telethon Concepts - Session Files](https://docs.telethon.dev/en/stable/concepts/sessions.html#string-sessions)
* [Telethon Concepts - Updates in Depth](https://docs.telethon.dev/en/stable/concepts/updates.html)
* [Telethon Quick Reference - Client](https://docs.telethon.dev/en/stable/quick-references/client-reference.html)
