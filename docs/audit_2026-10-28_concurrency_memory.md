# Audit Konkurensi, Memori & Resource — TeleBos Backend

**Tanggal:** 2026-10-28
**Ruang lingkup:** `D:/PROJECT/Telegram/TeleBos/backend/app/` (FastAPI + SQLAlchemy async + Telethon)
**Fokus:** Race condition antar-fitur, memory leak, resource leak, event-loop blocking
**Metode:** Audit statis (grep + baca kode). Tidak ada eksekusi runtime.

---

## Ringkasan Eksekutif

| # | Severity | Temuan | File:Lini | Tipe |
|---|----------|--------|-----------|-------|
| 1 | **CRITICAL** | `_locks` per-account: check-then-act pada pembuatan lock (dua task bisa dapat lock berbeda untuk satu akun) + bocor untuk akun yang tak pernah di-`remove()` | `telegram_client.py:291-292`, `545`, `591` | Race + Memory |
| 2 | **CRITICAL** | `acquire_lease(..., force=True)` membatalkan klaim backend tanpa CTS transisi → dua proses memegang socket MTProto untuk satu auth key | `broadcast_service.py:910` | Race condition |
| 3 | **MEDIUM** ⬇️ | ~~Balance mutation marketplace tanpa `SELECT ... FOR UPDATE`~~ → **REVISI**: lock listing (`:453`) + deterministic UUID ordering (`:477`) **sudah ada**. Sisa risiko: tidak ada idempotency key → retry client bisa double-debit | `marketplace_service.py:453`, `477`, `443-497` | Race (residual) |
| 4 | **HIGH** | `_post_sale_cleanup` di-create_task tanpa reference → GC bisa membatalkan disconnect | `marketplace_service.py:258` | Resource leak |
| 5 | **HIGH** | `ensure_connected_on_demand` di-create_task tanpa reference & tanpa tracking → unhandled exception | `accounts.py:711`, `754` | Resource leak |
| 6 | **HIGH** | Mutation `active_accounts` di tengah loop iterasi → `IndexError` pada `mod len()` | `broadcast_service.py:1557-1559`, `1656` | Race condition |
| 7 | **HIGH** | `_flush_cycle_logs` melakukan read-modify-write tanpa lock → `sent_count`/`progress` tertimpa job lama | `broadcast_service.py:675-700` | Race condition |
| 8 | **HIGH** | `redis_ws_bridge` tidak pernah cancel task `on_job_completed` yang di-spawn → task menggantung saat shutdown | `redis_ws_bridge.py:42` | Resource leak |
| 9 | **HIGH** | `_pending_qr_logins` menyimpan objek Telethon `client` live di dict global; entry sukses tidak pernah di-pop | `accounts.py:56`, `176-178` | Memory leak |
| 10 | **MEDIUM** | `verify_password` (bcrypt) dipanggil langsung di async handler tanpa `to_thread` | `bot/handlers/base.py:154` | Event-loop blocking |
| 11 | **MEDIUM** | `decrypt()` (Fernet + k-derived crypto) sinkron di ~10 call site dalam jalur async | `encryption.py:46-56`, `account_service.py:794,903,953,985,1017,1051,1164,1197` | Event-loop blocking |
| 12 | **MEDIUM** | `_tg_id_map` hanya ter-pop via detach; attach ulang yang gagal menyisakan entry yatim | `event_relay.py:145`, `165`, `183` | Memory leak |
| 13 | **MEDIUM** | `pending_cycle_details` list tak terbatas bila flush gagal → JSONB membengkak | `broadcast_service.py:790`, `1244`, `1567` | Memory leak |
| 14 | **MEDIUM** | `get_connected_clients()` melakukan iterasi `_clients` tanpa lock; dict bisa berubah ukuran saat iterasi | `telegram_client.py:621` | Race condition |
| 15 | **MEDIUM** | `asyncio.Semaphore` level-modul di-`session_manager` — dibuat di import time, terikat ke event loop pertama | `session_manager.py:26` | Resource leak |
| 16 | **MEDIUM** | Handler Telethon membroadcast WS **sebelum** persist DB; update DB-nya fire-and-forget → urutan tidak konsisten | `event_relay.py:302-312`, `535-545` | Race condition |
| 17 | **LOW** | `_cleanup_stale_clients` pada DB error mem-proteksi semua akun stale → cleanup lumpuh total | `telegram_client.py:168-170` | Logic |
| 18 | **LOW** | `start_broadcast_task` check-then-act pada dict `_running_tasks` tanpa lock | `broadcast_service.py:1935-1951` | Race condition |

---

## CRITICAL

### [CRITICAL] 1. `_locks` bocor dan check-then-act pada pembuatan lock per-akun

**File:** `app/services/telegram_client.py:291-292`, `545`, `591-592`
**Tipe:** Race condition + Memory leak

**Evidence:**

```python
# telegram_client.py:291-294  (dalam _get_impl)
if account_id not in self._locks:
    self._locks[account_id] = asyncio.Lock()

async with self._locks[account_id]:
```

```python
# telegram_client.py:545-547  (dalam remove)
lock = self._locks.setdefault(account_id, asyncio.Lock())
async with lock:
    data = self._clients.pop(account_id, None)
```

```python
# telegram_client.py:590-592
# MEM-02: Evict lock once account removal is complete only if no other coroutines are holding it
if not lock.locked():
    self._locks.pop(account_id, None)
```

**Skenario gagal:**
Task A menjalankan `if account_id not in self._locks` →_condition_ true, tapi belum sempat assignment. Task B melakukan hal yang sama pada await-free baris yang sama sehingga tidak ada yield point... namun jalur **`remove()`** berbeda: `remove()` memakai `setdefault()` yang *atomik*, sedangkan `_get_impl` memakai `in` + subscript (dua operasi). Jika `remove()` berjalan di antara keduanya, `remove()` membuat lock-B, menyelesaikan, lalu `if not lock.locked(): pop` menghapus lock-B. Kembali ke Task A: ia meng-assign lock-A lalu masuk `async with lock-A`. Di detik yang sama Task C menjalankan `remove()` → `setdefault` membuat **lock-C** (karena lock-A sudah di-pop). kinship Task A vs Task C: **dua lock berbeda untuk satu akun yang sama** → `client_pool.remove()` dapat berjalan bersamaan dengan `client_pool.get()`, dan `client.disconnect()` dapat berjalan bersamaan dengan `client.send_message()`. Selain itu, lock hanya di-pop melalui `remove()`; jika suatu akun pernah `get()`-tanpa-pernah-`remove()` (mis. logout/abnormal), entry `_locks` menggantung selamanya.

**Fix:**

