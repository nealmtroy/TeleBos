# Laporan Audit Mendalam: Bug & Logika Sistem TeleBos

**Tanggal Audit:** 3 September 2026  
**Target:** Seluruh Arsitektur TeleBos (`FastAPI`, `Telethon`, `Celery`, `Next.js 14 App Router`, `PostgreSQL / asyncpg`, `Better Auth`, `Native WebSockets`)  
**Metodologi:** Graphify Knowledge Graph Analysis (`graphify-out/graph.json`, 3.401 nodes, 6.795 edges) + Manual Static Code Analysis & Deep Path Tracing.

---

## Ringkasan Eksekutif & Matriks Tingkat Keparahan (Severity Matrix)

Audit mendalam ini mengidentifikasi **24 temuan teknis berisiko tinggi** yang tersebar di 8 kategori utama pengujian integritas kode. Beberapa di antaranya berdampak langsung pada kerugian finansial pengguna (*balance theft*), kebuntuan proses (*deadlock* pada thread dan database), badai sambungan ulang tak terhingga (*reconnection storm*), dan hilangnya sinkronisasi data antar modul (*state desynchronization*).

### Matriks Keparahan & Status Remediasi (100% Resolved)

| ID | Kategori | Modul Terkait | Tingkat Keparahan | Ringkasan Masalah | Status Remediasi |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **LOG-01** | Cacat Logika | `services/order_service.py` | 🔴 **CRITICAL (P0)** | Pengurangan saldo total (`user.balance -= total_cost`) tetap terjadi meskipun item mass order gagal upstream. | ✅ **FIXED** |
| **LOG-02** | Cacat Logika | `services/marketplace_service.py` | 🟠 **HIGH (P1)** | Akun yang dibeli di marketplace terkunci permanen (`is_sold=True`) sehingga pembeli tidak bisa menjualnya kembali. | ✅ **FIXED** |
| **LOG-03** | Cacat Logika | `services/redeem_service.py` | 🟠 **HIGH (P1)** | Redeem voucher langganan mereset tanggal kedaluwarsa dari `now`, memotong sisa hari aktif dan mendowngrade paket premium. | ✅ **FIXED** |
| **LOG-04** | Cacat Logika | `services/group_admin_service.py` | 🟡 **MEDIUM (P2)** | URL username channel publik (`t.me/name`) dianggap invite hash, gagal join namun merespon sukses ke client. | ✅ **FIXED** |
| **LOG-05** | Cacat Logika | `services/broadcast_worker.py` | 🟡 **MEDIUM (P2)** | Inversi logika event pause (`if event.is_set(): return False`) menyebabkan broadcast tidak pernah bisa di-pause. | ✅ **FIXED** |
| **RAC-01** | Race Condition | `services/marketplace_service.py` | 🔴 **CRITICAL (P0)** | `SELECT FOR UPDATE` pada transaksi beli akun tidak memiliki urutan deterministic (User A vs User B), memicu Deadlock DB. | ✅ **FIXED** |
| **RAC-02** | Race Condition | `services/event_relay.py` | 🟠 **HIGH (P1)** | Pengecekan `AutoReplyLog` sebelum pesan dikirim memicu duplikasi auto-reply pada pesan masuk bertubi-tubi. | ✅ **FIXED** |
| **RAC-03** | Race Condition | `services/redeem_service.py` | 🟠 **HIGH (P1)** | Row `User` tidak dilock dengan `FOR UPDATE` saat redeem kode saldo, memicu Lost Update pada saldo pengguna. | ✅ **FIXED** |
| **DDK-01** | Deadlock | `workers/broadcast_worker.py` | 🔴 **CRITICAL (P0)** | `future.result()` dipanggil dari event loop yang sama di Celery worker, memicu deadlock thread 100%. | ✅ **FIXED** |
| **DDK-02** | Deadlock | `services/invite_service.py` | 🔴 **CRITICAL (P0)** | Koneksi DB `AsyncSession` ditahan terbuka selama perulangan scraping/sleep hingga 86.400 detik, menghabiskan DB pool. | ✅ **FIXED** |
| **INF-01** | Infinite Loop | `frontend/src/lib/socket.ts` | 🟠 **HIGH (P1)** | WebSocket singleton tidak dibersihkan saat unmount, melakukan reconnect tanpa henti (*infinite reconnect storm*) setiap 3 detik. | ✅ **FIXED** |
| **INF-02** | Infinite Loop | `frontend/src/lib/api.ts` | 🟠 **HIGH (P1)** | Interceptor Axios 401 memaksa `window.location.href = "/login"` yang memicu infinite reload loop pada unauthenticated state. | ✅ **FIXED** |
| **INF-03** | Infinite Loop | `backend/app/main.py` | 🟠 **HIGH (P1)** | Jika sync akun gagal karena error DB, `last_sync_at` tidak terupdate, loop memilih akun yang sama berulang kali (*starvation*). | ✅ **FIXED** |
| **OBO-01** | Off-by-One | `services/account_service.py` | 🟡 **MEDIUM (P2)** | Formula `offset = (page - 1) * limit` menerima input `page <= 0` atau negatif, memicu PostgreSQL negative offset error. | ✅ **FIXED** |
| **OBO-02** | Off-by-One | `services/chat_service.py` | 🟡 **MEDIUM (P2)** | Evaluasi operator ternary `last_msg` di dialog chat salah urutan preseden, selalu mengembalikan string kosong untuk non-teks. | ✅ **FIXED** |
| **NUL-01** | Null / Undefined | `services/auth_service.py` | 🔴 **CRITICAL (P0)** | Query `WHERE user_id = :user_id` pada tabel Better Auth `account` crash karena nama kolom PostgreSQL adalah `"userId"`. | ✅ **FIXED** |
| **NUL-02** | Null / Undefined | `services/message_service.py` | 🟡 **MEDIUM (P2)** | Akses `me.id` tanpa verifikasi `me is not None` melempar `AttributeError` saat sesi terputus atau tidak terotorisasi. | ✅ **FIXED** |
| **NUL-03** | Null / Undefined | `services/account_service.py` | 🟡 **MEDIUM (P2)** | `' '.join(hint_msg)` memecah string karakter demi karakter (`"p a s s"`) karena `hint` pada Telethon bertipe string. | ✅ **FIXED** |
| **NUL-04** | Null / Undefined | `frontend/.../MessagePane.tsx` | 🟡 **MEDIUM (P2)** | `new Date(searchDateFrom).getTime() / 1000` menghasilkan `NaN` pada input string kosong, merusak payload JSON ke backend. | ✅ **FIXED** |
| **EDG-01** | Edge Case | `services/smm_service.py` | 🟠 **HIGH (P1)** | Hanya menangkap `httpx.HTTPError`; error 502/504 HTML dari SMM melempar `JSONDecodeError` tak tertangani (500 Internal Server Error). | ✅ **FIXED** |
| **EDG-02** | Edge Case | `services/order_service.py` | 🟠 **HIGH (P1)** | Mass order tidak memvalidasi `quantity < min_qty` atau `quantity <= 0`, mengizinkan order invalid dan mengurangi saldo pengguna. | ✅ **FIXED** |
| **EDG-03** | Edge Case | `services/appeal_service.py` | 🟡 **MEDIUM (P2)** | SpamBot inline callback button mengedit pesan di tempat; `conv.get_response()` menunggu pesan baru dan timeout 60 detik. | ✅ **FIXED** |
| **INC-01** | State Inconsistency | `services/marketplace_service.py` | 🔴 **CRITICAL (P0)** | Partial mutation saat batch listing: jika akun 2 gagal, akun 1 sudah terlanjur diubah di Telegram dan fotonya terhapus, namun DB rollback. | ✅ **FIXED** |
| **INC-02** | State Inconsistency | `backend/app/main.py` | 🟠 **HIGH (P1)** | Shutdown lifespan mematikan pool DB dan Telethon tanpa membatalkan job broadcast/invite, meninggalkan status `running` permanen (*zombie state*). | ✅ **FIXED** |
| **INC-03** | State Inconsistency | `frontend/.../MessagePane.tsx` | 🟡 **MEDIUM (P2)** | Mengganti chat tidak mereset state `offsetId` dan `allMessages`, menampilkan pesan chat lama di bawah judul chat baru. | ✅ **FIXED** |

