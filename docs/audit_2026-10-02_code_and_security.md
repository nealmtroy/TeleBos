# Laporan Audit Kode & Keamanan — TeleBos

**Tanggal:** 2 Oktober 2026
**Ruang lingkup:** Backend (`backend/app/**`), Frontend (`frontend/src/**`)
**Metodologi:** Orientasi Graphify Knowledge Graph (`graphify-out/graph.json`) + static reading terarah pada money path, auth, WebSocket, lifecycle task, dan i18n.
**Catatan penting:** Laporan lama (`docs/master_audit_report.md`, `docs/deep_bug_logic_audit_report.md`, dst.) mengklaim "100% FIXED". Audit ini memverifikasi ulang klaim tersebut terhadap kode terkini dan menemukan beberapa regresi/bocoran baru.

---

## Ringkasan Eksekutif

| Kategori | Jumlah | Catatan |
|---|---:|---|
| 🔴 CRITICAL | 2 | Kerugian saldo / overflow tipe kolom uang |
| 🟠 HIGH | 4 | Race condition, reconnect sia-sia, exception yang menyembunyikan kegagalan |
| 🟡 MEDIUM | 7 | Dead code, inkonsistensi skema, task tracking, config hardcoded |
| 🟢 Verified-safe | 5 | Fix lama yang memang sudah ada di kode |

Temuan paling serius:
1. **`update_user_balance` tanpa `FOR UPDATE`** — lost update pada saldo admin.
2. **Schema `users.balance` bertipe `Integer`, bukan `BigInteger`** — melanggar invariant proyek dan berisiko overflow pada tabel yang menyimpan uang.

---

## 🔴 CRITICAL

### C-01 — Race condition pada `update_user_balance` (lost update)

**Lokasi:** `backend/app/api/admin.py:485-509`

```python
result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))
user = result.scalar_one_or_none()
...
user.balance += payload.amount        # ← tanpa lock baris
```

**Masalah:** Seleksi user **tidak memakai `with_for_update()`**. Dua request admin bersamaan (mis. dua operator menambah saldo user yang sama) membaca nilai `balance` yang sama lalu menimpa satu sama lain..skema `CheckConstraint("balance >= 0")` tersedia, tetapi tidak mencegah *lost update* — hanya mencegah saldo negatif.

Bandingkan dengan `buy_account` (`marketplace_service.py:477-479`) dan `redeem_code` (`redeem_service.py:114-116`) yang **sudah** memakai `.with_for_update()`. Admin endpoint justru tidak.

**Skenario gagal:** Owner memberi +100.000 ke dua pengguna berbeda dari dua tab simultaneously → satu perubahan hilang. Pada skenario yang lebih luas (batch top-upvia automation), saldo bisa berkurang drastis.

**Fix:**
```python
result = await db.execute(
    select(User).where(User.id == UUID(payload.user_id)).with_for_update()
)
```

---

### C-02 — QR login: `create_task` tanpa reference tracking (MEDIUM, bukan CRITICAL)

**Lokasi:** `backend/app/api/accounts.py:231`

```python
asyncio.create_task(watch_qr_login(qr_id, client, qr_login, user.id))
```

**Koreksi terhadap klaim awal:** Entry `_pending_qr_logins` **memang perlu bertahan** setelah sukses — frontend polls `/accounts/qr-login/status/{qr_id}` (frontend `add/page.tsx:718`) untuk membaca `status == "success"` lalu redirect. Menghapus entry akan merusak alur login. Klaim "dict tidak pernah dihapus = leak" adalah **keliru**.

Yang **benar-benar** bermasalah:

1. **`create_task` tanpa reference** — task bisa di-garbage-collected sebelum selesai. Pola benar sudah ada di `event_relay.py:58-70`.
2. **Entry retain reference ke objek `client` selama 5 menit** meski sudah di-disconnect (baris 166-169 sudah memanggil `client.disconnect()`, jadi koneksi TCP-nya memang Tertutup). Yang tertahan hanya objek Python-nya — kecil, tapi tetap akumulatif pada batch onboarding besar.

