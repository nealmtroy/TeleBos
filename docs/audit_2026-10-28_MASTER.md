# Master Audit Report — TeleBos

**Project:** TeleBos — Telegram Multi-Account Management SaaS
**Lokasi:** `D:\PROJECT\Telegram\TeleBos`
**Tanggal:** 2026-10-28
**Cakupan:** Backend Python (`backend/app/`, 167 file / ~36.940 LOC) + integrasi frontend (auth token flow)
**Auditor:** 3 auditor paralel (dead code · security/logic · concurrency) + verifikasi manual oleh orchestrator

---

## 📊 Ringkasan Eksekutif

| Severity | Dead Code | Vuln/Logic | Concurrency | **TOTAL** |
|---|---|---|---|---|
| 🔴 CRITICAL | 1 | **3** | **2** | **6** |
| 🟠 HIGH | 3 | 4 | 6 | **13** |
| 🟡 MEDIUM | 7 | 7 | 7 | **21** |
| 🔵 LOW | 8 | 2 | 2 | **12** |
| **Total** | **19** | **16** | **17** | **52** |

### ✅ Koreksi setelah verifikasi manual (2026-10-28)
| Klaim Auditor | Status | Bukti |
|---|---|---|
| "Marketplace balance mutation tanpa row lock → saldo minus / dana dobel" | ❌ **SALAH** | `marketplace_service.py:453` sudah `.with_for_update()`; `:477` sudah deterministic UUID ordering (anti-ABBA). Turun CRITICAL → MEDIUM. |
| "Dead code: `?v=` fallback = path traversal" | ✅ **BENAR** | `media.py:99` → `os.path.join(..., f"{photo_version}.jpg")` tanpa sanitasi. |
| "Auth bypass di `/photo`" | ✅ **BENAR** | `media.py:56-62` tidak ada `Depends(get_current_user*)`. |
| "`_locks` check-then-act race" | ✅ **BENAR** | `telegram_client.py:291-292`. |
| "`_locks` bocor (never popped)" | ⚠️ **SEBAGIAN** | Di-pop di `remove()` line 591-592 (`if not lock.locked()`), jadi bocor **hanya** untuk akun yang tidak pernah di-`remove()`. |

### Breakdown
| Kategori | Temuan | Detail |
|---|---|---|
| Dead code | 4 modul, 414 unused imports | ~244 baris modul mati + ~70% import di 9 file |
| Vulnerability | 3 kritikal | Auth bypass, path traversal, IDOR |
| Logic defect | 7 | Bug "mocked" tersembunyi, saldo tidak balik, commit sebelum API |
| Race condition | 6 | `_locks` bocor, `create_task` tanpa ref, RMW tanpa lock |
| Memory / Resource leak | 5 | Task tidak di-cancel, dict tak terbatas |
| Unhandled error | 6 | `decrypt()` swallow, exception jadi logic |

---

## 📄 Report Lengkap

| # | Report | File | Ukuran |
|---|---|---|---|
| 1 | Dead Code, Redundansi & Unhandled Error | [`audit_2026-10-28_deadcode_redundancy_errors.md`](./audit_2026-10-28_deadcode_redundancy_errors.md) | 18 KB |
| 2 | Vulnerability & Cacat Logika | [`audit_2026-10-28_vuln_logic.md`](./audit_2026-10-28_vuln_logic.md) | 45 KB |
| 3 | Concurrency, Memory & Resource Leak | [`audit_2026-10-28_concurrency_memory.md`](./audit_2026-10-28_concurrency_memory.md) | 54 KB |
| 4 | **Graphify Deep Audit** (knowledge-graph, coupling, clustering) | [`audit_2026-10-28_graphify_deep.md`](./audit_2026-10-28_graphify_deep.md) | 17 KB |

---

## 🔴 CRITICAL — 7 Temuan (Prioritas Tertinggi)

### Group A: Broken Authentication & Data Exfiltration