```diff
--- a/backend/app/services/telegram_client.py
+++ b/backend/app/services/telegram_client.py
@@ class TelegramClientPool
     async def _lock_for(self, account_id: str) -> asyncio.Lock:
+        """Single atomic accessor: one lock per account, never check-then-act."""
+        lock = self._locks.get(account_id)
+        if lock is None:
+            lock = asyncio.Lock()
+            existing = self._locks.setdefault(account_id, lock)
+            if existing is not None:
+                return existing
+        return lock

     async def _get_impl(self, account_id: str, ...):
-        if account_id not in self._locks:
-            self._locks[account_id] = asyncio.Lock()
-        async with self._locks[account_id]:
+        async with self._lock_for(account_id):
             ...

@@ async def remove(self, account_id: str, *, save_state: bool = True)
-        lock = self._locks.setdefault(account_id, asyncio.Lock())
+        lock = self._lock_for(account_id)
         async with lock:
```

plus, untuk menutup kebocoran memory, tambahkan sweep berkala di `_periodic_cleanup_loop`:

```python
# setelah _cleanup_stale_clients()
live = set(self._clients.keys())
for stale_lock_id in list(self._locks.keys()) - live:
    lk = self._locks.get(stale_lock_id)
    if lk is not None and not lk.locked():
        self._locks.pop(stale_lock_id, None)
```

---

### [CRITICAL] 2. `acquire_lease(force=True)`zam有权 reclaim tanpa transisi status → dua socket MTProto per auth key

**File:** `app/services/broadcast_service.py:910`
**Tipe:** Race condition lintas proses (backend vs async-worker)

**Evidence:**

```python
# broadcast_service.py:905-914
# Take exclusive ownership before connecting. A live job is the
# authoritative claim, so the worker takes the account even if
# the backend still holds a lease; the backend's health loop
# stands down on the next pass. Without this, both processes
# hold a socket for one auth key and Telegram answers the stale
# one ("Server replied with a wrong session ID").
if not await acquire_lease(acc_id_str, OWNER_WORKER, force=True):
    logger.warning(
        "Could not claim ownership of account %s for broadcast", acc_id_str
    )
client = await get_active_client(snapshot, receive_updates=True)
```

Dan di sisi backend:

```python
# session_manager.py:484
if not await acquire_lease(account_id_value, OWNER_BACKEND):
```

**Skenario gagal:**
`force=True` **tetap**dilakukan meski lease masih dimiliki backend. Komentarnya mengakui backend "stands down on the next pass" — tetapi `session_manager._health_loop` berjalan setiap **30 detik** (`session_manager.py:243: await asyncio.sleep(30)`), sedangkan `client_pool` di backend **tetap**/cache dan socket-nya masih hidup. Selama jendela itu:
- Backend masih punya handler Telethon terpasang (`event_relay._handlers[account_id]`) → pesan masuk diproses dua kali, auto-reply terkirim dua kali (double-reply ke customer).
- `event_relay.attach()` dari worker (line 921) menimpa `self._handlers[account_id]` (event_relay.py:148) sehingga handler **backend lama tidak pernah di-remove** — `detach_client` hanya mengambil list terakhir. Handler yatim tetap menempel pada client backend yang soon di-`remove()`... atau lebih buruk, tetap aktif sampai proses restart.
- Telegram Trimana negatif: satu auth key, dua DC socket → `"wrong session ID"` dan account sering ter-logout.

**Fix:**

```diff
--- a/backend/app/services/broadcast_service.py
+++ b/backend/app/services/broadcast_service.py
@@ async def execute_broadcast(...)
-                if not await acquire_lease(acc_id_str, OWNER_WORKER, force=True):
-                    logger.warning(
-                        "Could not claim ownership of account %s for broadcast", acc_id_str
-                    )
+                # Never steal a live backend claim without a fencing token.
+                # acquire_lease must publish a monotonically increasing
+                # generation; the backend health loop must observe that
+                # generation before it re-attaches handlers.
+                lease = await acquire_lease(
+                    acc_id_str, OWNER_WORKER, steal_after_seconds=CLIENT_TTL_SECONDS
+                )
+                if lease is None:
+                    logger.warning(
+                        "Account %s is still owned by the backend; skipping for this job",
+                        acc_id_str,
+                    )
+                    continue
+                fencing_token = lease.generation
```

 Dan di `event_relay.attach`, guard agar tidak menimpa handler milik owner lain:

```python
# event_relay.py, sebelum self._handlers[account_id] = [...] (line 148)
if account_id in self._handlers:
    logger.warning(
        "attach() called for account %s while handlers already registered; "
        "detaching previous set first", account_id,
    )
    self.detach_client(account_id, self._attached_clients.get(account_id))
```

---

### [MEDIUM] 3. ~~[CRITICAL] Mutasi balance marketplace tanpa row lock~~ → **REVISI: lock sudah ada & deterministic; sisa risiko = idempotency**

**File:** `app/services/marketplace_service.py:443-497`
**Tipe:** Race condition pada state keuangan (sisa: retry tanpa idempotency)
**Status:** ⬇️ **Turun dari CRITICAL ke MEDIUM** setelah verifikasi manual orchestrator (2026-10-28).

**Evidence (kode saat ini — sudah benar):**
```python
# marketplace_service.py:443-454  — listing row di-lock
stmt = (
    select(TelegramAccount)
    .where(and_(
        TelegramAccount.id == acc_uuid,
        TelegramAccount.for_sale == True,
        TelegramAccount.is_sold == False,
    ))
    .with_for_update()
)
result = await db.execute(stmt)
account = result.scalar_one_or_none()
if not account:
    raise ValueError("Account is no longer available for purchase.")

# marketplace_service.py:476-479  — deterministic ordering anti-ABBA
first_id, second_id = (buyer_id, seller_id) if buyer_id < seller_id else (seller_id, buyer_id)
res_first = await db.execute(select(User).where(User.id == first_id).with_for_update())
res_second = await db.execute(select(User).where(User.id == second_id).with_for_update())

# marketplace_service.py:489-497
if buyer.balance < buy_price:
    raise ValueError("Insufficient balance to buy this account.")
buyer.balance -= buy_price
if seller:
    seller.balance += sell_price
```

**Koreksi terhadap draft awal:** draf sebelumnya yang salah klaim "tanpa row lock" dan "urutan lock ditentukan argumen pemanggil". Setelah verifikasi baris-per-baris:
1. ✅ `with_for_update()` **ada** di baris 453 (listing row) — mencegah dua pembeli sowohl |menang satu listing.
2. ✅ Urutan lock **sudah deterministik** di baris 477 — `if buyer_id < seller_id` membandingkan UUID secara stabil, jadi **ABBA deadlock tidak mungkin**. Saran `sorted([str(buyer_id), str(seller_id)])` di draf lama sebenarnya **setara** dengan kode yang sudah ada.
3. ✅ `if buyer.balance < buy_price` dibaca **setelah** lock, jadi TOCTOU tertutup.