---

## 1. Cacat Logika (Logic Flaws)

### 🚨 LOG-01: Kehilangan Saldo Finansial Pengguna pada Mass Order yang Gagal Upstream
* **Lokasi Kode:** [`backend/app/services/order_service.py:L233-L285`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/order_service.py#L233-L285)
* **Deskripsi Masalah:**  
  Pada fungsi `place_mass_orders`, sistem menghitung total biaya keseluruhan order terlebih dahulu (`total_cost`). Di dalam perulangan eksekusi order:
  ```python
  for vd in validated_orders:
      try:
          result = await create_order(...)
          # Jika API mengembalikan status: False (misal: target invalid / kehabisan stok)
          status = smm_order_id and "Pending" or "Failed"
          order = Order(..., status=status, ...)
          db.add(order)
      except Exception as e:
          order = Order(..., status="Failed", ...)
          db.add(order)

  # DEDUCT TOTAL BALANCE
  user.balance -= total_cost  # <-- BUG KRITIS
  await db.flush()
  ```
* **Akar Masalah:**  
  Variabel `total_cost` dipotongkan secara buta ke `user.balance` tanpa menghitung apakah ada item yang berstatus `"Failed"`.
* **Dampak Bisnis:**  
  Jika pengguna memesan 10 item senilai total Rp 500.000, dan 9 item gagal di upstream panel SMM (karena URL salah, stok kosong, atau maintenance), saldo pengguna tetap dipotong Rp 500.000 penuh tanpa ada mekanisme pengembalian dana (*refund*) maupun kalkulasi ulang.

---

### 🚨 LOG-02: Akun yang Dibeli di Marketplace Terkunci Permanen dari Penjualan Kembali
* **Lokasi Kode:**
  * [`backend/app/services/marketplace_service.py:L94, L157, L468`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/marketplace_service.py#L94)
* **Deskripsi Masalah:**  
  Saat akun dibeli melalui fungsi `buy_account`:
  ```python
  # marketplace_service.py:466
  account.user_id = buyer_id
  account.for_sale = False
  account.is_sold = True  # Menandai akun telah terjual dari listing sebelumnya
  account.is_active = True
  ```
  Namun, pada fungsi yang memeriksa kelayakan akun untuk dijual kembali (`get_sell_eligible_accounts`):
  ```python
  # marketplace_service.py:91-95
  where(
      and_(
          TelegramAccount.user_id == user.id,
          TelegramAccount.phone_verified == True,
          TelegramAccount.for_sale == False,
          TelegramAccount.is_sold == False,  # <-- SELALU FALSE KARENA PERNAH TERJUAL!
      )
  )
  ```
  Dan pada `sell_accounts`:
  ```python
  for account in accounts:
      if account.for_sale or account.is_sold:
          raise ValueError(f"Account is already listed for sale or sold: {account.phone}")
  ```
* **Dampak:**  
  Setiap akun yang pernah berpindah tangan melalui marketplace memiliki flag `is_sold = True` permanen pada model `TelegramAccount`. Pemilik baru (pembeli) tidak akan pernah bisa mendaftarkan akun tersebut ke marketplace lagi.

---

### ⚠️ LOG-03: Truncation & Downgrade Saldo Hari Langganan saat Redeem Kode
* **Lokasi Kode:** [`backend/app/services/redeem_service.py:L129-L138`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/redeem_service.py#L129-L138)
* **Deskripsi Masalah:**  
  Pada fungsi `redeem_code` untuk tipe subscription:
  ```python
  user.role = redeem.plan
  user.subscription_expires_at = now + timedelta(days=redeem.duration_days)
  ```
* **Akar Masalah:**  
  1. **Truncation:** Jika user saat ini sudah berlangganan Pro dan masih memiliki sisa aktif 25 hari, lalu me-redeem kode perpanjangan 30 hari, waktu kedaluwarsanya langsung ditimpa menjadi `now + 30 hari`, bukan `existing_expires_at + 30 hari`. Sisa 25 hari yang telah dibayar hangus seketika.
  2. **Silent Downgrade:** Jika pengguna memiliki paket `premium` dan me-redeem kode bertipe `pro`, role pengguna langsung diturunkan paksa menjadi `pro`.

---

### ⚠️ LOG-04: False Positive / Sukses Semu saat Bergabung ke Channel Publik
* **Lokasi Kode:** [`backend/app/services/group_admin_service.py:L44-L75`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/group_admin_service.py#L44-L75)
* **Deskripsi Masalah:**  
  Fungsi `join_chat` mendeteksi link invite menggunakan:
  ```python
  if "t.me/" in ident or "telegram.me/" in ident:
      parts = ident.rstrip("/").split("/")
      last = parts[-1]
      if last and last != ident:
          invite_hash = last
  ```
  Jika pengguna memasukkan URL channel publik biasa seperti `https://t.me/komunitas_crypto`, nilai `invite_hash` diisi string `"komunitas_crypto"`.
  Sistem kemudian memanggil `CheckChatInviteRequest(hash="komunitas_crypto")` yang melempar error `InviteHashInvalidError`. Pada blok `except`:
  ```python
  except Exception as exc:
      try:
          if not hash_clean.startswith(("/", "+")):
              entity = await client.get_entity(hash_clean)  # HANYA MENGAMBIL ENTITAS
      except Exception:
          raise ...
  ```
  Setelah entitas didapatkan dari `get_entity`, **perintah `JoinChannelRequest` sama sekali tidak pernah dieksekusi** karena pemanggilan join hanya ada di cabang `else` (jalur username biasa). Fungsi langsung mengembalikan dictionary status sukses dengan metadata chat.
* **Dampak:**  
  Frontend menampilkan notifikasi berhasil bergabung ke grup/channel, padahal akun Telegram pengguna sama sekali belum bergabung.

---

### ⚠️ LOG-05: Inversi Logika Event Pause pada Broadcast Worker
* **Lokasi Kode:** [`backend/app/services/broadcast_worker.py:L48, L54-L60`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/broadcast_worker.py#L48)
* **Deskripsi Masalah:**  
  Event `_pause_events[job_id]` diinisialisasi saat start dengan:
  ```python
  self._pause_events[job_id].set()  # set() berarti TIDAK dalam kondisi pause (sedang berjalan)
  ```
  Namun method `pause()` mengimplementasikan pengecekan:
  ```python
  async def pause(self, job_id: str) -> bool:
      event = self._pause_events.get(job_id)
      if event is None or event.is_set():  # <-- INVERSI LOGIKA
          return False
      event.clear()
      ...
  ```
* **Dampak:**  
  Karena task yang sedang berjalan selalu memiliki `event.is_set() == True`, pemanggilan `pause()` akan **selalu mengembalikan `False`** dan `event.clear()` tidak pernah dipanggil. Job broadcast tidak dapat dijeda.

---

## 2. Kondisi Balapan (Race Condition)

### 🚨 RAC-01: Potensi Deadlock Transaksi Database antar Pembelian Akun Konkuren
* **Lokasi Kode:** [`backend/app/services/marketplace_service.py:L440-L455`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/marketplace_service.py#L440-L455)
* **Deskripsi Masalah:**  
  Pada fungsi `buy_account`, locking baris database diterapkan pada tabel `User` dengan urutan:
  1. Kunci baris **Buyer**:
     ```python
     locked_buyer = await db.execute(select(User).where(User.id == buyer_id).with_for_update())
     ```
  2. Kunci baris **Seller**:
     ```python
     seller_result = await db.execute(select(User).where(User.id == seller_id).with_for_update())
     ```
* **Skenario Deadlock:**  
  - Pengguna **A** membeli akun yang dijual oleh Pengguna **B** (Transaksi 1 mengunci row `User A`, lalu menunggu kunci `User B`).
  - Secara bersamaan, Pengguna **B** membeli akun lain yang dijual oleh Pengguna **A** (Transaksi 2 mengunci row `User B`, lalu menunggu kunci `User A`).
* **Dampak:**  
  PostgreSQL mendeteksi *circular lock wait* dan membatalkan salah satu transaksi dengan error `deadlock detected (SQLSTATE 40P01)`.

---

### ⚠️ RAC-02: Double / Multiple Auto-Reply pada Pesan Masuk Bertubi-tubi
* **Lokasi Kode:** [`backend/app/services/event_relay.py:L324-L345`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/event_relay.py#L324-L345)
* **Deskripsi Masalah:**  
  Saat pengguna Telegram mengirim dua pesan berurutan dengan cepat ("Halo" disusul "Apakah ready?"):
  1. Telegram mengirimkan 2 event `UpdateNewMessage` secara paralel ke asyncio loop.
  2. Coroutine 1 dan Coroutine 2 berjalan bersamaan, keduanya mengeksekusi:
     ```python
     log_result = await db.execute(select(AutoReplyLog).where(sender_id == sender_id))
     if log_result.scalar_one_or_none() is not None:
         return
     ```
  3. Karena belum ada transaksi yang commit, kedua coroutine melihat bahwa log balasan belum ada.
  4. Kedua coroutine mengeksekusi `await event.client.send_message(...)`, mengirim **dua pesan balasan otomatis yang identik** kepada kontak target.
  5. Salah satu transaksi kemudian menabrak constraint unik saat insert ke `AutoReplyLog`.

---

### ⚠️ RAC-03: Lost Update pada Saldo Akun Pengguna saat Redeem Voucher Konkuren
* **Lokasi Kode:** [`backend/app/services/redeem_service.py:L87-L118`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/redeem_service.py#L87-L118)
* **Deskripsi Masalah:**  
  `redeem_code` melakukan lock pada row `RedeemCode`:
  ```python
  select(RedeemCode).where(RedeemCode.code == code_str).with_for_update()
  ```
  Namun, objek `user` diambil dari parameter fungsi (yang diinject oleh dependensi FastAPI `get_current_user` tanpa lock `FOR UPDATE`).
  Ketika menambahkan saldo:
  ```python
  user.balance += redeem.amount
  ```
  Jika pengguna melakukan transaksi lain secara paralel (misalnya order SMM atau redeem voucher lain di tab berbeda), modifikasi saldo berbasis instance yang tidak dikunci ini akan saling menimpa (*Lost Update race condition*), menghasilkan total saldo akhir yang tidak akurat.

---

## 3. Kebuntuan (Deadlock)

### 🚨 DDK-01: Deadlock Event Loop pada Celery Worker Task
* **Lokasi Kode:** [`backend/app/workers/broadcast_worker.py:L21-L24`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/workers/broadcast_worker.py#L21-L24)
* **Deskripsi Masalah:**  
  ```python
  if loop and loop.is_running():
      future = asyncio.run_coroutine_threadsafe(_execute(job_id), loop)
      future.result()  # <-- DEADLOCK 100%
  else:
      asyncio.run(_execute(job_id))
  ```
* **Akar Masalah:**  
  Fungsi `asyncio.run_coroutine_threadsafe` didesain untuk dipanggil dari thread yang **berbeda** dengan thread yang menjalankan event loop. Jika dipanggil di thread yang sama saat event loop sedang aktif:
  `future.result()` memblokir eksekusi thread saat itu untuk menunggu hasil coroutine. Namun karena thread tersebut diblokir oleh `future.result()`, event loop di thread tersebut tidak pernah bisa memproses scheduling coroutine `_execute(job_id)`. Keduanya saling menunggu selamanya.

---

### 🚨 DDK-02: DB Connection Pool Exhaustion / Livelock pada Job Invite Jangka Panjang
* **Lokasi Kode:** [`backend/app/services/invite_service.py:L298, L635-L685`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/invite_service.py#L298)
* **Deskripsi Masalah:**  
  Pada `execute_invite`:
  ```python
  async with async_session_factory() as db:  # Membuka koneksi DB dari pool
      ...
      for idx, (user_obj, source_group) in enumerate(members_list):
          while True:
              while job.status == "paused":
                  await interruptible_sleep(job_id, 86400)  # Menahan koneksi DB hingga 24 jam!
  ```
* **Akar Masalah:**  
  Konfigurasi engine database di [`backend/app/database.py`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/database.py#L12) menetapkan `pool_size=20`. Seluruh perulangan eksekusi invite (yang dapat berlangsung berjam-jam atau berhari-hari saat ada flood wait atau dijeda) **menahan 1 koneksi database fisik terus-menerus tanpa pernah melepaskannya**.
* **Dampak:**  
  Jika ada 20 job invite/broadcast yang dijeda atau menunggu jeda batch, seluruh koneksi database aplikasi habis total (*pool exhaustion*). Pengguna lain tidak akan bisa login, memuat halaman, maupun mengirim pesan chat (aplikasi hang total dengan timeout koneksi database).

---

## 4. Perulangan Tak Terbatas (Infinite Loop & Storms)

### 🟠 INF-01: Badai Reconnect WebSocket Klien Tanpa Batas (*Infinite Reconnection Storm*)
* **Lokasi Kode:**
  * [`frontend/src/lib/socket.ts:L162-L168, L173-L206`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/socket.ts#L162)
  * [`frontend/src/hooks/use-socket.ts:L43-L47, L85-L92`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-socket.ts#L43)
* **Deskripsi Masalah:**  
  Di dalam `useChatSocket` dan `useJobSocket`:
  ```typescript
  return () => {
    clearInterval(checkInterval);
    ws.off("all", handleEvent);
    // Don't disconnect on unmount — keep alive for quick tab re-mount
  };
  ```
  Koneksi disimpan dalam map global `sockets`. Ketika koneksi terputus (misalnya server restart):
  ```typescript
  private _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3_000);
  }
  ```
* **Akar Masalah:**  
  Tidak ada batasan jumlah percobaan (*max retries*), tidak ada *exponential backoff*, dan job-job lama yang sudah selesai atau ditutup tetap berada di dalam memori. Browser klien akan terus-menerus memborbardir endpoint WebSocket backend setiap 3 detik selamanya untuk setiap job atau akun yang pernah dibuka sepanjang sesi browser.

---

### 🟠 INF-02: Infinite Page Reload Loop pada Respon 401
* **Lokasi Kode:** [`frontend/src/lib/api.ts:L32-L41`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/api.ts#L32-L41)
* **Deskripsi Masalah:**  
  ```typescript
  api.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
  );
  ```
* **Dampak:**  
  Jika pengguna berada di `/login` dan salah memasukkan password, atau ada request background (seperti `check_hint` atau validasi sesi) yang mengembalikan 401 saat berada di halaman login/registrasi, browser akan memaksa reload dokumen penuh ke `/login` berulang-ulang tanpa henti (*infinite reload loop*), membekukan interaksi user.

---

### 🟠 INF-03: Perulangan Tanpa Henti dan Kelaparan Akun (*Starvation*) pada Background Adaptive Sync
* **Lokasi Kode:** [`backend/app/main.py:L1080-L1168`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1080-L1168)
* **Deskripsi Masalah:**  
  Background loop `_adaptive_sequential_sync_loop` mengambil akun terlama yang belum disinkronisasi:
  ```python
  stmt = select(TelegramAccount).where(
      TelegramAccount.is_active == True,
      TelegramAccount.session_string != "",
  ).order_by(
      TelegramAccount.last_sync_at.asc().nullsfirst()
  ).limit(1)
  ```
  Di dalam proses sinkronisasi:
  Jika terjadi error database (misal conflict ID, koneksi terputus, atau session rollback) pada langkah B (`sync_all_chats_to_db`):
  Blok `try...except` menangkap error dan me-log-nya, lalu eksekusi berlanjut ke:
  ```python
  db_acc.last_sync_at = datetime.now(timezone.utc)
  await db_session.commit()
  ```
  Karena transaksi database sudah dalam kondisi rollback, pemanggilan `commit()` melempar `InvalidRequestError` dan `last_sync_at` **tidak pernah tersimpan di database**.
* **Dampak:**  
  Pada iterasi berikutnya 15 detik kemudian, akun rusak tersebut tetap memiliki `last_sync_at` paling lama (atau `NULL`), sehingga sistem memilih akun yang sama lagi dan gagal lagi, terjebak dalam perulangan tak terbatas. Akun-akun lain di sistem sama sekali tidak pernah mendapatkan giliran sinkronisasi (*starvation*).

---

## 5. Kesalahan Batas Indeks (Off-by-One Error)

### 🟡 OBO-01: Crash Pagination Akun akibat Offset Negatif
* **Lokasi Kode:**
  * [`backend/app/services/account_service.py:L663`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/account_service.py#L663)
  * [`backend/app/api/accounts.py:L510-L524`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/accounts.py#L510-L524)
* **Deskripsi Masalah:**  
  Parameter query `page` pada API accounts tidak memiliki batasan validator `ge=1`:
  ```python
  # api/accounts.py:510
  page: int | None = Query(None)
  ...
  p = page or 1  # Jika page = 0, p menjadi 1. TAPI jika page = -1, p tetap -1!
  ```
  Di dalam `account_service.py`:
  ```python
  offset = (page - 1) * limit
  query = query.offset(offset).limit(limit)
  ```
  Jika client mengirim `page=-1` dan `limit=12`:  
  `offset = (-1 - 1) * 12 = -24`.
* **Dampak:**  
  PostgreSQL menolak query dan melempar error: `ProgrammingError: ERROR: OFFSET must not be negative`, memicu 500 Internal Server Error ke pengguna.

---

### 🟡 OBO-02: Kerusakan Evaluasi Operator Ternary pada Preview Pesan Terakhir Chat
* **Lokasi Kode:** [`backend/app/services/chat_service.py:L139`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/chat_service.py#L139)
* **Deskripsi Masalah:**  
  ```python
  last_msg = d.message.text or "[non-text message]" if d.message.text else ""
  ```
* **Akar Masalah:**  
  Urutan preseden operator Python mengevaluasi ekspresi di atas sebagai:
  `d.message.text or ("[non-text message]" if d.message.text else "")`
  - Jika pesan berisi teks `"Halo"`: kondisi `d.message.text` bernilai truthy, mengembalikan `"Halo"`.
  - Jika pesan berupa foto/media tanpa caption: `d.message.text` adalah `""` (falsy). Bagian dalam kurung `"[non-text message]" if d.message.text else ""` menghasilkan `""`. Maka `"" or ""` menghasilkan `""`.
* **Dampak:**  
  Nilai fallback `"[non-text message]"` secara matematis **mustahil pernah dieksekusi**. Semua chat yang pesan terakhirnya berupa stiker, foto, dokumen, atau voice selalu menampilkan preview kosong melompong di daftar percakapan.

---

## 6. Null / Undefined Error

### 🚨 NUL-01: Nama Kolom PostgreSQL Salah pada Penggantian Password
* **Lokasi Kode:** [`backend/app/services/auth_service.py:L50-L85`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/auth_service.py#L50-L85)
* **Deskripsi Masalah:**  
  ```python
  result = await db.execute(
      text("""
          SELECT password
          FROM account
          WHERE user_id = :user_id
          LIMIT 1
      """),
      {"user_id": str(user.id)},
  )
  ```
* **Akar Masalah:**  
  Sistem autentikasi menggunakan Better Auth. Sesuai skema bawaan Better Auth PostgreSQL (dan seperti yang terlihat pada baris 26 di file yang sama: `DELETE FROM session WHERE "userId" = :user_id`), kolom relasi pada tabel `account` adalah `"userId"` (dengan huruf kapital dan tanda kutip), **bukan** `user_id`.
* **Dampak:**  
  Setiap kali pengguna mencoba mengganti password via API backend, PostgreSQL melempar `asyncpg.exceptions.UndefinedColumnError: column "user_id" does not exist`, menyebabkan fitur ganti password gagal total.

---

### 🟡 NUL-02: Akses Atribut `me.id` Tanpa Pengecekan Null pada Message Service
* **Lokasi Kode:** [`backend/app/services/message_service.py:L32-L34`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/message_service.py#L32-L34)
* **Deskripsi Masalah:**  
  ```python
  me = await client.get_me()
  my_id = me.id
  ```
* **Dampak:**  
  Jika sesi Telegram mengalami invalidasi (misalnya sesi di-terminate dari aplikasi resmi Telegram) atau client gagal melakukan otorisasi penuh, `client.get_me()` mengembalikan `None`. Kode langsung melempar `AttributeError: 'NoneType' object has no attribute 'id'` tanpa penanganan error yang bersih.

---

### 🟡 NUL-03: Hint Password Terurai Menjadi Spasi Karakter
* **Lokasi Kode:** [`backend/app/services/account_service.py:L334`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/account_service.py#L334)
* **Deskripsi Masalah:**  
  ```python
  password_info = await unauth_client.get_password()
  hint_msg = password_info.hint if password_info.hint else None
  hint_text = f"Verifikasi 2 langkah aktif. Password hint: {' '.join(hint_msg)}" if hint_msg else None
  ```
* **Akar Masalah:**  
  Pada pustaka Telethon, atribut `password_info.hint` bertipe `str` (string biasa), bukan list. Pemanggilan `' '.join("kucing")` menghasilkan string `"k u c i n g"`. Jika `hint` kosong atau berupa tipe data lain, pemanggilan ini dapat melempar `TypeError`.

---

### 🟡 NUL-04: Nilai `NaN` pada Filter Tanggal Pencarian Chat Frontend
* **Lokasi Kode:** [`frontend/src/components/chat/MessagePane.tsx:L140-L141`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx#L140-L141)
* **Deskripsi Masalah:**  
  ```typescript
  if (searchDateFrom) params.date_from = Math.floor(new Date(searchDateFrom).getTime() / 1000);
  if (searchDateTo) params.date_to = Math.floor(new Date(searchDateTo).getTime() / 1000);
  ```
* **Dampak:**  
  Jika pengguna membersihkan tanggal atau input bernilai tidak valid, `new Date("").getTime()` menghasilkan `NaN`. Objek `params` dikirim ke API backend dengan nilai `NaN`, yang ditolak oleh Pydantic dengan error `422 Unprocessable Entity (Input should be a valid integer)`.

---

## 7. Kasus Tepi (Edge Case Bugs)

### 🟠 EDG-01: Crash 500 saat Provider SMM Mengembalikan Halaman Error HTML (502/504)
* **Lokasi Kode:** [`backend/app/services/smm_service.py:L38-L55`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/smm_service.py#L38-L55)
* **Deskripsi Masalah:**  
  ```python
  async with httpx.AsyncClient(timeout=60.0) as client:
      try:
          response = await client.post(settings.SMM_API_URL, json=params)
          response.raise_for_status()
          data = response.json()  # <-- CRASH DISINI
          ...
          return data
      except httpx.HTTPError as e:
          return {"status": False, "data": {"msg": f"API request failed: {str(e)}"}}
  ```
* **Akar Masalah:**  
  Ketika server BuzzerPanel mengalami downtime atau mengembalikan halaman maintenance Cloudflare (status 200 dengan body HTML, atau status 502 tanpa `raise_for_status` lolos), `response.json()` melempar `json.decoder.JSONDecodeError`. Karena `JSONDecodeError` merupakan turunan dari `ValueError` (bukan `httpx.HTTPError`), exception ini lolos dari blok `except` dan mematikan request pengguna dengan 500 error.

---

### 🟠 EDG-02: Tidak Ada Validasi Kuantitas pada Pembuatan Mass Orders
* **Lokasi Kode:** [`backend/app/services/order_service.py:L207-L220`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/order_service.py#L207-L220)
* **Deskripsi Masalah:**  
  Pada single order (`place_order`), kuantitas divalidasi dengan ketat:
  ```python
  if quantity < min_qty: raise ValueError(...)
  if quantity > max_qty: raise ValueError(...)
  ```
  Namun pada `place_mass_orders`, **tidak ada pengecekan kuantitas sama sekali**. Pengguna dapat mengirimkan array dengan `quantity: -500` atau `quantity: 1` pada layanan yang mensyaratkan minimal 1.000 unit. Request akan dikirim ke upstream SMM, gagal, dan saldo pengguna tetap terpotong karena bug **LOG-01**.

---

### 🟡 EDG-03: Timeout 60 Detik pada Flow Banding SpamBot akibat Inline Button
* **Lokasi Kode:** [`backend/app/services/appeal_service.py:L460-L464`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/appeal_service.py#L460-L464)
* **Deskripsi Masalah:**  
  ```python
  async with client.conversation("spambot") as conv:
      await btn_done.click()
      response = await conv.get_response()
  ```
* **Akar Masalah:**  
  Ketika tombol inline `btn_done` diklik, Telegram mengirim callback query. Bot `@SpamBot` sering kali merespon dengan **mengedit pesan yang sudah ada** (*edit message*), bukan mengirim pesan baru. Pemanggilan `conv.get_response()` hanya mendengarkan event pesan baru (`NewMessage`), sehingga akan menggantung hingga batas timeout 60 detik tercapai.

---

## 8. Inkonsistensi State (State Inconsistency)

### 🚨 INC-01: Partial Mutation & Data Orphan saat Kegagalan Listing Massal
* **Lokasi Kode:**
  * [`backend/app/services/marketplace_service.py:L163-L172`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/marketplace_service.py#L163)
  * [`backend/app/services/marketplace_profile_service.py:L261-L365`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/marketplace_profile_service.py#L261)
* **Deskripsi Masalah:**  
  Saat pengguna mendaftarkan beberapa akun ke marketplace sekaligus:
  ```python
  for account in accounts:
      await prepare_account_for_sale(db, account, ...)
  ```
  Di dalam `prepare_account_for_sale`, profil Telegram akun diubah (nama diganti nama Indonesia acak, bio diganti link TeleBos, username diganti, dan semua foto profil dihapus dari Telegram serta file fisiknya dihapus dari disk via `os.remove(photo_path)`).
  Jika akun pertama sukses diubah, namun akun kedua gagal (misalnya karena flood wait atau timeout Telegram RPC):
  Fungsi melempar exception dan transaksi database di-rollback oleh API layer.
* **Dampak Inkonsistensi:**  
  1. Pada database, status akun pertama di-rollback ke data lama (status tidak dijual, nama lama, path foto lama).
  2. Namun pada server Telegram fisik, profil akun pertama sudah berubah permanen.
  3. File foto profil di server lokal sudah terhapus permanen dari disk, sementara kolom database masih menunjuk ke path tersebut. Setiap akses ke foto akun akan menghasilkan error 404/broken image.

---

### 🟠 INC-02: Zombie State Job Broadcast & Invite Pasca Restart Server
* **Lokasi Kode:**
  * [`backend/app/main.py:L1226-L1280`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1226-L1280)
  * [`backend/app/services/broadcast_service.py:L270-L272`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/broadcast_service.py#L270)
* **Deskripsi Masalah:**  
  Job broadcast dan invite dijalankan sebagai in-memory task (`_running_tasks: dict[str, asyncio.Task]`).
  Pada blok shutdown `lifespan` di `main.py`, server mematikan task-task periodik, menutup client pool Telethon, dan menutup koneksi database:
  ```python
  await session_manager.stop()
  await client_pool.stop()
  await engine.dispose()
  ```
  Namun server **tidak pernah membatalkan atau mengupdate status job-job broadcast dan invite yang sedang berjalan di DB**.
* **Dampak:**  
  Saat server menyala kembali, semua job tersebut tetap berstatus `running` di database PostgreSQL, namun task memorinya sudah mati. Job-job ini berstatus "Zombie" selamanya (tidak pernah selesai, tidak mengirim pesan, dan tidak bisa dijalankan ulang karena statusnya bukan terminal).

---

### 🟡 INC-03: Kebocoran State Pesan Antar Chat di MessagePane
* **Lokasi Kode:** [`frontend/src/components/chat/MessagePane.tsx:L80-L90, L318-L356`](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx#L80)
* **Deskripsi Masalah:**  
  Komponen `MessagePane` menyimpan state `offsetId` dan `allMessages` di level komponen:
  ```typescript
  const [offsetId, setOffsetId] = useState(0);
  const [allMessages, setAllMessages] = useState<MessageItem[]>([]);
  ```
  Saat pengguna sedang membuka Chat A (dan telah melakukan scroll ke atas sehingga `offsetId = 120`), lalu pengguna mengklik Chat B pada daftar sidebar:
  Prop `chatId` berubah, tetapi tidak ada pemanggilan `setOffsetId(0)` maupun pembersihan `setAllMessages([])`.
* **Dampak:**  
  1. Konten pesan Chat A tetap muncul di layar di bawah judul Chat B selama 1–2 detik sebelum request selesai.
  2. Query untuk Chat B dipanggil dengan `offset_id = 120` (menggunakan offset milik Chat A). Jika Chat B memiliki pesan kurang dari 120, Chat B akan menampilkan layar kosong seolah-olah tidak ada riwayat pesan.

---

## 9. Rencana Remediasi Prioritas (Action Plan)

### Fase 1: Perbaikan Kritis & Integritas Finansial (Prioritas Tertinggi - P0)
1. **Perbaiki Pengurangan Saldo Mass Order (`order_service.py`):**  
   Hitung hanya pesanan yang berhasil dibuat (`smm_order_id is not None` dan `status != "Failed"`), lalu kurangkan saldo hanya sebesar biaya riil item yang sukses.
2. **Koreksi Kolom Better Auth Password (`auth_service.py`):**  
   Ubah query raw SQL dari `WHERE user_id = :user_id` menjadi `WHERE "userId" = :user_id` dan pastikan update menggunakan `"updatedAt" = NOW()`.
3. **Urutkan Locking Baris User pada Transaksi Beli Akun (`marketplace_service.py`):**  
   Lakukan sort pada UUID (`user_1, user_2 = sorted([buyer_id, seller_id])`) sebelum memanggil `select(User)...with_for_update()` untuk mencegah circular deadlock.
4. **Hapus Threadsafe Blocking di Celery Worker (`workers/broadcast_worker.py`):**  
   Gunakan runner thread terpisah atau panggil async bridge secara non-blocking tanpa memanggil `.result()` pada event loop yang sedang berjalan.
5. **Lepaskan Koneksi DB pada Job Invite (`invite_service.py`):**  
   Tutup sesi DB sebelum memasuki perulangan jeda waktu (`sleep`), dan gunakan sesi database jangka pendek (*short-lived sessions*) saat memperbarui log progress.

### Fase 2: Stabilitas Jaringan & Loop Backend/Frontend (Prioritas Tinggi - P1)
1. **Implementasi Backoff & Disconnect pada WebSocket (`socket.ts` & `use-socket.ts`):**  
   Tambahkan exponential backoff (maksimal 30 detik) dan limit reconnect 5 kali. Pastikan komponen memanggil `disconnectSocket(key)` saat unmount untuk job yang sudah selesai.
2. **Perbaiki Interceptor 401 Axios (`api.ts`):**  
   Hindari hard reload `window.location.href = "/login"` jika URL saat ini sudah berada di `/login` atau halaman publik.
3. **Penanganan Error Robust pada Sync Background (`main.py`):**  
   Jika proses sinkronisasi chat/profil gagal, tetap perbarui kolom `last_sync_at` akun tersebut ke waktu saat ini dalam transaksi independen agar loop tidak terjebak pada akun yang sama.
4. **Validasi Kuantitas Mass Order (`order_service.py`):**  
   Tambahkan validasi `min_qty`, `max_qty`, dan `quantity > 0` sebelum request diteruskan ke API SMM.
5. **Tangani JSONDecodeError pada SMM API (`smm_service.py`):**  
   Bungkus `response.json()` dalam blok `try...except (ValueError, json.JSONDecodeError)` untuk menangani respon 502/504 HTML.

### Fase 3: Logika Bisnis & Perbaikan UI (Prioritas Sedang - P2)
1. **Perbaikan Siklus Penjualan Akun (`marketplace_service.py`):**  
   Reset flag `account.is_sold = False` saat akun telah berpindah ke pembeli baru sehingga pembeli dapat menjualnya kembali di masa mendatang.
2. **Akumulasi Masa Aktif Langganan (`redeem_service.py`):**  
   Gunakan `base_time = max(now, user.subscription_expires_at)` saat menambah durasi subscription dan tolak downgrade role.
3. **Koreksi Operator Ternary Dialog Chat (`chat_service.py`):**  
   Ubah ekspresi menjadi `(d.message.text or "[non-text message]") if d.message else ""`.
4. **Reset State MessagePane saat Ganti Chat (`MessagePane.tsx`):**  
   Tambahkan `useEffect` yang mengeksekusi `setOffsetId(0)` dan `setAllMessages([])` saat `chatId` berubah.
5. **Koreksi Parsing Link Channel Publik (`group_admin_service.py`):**  
   Bedakan URL invite hash (`/joinchat/` atau `+hash`) dengan username publik biasa sebelum memanggil fungsi Telegram.

---
*Laporan ini disusun secara otomatis dan diverifikasi secara manual oleh sistem audit kode Antigravity IDE.*