**Fix:** Track reference task (bagian yang benar-benar bermasalah):
```python
_qr_watch_tasks: set[asyncio.Task] = set()

# di qr_login_init:
task = asyncio.create_task(watch_qr_login(qr_id, client, qr_login, user.id))
_qr_watch_tasks.add(task)
task.add_done_callback(_qr_watch_tasks.discard)
```

**Prioritas: MEDIUM** (bukan CRITICAL — tidak ada kebocoran koneksi, hanya reference tracking).

---

### C-03 — `users.balance` bertipe `Integer`, melanggar invariant "BigInteger untuk uang"

**Lokasi:** `backend/app/models/user.py:27`

```python
balance: Mapped[int] = mapped_column(default=0)   # ← tanpa tipe eksplisit
```

SQLAlchemy menyimpulkan `Integer` dari annotation `Mapped[int]`. Bandingkan dengan `telegram_account.py` yang konsisten memakai `BigInteger` untuk semua kolom uang:
```python
sell_price: Mapped[int | None] = mapped_column(BigInteger, ...)
buy_price:  Mapped[int | None] = mapped_column(BigInteger, ...)
```

`CLAUDE.md` menyatakan: *"Use `BigInteger` for money/counts that can exceed 32-bit limits."* `balance` adalah saldo uang yangakumulatif (top-up, pembelian marketplace, SMM order) — jelas melampaui 2.147.483.647 dalam skenario platform yang aktif.

**Fix:**
```python
balance: Mapped[int] = mapped_column(BigInteger, default=0)
```
Lalu buat migrasi Alembic:
```bash
cd backend
alembic revision --autogenerate -m "widen users.balance to BigInteger"
alembic upgrade head
```

---

## 🟠 HIGH

### H-01 — `require("@/lib/socket")` di dalam `useEffect` (frontend anti-pattern)

**Lokasi:** `frontend/src/hooks/use-accounts.ts:274`

```typescript
const { connectChatSocket } = require("@/lib/socket");
```

**Masalah:** CommonJS `require()` dipanggil di dalam `useEffect`. Ini:
- Tidak di-bundle secara statis oleh Next.js/webpack → impairs tree-shaking,
- Tidak konsisten dengan seluruh file lain yang memakai `import` ESM di top-level,
- Dengan React StrictMode (double-invoke di dev), efek dijalankan dua kali dan `require` dipanggil ulang.

**Fix:** Gunakan import ESM statis di bagian atas file:
```typescript
import { connectChatSocket } from "@/lib/socket";
```

---

### H-02 — Job socket tidak pernah di-disconnect setelah job selesai

**Lokasi:** `frontend/src/hooks/use-socket.ts:85-89`

```typescript
} else if (data.type === "completed" || data.type === "error") {
  setProgress(data);
}
```

`ReconnectingWebSocket` reconnect otomatis dengan backoff hingga 10×. Ketika backend menutup socket setelah job selesai (`"completed"` event diterima), frontend **tetap** mencoba reconnect 10 kali dengan delay hingga 30 detik. Untuk job yang selesai dalam 1 detik, ini membakar 10 koneksi WebSocket yang sia-sia.

**Fix:** Di `useJobSocket`, panggil `ws.disconnect()` setelah menerima event terminal:
```typescript
} else if (data.type === "completed" || data.type === "error") {
  setProgress(data);
  setTimeout(() => disconnectSocket(`${jobType}:${jobId}`), 1000);
}
```

---

### H-03 — `except Exception: pass` menyembunyikan kegagalan load order

**Lokasi:** `backend/app/api/orders.py:231-232`

```python
except Exception:
    pass
```

**Masalah:** Jika Redis `get` gagal (timeout, connection error), exception di-swallow dan request tetap membuat order baru — sementara pengguna mungkin melihat duplikat order dari cache miss yang sebelumnya sukses. Idempotency check via Redis **tidak diverifikasi**, sehingga retry setelah network blip bisa membuat order ganda.

**Fix:** Log exception minimal agar bisa di-debug:
```python
except Exception as exc:
    logger.warning("Idempotency cache read failed for key %s: %s", cache_key, exc)
```

---

### H-04 — `resolve_chat_entity` fallback tanpa logging (MEDIUM, bukan HIGH)

**Lokasi:** `backend/app/api/media.py:127-130`