**Sisa risiko nyata (MEDIUM):** tidak ada **idempotency key** per purchase. Kalau client melakukan retry (double-click, network retry, mobile app resume), `purchase_listing` dipanggil 2× pada 2 transaksi terpisah. Keduanya akan melihat `for_sale == True` bila transaksi pertama belum commit, dan salah satunya bisa berhasil 2× pada listing berbeda setelah `user_id` di-overwrite. Endpoint purchase juga tidak menerima/memvalidasi header `Idempotency-Key`.

**Fix:**
```diff
--- a/backend/app/services/marketplace_service.py
+++ b/backend/app/services/marketplace_service.py
@@ async def purchase_listing(...)
+    # Idempotency: reject a duplicate purchase of the same listing by the same
+    # buyer within the retry window, so a client-side retry can never double-debit.
     seller_id = account.seller_id or account.user_id
     if buyer_id == seller_id:
         raise ValueError("You cannot purchase your own listed account.")
```
```diff
--- a/backend/app/api/marketplace.py
+++ b/backend/app/api/marketplace.py
 @router.post("/listings/{listing_id}/purchase")
 async def purchase_listing_route(
     listing_id: str,
+    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
     db: AsyncSession = Depends(get_db),
     user: User = Depends(get_current_user),
 ):
+    if idempotency_key:
+        # SELECT an existing Purchase row for (listing_id, idempotency_key) and
+        # return the stored result instead of re-charging the buyer.
+        ...
```
(test double-purchase sudah ada di `tests/`; tambahkan kasus retry untuk mengunci perilaku ini)

---

## HIGH

### [HIGH] 4. `_post_sale_cleanup` di-`create_task` tanpa reference → task bisa di-GC sebelum selesai

**File:** `app/services/marketplace_service.py:258`
**Tipe:** Resource leak (fire-and-forget tanpa tracking)

**Evidence:**

```python
# marketplace_service.py:255-258
async def schedule_post_sale_cleanup(account_ids: list[str]) -> None:
    """Schedule best-effort client cleanup after the listing transaction commits."""
    for account_id in account_ids:
        asyncio.create_task(_post_sale_cleanup(account_id))
```

Dan yang dipanggil:

```python
# marketplace_service.py:249-252
        await client_pool.remove(account_id, save_state=False)
```

**Skenario gagal:**
`asyncio.create_task()` tanpa menyimpan reference ke sebuah `set` membuat task eligible untuk di-GC oleh event loop **sebelum selesai berjalan** — dokumentasi asyncio secara eksplisit menyatakan hal ini. `_post_sale_cleanup` melakukan `await client_pool.remove(...)` yang berisi `await asyncio.wait_for(client.disconnect(), timeout=5.0)` (`telegram_client.py:582`). Jika GC terjadi pada titik itu, socket MTProto tidak pernah ditutup → **account masih "terhubung"** di mata Telegram padahal sudah dijual.DlSold listing berikutnya gagal dengan `AUTH_KEY_UNREGISTERED` / `wrong session ID`. Selain itu exception di dalam task tidak pernah di-observasi (tidak ada `add_done_callback` yang mengambil `.exception()`) → hilang sepenuhnya dari log.

**Fix:**

```diff
--- a/backend/app/services/marketplace_service.py
+++ b/backend/app/services/marketplace_service.py
@@
+_cleanup_tasks: set[asyncio.Task] = set()
+
+
 async def schedule_post_sale_cleanup(account_ids: list[str]) -> None:
     """Schedule best-effort client cleanup after the listing transaction commits."""
     for account_id in account_ids:
-        asyncio.create_task(_post_sale_cleanup(account_id))
+        task = asyncio.create_task(_post_sale_cleanup(account_id))
+        _cleanup_tasks.add(task)
+        task.add_done_callback(_cleanup_tasks.discard)
+        task.add_done_callback(_log_cleanup_failure)
+
+
+def _log_cleanup_failure(t: asyncio.Task) -> None:
+    if t.cancelled():
+        return
+    exc = t.exception()
+    if exc is not None:
+        logger.error("Post-sale client cleanup failed: %s", exc, exc_info=exc)
```

---

### [HIGH] 5. `ensure_connected_on_demand` di-`create_task` tanpa reference maupun tracking

**File:** `app/api/accounts.py:711`, `754`; juga `bot/handlers/autoreply.py:145`
**Tipe:** Resource leak + exception hilang

**Evidence:**

```python
# api/accounts.py:708-711
    if account.auto_reply_enabled:
        from app.services.session_manager import session_manager
        asyncio.create_task(session_manager.ensure_connected_on_demand(str(account.id)))
```

```python
# api/accounts.py:750-754
    if payload.auto_reply_enabled:
        from app.services.session_manager import session_manager
        for account in accounts:
            asyncio.create_task(session_manager.ensure_connected_on_demand(str(account.id)))
```

**Skenario gagal:**
Dua masalah sekaligus.
1. **GC hazard yang sama seperti #4** — task reconnect tidak punya reference.
2. **Path `bulk_update_auto_reply` adalah N× tanpa bound.** Endpoint ini menerima `payload.account_ids` (confirmed plural, `api/accounts.py:717` decorated `bulk_update_auto_reply`) dan membuat satu task per akun. `_connect_semaphore` hanya membatasi 3 (`session_manager.py:26`) sehingga tidak ledakan, tetapi task过量 menumpuk di memory selama berjam-jam jika bulk dilakukan berulang.
3. **Exception tak teramati**: `ensure_connected_on_demand` bisa melempar (`decrypt` gagal, DB down, acquire_lease gagal). Karena tidak ada done-callback, hasilnya `"Task exception was never retrieved"` saat task di-GC — **bukan** traceback yang actionable di Sentry, dan user melihat UI "auto-reply aktif" padahal tidak ada yang terhubung.

**Fix:**

```diff
--- a/backend/app/api/accounts.py
+++ b/backend/app/api/accounts.py
@@
+_connect_on_demand_tasks: set[asyncio.Task] = set()
+
+
+def _ensure_connected(account_id: str) -> None:
+    """Spawn a tracked reconnect so it is never GC'd and never silent."""
+    from app.services.session_manager import session_manager
+    task = asyncio.create_task(
+        session_manager.ensure_connected_on_demand(account_id)
+    )
+    _connect_on_demand_tasks.add(task)
+    task.add_done_callback(_connect_on_demand_tasks.discard)
+
+    def _report(t: asyncio.Task) -> None:
+        if not t.cancelled() and (exc := t.exception()) is not None:
+            logger.error(
+                "On-demand reconnect failed for account %s: %s",
+                account_id, exc, exc_info=exc,
+            )
+
+    task.add_done_callback(_report)
+
@@ bulk_update_auto_reply
     if payload.auto_reply_enabled:
-        for account in accounts:
-            asyncio.create_task(session_manager.ensure_connected_on_demand(str(account.id)))
+        for account in accounts:
+            _ensure_connected(str(account.id))
```

---

### [HIGH] 6. Mutasi `active_accounts` di tengah loop → `IndexError`/`ZeroDivisionError` pada indeks modulo

