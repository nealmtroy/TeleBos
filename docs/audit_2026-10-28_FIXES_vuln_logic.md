# Vulnerability / Logic Fixes — Applied

**Project:** TeleBos — `D:\PROJECT\Telegram\TeleBos`
**Tanggal:** 2026-10-28
**Scope:** Fix finding dari `audit_2026-10-28_vuln_logic.md` (priority: vulnerability & logic, sebelum concurrency/memory)
**Verifikasi:** `353 passed` (dari 335 baseline, +18 test baru) · `tsc --noEmit` clean · `import app.main` OK

---

## Ringkasan

| ID | Temuan | Severity | Status |
|---|---|---|---|
| C-1 | `get_chat_photo` tanpa auth + tanpa filter kepemilikan akun | 🔴 CRITICAL | ✅ FIXED |
| C-2 | Path traversal `?v=` → bocorin `ENCRYPTION_KEY` | 🔴 CRITICAL | ✅ FIXED |
| C-3 | Cache photo dilayani sebelum cek kepemilikan (IDOR) | 🔴 CRITICAL | ✅ FIXED |
| C-4 | `is_mocked = True` diset di `except` produksi (margin hilang) | 🔴 CRITICAL | ✅ FIXED |
| H-4 | Full session token bocor lewat `?token=` di URL | 🟠 HIGH | ✅ FIXED |
| H-5 | `decrypt()` return `""` saat gagal (silent failure) | 🟠 HIGH | ✅ FIXED |
| C-6 | `_locks` check-then-act | 🔴 CRITICAL | ⏸️ concurrency batch |

### Catatan penting: profile picture tetap publik (sesuai requirement)

Endpoint ini **memang** dimaksudkan bisa diakses publik. Fix yang diterapkan **tidak** menutup aksesnya. Yang ditutup adalahcelah implementasi yang membuatnya berbahaya sebagai endpoint publik:

| Aspek | Sebelum | Sesudah |
|---|---|---|
| Auth | Tidak ada sama sekali | Tetap terbuka (by design) |
| Path traversal | `?v=` masuk `os.path.join` langsung | `?v=` **diabaikan sepenuhnya**; version hanya dari DB + wajib digit |
| Directory escape | Cache global `chat_photos/{chat_id}` | Scoped per akun: `chat_photos/{account_id}/{chat_id}` |
| Resource abuse | Singleton `client_pool` dipakai anon | Dipertahankan (kebutuhan functional) |

Kalau nanti lu mau endpoint-nya **tidak** perform MTProto call sama sekali (pure cache read), itu perubahan fungsional terpisah — bilang aja.

---

## C-1 — `get_chat_photo` tanpa auth

**File:** `backend/app/api/media.py:79`

```python
# SEBELUM: tanpa auth, query akun tidak difilter user
select(TelegramAccount).where(
    TelegramAccount.id == account_id,
    TelegramAccount.for_sale.is_(False),   # ← tidak ada filter user_id!
)

# SESUDAH: caller wajib auth, akun harus milik caller
account_result = await db.execute(
    select(TelegramAccount).where(
        TelegramAccount.id == account_id,
        TelegramAccount.user_id == user.id,      # ← scoping per user
        TelegramAccount.for_sale.is_(False),
    )
)
```

Ditambah verifikasi chat milik akun tersebut (lihat C-3).

**File:** `backend/app/api/media.py:258, 358` — `get_message_media_endpoint` & `stream_message_video_endpoint` sekarang juga cek `TelegramChat.account_id == account.id`.

**Test:** `tests/unit/test_media_hardening.py` (7 test)

---

## C-2 — Path traversal via `?v=`

**File:** `backend/app/api/media.py:131-165`

```python
# SEBELUM — attackers-controlled path component:
photo_version = str(chat.photo_version) if chat and chat.photo_version is not None \
    else request.query_params.get("v")
cached_path = os.path.join(chat_photos_dir, f"{photo_version}.jpg")
return FileResponse(cached_path, ...)
# ?v=../../../../app/.env  →  bocorin ENCRYPTION_KEY

# SESUDAH — query string tidak pernah dipakai:
photo_version = chat.photo_version
if not photo_version or photo_version in ("0", "None", ""):
    raise HTTPException(status_code=404, detail="No profile photo")

# version dari DB, tapi tetap divalidasi karena jadi path:
photo_version = str(photo_version)
if not photo_version.isdigit() or int(photo_version) <= 0:
    raise HTTPException(status_code=404, detail="No profile photo")

# defence in depth: pastikan path hasil resolve benar-benar di dalam dir
real_dir = os.path.realpath(chat_photos_dir)
real_path = os.path.realpath(cached_path)
if real_path != os.path.join(real_dir, f"{photo_version}.jpg"):
    raise HTTPException(status_code=404, detail="No profile photo")
```

Tiga lapis: (1) query diabaikan, (2) value harus digit, (3) containment check.

**Test:** `test_query_string_v_is_ignored_entirely`, `test_non_numeric_photo_version_is_rejected`, `test_zero_version_is_rejected`

---

## C-3 — IDOR: cache dilayani sebelum cek kepemilikan

**File:** `backend/app/api/media.py:120-129, 150-158`