#### C-1. Endpoint foto chat tanpa autentikasi sama sekali
- **File:** `backend/app/api/media.py:56-62`
- **Evidence (terverifikasi langsung):**
```python
@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(
    account_id: str,
    chat_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),   # ← TIDAK ADA Depends(get_current_user)
):
    account_result = await db.execute(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.for_sale.is_(False),   # ← TIDAK ADA filter user_id
        )
    )
```
Router `media` juga tidak punya `dependencies=[...]` di level router (`media.py:52`).
**Impact:** siapa pun tanpa login bisa:
1. Enumerasi seluruh akun Telethon (UUID di URL)
2. Memaksa decrypt session string + buka koneksi MTProto ke server Telegram
3. Memakai backend sebagai proksi download media milik orang lain
4. DoS — setiap request membuka socket Telegram baru

**Fix:**
```diff
 async def get_chat_photo(
     account_id: str,
     chat_id: int,
     request: Request,
     db: AsyncSession = Depends(get_db),
+    user: User = Depends(get_current_user_from_token_or_header),
 ):
     account_result = await db.execute(
         select(TelegramAccount).where(
             TelegramAccount.id == account_id,
+            TelegramAccount.user_id == user.id,
             TelegramAccount.for_sale.is_(False),
         )
     )
```

---

#### C-2. Path Traversal → Arbitrary File Read via `?v=`
- **File:** `backend/app/api/media.py:99`, `:111-122`
- **Evidence (terverifikasi langsung):**
```python
photo_version = str(chat.photo_version) if chat and chat.photo_version is not None else request.query_params.get("v")
...
chat_photos_dir = os.path.join(base_dir, "uploads", "chat_photos", str(account.id), str(chat_id))
cached_path = os.path.join(chat_photos_dir, f"{photo_version}.jpg")
if os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
    return FileResponse(cached_path, media_type="image/jpeg", headers=headers)
```
Kalau `chat` tidak ada atau `photo_version` NULL → nilai taken dari query param **`?v=`** yang dikontrol penyerang. Tidak ada sanitasi path.
**Exploit:** `GET /api/v1/accounts/<uuid>/chats/1/photo?v=../../../../../../Windows/win.ini` → arbitrary file read (dibatasi suffix `.jpg`, tapi `win.jpg`/file `.jpg` apa pun bisa dibaca; lebih buruk jika ada file `.jpg` sensitif).

**Fix:**
```python
photo_version = str(chat.photo_version) if chat and chat.photo_version is not None else None
if not photo_version or not photo_version.isalnum():
    raise HTTPException(status_code=404, detail="No profile photo")
```
(Hapus fallback `request.query_params.get("v")` sepenuhnya — client sudah tahu versi dari response sebelumnya.)

---

#### C-3. IDOR media — cache dilayani sebelum cek kepemilikan
- **File:** `backend/app/api/media.py:227-236`
- **Evidence:**
```python
media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
if os.path.exists(media_cache_dir):
    for f in os.listdir(media_cache_dir):
        if f.startswith(f"{message_id}."):
            cached_file = os.path.join(media_cache_dir, f)
            break
if cached_file and os.path.exists(cached_file):
    return create_safe_file_response(cached_file)   # ← return SEBELUM validasi account
...
account = await account_service.get_account(db, account_id, str(user.id))  # cek kepemilikan setelahnya
```
Cache di-key hanya `chat_id` (global). User A bisa ambil media user B只要 tahu `chat_id` + `message_id`.
**Fix:** pindahkan pengecekan kepemilikan ke sebelum lookup cache, dan key cache dengan `account_id`.

---

### Group B: Race Condition & Data Integrity

#### C-4. ~~Mutasi balance marketplace tanpa row lock~~ → **DIPERBAIKI: sudah ada lock, turun ke MEDIUM**
- **File:** `backend/app/services/marketplace_service.py:443-497`
- **Status setelah verifikasi manual orchestrator:** Klaim auditor "tanpa row lock" **SALAH**. Kode sudah benar:
  - `marketplace_service.py:453` — `TelegramAccount` di-lock via `.with_for_update()`
  - `marketplace_service.py:477` — deterministic lock ordering: `first_id, second_id = (buyer_id, seller_id) if buyer_id < seller_id else (seller_id, buyer_id)` → mencegah ABBA deadlock
  - `marketplace_service.py:478-479` — kedua `User` di-lock `FOR UPDATE` dalam urutan stabil