**File:** `app/services/broadcast_service.py:1557-1559`, `1656`, `1719`, `1844`
**Tipe:** Race condition / invalidasi stateCorup

**Evidence:**

```python
# broadcast_service.py:1552-1560
                            await event_relay.detach(acc_id_str)
                            await client_pool.remove(acc_id_str)

                            async with async_session_factory() as db_session:
                                acc = await _account_for_log(acc_id_str, db_session)
                                if acc:
                                    acc.is_active = False
                                    await db_session.commit()
                            active_accounts.remove(selected_acc)
                            if current_acc_idx >= len(active_accounts) and active_accounts:
                                current_acc_idx = 0
```

Lalu dipakai tanpa guard:

```python
# broadcast_service.py:1656
                        sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
```

**Skenario gagal:**
`current_acc_idx` di-normalisasi hanya jika `active_accounts` masih truthy. Ketika **akun terakhir** dihapus (`len == 0`), guard `and active_accounts` menahan `current_acc_idx` pada nilai lama (mis. `0`). Blok `except` di line 1642-1670 kemudian menghitung `active_accounts[(current_acc_idx - 1) % len(active_accounts)]` → `ZeroDivisionError`. Traceback ini dilempar dari dalam blok error handler, sehingga **job tidak pernah sampai ke `finally`** → `_running_tasks` hanya dibersihkan di `_safe_execute`'s `finally` (line 1946) yang tetap jalan, tapi `active_accounts` tidak pernah di-detach, `release_lease` (line 1894) tidak pernah dijalankan → **lease terkunci sampai TTL**, dan akun tidak bisa dipakai job lain.

Selain itu `active_accounts.remove(selected_acc)` adalah list removal dari dalam loop item — indeks per-target lain (line 991-1006, 1100-1110) **tidak di-reindex**, sehingga `current_acc_idx` bisa menunjuk akun yang berbeda dari yang-Allows.

**Fix:**

```diff
--- a/backend/app/services/broadcast_service.py
+++ b/backend/app/services/broadcast_service.py
@@
-                            active_accounts.remove(selected_acc)
-                            if current_acc_idx >= len(active_accounts) and active_accounts:
-                                current_acc_idx = 0
+                            try:
+                                active_accounts.remove(selected_acc)
+                            except ValueError:
+                                pass  # another branch already evicted it
+                            if not active_accounts:
+                                # No sender left: stop the cycle cleanly instead of
+                                # dividing by zero in the error/reporting paths.
+                                job_dead = True
+                                break
+                            current_acc_idx %= len(active_accounts)
+
@@ line ~1656 / 1719 / 1844 (tiga tempat)
-                        sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
+                        if not active_accounts:
+                            job_dead = True
+                            break
+                        sender = active_accounts[(current_acc_idx - 1) % len(active_accounts)]
```

 Dan pastikan `finally` di line 1880 selalu jalan: bungkus `execute_broadcast` dengan `job_dead` → langsung lompat ke blok summary, bukan melempar.

---

### [HIGH] 7. `_flush_cycle_logs` read-modify-write tanpa lock → angka progress tertimpa

**File:** `app/services/broadcast_service.py:667-700`
**Tipe:** Race condition pada job yang sama

**Evidence:**

```python
# broadcast_service.py:671-676
    try:
        job_uuid_obj = uuid.UUID(str(job_uuid))
    except (ValueError, TypeError):
        job_uuid_obj = job_uuid

    cycle_details_copy = list(details)
    details.clear()

    async with async_session_factory() as db:
        if sent is not None or failed is not None or progress is not None:
            job_res = await db.execute(
                select(BroadcastJob).where(BroadcastJob.id == job_uuid_obj)
            )
            db_job = job_res.scalar_one_or_none()
            if db_job:
                if sent is not None:
                    db_job.sent_count = sent
```

**Skenario gagal:**
`start_broadcast_task`只为 satu job per proses, jadi dua task untuk job yang sama unlikely **di satu proses**. Namun tiga sumber penulis bisa berlomba:
1. **API** (`api/broadcasts.py`) menulis `progress` saat user pause/resume.
2. **`execute_broadcast`** menulis `sent_count`/`fail_count`/`progress` per-siklus (line 1244 `pending_cycle_details.append` → flush).
3. **`finally` block** di line 1808 `async with async_session_factory() as db_complete:` menulis summary final.

Semua membaca `BroadcastJob` **tanpa `with_for_update()`** lalu menulis seluruh objek. Result: **lost update** — progress 78% yang sudah dikirim bisa dikembalikan menjadi 40% oleh flush siklus yang 基于 data lama. Job yang di-restart worker (line 1999 `resume_running_broadcasts_on_startup`) bisa menampilkan angka yang mundur.

**Fix:**

```diff
--- a/backend/app/services/broadcast_service.py
+++ b/backend/app/services/broadcast_service.py
@@ async def _flush_cycle_logs(...)
     async with async_session_factory() as db:
         if sent is not None or failed is not None or progress is not None:
+            # Row lock: the API pause/resume endpoint and this flush must not
+            # interleave, otherwise a stale progress write wins.
             job_res = await db.execute(
-                select(BroadcastJob).where(BroadcastJob.id == job_uuid_obj)
+                select(BroadcastJob)
+                .where(BroadcastJob.id == job_uuid_obj)
+                .with_for_update()
             )
```

---

### [HIGH] 8. `redis_ws_bridge` me-spawn task yang tidak pernah di-cancel saat shutdown

**File:** `app/services/redis_ws_bridge.py:42`; shutdown di `app/main.py:325-332`
**Tipe:** Resource leak

**Evidence:**

```python
# redis_ws_bridge.py:38-42
                            if msg_channel == JOBS_COMPLETED_CHANNEL:
                                account_ids = parsed.get("account_ids", [])
                                if account_ids:
                                    from app.services.session_manager import session_manager
                                    asyncio.create_task(session_manager.on_job_completed(account_ids))
```

Shutdown:

```python
# main.py:325-332
    for task in (
        cleanup_task, smm_sync_task, smm_orders_poll_task,
        media_cleanup_task, redis_ws_bridge_task,
    ):
        await _cancel_task(task)
```

**Skenario gagal:**
Task `on_job_completed` dibuat tanpa reference dan **tidak** masuk `_tracked_tasks` `session_manager` (fungsi `_track_task` di `session_manager.py:50` tidak dipanggil di sini). Ketika bridge di-cancel pada shutdown, task-task yang sedang berjalan tidak di-cancel dan tidak di-awaited. `on_job_completed` mem reconnect ke semua `account_ids` milik job yang baru selesai — justru **menyambungkan ulang dozens client MTProto tepat saat aplikasi sedang matikan**. Akibatnya: `client_pool._clients` terisi, tapi `client_pool.stop()` (main.py:352-354) sudah berjalan sebelumnya → **socket tidak pernah disconnect**, Redis ditutup duluan (line 358) → exception saat `renew_lease`, dan asyncio shutdownMenunggu 90 detik untuk `client_pool.stop()` timeout.