```python
try:
    entity = await resolve_chat_entity(client, account.id, chat_id)
except Exception:
    entity = await client.get_entity(chat_id)
```

**Koreksi terhadap klaim awal:** Setelah menelusuri `resolve_chat_entity` (`chat_service.py:649`), fungsi itu **sudah punya fallback chain sendiri**: cache → local DB (`access_hash`) → network. Jadi `except` di media.py hanya ter-trigger bila **ketiganya** gagal, dan `get_entity` adalah last resort yang wajar — bukan bug.

Yang tetap bermasalah: fallback ini **tanpa logging**, sehingga pola "resolve gagal total → network retry" tidak terlihat di log. Untuk `download_profile_photo` yang dipanggil otomatis (sinkronisasi avatar), pola ini bisa troubleshooting.

**Fix (logging, bukan perubahan perilaku):**
```python
except Exception as resolve_exc:
    logger.warning(
        "resolve_chat_entity failed for account %s chat %s; "
        "falling back to get_entity: %s", account.id, chat_id, resolve_exc,
    )
    entity = await client.get_entity(chat_id)
```

**Prioritas: MEDIUM** (bukan HIGH — fallback-nya memang disengaja).

---

### H-05 — `delete_user` swallow error saat pool cleanup

**Lokasi:** `backend/app/api/admin.py:568-569`

```python
try:
    await client_pool.remove(str(acc.id), save_state=False)
except Exception:
    pass
```

**Masalah:** Jika `client_pool.remove` gagal, Telethon client untuk akun user yang dihapus **tetap terhubung** ke Telegram dengan session string yang sudah dihapus. Client ini akan tetap aktif sampai process restart atau cleanup periodik — akses tidak terotorisasi ke akun yang sudah "dihapus" dari sistem.

**Fix:**
```python
except Exception as exc:
    logger.error("Failed to remove client for account %s during user deletion: %s", acc.id, exc)
```

---

### H-06 — `watch_qr_login` swallow error pada `client.disconnect()`

**Lokasi:** `backend/app/api/accounts.py:204-205`

```python
try:
    await client.disconnect()
except Exception:
    pass
```

**Masalah:** Sama seperti H-05 — jika disconnect gagal, unauth Telethon client yang dibuat di `qr_login_init` tetap terbuka.`_pending_qr_logins` entry containing this client akan dihapus oleh sweep 5 menit kemudian, tapi koneksi TCP-nya sudah tidak ter-tracking.

**Fix:** Log dengan level warning minimal.

---

## 🟡 MEDIUM

### M-01 — `signed_url.py` adalah dead code

**Lokasi:** `backend/app/utils/signed_url.py`

Seluruh fungsi (`generate_photo_token`, `parse_photo_token`) **tidak pernah dipanggil** di produksi. Hanya dirujuk oleh `backend/tests/unit/test_signed_url.py`. signed URL dengan HMAC-SHA256 truncate 16 hex chars (~64 bit) sebenarnya **sudah diimplementasikan dengan benar** (`hmac.compare_digest`, expiry check, account-scoped), tapi tidak dipakai di mana pun.

**Dampak:** Kemungkinan besar kang dipakai sebagai `?token=<jwt>` di URL foto — artinya JWT penuh masih bocor ke access log / Referer header, masalah yang seharusnya sudah diselesaikan oleh modul ini.

**Fix:** Jika intent-nya memakai signed URL, wire up `generate_photo_token` di endpoint foto. Jika tidak dipakai, hapus modul + test-nya.

---

### M-02 — `check_account_limit` race condition

**Lokasi:** `backend/app/api/accounts.py` (import), `backend/app/services/account_service.py`

Ketika dua request penambahan akun bersamaan tiba, keduanya bisa melewati `check_account_limit` sebelum salah satunya commit → user bisa melebihi batas akun yang ditentukan plan-nya.

**Fix:** Lock pada level user di dalam `check_account_limit`, atau tambahkan constraint di database.

---

### M-03 — `resolve_chat_entity` fallback pattern duplikasi

**Lokasi:** `backend/app/api/media.py:127-130` dan kemungkinan tempat lain

Pola `try: resolve_chat_entity(...) except: client.get_entity(...)` diulang di beberapa handler. Setiap fallback memicu network round-trip. Driftantinyield silent over-fetch.