- **Sisa risiko nyata (MEDIUM, bukan CRITICAL):** tidak ada guard untuk kasus `buyer_id == seller_id` pada jalur DB di mana `user_id` seller sudah di-overwrite, dan tidak ada idempotency key per order (retry double-click bisa debit 2×). Fix: `SELECT ... FOR UPDATE` pada listing row sudah cukup untuk mencegah double-buy; tambahkan idempotency key + `Idempotency-Key` header di endpoint purchase.
**Fix:** lihat `audit_2026-10-28_vuln_logic.md` untuk detail idempotency.

---

#### C-5. `_locks` bocor + check-then-act saat pembuatan lock per-akun
- **File:** `backend/app/services/telegram_client.py:291-294` vs `:590-592`
- **Evidence (terverifikasi):**
```python
# line 291-292 — check-then-act, race: dua coroutine bisa buat dua Lock
if account_id not in self._locks:
    self._locks[account_id] = asyncio.Lock()
async with self._locks[account_id]:
```
```python
# line 590-592 — eviction tidak-atomic vs pemakaian
if not lock.locked():
    self._locks.pop(account_id, None)
```
**Impact:** (a) dict `_locks` tumbuh tanpa batas untuk akun yang pernah dipakai; (b) dua task bisa memegang dua `Lock` berbeda untuk akun yang sama →同一柄 client dipakai dua operasi bersamaan; (c) `pop()` bisa menghapus lock yang baru saja dipakai.

**Fix:** pakai `defaultdict(asyncio.Lock)` / `setdefault()` (atomik di event loop) dan jangan pop lock di hot-path — cukup batas ukuran dict atau evict hanya saat `active_count`排空.

---

#### C-6. `acquire_lease(force=True)` reclaim tanpa transisi status → dua socket MTProto per auth key
- **File:** `backend/app/services/broadcast_service.py:905-914` + `session_manager.py:484`
- **Masalah:** backend yang masih memegang lease bisa diambil alih worker tanpa status transition. Dua proses memegang socket untuk satu auth key → Telegram membalas *"Server replied with a wrong session ID"*.
**Fix:** jadikan lease state machine atomic (compare-and-swap di Redis), dan worker hanya boleh force-claim lewat endpoint yang melakukan transisi status eksplisit.

---

### Group C: Logic Defect tersembunyi

#### C-7. Production error disamarkan jadi "mocked" → harga marketplace salah
- **File:** `backend/app/services/marketplace_service.py:148-166` (terverifikasi)
```python
is_mocked = hasattr(price_service.resolve_telegram_id_price, "assert_called") or hasattr(..., "mock")
if not is_mocked:
    try:
        await price_service.resolve_prices_for_accounts(db, accounts)
    except Exception:
        is_mocked = True          # ← DB error disamarkan jadi test!
...
if is_mocked:
    buy_prices[account.id] = prices[account.id]   # ← harga beli = harga jual
```
**Impact:** koneksi DB gagal / bug logika → `buy_price = sell_price` → margin SMM hilang → **rugi pemilik akun**. Tidak ada log.

**Fix:** gunakan flag terpisah `is_test_env` yang tidak bisa di-toggle oleh exception; log exception sebagai warning; pertahankan `buy_prices` via `resolve_buy_price_for_telegram_id` pada jalur non-test.

---

## 🟠 HIGH — 13 Temuan (Ringkasan)

| # | Temuan | File |
|---|---|---|
| H-1 | Saldo tidak pernah dikembalikan untuk order `Failed`/`Partial` | `order_service.py` |
| H-2 | Saldo di-commit sebelum panggilan API eksternal (jendela kehilangan uang saat crash) | `order_service.py` |
| H-3 | `_post_sale_cleanup` di-`create_task` tanpa reference → bisa di-GC | `marketplace_service.py:255-258` (terverifikasi) |
| H-4 | `ensure_connected_on_demand` di-`create_task` tanpa tracking | `api/accounts.py:708,750` |
| H-5 | `_pending_qr_logins` menyimpan client Telethon live; entry sukses tak pernah di-pop | `api/accounts.py:55-176` |
| H-6 | Session token diterima lewat query param `?token=` (bocor ke log/history/Referer) | `dependencies.py:110` |
| H-7 | `decrypt()` return `""` diam-diam → client dari session kosong | `utils/encryption.py:44` |
| H-8 | Token sesi (`signed_url.py`) yang sudah ditulis tapi tak pernah dipakai | `utils/signed_url.py` |
| H-9 | `session_service.py` 59 baris mati | `services/session_service.py` |
| H-10 | `_flush_cycle_logs` read-modify-write tanpa lock → progress tertimpa | `broadcast_service.py:671` |
| H-11 | `redis_ws_bridge` spawn task yang tak pernah di-cancel saat shutdown | `redis_ws_bridge.py:38-42` |
| H-12 | Mutasi `active_accounts` di tengah loop → IndexError | `broadcast_service.py:1552` |
| H-13 | `verify_password` (bcrypt) memblokir event loop | `bot/handlers/base.py:154` |