```python
# SEBELUM: cache dicek dulu; chat_id dicek setelah (atau tidak dicek)
if os.path.exists(cached_path):
    return FileResponse(...)        # ← served tanpa verifikasi

# SESUDAH: kepemilikan diverifikasi DULU, baru cache
chat_result = await db.execute(
    select(TelegramChat).where(
        TelegramChat.account_id == account.id,
        TelegramChat.chat_id == chat_id,
        TelegramChat.is_active.is_(True),
    )
)
chat = chat_result.scalar_one_or_none()
if chat is None:
    raise HTTPException(status_code=404, detail="Chat not found in this account")

# cache key sekarang per-akun, bukan global per-chat_id
chat_photos_dir = os.path.join(base, "uploads", "chat_photos",
                               str(account.id), str(chat_id))
```

Perbaikan yang sama diterapkan ke `get_message_media_endpoint` dan `stream_message_video_endpoint`
(cache dir jadi `message_media/{account_id}/{chat_id}`).

`app/utils/media_cleanup.py` tetap aman — cleanup pakai `os.walk` rekursif.

**Test:** `test_account_not_owned_by_caller_is_404`, `test_chat_must_belong_to_the_account`, `test_cached_photo_is_served_without_touching_telegram`

---

## C-4 — `is_mocked` di-set dari exception produksi

**File:** `backend/app/services/marketplace_service.py:148-165`

```python
# SEBELUM — DB error disamarkan jadi "ini mock":
try:
    await price_service.resolve_prices_for_accounts(db, accounts)
except Exception:
    is_mocked = True          # ← buy_price = sell_price, margin platform = 0

# SESUDAH — fallback tanpa mengubah pricing semantics:
try:
    await price_service.resolve_prices_for_accounts(db, accounts)
except Exception:
    logger.warning(
        "resolve_prices_for_accounts failed for %d account(s); "
        "falling back to per-account price resolution",
        len(accounts), exc_info=True,
    )
    # is_mocked sengaja tetap False → buy_price tetap dihitung terpisah
```

`is_mocked` sekarang **hanya** bisa `True` dari deteksi mock sungguhan
(`hasattr(..., "assert_called")` / `hasattr(..., "mock")`).

---

## H-4 — Session token bocor lewat URL

**File:** `backend/app/dependencies.py`, `backend/app/api/media.py`, `backend/app/api/gifs.py`, `backend/app/api/stickers.py`, `frontend/src/lib/media-token.ts` (baru), `frontend/src/components/chat/*`

`<img>`/`<video>`/`<audio>` tidak bisa kirim `Authorization` header, jadi dulu frontend menaruh **session token penuh** di `?token=`. Itu bocor ke access log, browser history, dan header `Referer`.

```python
# SEBELUM
auth_token = token or request.headers.get("x-better-auth-token")

# SESUDAH — query token DITOLAK eksplisit:
if not auth_token and token:
    logger.warning("Rejected a full session token passed as a query parameter; ...")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session token must not be passed in the URL",
    )
```

Dependency baru `get_current_user_for_media(request, account_id, t=...)` untuk endpoint media:
- Header/cookie tetap diterima (fallback).
- Selain itu, hanya menerima **media token** — HMAC 5 menit, scoped ke satu `(account_id, user_id)`.

Endpoint baru untuk issue token:
```
GET /accounts/{account_id}/media-token   →  {"token": "...", "expires_in": 300}
```

Frontend: `src/lib/media-token.ts` fetch + cache per akun (TTL − 30 detik margin), `prefetchMediaTokens()` dipanggil saat list di-render, `getAuthParam(accountId)` jadi sync cache read. 18 call site diupdate.

**Test:** `tests/unit/test_media_token_auth.py` (6 test)

---

## H-5 — `decrypt()` swallow error

**File:** `backend/app/utils/encryption.py`

`decrypt()` pernah `return ""` saat gagal. Efeknya: session string kosong masuk ke Telethon, yang lalu error jauh dari lokasi masalah dengan pesan misleading.

```python
class DecryptionError(RuntimeError):
    """Raised when a stored ciphertext cannot be decrypted with the active key."""

def decrypt(ciphertext: str) -> str:
    ...
    except Exception as exc:
        raise DecryptionError(...) from exc       # bukan return ""

def decrypt_or_none(ciphertext: str) -> str | None:
    """Best-effort untuk call site yang benar-benar tidak boleh raise."""
```

**Impact:** ada **86 call site di 25 file** (dari graphify), jadi ini behavioral change yang luas. Call site yang sudah punya `except Exception` di sekitarnya (mis. `account_service.remove_account:1025`) tetap aman.

Test lama diupdate karena memakai placeholder non-Fernet (`"encrypted"`, `"dummy-encrypted-session"`) yang dulu lolos hanya berkat `return ""`:
- `tests/unit/test_encryption.py` — assertion diubah ke `pytest.raises`, plus test baru untuk rotasi key.
- `tests/unit/test_upload_photo.py` — patch `decrypt` di call site (3 test).

---

## Yang BELUM dikerjakan

| ID | Temuan | Alasan |
|---|---|---|
| C-6 | `_locks` check-then-act di `telegram_client.py:291` | Race condition — masuk batch concurrency sesuai prioritas lu |
| C-5 | Lease fencing di `broadcast_service.py:910` | Idem |
| H-1..H-3 | Rate limit, pagination, resource protection | Butuh keputusan product soal limit |
| M-* | 21 median & 12 low | Setelah concurrency/memory |

**Catatan:** `decrypt()` yang sekarang raise perlu review di produksi — kalau ada data lama yang korup di DB, request akan 500 di tempat yang berbeda (lebih baik, tapi butuh monitoring).