**Fix:** Extract ke satu helper `resolve_or_fetch_entity(client, account_id, chat_id)` di `telethon_helpers.py`.

---

### M-04 — Hardcoded owner email di startup

**Lokasi:** `backend/app/main.py:427-436`

```python
result = await db.execute(select(User).where(User.email == "nealmtroy@gmail.com"))
if owner_user and owner_user.role != "owner":
    owner_user.role = "owner"
```

Email owner di-hardcode di source code. Ini perlu dipindahkan ke environment variable (`OWNER_EMAIL`) agarfleksibel untuk staging/production.

**Fix:**
```python
OWNER_EMAIL = os.getenv("OWNER_EMAIL", "")
if OWNER_EMAIL:
    result = await db.execute(select(User).where(User.email == OWNER_EMAIL))
    ...
```

---

### M-05 — `session_token.py` — SHA-256 tanpa salt

**Lokasi:** `backend/app/utils/session_token.py:19-29`

```python
def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
```

SHA-256 tanpa salt secara kriptografis lemah untuk password, tapi **cukup untuk session token** (token sudah high-entropy). Yang penting: implementasi ini harus konsisten antara Better Auth (DB hook) dan backend ini, dan itu sudah dijaga oleh komentar di docstring. **Tidak ada perubahan yang dibutuhkan** — hanya dokumentasi bahwa ini bukan untuk password.

---

### M-06 — `create_task` tanpa reference tracking di beberapa tempat

**Lokasi:**
- `backend/app/api/accounts.py:231` — `watch_qr_login` (lihat C-02)
- `backend/app/api/accounts.py:705, 748` — `ensure_connected_on_demand`
- `backend/app/bot/handlers/autoreply.py:145` — `ensure_connected_on_demand`

`asyncio.create_task` tanpa menyimpan reference berarti task bisa di-garbage-collected sebelum selesai. Pattern yang benar sudah ada di `event_relay.py:58-70` (`_spawn_task` dengan strong reference set + done callback). Perlu dikonsistenkan.

**Fix:** Gunakan pola yang sama di `event_relay._spawn_task` atau buat helper bersama.

---

## 🟢 Verified-safe (Fix lama yang terkonfirmasi ada di kode)

| ID | Fix | Lokasi | Status |
|---|---|---|---|
| S-01 | `buy_account` memakai `FOR UPDATE` + deterministic lock ordering | `marketplace_service.py:453, 477-479` | ✅ Ada |
| S-02 | `redeem_code` memakai `FOR UPDATE` pada kode + user | `redeem_service.py:90, 115` | ✅ Ada |
| S-03 | `place_order`/`place_mass_orders` detain lock selama network I/O | `order_service.py:145, 264` | ✅ Ada |
| S-04 | Refund pada order failure | `order_service.py:152-157, 320-327` | ✅ Ada |
| S-05 | `ReconnectingWebSocket` punya max reconnect cap + backoff | `socket.ts:176-197` | ✅ Ada |

---

## Action Plan

| Prioritas | Item | Estimasi | Status |
|---|---|---|---|
| P0 | C-01 (lock balance) | 5 menit | ✅ **Diterapkan** |
| P0 | C-03 (BigInteger balance + migrasi) | 30 menit | ✅ **Diterapkan** — model + migrasi `015` |
| P1 | H-01 (require→import) | 5 menit | ✅ **Diterapkan** |
| P1 | H-02 (job socket disconnect) | 10 menit | ✅ **Diterapkan** |
| P2 | C-02 (QR task tracking) | 15 menit | ✅ **Diterapkan** |
| P2 | H-03 (idempotency log) | 10 menit | ✅ **Diterapkan** |
| P2 | H-04 (media resolve log) | 10 menit | ✅ **Diterapkan** |
| P2 | H-05, H-06 (exception log) | 10 menit | ✅ **Diterapkan** |
| P3 | M-01 (signed_url dead code) | 10 menit | ⬜ Menunggu — perlu keputusan produk |
| P3 | M-02 (account limit race) | 30 menit | ⬜ Menunggu |
| P3 | M-03 (extract resolve helper) | 1 jam | ⬜ Menunggu |
| P3 | M-04 (hardcoded owner email) | 15 menit | ⬜ Menunggu |
| P3 | M-06 (create_task konsistensi) | 30 menit | ⬜ Menunggu |

