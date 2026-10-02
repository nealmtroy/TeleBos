# Audit Report — Dead Code, Redundansi & Unhandled Error

**Project:** TeleBos (D:\PROJECT\Telegram\TeleBos)
**Scope:** Backend Python — `backend/app/` (167 file, ~36.940 LOC)
**Tanggal:** 2026-10-28
**Metodologi:** Analisis AST (Python `ast` module) untuk deteksi unused import & modul unreferenced + grep terarah + pembacaan manual file kunci.

---

## Ringkasan Eksekutif

| Kategori | Temuan | Catatan |
|---|---|---|
| **Modul dead (tidak ter-import di mana pun)** | 4 | 244 baris kode mati |
| **Unused imports** | 414 nama di 55 file | ~70% di 9 file `api/*.py` |
| **Redundansi import (copy-paste)** | 9 file | 1 file import 34 schema yg cuma butuh 2 |
| **Unused imports di service (sisa refactor)** | 7 file | `message_service`, `poll_service`, `session_service`, dll |
| **Unhandled / misleading error handling** | 6 | 1Critical (logic bug tersembunyi) |
| **Total baris bisa dihemat** | ~300+ | |

### Temuan per Severity

| Severity | Jumlah |
|---|---|
| 🔴 CRITICAL | 1 |
| 🟠 HIGH | 3 |
| 🟡 MEDIUM | 7 |
| 🔵 LOW | 8 |

> ✅ **Kabar baik:** codebase ini sudah **jauh lebih bersih dari rata-rata**. Tidak ada `bare except:`, tidak ada `except Exception: pass` tanpa logging, tidak ada TODO/FIXME/HACK tersisa, dan `time.sleep` yang gwantique sudah diisolasi via `run_in_executor`.jie

---

## 🔴 CRITICAL

### [CRITICAL] 1. Production error disamarkan jadi "mocked" — logic bug tersembunyi di marketplace

- **File:** `backend/app/services/marketplace_service.py:148-160`
- **Tipe:** Unhandled error / logic defect

**Evidence:**
```python
# Batch resolve prices (N1Q-02), falling back to resolve_telegram_id_price if patched/mocked
is_mocked = hasattr(price_service.resolve_telegram_id_price, "assert_called") or hasattr(price_service.resolve_telegram_id_price, "mock")
if not is_mocked:
    try:
        await price_service.resolve_prices_for_accounts(db, accounts)
    except Exception:
        is_mocked = True

for account in accounts:
    if is_mocked or account.sell_price is None:
        prices[account.id] = await price_service.resolve_telegram_id_price(db, account)
    else:
        prices[account.id] = account.sell_price
```

**Masalah:**
`is_mocked` awalnya hanya `True` saat fungsi benar-benar di-mock (deteksi `assert_called`/`mock`). Tapi begitu `resolve_prices_for_accounts` **melempar exception apa pun** — termasuk `ConnectionError` ke PostgreSQL, `TimeoutError`, atau bug logika di dalamnya — `except Exception` menangkap lalu **meng-set `is_mocked = True`**, seolah ini lingkungan test.

Dampaknya:
1. **Harga salah.** Jalur fallback `resolve_telegram_id_price` dipakai untuk listing yang bukan bagian test. Dua fungsi itu bisa menghitung harga berbeda → **harga tlisting berbeda dari yang ditampilkan di batch** (race antara batch vs single-path).
2. **Exception hilang tanpa jejak.** Tidak ada `logger.exception`. DB down / timeout / bug internal jadi tak terlihat di monitoring.
3. **Konsumen data salah.** Lebih jauh, `buy_prices[account.id] = prices[account.id]` (line 166) aktif saat `is_mocked` → **harga beli = harga jual**,biaya SMM jadi nol. Potensi **rugi langsung pemilik akun**.