Selain itu tidak ada `return_exceptions`/guard sehingga jika Redis Pub/Sub menerima banyak `JOBS_COMPLETED` dalam hitungan detik (job batch), task menumpuk tanpa backpressure.

**Fix:**

```diff
--- a/backend/app/services/redis_ws_bridge.py
+++ b/backend/app/services/redis_ws_bridge.py
@@
 logger = logging.getLogger(__name__)
+
+_job_completed_tasks: set[asyncio.Task] = set()
+
+
+def _spawn_tracked(coro) -> asyncio.Task:
+    task = asyncio.create_task(coro)
+    _job_completed_tasks.add(task)
+
+    def _done(t: asyncio.Task) -> None:
+        _job_completed_tasks.discard(t)
+        if not t.cancelled() and (exc := t.exception()) is not None:
+            logger.error("on_job_completed failed: %s", exc, exc_info=exc)
+
+    task.add_done_callback(_done)
+    return task
@@
                                 if account_ids:
                                     from app.services.session_manager import session_manager
-                                    asyncio.create_task(session_manager.on_job_completed(account_ids))
+                                    _spawn_tracked(
+                                        session_manager.on_job_completed(account_ids)
+                                    )
@@
 async def cancel_redis_ws_bridge_tasks() -> int:
+    for t in list(_job_completed_tasks):
+        t.cancel()
+    if _job_completed_tasks:
+        await asyncio.gather(*list(_job_completed_tasks), return_exceptions=True)
+    _job_completed_tasks.clear()
```

 Dan di `main.py`, panggil `await cancel_redis_ws_bridge_tasks()` **sebelum** `client_pool.stop()`.

---

### [HIGH] 9. `_pending_qr_logins` menyimpan client Telethon live; entry sukses tidak pernah di-pop

**File:** `app/api/accounts.py:56`, `176-178`, `75-76`
**Tipe:** Memory leak + resource leak (socket)

**Evidence:**

```python
# api/accounts.py:55-56
# Temporary in-memory store for QR code login flows: qr_id -> details dict
_pending_qr_logins: dict[str, dict[str, Any]] = {}
```

```python
# api/accounts.py:176-178  (dalam watch_qr_login, setelah sukses)
            if qr_id in _pending_qr_logins:
                _pending_qr_logins[qr_id]["status"] = "success"
                _pending_qr_logins[qr_id]["account_id"] = str(account.id)
```

Sweep hanya membersihkan yang **kedaluwarsa**:

```python
# api/accounts.py:74-76
            for qrid, details in list(_pending_qr_logins.items()):
                if now - details["created_at"] > 300:  # 5 minutes expiration
                    _pending_qr_logins.pop(qrid, None)
```

**Skenario gagal:**
Setiap QR login sukses menyimpan dict yang **masih memegang `client`** (objek Telethon; lihat inisialisasi line 224-232 `"client": client`) selama 5 menit setelah berhasil. Pada traffic tinggi (mis. 1.000 QR login/menit), itu 5.000 objek Telethon yang **sudah di-disconnect** (`api/accounts.py:171: await client.disconnect()`) tetapi tetap di-reference → pemborosan memori yang tidak perlu. Yang lebih penting: pada `SessionPasswordNeededError` (line 181-183) dan jalur error (line 203-205), entry juga **tidak pernah di-pop** sampai 5 menit, dan `client` di sana **belum di-disconnect** jika exception terjadi sebelum `finally` → socket MTProto menggantung. `clean_pending_logins_task` adalah satu-satunya sweeper, dan ia hanya disconnect pada saat expiry.

**Fix:**

```diff
--- a/backend/app/api/accounts.py
+++ b/backend/app/api/accounts.py
@@
             # Update status to success!
             if qr_id in _pending_qr_logins:
                 _pending_qr_logins[qr_id]["status"] = "success"
                 _pending_qr_logins[qr_id]["account_id"] = str(account.id)
+                # Drop the (already disconnected) Telethon client so the entry
+                # holds only the few bytes the status endpoint needs.
+                _pending_qr_logins[qr_id].pop("client", None)
```

 Dan di `watch_qr_login`, tambahkan `finally` yang menjamin disconnect:

```python
    finally:
        details = _pending_qr_logins.get(qr_id)
        if details:
            leftover = details.pop("client", None)
            if leftover is not None and leftover is not client:
                await leftover.disconnect()
```

---

## MEDIUM

### [MEDIUM] 10. `verify_password` (bcrypt) memblokir event loop

**File:** `app/bot/handlers/base.py:154`; implementasi di `app/utils/encryption.py:60-64`
**Tipe:** Event-loop blocking

**Evidence:**

```python
# bot/handlers/base.py:154
                if not user or not verify_password(password, user.password_hash):
```

```python
# utils/encryption.py:60-64
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash (passlib-compatible).

    Used by the Telegram bot login flow.
    """
    return _pwd_context.verify(plain_password, hashed_password)
```

**Skenario gagal:**
bcrypt with default rounds (12) memakai **~250-400 ms CPU murni** per verifikasi, tanpa await point. Dipanggil langsung di dalam `async def` handler Telethon → seluruh event loop **beku 0,3-0,4 detik** per percobaan login bot yang salah. Di worker yang sama ada `queue_consumer_loop` dan `control_subscriber_loop` yang menjalankan job broadcast — satu percobaan brute-force akan menunda semua job. Karena tidak ada rate limit terlihat pada jalur ini, ini adalah vektor CPU-DoS yang murah.

**Fix:**

```diff
--- a/backend/app/bot/handlers/base.py
+++ b/backend/app/bot/handlers/base.py
@@
-                if not user or not verify_password(password, user.password_hash):
+                # bcrypt is ~300ms of pure CPU: never run it on the event loop.
+                password_ok = (
+                    await asyncio.to_thread(verify_password, password, user.password_hash)
+                    if user else False
+                )
+                if not user or not password_ok:
```

 Dan untuk `hash_password` (dipakai saat registrasi), offload dengan cara yang sama.

---

### [MEDIUM] 11. `decrypt()` Fernet sinkron dipanggil di ~10 titik dalam jalur async

**File:** `app/utils/encryption.py:46-56`; call site di `app/services/account_service.py:794, 903, 953, 985, 1017, 1051, 1164, 1197` dan `app/services/session_manager.py:418`
**Tipe:** Event-loop blocking (terukur kecil, tapilekup di hot path)

**Evidence:**

```python
# encryption.py:46-56
def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext back to the original string."""
    if not ciphertext:
        return ""
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc)
        return ""
```

```python
# account_service.py:794  (update_profile)
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
```