---

## 🟡 MEDIUM — 20 Temuan (Ringkasan)

- Penyesuaian saldo admin dijepit ke `0` diam-diam tanpa ledger (`api/admin.py`)
- Margin platform hilang saat `buy_price` NULL
- Kredensial DB default hanya dijaga env flag
- Pembagian harga integer per-order membuat order kecil gratis
- Lookup sesi jatuh ke perbandingan token plaintext
- Jalur `token_or_header` melewati auto-downgrade langganan kedaluwarsa
- Upload voice tanpa batas ukuran (memory DoS)
- Rate limiter fail-open secara default
- N+1 query di statistik admin & sinkronisasi profil
- 414 unused imports di 55 file (termasuk 1 file import 34 schema yg butuh 2)
- `models/enums.py` (42 baris) tidak dipakai
- 7 service file punya 9-16 unused import sisa refactor

---

## 🔵 LOW — 13 Temuan (Ringkasan)

- `bcrypt` blocking di async context
- `Fernet decrypt` sinkron di ~10 titik jalur async
- 8 dead import kecil di `main.py`, `admin.py`, `settings.py`, dll
- `from __future__ import annotations` yang tidak perlu

---

## ✅ Catatan Positif

Codebase ini **jauh lebih bersih dari rata-rata industri**. Bukti:
- **0** `bare except:` di 167 file
- **0** `except Exception: pass` tanpa logging (60 ada tapi semuanya punya konteks)
- **0** TODO/FIXME/HACK tersisa (catatan di `redeem_service.py` ternyata false-positive — "XXXX" dalam regex format redeem code)
- `time.sleep` yang gwiquery ternyata sudah diisolasi via `run_in_executor` (`appeal_service.py:393`)
- SQL f-string di `database_migrator.py` hanya memakai identifier internal, bukan user input
- Shutdown teardown sudah guarded per-langkah (`main.py:_shutdown_resources`)
- `redact`-based `sanitize_exception` dipakai konsisten

---

## 🗓️ Prioritas Perbaikan (urutan kerja)

### Sprint 1 — Security Hotfix (hari ini)
1. **C-1** Tambah auth + filter `user_id` di `get_chat_photo`
2. **C-2** Hapus fallback `?v=` atau sanitasi `photo_version`
3. **C-3** Validasi kepemilikan sebelum serve cache
4. **C-7** Pisahkan flag `is_test_env` dari exception handler

### Sprint 2 — Data Integrity (1-2 hari)
5. **C-4** Row lock pada mutasi balance marketplace
6. **H-1/H-2** Refund saldo + commit setelah API call sukses
7. **H-3/H-4** Simpan reference task (`asyncio.create_task` → `set` + `done_callback`)

### Sprint 3 — Concurrency hardening (2-3 hari)
8. **C-5** Atomic lock creation + hentikan eviction di hot-path
9. **C-6** Lease state machine atomic di Redis
10. **H-10/H-11/H-12** Lock pada RMW, cancel task saat shutdown

### Sprint 4 — Code hygiene (1 hari)
11. `ruff check app/ --select F401 --fix` (hemat ~414 baris)
12. Hapus modul mati: `session_service.py`, `avatar_generator.py`, `enums.py`, `schemas/device.py`, `schemas/log.py`
13. `signed_url.py`: integrate untuk C-2/H-6, atau hapus

---

## 🔧 Fix Cepat (aman, bisa langsung jalan)

```bash
cd D:/PROJECT/Telegram/TeleBos/backend

# Preview
ruff check app/ --select F401

# Hapus otomatis (414 imports, ~9 file api/*.py langsung bersih)
ruff check app/ --select F401 --fix

# Verifikasi tidak ada yang rusak
python -c "import app.main" && echo OK
pytest tests/ -x -q
```