**Fix:**
```diff
 is_mocked = hasattr(price_service.resolve_telegram_id_price, "assert_called") or hasattr(price_service.resolve_telegram_id_price, "mock")
 if not is_mocked:
     try:
         await price_service.resolve_prices_for_accounts(db, accounts)
-    except Exception:
-        is_mocked = True
+    except Exception:
+        # Bug/DB error harus terlihat, bukan disamarkan jadi "mocked".
+        # Fallback per-akun tetap aman, tapi tetap kita log sebagai warning.
+        logger.warning(
+            "resolve_prices_for_accounts gagal untuk %d akun, fallback ke resolve_telegram_id_price satuan",
+            len(accounts),
+            exc_info=True,
+        )
 
 for account in accounts:
-    if is_mocked or account.sell_price is None:
+    if is_mocked or account.sell_price is None:
         prices[account.id] = await price_service.resolve_telegram_id_price(db, account)
     else:
         prices[account.id] = account.sell_price
```
`logger` sudah tersedia di file ini; `is_mocked` tetap `False` sehingga `buy_prices` tetap dihitung via `resolve_buy_price_for_telegram_id` (tidak berubah jadi harga jual).

---

## 🟠 HIGH

### [HIGH] 2. `decrypt()` gagal diam-diam → return `""` → client Telegram dibuat dari session kosong

- **File:** `backend/app/utils/encryption.py:44-52`
- **Tipe:** Unhandled error (silent failure) — root cause dari banyak call site

**Evidence:**
```python
def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext back to the original string."""
    if not ciphertext:
        return ""
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc)
        return ""      # ← swallow
```

**Masalah:** Kegagalan decrypt (key berubah, ciphertext korup, `InvalidToken`) **tidak dilempar**. Setiap pemanggil menerima `""` dan，多数 tidak memvalidasi:
```python
# app/api/chats.py:287
session_str = account.session_string  # decrypted  ← komentar menyesatkan
from app.utils.encryption import decrypt
client = await client_pool.get(str(account.id), decrypt(session_str))  # bisa "" tanpa error

# app/api/media.py:243-246
session_str = decrypt(account.session_string)
client = await client_pool.get(str(account.id), session_str)
if client is None:
    raise HTTPException(status_code=400, detail="Account is disconnected")  # pesan salah: bukan "disconnected"
```
Kalau `decrypt` return `""`, `StringSession("")` akan **gagal saat connect** dengan error tidak jelas ("Auth key must be provided") — pesan 500/400 yang menyesatkan debugging.

**Fix (opsional-error):** ubah `decrypt` jadi strict + sediakan `decrypt_or_none()`:
```python
def decrypt_or_none(ciphertext: str) -> str | None:
    """Return decrypted value or None when the ciphertext cannot be decrypted."""
    if not ciphertext:
        return None
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except Exception as exc:
        logger.error("Decryption failed: %s", exc)
        return None
```
Lalu di call site:
```diff
-session_str = decrypt(account.session_string)
+session_str = decrypt_or_none(account.session_string)
+if not session_str:
+    raise HTTPException(status_code=500, detail="Stored session is corrupted; re-login required")
 client = await client_pool.get(str(account.id), session_str)
```

---

### [HIGH] 3. `signed_url.py` — mitigasi kebocoran token sudah ditulis tapi TIDAK pernah dipakai

- **File:** `backend/app/utils/signed_url.py` (71 baris), test `tests/unit/test_signed_url.py`
- **Tipe:** Dead code (fitur keamanan unfinished)

**Evidence:**
```python
# app/utils/signed_url.py:1-11
"""Short-lived signed token generation for photo URLs.

Replaces passing full JWTs as query parameters (which leak into logs, history,
and Referer headers) with a lightweight HMAC token specific to the resource.
...
"""
```
Module ini **tidak di-import oleh file mana pun** di `backend/app/` — hanya dirujuk oleh test-nya sendiri:
```
app/utils/signed_url.py:25:def generate_photo_token(...)
tests/unit/test_signed_url.py:9:    token = signed_url.generate_photo_token("account-1", "user-1")
```