**Skenario gagal:**
Fernet `decrypt` adalah AES-CBC + HMAC-SHA256. Untuk string session 100-300 byte biayanya **~20-60 µs** — kecil secara individual. Masalahnya adalah **kumulatif dan frekuensi**: `update_profile` (794), `upload_profile_photo` (903/953), `delete_photo`, `set_username`, `set_2fa`, dan `session_manager._connect_account` (418, dipanggil per reconnect untuk **setiap** akun dalam health loop 30 detik) semuanya decrypt. Pada 200 akun aktif dengan reconnect bergilir, ini ~7 decrypt/detik — masih dapat diabaikan. Severity MEDIUM, bukan HIGH, **tetapi** ada dua konsekuensi yang lebih serius daripada blocking:
- `decrypt` **menelan exception dan mengembalikan `""`** (line 55-56). Di `update_profile` hasilnya `client_pool.get(id, "")` → Telethon membuat client dengan session **kosong** yang langsung gagal auth, dan error asli (ENOKEY yang kadaluwarsa) hilang. Ini adalah **silent-corruption bug**, bukan hanya perf.
- `_get_cipher()` melakukan lazy-init **tanpa lock** (line 27-34): dua task yang masuk bersamaan bisa sama-sama membangun `Fernet` — benign secara CPython tapi tetap race yang tidak dijaga.

**Fix:**

```diff
--- a/backend/app/services/account_service.py
+++ b/backend/app/services/account_service.py
@@ async def update_profile(...)
-    session_str = decrypt(account.session_string)
+    # Offload crypto off the loop; raise instead of silently returning "".
+    session_str = await asyncio.to_thread(decrypt, account.session_string)
+    if not session_str:
+        raise RuntimeError("Could not decrypt session string; check ENCRYPTION_KEY.")
     client = await client_pool.get(str(account.id), session_str)
```

 Dan tambahkan `decrypt_strict` yang melempar exception, dipakai di semua call site produksi; pertahankan `decrypt()` yang swallow hanya untuk jalur migrasi.

---

### [MEDIUM] 12. `_tg_id_map` meninggalkan entry yatim saat attach gagal

**File:** `app/services/event_relay.py:145`, `165`, `183`
**Tipe:** Memory leak

**Evidence:**

```python
# event_relay.py:143-146
        try:
            me = await client.get_me()
            if me:
                self._tg_id_map[account_id] = me.id
        except Exception:
            pass

        self._handlers[account_id] = [
```

Di-pop hanya di dua jalur:

```python
# event_relay.py:164-165 (detach_client)
        handlers = self._handlers.pop(account_id, None)
        self._tg_id_map.pop(account_id, None)

# event_relay.py:182-183 (detach)
        self._handlers.pop(account_id, None)
        self._tg_id_map.pop(account_id, None)
```

**Skenario gagal:**
`attach()` pada line 148 menimpa `self._handlers[account_id]` tanpa mengecek apakah entry lama ada — lihat temuan #2. Jika `attach` untuk akun A sukses, lalu A dihapus dan di-`detach()`ed, `_tg_id_map` benar dibersihkan. Namun pada **restart worker yang sama** (line 199 `resume_running_broadcasts_on_startup` → `event_relay.attach` per akun) atau pada `detach()` dipanggil untuk akun yang **tidak punya handler** (`handlers is None` → early return di line 167), `_tg_id_map.pop` **tidak dijalankan** karena `detach_client` return duluan. Kalau `_tg_id_map[account_id]` terisi tapi `_handlers[account_id]` sudah hilang, entry itu **tidak pernah dibersihkan** — dict tumbuh monoton selama uptime worker. Untuk 5.000 akun yang pernah_login的本质上是 beberapa ratus byte per entry — kecil, tapi persis jenis leak yang ditemukan setelah 3 minggu uptime.

**Fix:**

```diff
--- a/backend/app/services/event_relay.py
+++ b/backend/app/services/event_relay.py
@@ def detach_client(self, account_id: str, client: Any) -> None:
         """Remove handlers using an already-held client without pool I/O."""
         handlers = self._handlers.pop(account_id, None)
+        # Always drop the cached telegram_id, even when no handlers were
+        # registered: _tg_id_map is an orphan store otherwise.
         self._tg_id_map.pop(account_id, None)
         if handlers is None:
             return
```

 Dan tambahkan sweep di `_periodic_cleanup_loop` (atau di health loop) untuk key yang tidak ada di `_clients`:

```python
for orphan in list(self._tg_id_map) - set(self._handlers):
    self._tg_id_map.pop(orphan, None)
```

---

### [MEDIUM] 13. `pending_cycle_details` tumbuh tanpa batas bila flush gagal

**File:** `app/services/broadcast_service.py:790`, `1244`, `1567`, `675`
**Tipe:** Memory leak

**Evidence:**

```python
# broadcast_service.py:790
    pending_cycle_details: list[dict] = []
```

```python
# broadcast_service.py:1567-1575
                pending_cycle_details.append({
                    "group_identifier": group_identifier,
                    "group_id": log_group_id,
                    "account_id_used": acc_id_str,
                    "account_name": acc_name,
                    "status": log_status,
```

Dan flush:

```python
# broadcast_service.py:670-676
    cycle_details_copy = list(details)
    details.clear()
```

**Skenario gagal:**
`_flush_cycle_logs` melakukan `details.clear()` **setelah** `list(details)` — jadi list itu sendiri tidak pernah di-crop oleh caller. Jika `_flush_cycle_logs` melempar exception **setelah** `details.clear()` (mis. `async with async_session_factory() as db` gagal membuka koneksi di line 677), detail yang sudah disalin hilang dari memori — data hilang permanen. Sebaliknya jika pemanggil membungkus dalam retry tanpa mengecek, list bisa tumbuh. Untuk broadcast ke 50.000 grup dalam satu siklus dengan `loop_enabled=True`, `details` menahan 50.000 dict × ~300 B ≈ **15 MB per siklus**, dan list di-rebind **per siklus** (line 790) sehingga tidak grows across siklus — jadi kebocoran terbatas, tapi **JSONB** yang dihasilkan pada `db_log.details` (line 700+) bisa **1-2 MB per baris**, dan tidak ada chunking.

**Fix:**

```diff
--- a/backend/app/services/broadcast_service.py
+++ b/backend/app/services/broadcast_service.py
@@
-    pending_cycle_details: list[dict] = []
+    pending_cycle_details: list[dict] = []
+    MAX_PENDING_DETAILS = 5_000  # bound memory; flush partial batches

@@ line 1567 append site
                 pending_cycle_details.append({...})
+                if len(pending_cycle_details) >= MAX_PENDING_DETAILS:
+                    await _flush_cycle_logs(
+                        job_uuid, current_cycle_number, pending_cycle_details,
+                        total_groups, sent, failed, last_progress,
+                    )
```

 Danoplus guard di `_flush_cycle_logs` agar `details.clear()` hanya terjadi setelah session benar-benar siap:

```python
async with async_session_factory() as db:
    ...
    # clear only after the write succeeds
    details.clear()
```

---

### [MEDIUM] 14. `get_connected_clients()` mengiterasi `_clients` tanpa lock

**File:** `app/services/telegram_client.py:619-621`; konsumen di `app/services/session_manager.py:194`, `app/services/event_relay.py:177`
**Tipe:** Race condition

**Evidence:**

```python
# telegram_client.py:619-621
    async def get_connected_clients(self) -> dict[str, TelegramClient]:
        """Return dict of still-connected clients."""
        return {k: v["client"] for k, v in self._clients.items() if v["client"].is_connected()}
```

Pemanggilnya:

```python
# session_manager.py:193-196 (dalam stop)
        clients = await client_pool.get_connected_clients()
        for account_id in list(clients.keys()):
            await event_relay.detach(account_id)
```

```python
# event_relay.py:176-179 (detach tanpa client)
        if client is None:
            client = (await client_pool.get_connected_clients()).get(account_id)
```

**Skenario gagal:**
Dict comprehension ini berjalan **tanpa lock** sambil `_cleanup_stale_clients()` (line 187-188: `await self.remove(acc_id, save_state=True)`) bisa `self._clients.pop()` di tengah iterasi. Karena `list(self._clients.items())` tidak dipakai, iterasi über underlying dict **during mutation** → `RuntimeError: dictionary changed size during iteration`. Rate-nya rendah tetapi nyata: cleanup loop jalan setiap 60 detik (`telegram_client.py:198`) dan `stop()` dipanggil bersamaan dengan worker yang sedang `release_lease`. Selain itu, `v["client"].is_connected()` adalah **call into Telethon state** — client bisa ter-disconnect antara check dan pemakaian di `event_relay.detach` (line 179) sehingga handler di-remove dari client yang salah/telah mati.

**Fix:**

```diff
--- a/backend/app/services/telegram_client.py
+++ b/backend/app/services/telegram_client.py
@@
     async def get_connected_clients(self) -> dict[str, TelegramClient]:
         """Return dict of still-connected clients."""
-        return {k: v["client"] for k, v in self._clients.items() if v["client"].is_connected()}
+        # Snapshot the items first: _cleanup_stale_clients() pops entries
+        # concurrently and dict iteration during mutation raises RuntimeError.
+        snapshot = list(self._clients.items())
+        return {
+            k: v["client"]
+            for k, v in snapshot
+            if v["client"].is_connected()
+        }
```

---

### [MEDIUM] 15. `_connect_semaphore` dibuat di module import time

**File:** `app/services/session_manager.py:26`; dipakai di `_connect_account`
**Tipe:** Resource leak / event-loop affinity

**Evidence:**

```python
# session_manager.py:24-26
# Connection work includes Telegram network I/O and short DB lookups. Keep it
# below the database pool capacity so reconnect storms cannot starve API/WS auth.
_connect_semaphore = asyncio.Semaphore(3)
```

**Skenario gagal:**
`asyncio.Semaphore` sejak **Python 3.10** tidak lagi mengikat loop di constructor, jadi ini **aman di 3.11** — however, ia **shareable across event loops** hanya jika tidak pernah `await` saat dipegang. Yang jadi masalah nyata adalah `_connect_task_lock = asyncio.Lock()` di **line 33**, yang dibuat pada import time bersama `_connect_semaphore`. Jika modul ini di-import **sebelum** loop utama berjalan (mis. di pytest, atau di script CLI), dan `session_manager.ensure_connected_on_demand` dipanggil dari loop berbeda (mis. test suite yang memakai `anyio` per-test loop), lock bisa terikat ke loop yang sudah mati → `RuntimeError: Lock is bound to a different event loop`. Pola ini muncul di `tests/` dan di worker jika `async_worker` meng-import modul sebelum `asyncio.run`.

**Fix:**

```diff
--- a/backend/app/services/session_manager.py
+++ b/backend/app/services/session_manager.py
@@
-_connect_semaphore = asyncio.Semaphore(3)
+_connect_semaphore: asyncio.Semaphore | None = None
+_connect_task_lock: asyncio.Lock | None = None
+
+
+def _connect_guards() -> tuple[asyncio.Semaphore, asyncio.Lock]:
+    """Lazily bind the semaphore/lock to the *running* loop.

+    Module-level asyncio primitives capture the loop they are first awaited
+    on; creating them at import time breaks under pytest and under any host
+    that runs more than one loop in a process.
+    """
+    global _connect_semaphore, _connect_task_lock
+    loop = asyncio.get_running_loop()
+    if _connect_semaphore is None:
+        _connect_semaphore = asyncio.Semaphore(3)
+    if _connect_task_lock is None:
+        _connect_task_lock = asyncio.Lock()
+    return _connect_semaphore, _connect_task_lock
@@
-        async with _connect_task_lock:
+        _, connect_lock = _connect_guards()
+        async with connect_lock:
```

---

### [MEDIUM] 16. Event relay broadcast ke WebSocket sebelum persist DB; persist-nya fire-and-forget

**File:** `app/services/event_relay.py:302-312`, `535-545`
**Tipe:** Race condition (ordering)

**Evidence:**

```python
# event_relay.py:301-312
        await manager.broadcast(channel, new_msg_payload)
        try:
            from app.utils.redis_dispatcher import publish_ws_event
            await publish_ws_event(channel, new_msg_payload)
        except Exception:
            pass

        # Update DB in the background
        if chat:
            self._spawn_task(
                self._update_chat_on_new_message(account_id, chat, msg, is_outgoing=False)
            )
```

**Skenario gagal:**
Frontend menerima pesan di WS **sebelum** baris DB di-commit. Jika user membuka tab chat dalam 50 ms berikutnya, endpoint `/chats/{id}/messages` membaca DB yang **belum punya** pesan tersebut → tampilan "kosong" sampai refetch manual. Untuk pesan masuk yang memicu auto-reply, `_update_chat_on_new_message` juga menulis `AutoReplyLog`-adjacent state yang dipakai sebagai dedup (line 383-390); bila task `_spawn_task` gagal karena pool DB penuh, pesan tetap terkirim ke WS tapi hilang dari riwayat → **dedup check berikutnya tidak menemukan log** dan Redis fallback (line 361 `is_auto_reply_sent_to_user`) adalah satu-satunya penjaga. Bila Redis juga kosong (evicted), **auto-reply terkirim ulang** ke customer yang sama.

`self._background_tasks` (line 56) yangidone.tasksetaid_Jepit跳跃 sedang tumbuh cepat karena setiap event message = 2 task (WS update + DB update) dengan `set()` yang bertambah cepat, dan `discard` baru jalan saat task selesai (line 64 done-callback). Pada account dengan traffic tinggi (mis. 50 msg/menit × 10 akun = 500 msg/menit), `set()` berisi ~1.000 task yang belum selesai.