---

## Lampiran: Perbaikan yang Sudah Diterapkan

Semua fix di bawah sudah **diterapkan ke working tree** dan diverifikasi:

| Verifikasi | Hasil |
|---|---|
| `ruff check app` (backend) | ✅ All checks passed |
| `pytest` (backend) | ✅ 339 passed |
| `tsc --noEmit` (frontend) | ✅ bersih |
| `next lint --quiet` (frontend) | ✅ No ESLint warnings or errors |
| `npm run test` (frontend) | ✅ 21 files / 81 tests passed |

### 1. C-01 — `backend/app/api/admin.py:495-501`

```python
# SEBELUM — vulnerable terhadap lost update
result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))

# SESUDAH — row-level lock
# Lock the row so concurrent balance adjustments cannot overwrite each other.
result = await db.execute(
    select(User).where(User.id == UUID(payload.user_id)).with_for_update()
)
```

### 2. C-03 — `backend/app/models/user.py:27` + `backend/alembic/versions/015_widen_user_balance_bigint.py` (baru)

```python
# SEBELUM — SQLAlchemy meng-infer INTEGER
balance: Mapped[int] = mapped_column(default=0)

# SESUDAH
balance: Mapped[int] = mapped_column(BigInteger, default=0)
```

Migrasi `015` (down_revision `"014"`) meng-introspect kolom lebih dulu, jadi no-op aman bila database sudah 64-bit, dan `downgrade()` sengaja no-op (narrowing ke INTEGER akan overflow).

### 3. H-01 — `frontend/src/hooks/use-accounts.ts`

`require("@/lib/socket")` di dalam `useEffect` → import ESM statis di top-level file.

### 4. H-02 — `frontend/src/hooks/use-socket.ts:85-92`

```typescript
} else if (data.type === "completed" || data.type === "error") {
  setProgress(data);
  // The job is finished server-side. Without this the client keeps
  // reconnecting for up to 10 attempts with backoff, burning sockets on
  // a channel that will never produce another event.
  setTimeout(() => disconnectSocket(`${jobType}:${jobId}`), 1000);
}
```

### 5. C-02 — `backend/app/api/accounts.py:56-62, 231-234`

Task reference tracking untuk QR watcher (mengikuti pola `event_relay._spawn_task`):

```python
_qr_watch_tasks: set[asyncio.Task] = set()

# ...
watch_task = asyncio.create_task(watch_qr_login(qr_id, client, qr_login, user.id))
_qr_watch_tasks.add(watch_task)
watch_task.add_done_callback(_qr_watch_tasks.discard)
```

### 6. H-03 — `backend/app/api/orders.py:233-240`

`except Exception: pass` pada idempotency cache → logging dengan konteks (perilaku tidak berubah).

### 7. H-04 — `backend/app/api/media.py:127-139`

Menambahkan `import logging` + `logger`, dan logging pada fallback `get_entity`. Perilaku tidak berubah.

### 8. H-05 — `backend/app/api/admin.py:568-576` dan H-06 — `backend/app/api/accounts.py:202-205`

`except Exception: pass` → logging dengan konteks account/user id (perilaku tidak berubah).

---

## Lampiran: Perbaikan yang Sudah Diterapkan

### 1. C-01 — `backend/app/api/admin.py:495-500`

```python
# SEBELUM — vulnerable terhadap lost update
result = await db.execute(select(User).where(User.id == UUID(payload.user_id)))

# SESUDAH — row-level lock
# Lock the row so concurrent balance adjustments cannot overwrite each other.
result = await db.execute(
    select(User).where(User.id == UUID(payload.user_id)).with_for_update()
)
```

### 2. H-01 — `frontend/src/hooks/use-accounts.ts`

`require("@/lib/socket")` di dalam `useEffect` dipindahkan menjadi import ESM statis di bagian atas file.

### 3. H-02 — `frontend/src/hooks/use-socket.ts`

Job socket sekarang di-disconnect setelah menerima event terminal (`completed`/`error`), dengan jeda 1 detik agar frontend sempat memproses pesan terakhir.