**Konteks:** ini justru **solusi** untuk temuan auditor lain — `get_current_user_from_token_or_header` (dependencies.py:110) menerima session token via **query param `?token=`**, yang bocor ke access log / browser history / header `Referer`. signed_url dirancang persis untuk itu tapi tidak pernah di-integrate.

**Fix:**
- **Opsi A (terbaik):** integrate di endpoint yang memang butuh token di URL (photo download). Ganti `?token=<session>` dengan `?t=<signed_photo_token>` + validasi `verify_photo_token`.
- **Opsi B:** hapus modul + test kalau UID tidak jadi dikirim via URL.

---

### [HIGH] 4. `session_service.py` — 59 baris service mati, tidak ada importer

- **File:** `backend/app/services/session_service.py:1-59`
- **Tipe:** Dead code

**Evidence:**
```python
# app/services/session_service.py:20-26
async def get_active_sessions(account: TelegramAccount) -> list:
    session_str = decrypt(account.session_string)
    client = await client_pool.get(str(account.id), session_str)
    if client is None:
        raise RuntimeError("Account is disconnected. Please re-login.")
```
Dicek: `grep -rn "session_service\|get_active_sessions" app/ tests/` → **0 hasil** di luar file itu sendiri. Baris `get_active_sessions` tidak pernah dipanggil (fitur live "active sessions" tidak pernah dikirim / Never Implemented).

**Fix:** hapus seluruh file, atau implementasikan endpoint `/accounts/{id}/sessions/live` bila memang direncanakan.

---

## 🟡 MEDIUM

### [MEDIUM] 5. `polls.py` import 34 schema yang tidak dipakai — copy-paste dari `chats.py`

- **File:** `backend/app/api/polls.py:3-46`
- **Tipe:** Redundansi

**Evidence:** polls.py butuh **2** schema saja (`CreatePollRequest`, `VotePollRequest`, line 55 & 80), tapi meng-import 34 nama:
```python
from app.schemas.chat import (
    ChatListResponse, MessageListResponse, SendMessageRequest, SendMessageResponse,
    FolderCreate, FolderUpdate, FolderResponse, FolderListResponse, BatchChatActionRequest,
    JoinChatRequest, JoinChatResponse, DeleteMessageRequest, BatchDeleteMessagesRequest,
    EditMessageRequest, ForwardMessagesRequest, SendReactionRequestSchema, PinMessageRequest,
    PromoteMemberRequest, UpdateGroupPermissionsRequest, MuteChatRequest, EditChatInfoRequest,
    SharedMediaResponse, ChatSearchResponse, GroupMemberListResponse, GroupPermissionsResponse,
    StickerPacksResponse, InviteLinkListResponse, CreateInviteLinkRequest, CreatePollRequest,
    VotePollRequest, StickerSetResponse, SendStickerRequest, SendScheduledMessageRequest, InviteLinkItem,
)
from app.services import account_service, poll_service as chat_service
from app.utils.rate_limiter import rate_limiter
# ↑ semua TIDAK dipakai
```

**Fix:** potong ke 2 yang dipakai saja:
```python
from app.schemas.chat import CreatePollRequest, VotePollRequest
```
Impact: 34 baris hilang + faster import (FastAPI reload).

---

### [MEDIUM] 6. `reactions.py`, `pins.py`, `stickers.py`, `group_admin.py`, `messages.py`, `media.py` — pola sama

- **Tipe:** Redundansi
- **Impact:** ~200 unused imports total di 6 file

| File | Unused | Contoh yang tidak dipakai |
|------|--------|--------------------------|
| `api/reactions.py` | 40 | `File`, `Form`, `rate_limiter`, 30 schema |
| `api/pins.py` | 39 | idem |
| `api/stickers.py` | 37 | idem |
| `api/group_admin.py` | 31 | idem |
| `api/messages.py` | 30 | idem |
| `api/media.py` | 33 | 30 schema `app.schemas.chat` |

**Fix (semua file):** jalankan linter otomatis. `ruff` sudah terpasang (ada `.ruff_cache/`):
```bash
cd backend
# preview dulu
ruff check app/api/ --select F401
# hapus otomatis
ruff check app/api/ --select F401 --fix
```