**Fix:**

```diff
--- a/backend/app/services/event_relay.py
+++ b/backend/app/services/event_relay.py
@@ _on_new_message
-        await manager.broadcast(channel, new_msg_payload)
-        try:
-            from app.utils.redis_dispatcher import publish_ws_event
-            await publish_ws_event(channel, new_msg_payload)
-        except Exception:
-            pass
-
-        # Update DB in the background
         if chat:
-            self._spawn_task(
-                self._update_chat_on_new_message(account_id, chat, msg, is_outgoing=False)
-            )
+            # Persist BEFORE notifying: the WS consumer's first REST refetch
+            # must already see the row, and the auto-reply dedup log must be
+            # committed before we can be re-invoked for the same message.
+            await self._update_chat_on_new_message(
+                account_id, chat, msg, is_outgoing=False
+            )
+            async with self._db_sem:
+                await self._write_auto_reply_dedup(account_id, msg)
+
+        await manager.broadcast(channel, new_msg_payload)
+        try:
+            from app.utils.redis_dispatcher import publish_ws_event
+            await publish_ws_event(channel, new_msg_payload)
+        except Exception:
+            pass
```

 Dan batasi `_background_tasks` dengan backpressure sederhana:

```python
def _spawn_task(self, coro) -> asyncio.Task:
    if len(self._background_tasks) >= self.MAX_BACKGROUND_TASKS:
        logger.warning(
            "event_relay backlog %d >= cap; dropping a maintenance task",
            len(self._background_tasks),
        )
        coro.close()
        return asyncio.create_task(asyncio.sleep(0))  # no-op placeholder
    ...
```

---

## LOW

### [LOW] 17. DB error saat cleanup mem-proteksi seluruh akun stale → cleanup lumpuh permanen

**File:** `app/services/telegram_client.py:168-170`
**Tipe:** Resource leak (logika)

**Evidence:**

```python
# telegram_client.py:166-170
            except Exception as exc:
                logger.error("Error checking protected clients in DB: %s", exc)
                # Play safe on DB error, protect everyone
                protected_keys = set(stale_keys)
```

**Skenario gagal:**
Jika query DB gagal **satu kali** (pool timeout saat jam sibuk), **seluruh** akun stale di-proteksi. `last_accessed` di-set ke `now` untuk semuanya (line 175-177), sehingga cleanup berikutnya harus menunggu TTL penuh lagi. Dengan DB yang flaky periodik, cache client bisa tumbuh tanpa batas dan **tidak pernah** shrunk → hundreds of open MTProto sockets (Telegram mulai limiting koneksi per IP ~ dalam hitungan puluhan). Tidak ada breaker/counter yang membedakan error transien vs permanen.

**Fix:**

```diff
--- a/backend/app/services/telegram_client.py
+++ b/backend/app/services/telegram_client.py
@@
             except Exception as exc:
-                logger.error("Error checking protected clients in DB: %s", exc)
-                # Play safe on DB error, protect everyone
-                protected_keys = set(stale_keys)
+                logger.error("Error checking protected clients in DB: %s", exc)
+                # Protect only the accounts actively held by a *known* busy
+                # job — not every stale key. Protecting everything turns one
+                # transient DB blip into a permanent leak of MTProto sockets.
+                protected_keys = {
+                    k for k in stale_keys
+                    if k in self._lease_protected_now()
+                }
```

 dengan `_lease_protected_now()` membaca dari Redis (`acquire_lease` sudah menyimpan owner+TTL) alih-alih melakukan query SQL.

---

### [LOW] 18. `start_broadcast_task` check-then-act pada dict `_running_tasks`

**File:** `app/services/broadcast_service.py:1930-1951`; identik di `invite_service.py:1332-1354` dan `auto_join_service.py:499-519`
**Tipe:** Race condition

**Evidence:**

```python
# broadcast_service.py:1935-1951
    job_id_str = str(job_id)
    existing_task = _running_tasks.get(job_id_str)
    if existing_task and not existing_task.done():
        return False

    async def _safe_execute():
        ...

    task = asyncio.create_task(_safe_execute())
    _running_tasks[job_id_str] = task
    return True
```

**Skenario gagal:**
`start_broadcast_task` adalah `def` (sinkron) sehingga tidak ada await point di dalamnya — jadi dalam satu event loop, pemeriksaan dan assignment secara praktis atomic. **Namun** ia dipanggil dari tiga tempat yang berbeda: `workers/async_worker.py:90`, `:147` (control channel), dan `:200` (startup resume). Jalur **startup** (`resume_running_broadcasts_on_startup`, line 1984-2002) berjalan sebelum `queue_consumer_loop` mulai, jadi tidak ada race di sana. Yang tersisa adalah jalur **control channel** (line 147) yang bisa menyalakan job yang sama yang sedang running — `existing_task.done()` check_linear_api yang benar secaramemory-model, tapi tidak ada lock, jadi jika suatu saat `start_broadcast_task` diubah menjadi `async def` (mis. untuk awaits) atau dipanggil dari thread executor, check-then-act ini akan dobel-spawn dua `execute_broadcast` untuk job yang sama — dua publisher, dobel kirim, dobel tagihan SMM.

**Fix:**

```diff
--- a/backend/app/services/broadcast_service.py
+++ b/backend/app/services/broadcast_service.py
@@
-_running_tasks: dict[str, asyncio.Task] = {}
+_running_tasks: dict[str, asyncio.Task] = {}
+_running_tasks_lock = asyncio.Lock()
@@
-def start_broadcast_task(job_id: str | uuid.UUID) -> bool:
+async def start_broadcast_task(job_id: str | uuid.UUID) -> bool:
     """Ensure a background broadcast task is running for the given job ID."""
     job_id_str = str(job_id)
-    existing_task = _running_tasks.get(job_id_str)
-    if existing_task and not existing_task.done():
-        return False
+    async with _running_tasks_lock:
+        existing_task = _running_tasks.get(job_id_str)
+        if existing_task and not existing_task.done():
+            return False
+        task = asyncio.create_task(_safe_execute_for(job_id_str))
+        _running_tasks[job_id_str] = task
+        return True
```

 Semua call site harus di-`await`: `workers/async_worker.py:90`, `:147`, `:199`.

---

## Catatan Metodologi

- Semua temuan didasarkan pada kode yang **dibaca langsung** pada file dan baris yang disebut.
- Tidak ada temuan yang disimpulkan tanpa/snippet yang benar-benar dibaca.
- Angka severity mengikuti dampak operasional: CRITICAL = kerugian data/uang atau outage, HIGH = kebocoran sumber daya yang dapat Confirm atau crash job, MEDIUM = degradasi performa/konsistensi, LOW = hardening.
- Verifikasi dinamis (mem-tracking, load test) tidak dilakukan — disarankan sebagai langkah lanjutan untuk temuan #1, #2, dan #9 karena semuanya bersifat intermitten.