---

### [MEDIUM] 7. 7 service file punya 9-16 unused import sisa refactor

- **Tipe:** Redundansi / dead import
- **Evidence (contoh `services/message_service.py`, 16 unused):**
```
uuid, Any?, timezone, dt_module, delete, func, select, update, insert, AsyncSession, ChatFolder, TelegramChat, client_pool, decrypt, PeerChannel, PeerChat, PeerUser
```
Yang dipakai hanya: `logging`, `get_active_client`, `resolve_chat_entity`, `select`, `AsyncSession`.

| File | Unused count |
|------|---------------|
| `services/message_service.py` | 16 |
| `services/poll_service.py` | 15 |
| `services/session_service.py` | 14 (file mati) |
| `services/reaction_service.py` | 13 |
| `services/sticker_service.py` | 13 |
| `services/event_relay.py` | 8 |
| `services/group_admin_service.py` | 6 |

Pola identik di semua: header file masih bring in `uuid`, `datetime`, `sqlalchemy.delete/insert/update/func`, model `ChatFolder`/`TelegramChat`, `client_pool`, `decrypt` — sisa copy-paste dari `account_service.py`.ody

**Fix:**
```bash
cd backend
ruff check app/ --select F401 --fix
```

---

### [MEDIUM] 8. `models/enums.py` (42 baris) — StrEnum central tidak dipakai dimanapun

- **File:** `backend/app/models/enums.py`
- **Tipe:** Dead code

**Evidence:** berisi `JobStatus`, `UserRole`, dan enum lain dengan docstring "Centralized domain enumerations". Dicek:
```bash
grep -rn "JobStatus\|UserRole" app/ --include="*.py"
```
→ hanya enum itu sendiri yang muncul; semua model & service masih pakai **string literal** (`job.status == "running"`, `user.role == "owner"`).

**Fix:** dua opsi:
1. Migrasikan ke enum (lebih aman, type-checked):
```diff
-class UserRole(str, Enum): ...
+from app.models.enums import UserRole
 if user.role == "owner":
```
2. Hapus file kalau belum jadiKy 계획 enum.

---

### [MEDIUM] 9. `schemas/device.py` & `schemas/log.py` — schema tidak terpakai

- **File:** `backend/app/schemas/device.py` (19), `backend/app/schemas/log.py` (21)
- **Tipe:** Dead code

**Evidence:**
- `schemas/device.py` berisi `DeviceResponse`; `api/devices.py` **tidak** import dari `schemas.device` — response-nya di-inline atau dict.
- `schemas/log.py` berisi `BroadcastLogResponse`; `api/broadcast.py` **tidak** import dari `schemas.log` — response broadcast log di-inline.

**Fix:** hapus file, atau (lebih baik) adopsi di endpoint terkait supaya konsisten typed.

---

### [MEDIUM] 10. `avatar_generator.py` (74 baris) — tidak dipakai

- **File:** `backend/app/utils/avatar_generator.py`
- **Tipe:** Dead code

**Evidence:** fungsi `get_initials`, `generate_gradient_avatar` tidak di-import. `api/accounts.py` mungkin generate avatar di frontend saja.

**Fix:** hapus, atau pindahkan ke frontend (Next.js) kalau memang logic avatar lived di sana.

---

## 🔵 LOW

### [LOW] 11. `get_current_user_from_token_or_header` di-import tapi tidak dipakai di 6 file

- **Files:** `api/chats.py:7`, `api/messages.py:7`, `api/pins.py:7`, `api/polls.py:7`, `api/reactions.py:7`, `api/stickers.py:7`
- **Tipe:** Dead import

**Evidence:** pola `from app.dependencies import get_current_user, get_current_user_from_token_or_header` — tapi endpoint-nya hanya pake `get_current_user`.

**Fix:** `ruff check app/ --select F401 --fix`.

---

### [LOW] 12. `order_service.py` import `decrypt` & `encrypt` tapi tidak dipakai

- **File:** `backend/app/services/order_service.py` (2 unused)
- **Tipe:** Dead import
- **Fix:** hapus baris import.

---

### [LOW] 13. `invite_service.py` import `decrypt`, `TelegramClient`, `StringSession`, `get_settings`, `flood_controller` — tidak dipakai

- **File:** `backend/app/services/invite_service.py` (5 unused)
- **Tipe:** Dead import
- **Fix:** hapus.

---

### [LOW] 14. `broadcast_service.py` — `_invite_hash`, `_public_target`, `json` unused

- **File:** `backend/app/services/broadcast_service.py` (3 unused)
- **Tipe:** Dead import / sisa refactor
- **Fix:** hapus import, atau lengkapi/`# noqa` bila memang-cultural planned.

---

### [LOW] 15. `main.py` import `TrustedHostMiddleware` tapi tidak dipakai

- **File:** `backend/app/main.py:49` (import), tidak ada `add_middleware(TrustedHostMiddleware...)` call
- **Tipe:** Dead import
- **Fix:** hapus import (atau add middleware kalau memang mau hardening Host header).

---

### [LOW] 16. `api/admin.py` & `api/admin_smm.py` & `api/invite.py` import `get_current_user` tanpa dipakai

- **Tipe:** Dead import
- **Fix:** hapus (atau pakai di endpoint yang butuh).

---

### [LOW] 17. `indonesian_names.py:18` & 3 file lain import `annotations` dari `__future__` tanpa efek

- **Files:** `indonesian_names.py`, `services/broadcast_entitlement.py`, `services/marketplace_profile_service.py`, `utils/account_ownership.py`
- **Tipe:** Redundant import (`from __future__ import annotations` sudah default di Python 3.12+, atau tidak ada type annotation yang perlu di-defer)
- **Fix:** hapus jika memang tidak ada forward-ref type.

---

### [LOW] 18. `api/settings.py` import `logging` — module-level logger mungkin sudah ada, tapi import-nya sia-sia

- **File:** `backend/app/api/settings.py` (1 unused: `logging`)
- **Tipe:** Dead import
- **Fix:** hapus baris import.

---

## Ringkasan Perbaikan Cepat (copy-paste)

```bash
cd D:/PROJECT/Telegram/TeleBos/backend

# 1. Lihat semua unused import
ruff check app/ --select F401

# 2. Hapus otomatis (safe — hanya hapus import yang tidak dipakai)
ruff check app/ --select F401 --fix

# 3. Verifikasi tidak ada yang rusak
python -c "import app.main" && echo OK

# 4. Jalankan test suite
pytest tests/ -x -q

# 5. Hapus modul mati manual
rm app/services/session_service.py
rm app/utils/avatar_generator.py
rm app/models/enums.py   # atau migrasikan ke enum dulu
rm app/schemas/device.py app/schemas/log.py
# signed_url.py: integrate atau hapus (temuان #3)
```

### Perbaikan manual (Critical #1)
Edit `app/services/marketplace_service.py:151-154` sesuai diff di atas — **jangan sampai production error disamarkan jadi "mocked"**.

---

## Catatan Methodology

- **Unused imports** dideteksi via AST walk: setiap `Import`/`ImportFrom` di-bind ke nama, lalu dicek apakah nama itu muncul sebagai `ast.Name`/`ast.Attribute` di file yang sama. String literal ikut dihitung (untuk type annotation string).
- **Modul unreferenced** dideteksi via: kumpulkan semua `import` dari semua file, normalisasi prefix `app.` → path relatif, lalu bandingkan dengan daftar modul yang ada.
- **Verifikasi manual** dilakukan untuk setiap kandidat agar false-positive (entrypoint `python -m`, `__init__.py` re-export) tidak salah dilaporkan.
- Catatan: laporan ini **tidak** mengulang temuan yang sudah ada di `docs/audit_2026-10-02_code_and_security.md`, `docs/deep_bug_logic_audit_report.md`, dan audit lain yang lebih lama.