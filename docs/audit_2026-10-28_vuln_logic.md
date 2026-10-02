# Audit Keamanan & Cacat Logika — TeleBos Backend

**Tanggal:** 2026-10-28
**Ruang lingkup:** `D:/PROJECT/Telegram/TeleBos/backend/app/` (FastAPI + SQLAlchemy async + Telethon)
**Fokus:** autentikasi/otorisasi, uang & saldo, penanganan berkas, logika bisnis
**Metode:** audit statis kode sumber (tanpa eksekusi). Setiap temuan menyertakan `file:line` dan potongan kode yang benar-benar dibaca.

---

## Ringkasan Eksekutif

| # | Severitas | Temuan | Lokasi |
|---|-----------|--------|--------|
| 1 | **CRITICAL** | Endpoint `/chats/{chat_id}/photo` tanpa autentikasi sama sekali — mengelps session string & membuka koneksi Telethon | `api/media.py:56` |
| 2 | **CRITICAL** | Path Traversal → Arbitrary File Read lewat query param `?v=` yang dipakai sebagai nama berkas cache | `api/media.py:99,119,121` |
| 3 | **CRITICAL** | IDOR media: cache dilayani **sebelum** cek kepemilikan akun/chat; direktori cache hanya dikunci `chat_id` | `api/media.py:224,228-236,312-320` |
| 4 | **HIGH** | Token sesi diterima lewat query param `?token=` (bocor ke access log / Referer / history) | `dependencies.py:110-116` |
| 5 | **HIGH** | `decrypt()` mengembalikan `''` diam-diam pada kegagalan; pemanggil tidak memvalidasi | `utils/encryption.py:44-52` |
| 6 | **HIGH** | Saldo tidak pernah dikembalikan untuk order yang berstatus `Failed`/`Partial` dari panel SMM | `services/order_service.py:371-399` |
| 7 | **HIGH** | Saldo dipotong + di-`commit` sebelum panggilan API eksternal → ada jendela crash yang menghilangkan uang permanen | `services/order_service.py:143-145,262-264` |
| 8 | **MEDIUM** | Saldo admin dijepit ke `0` diam-diam, tanpa ledger/riwayat audit saldo | `api/admin.py:503-505` |
| 9 | **MEDIUM** | Margin platform hilang: `buy_price` NULL membuat pembeli membayar tepat `sell_price` | `services/marketplace_service.py:472-474` |
| 10 | **MEDIUM** | Kredensial DB default `postgres:postgres` hanya dijaga jika `TELEBOS_ENV=production` | `config.py:132-138` |
| 11 | **MEDIUM** | Pembagian harga integer per-order → order murah/gratis untuk qty kecil | `services/order_service.py:428-436` |
| 12 | **MEDIUM** | Lookup sesi jatuh ke perbandingan token plaintext (permukaan timing attack, token lama tetap berlaku) | `dependencies.py:54-55,132-133` |
| 13 | **MEDIUM** | Jalur `token_or_header` tidak menjalankan auto-downgrade langganan kedaluwarsa | `dependencies.py:110-174` vs `:103-105` |
| 14 | **MEDIUM** | Upload voice tanpa batas ukuran → memory DoS | `api/media.py:556-558` |
| 15 | **LOW** | Rate limiter *fail-open* secara default; Redis down ⇒ semua limit (redeem/2FA/admin) mati | `config.py:60`, `utils/rate_limiter.py:133` |
| 16 | **LOW** | N+1 query pada statistik admin & sinkronisasi profil (loop `await db.execute`) | `api/admin.py:301-307`, `services/profile_sync_service.py:207` |

**Total: 3 CRITICAL · 4 HIGH · 7 MEDIUM · 2 LOW**

---

### [CRITICAL] 1. Endpoint foto chat tanpa autentikasi — membocorkan session string & menyalakan Telethon

**File:** `backend/app/api/media.py:56-62`
**Tipe:** Broken Authentication / CWE-306 (Missing Authentication for Critical Function)

**Evidence:**
```python
@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(
    account_id: str,
    chat_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),          # ← tidak ada Depends(get_current_user)
):
```
Router `media` juga tidak punya dependency tingkat router (`api/media.py:52`: `router = APIRouter(tags=["media"])`). Bandingkan dengan endpoint lain di berkas yang sama, misalnya `api/media.py:212` dan `:298` yang memakai `user: User = Depends(get_current_user_from_token_or_header)`.

Yang dilakukan fungsi ini untuk permintaan anonim:
- `api/media.py:80-88` — memuat `TelegramAccount` **tanpa filter kepemilikan** (`for_sale.is_(False)` saja).
- `api/media.py:124-125` — `session_str = decrypt(account.session_string)` lalu `client = await client_pool.get(str(account.id), session_str)`.
- `api/media.py:131-156` — melakukan panggilan jaringan nyata ke Telegram (`get_entity`, `download_profile_photo`) dan menulis ke disk.

**Exploit/Impact:**
Serangan anonim tanpa kredensial apa pun dapat: (a) meng enumerasi seluruh akun Telethon yang terdaftar lewat `account_id`, (b) memicu dekripsi session string dan koneksi Telethon untuk akun mana pun yang ID-nya diketahui, (c) memakai backend sebagai pipa proksi untuk mengunduh media Telegram milik pengguna lain. Ini juga memberi permukaan DoS (setiap permintaan membuka koneksi MTProto) dan membocorkan informsi existence akun.

**Fix:**
```diff
 @router.get("/accounts/{account_id}/chats/{chat_id}/photo")
 async def get_chat_photo(
     account_id: str,
     chat_id: int,
     request: Request,
     db: AsyncSession = Depends(get_db),
+    user: User = Depends(get_current_user_from_token_or_header),
 ):
     account_result = await db.execute(
         select(TelegramAccount).where(
-            TelegramAccount.id == account_id,
+            TelegramAccount.id == account_id,
+            TelegramAccount.user_id == user.id,
             TelegramAccount.for_sale.is_(False),
         )
     )
```

---

### [CRITICAL] 2. Path Traversal → Arbitrary File Read melalui query param `?v=`

**File:** `backend/app/api/media.py:99`, `:111-122`
**Tipe:** CWE-22 Path Traversal / Local File Inclusion

**Evidence:**
```python
 99|    photo_version = str(chat.photo_version) if chat and chat.photo_version is not None else request.query_params.get("v")
100|    if not photo_version or photo_version in ("0", "None", ""):
101|        raise HTTPException(status_code=404, detail="No profile photo")
...
119|    cached_path = os.path.join(chat_photos_dir, f"{photo_version}.jpg")
120|
121|    if os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
122|        return FileResponse(cached_path, media_type="image/jpeg", headers=headers)
```
`photo_version` berasal langsung dari query string dan **tidak pernah disanitasi** — tidak ada `os.path.basename()`, tidak ada allow-list karakter. Blacklist di baris 100 hanya menyaring literal `"0"`, `"None"`, `""`.

**Exploit/Impact:**
Pada account yang chat-nya punya `photo_version IS NULL` di DB (kasumbral normal — lihat `api/media.py:152-154` yang memang meng-`None`-kan saat gagal unduh), penyerang cukup meminta:
```
GET /api/v1/accounts/<uuid>/chats/<chat_id>/photo?v=../../../../../../etc/passwd%00
```
atau tanpa NUL byte (tetap terbaca berkas `.jpg`): `?v=../../../app/.env` menghasilkan `chat_photos_dir/../../../app/.env.jpg`. Jika berkas target ada dan berukuran ≠ 0, `FileResponse` mengembalikannya. Karena endpoint ini **tanpa autentikasi** (temuan #1), siapa pun bisa membaca berkas konfigurasi backend (`backend/.env` berisi `ENCRYPTION_KEY`, `SMM_API_KEY`, `SENTRY_DSN`, `GROQ_API_KEY_*`) maupun berkas kredensial lain di dalam image container. Kebocoran `ENCRYPTION_KEY` membuat semua `telegram_accounts.session_string` dan `twofa_password` dapat didekripsi.

**Fix:**
```diff
-    photo_version = str(chat.photo_version) if chat and chat.photo_version is not None else request.query_params.get("v")
-    if not photo_version or photo_version in ("0", "None", ""):
+    photo_version = str(chat.photo_version) if chat and chat.photo_version is not None else request.query_params.get("v")
+    # v dari query hanya boleh berupa versi numerik yang ketat
+    if not photo_version or not photo_version.isdigit() or int(photo_version) <= 0:
         raise HTTPException(status_code=404, detail="No profile photo")
```
Dan sebagai defence-in-depth, sebelum `FileResponse`:
```python
if not os.path.realpath(cached_path).startswith(os.path.realpath(chat_photos_dir) + os.sep):
    raise HTTPException(status_code=404, detail="No profile photo")
```

---

### [CRITICAL] 3. IDOR media: cache dilayani sebelum cek kepemilikan; cache hanya dikunci `chat_id`

**File:** `backend/app/api/media.py:224`, `:228-236` (endpoint media), `:309`, `:312-320` (endpoint video)
**Tipe:** CWE-639 Authorization Bypass Through User-Controlled Key (IDOR)

**Evidence** — `get_message_media_endpoint`:
```python
224|    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
...
228|    cached_file = None
229|    if os.path.exists(media_cache_dir):
230|        for f in os.listdir(media_cache_dir):
231|            if f.startswith(f"{message_id}."):
232|                cached_file = os.path.join(media_cache_dir, f)
233|                break
234|
235|    if cached_file and os.path.exists(cached_file):
236|        return create_safe_file_response(cached_file)     # ← DIKEMBALIKAN LANGSUNG
237|
238|    # If not cached, download using Telethon client
239|    account = await account_service.get_account(db, account_id, str(user.id))
240|    if account is None:
241|        raise HTTPException(status_code=404, detail="Account not found")
```
Baris 239-241 — satu-satunya verifikasi kepemilikan — baru dieksekusi **setelah** baris 236. Perhatikan juga baris 224: nama direktori cache hanya berisi `chat_id`, **tanpa `account_id`**, sehingga semua akun dan semua pengguna berbagi satu namespace direktori untuk `chat_id` yang sama.

Pola identik di `stream_message_video_endpoint`:
```python
309|    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
312|    video_path = None
313|    if os.path.exists(media_cache_dir):
314|        for f in os.listdir(media_cache_dir):
315|            if f.startswith(f"{message_id}."):
316|                video_path = os.path.join(media_cache_dir, f)
319|    if not video_path or not os.path.exists(video_path):
320|        account = await account_service.get_account(db, account_id, str(user.id))
```
Di sini `get_account` memang dipanggil, tetapi hanya memeriksa `account_id` milik pemanggil — **tidak ada verifikasi bahwa `chat_id` tersebut milik akun itu**. Bandingkan `api/media.py:532` (`shared-media`) yang juga hanya memanggil `get_account` tanpa cek `chat_id`.

**Exploit/Impact:**
Pengguna A yang sah (punya akun sendiri) dapat meminta `GET /api/v1/accounts/<akun-A>/chats/<chat_id-pengguna-B>/messages/<id>/media`. Jika media itu sudah ter-cache (cache bertahan 48 jam, `utils/media_cleanup.py:11`), respons mengembalikan berkas **tanpa satu pun pemeriksaan kepemilikan**. Persis seperti yang terjadi pada `upload_and_send_voice` (`api/media.py:546`) yang juga hanya memvalidasi `account_id`, bukan `chat_id`. Akibatnya media privat (foto, dokumen, voice note, video) milik akun lain dapat diunduh pengguna mana pun yang terk authentikasi, dan IDOR yang sama berlaku pada endpoint streaming video.

**Fix:**
```diff
-    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(chat_id))
+    media_cache_dir = os.path.join(base_dir, "uploads", "message_media", str(account_id), str(chat_id))
...
-    # Check if we already have it cached.
+    account = await account_service.get_account(db, account_id, str(user.id))
+    if account is None:
+        raise HTTPException(status_code=404, detail="Account not found")
+    # CACHE BARU BOLEH DILAYANI SETELAH KEPEMILIKAN TERVERIFIKASI
     cached_file = None
```
Dan tambahkan validasi kepemilikan chat di semua handler media (`shared-media`, `voice`, `send_media`, `stream`):
```python
chat = await db.execute(select(TelegramChat).where(
    TelegramChat.account_id == account.id, TelegramChat.chat_id == chat_id))
if chat.scalar_one_or_none() is None:
    raise HTTPException(status_code=404, detail="Chat not found in this account")
```

---

### [HIGH] 4. Token sesi diterima lewat query param `?token=`

**File:** `backend/app/dependencies.py:110-116`
**Tipe:** CWE-598 Use of GET Request Method With Sensitive Query Strings

**Evidence:**
```python
110|async def get_current_user_from_token_or_header(
111|    request: Request,
112|    token: str | None = Query(None),
113|    db: AsyncSession = Depends(get_db),
114|) -> User:
115|    """Validate Better Auth session from header or query param, returning authenticated user."""
116|    auth_token = token or request.headers.get("x-better-auth-token")
```
`Query(None)` membuat FastAPI menerima token sebagai bagian dari URL. Fungsi ini dipakai pada endpoint sensitif: `api/media.py:212` (unduh media pesan) dan `api/media.py:298` (streaming video).

**Exploit/Impact:**
Token sesi penuh (yaitu session Better Auth berumur panjang) terekam permanen di: access log reverse proxy/nginx dan aplikasi, `Referer` header ketika halaman memuat aset eksternal, riwayat & bookmark browser, serta log analitik. Satu entri log berarti satu token = pemblokiran penuh akun pengguna sampai `expiresAt`. Tidak ada TTL pendek maupun scoping seperti yang sudah ada di `utils/signed_url.py` — mekanisme token foto bertanda tangan justru dibuat untuk menghindari masalah ini tetapi tidak dipakai di sini.

**Fix:**
```diff
 async def get_current_user_from_token_or_header(
     request: Request,
-    token: str | None = Query(None),
     db: AsyncSession = Depends(get_db),
 ) -> User:
     """Validate Better Auth session from header or secure cookie only."""
-    auth_token = token or request.headers.get("x-better-auth-token")
+    auth_token = request.headers.get("x-better-auth-token")
```
Untuk kebutuhan non-browser (mis. `<video src=...>`) gunakan token foto ber-HMAC yang sudah tersedia di `utils/signed_url.py:25` (`generate_photo_token`, TTL 300 detik, ter-scope ke `(account_id, user_id)`) alih-alih session token penuh.

---

### [HIGH] 5. `decrypt()` mengembalikan string kosong tanpa error pada kegagalan

**File:** `backend/app/utils/encryption.py:44-52`
**Tipe:** CWE-390 Detection of Error Condition Without Action / Silent Data Loss

**Evidence:**
```python
44|def decrypt(ciphertext: str) -> str:
45|    """Decrypt a base64-encoded ciphertext back to the original string."""
46|    if not ciphertext:
47|        return ""
48|    try:
49|        return _get_cipher().decrypt(ciphertext.encode()).decode()
50|    except Exception as exc:
51|        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc)
52|        return ""
```
Tidak ada nilai sentinel khusus. Pemanggil memperlakukannya sebagai session string yang valid:
```python
api/media.py:124    session_str = decrypt(account.session_string)
api/media.py:125    client = await client_pool.get(str(account.id), session_str)
api/media.py:243-244 (identik)
api/media.py:324-325 (identik)
api/chats.py:281    session_str = account.session_string  # decrypted
api/chats.py:287    client = await client_pool.get(str(account.id), decrypt(session_str))
```
`client_pool.get()` menerima `session_string: str` tanpa validasi (`services/telegram_client.py:201-211`).

**Exploit/Impact:**
Berbeda dengan `_get_cipher()` yang diligently `raise RuntimeError` saat key salah (baris 30-32), `decrypt()` menelan error. Konsekuensi:
- **Kegagalan diam-diam:** key yang dirotasi / ciphertext rusak → user melihat "Account is disconnected" (HTTP 400) alih-alih error konfigurasi yang dapat diagnosing.
- **Perilaku tak terduga:** string kosong diteruskan ke Telethon `StringSession`, yang mungkin membuat session dummy dan memicu error tak terduga, atau lebih buruk, terhubung ke session yang salah.
- **Dampak keamanan tidak langsung:** konsistensi session yang gagal tidak pernah memberi alarm, membuat sulit terdeteksi pembalikan/kompromi data.
- `api/media.py:288` dan `:424` juga mengembalikan `detail=str(exc)` ke klien — membocorkan detail internal exception Telethon/DB ke pengguna.

**Fix:**
```diff
+class DecryptionError(RuntimeError):
+    """Raised when a ciphertext cannot be decrypted with the active key."""
+
 def decrypt(ciphertext: str) -> str:
     """Decrypt a base64-encoded ciphertext back to the original string."""
     if not ciphertext:
-        return ""
+        raise DecryptionError("empty ciphertext")
     try:
         return _get_cipher().decrypt(ciphertext.encode()).decode()
     except Exception as exc:
-        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc)
-        return ""
+        logger.error("Decryption failed (possibly invalid ENCRYPTION_KEY): %s", exc, exc_info=True)
+        raise DecryptionError("ciphertext could not be decrypted") from exc
```
Lalu di setiap pemanggil:
```python
try:
    session_str = decrypt(account.session_string)
except DecryptionError as exc:
    logger.error("session decrypt failed for account %s", account.id)
    raise HTTPException(status_code=500, detail="Stored session is unreadable") from exc
client = await client_pool.get(str(account.id), session_str)
```

---

### [HIGH] 6. Saldo tidak pernah dikembalikan untuk order `Failed` / `Partial`

**File:** `backend/app/services/order_service.py:371-399` (dan `api/orders.py:282-298`)
**Tipe:** CWE-682 Incorrect Calculation / kehilangan nilai uang

**Evidence:**
```python
371|async def refresh_order_status(db: AsyncSession, order: Order) -> Order:
372|    """Check the SMM panel for the latest order status and update the DB record."""
...
376|    result = await check_order_status(order.smm_order_id)
377|    if result.get("status"):
378|        data = result.get("data", {})
379|        new_status = data.get("status", order.status)
...
381|        order.status = new_status
382|        order.start_count = _parse_int_or_none(data.get("start_count"), order.start_count)
383|        order.remains = _parse_int_or_none(data.get("remains"), order.remains)
384|        if new_status != previous_status:
385|            create_notification(db, order.user_id, "order.status_changed", ...)
...
398|    await db.flush()
399|    return order
```
Tidak ada cabang refund di mana pun. Bandingkan dengan jalur placement yang **sudah** membayar refund penuh:
```python
order_service.py:150-158   # refund saat exception jaringan
order_service.py:160-169   # refund saat result.get("status") falsy
order_service.py:318-327   # refund parsial untuk mass order
```
`services/order_service.py:36-44` sudah punya `_notification_kind_for_status()` yang mengenali `failed`, `error`, `partial`, `canceled` — jadi status terminal ini memang dijumpai, tapi tidak ada logika uang yang mengiringinya. `api/orders.py:282-298` (`/{order_id}/refresh`) dan `:300-307` (`/orders/refresh-all`) adalah pintu masuk yang mudah dipicu pengguna.

**Exploit/Impact:**
Pengguna memesan layanan SMM, saldo dipotong penuh di `place_order` (`:144`), lalu panel mengembalikan `Failed` atau `Partial`. Tidak ada kode yang mengembalikan kredit. Untuk kasus `Partial` bahkan lebih jelas: panel SMM hanya delivering sebagian dari `remains`, sehingga pengguna membayar 100%, menerima sebagian saja, dan sistem tetap menganggap order selesai. Akibatnya pengguna berhenti memesan, dan operator menanggung kerugian tanpa alarm apa pun.

**Fix:**
```diff
 async def refresh_order_status(db: AsyncSession, order: Order) -> Order:
     ...
         order.status = new_status
         order.start_count = _parse_int_or_none(data.get("start_count"), order.start_count)
         order.remains = _parse_int_or_none(data.get("remains"), order.remains)
+
+        # Kembalikan kredit untuk order terminal yang tidak terpenuhi.
+        # Refund hanya dilakukan sekali thanks to order.refunded_at.
+        if new_status.lower() in {"failed", "error", "canceled", "cancelled"}:
+            await _refund_order(db, order, order.total_price, f"status={new_status}")
+        elif new_status.lower() == "partial":
+            ordered = order.quantity or 0
+            delivered = order.remains or 0
+            undelivered = max(0, ordered - delivered)
+            if ordered > 0 and undelivered > 0:
+                refund = (order.total_price * undelivered) // ordered
+                await _refund_order(db, order, refund, f"partial: {undelivered}/{ordered} tidak terkirim")
+
         if new_status != previous_status:
             ...
```
dengan helper idempoten:
```python
async def _refund_order(db: AsyncSession, order: Order, amount: int, reason: str) -> None:
    if amount <= 0 or order.refunded_at is not None:
        return
    res = await db.execute(select(User).where(User.id == order.user_id).with_for_update())
    u = res.scalar_one_or_none()
    if u is None:
        logger.error("refund skipped, user %s missing for order %s", order.user_id, order.id)
        return
    u.balance += amount
    order.refunded_at = datetime.now(timezone.utc)
    order.refund_amount = (order.refund_amount or 0) + amount
    await db.flush()
```

---

### [HIGH] 7. Saldo di-`commit` sebelum panggilan API eksternal — jendela kehilangan uang saat crash

**File:** `backend/app/services/order_service.py:143-158` (single), `:262-264` (mass)
**Tipe:** CWE-662 Improper Synchronization / desain saga tanpa kompensasi tahan crash

**Evidence:**
```python
143|    # Deduct balance and commit immediately to release the row write lock before network I/O
144|    locked_user.balance -= total_price
145|    await db.commit()
146|
147|    # 2. Call SMM API outside of the database row lock
148|    try:
149|        result = await create_order(service_id, data_target, quantity, comments, usernames)
150|    except Exception as exc:
151|        # Refund on network / unexpected exception
152|        refund_res = await db.execute(select(User).where(User.id == user.id).with_for_update())
...
156|        refund_user.balance += total_price
157|        await db.commit()
```
Baris 145 melakukan `commit` (transaksi #1 selesai permanen), lalu baris 149 melakukan panggilan jaringan. Kompensasi di baris 152-157 hanya berjalan bila exception **tertangkap Python**. Pada `place_mass_orders` (`:263-264`) risikonya lebih besar lagi: commit pengurangan `total_cost` terjadi sebelum loop yang dapat menghasilkan banyak order `Failed`, dan penghitungan refund baru dilakukan setelah semuanya selesai (`:318-327`).

**Exploit/Impact:**
Jika worker mati (OOM-killer, `docker restart`, crash segfault, deploy, atau `CancelledError` saat shutdown) di antara baris 145 dan 149, atau di tengah loop mass order, saldo sudah terpotong permanen tanpa ada order tercatat dan tanpa refund. Karena `total_cost` mass order dapat sangat besar, satu crash berarti kehilangan kredit pengguna dalam jumlah besar sekaligus. Selain itu tidak ada tabel ledger/idempotency key untuk kompensasi — tidak ada cara untuk mengetahui order mana yang perlu direfund secara manual.

**Fix:**ubah pemotongan saldo menjadi *reservasi* yang tercatat, dan lakukan refund berbasis ledger yang idempoten + direkonsiliasi berkala:
```python
# 1. Reserve (bukan potong irreversible) + catat di ledger dalam 1 transaksi
ledger = BalanceLedger(
    user_id=user.id, amount=-total_price, kind="order_reserve",
    ref=f"order:{uuid4()}", status="reserved",
)
db.add(ledger)
locked_user.balance -= total_price
await db.commit()          # reserve terlihat, tapi refund tracked
try:
    result = await create_order(...)
except Exception as exc:
    await release_reserve(db, ledger, reason=f"smm_error:{exc}")
    raise ValueError(f"Order failed due to network error: {exc}")
```
Lalu tambahkan task rekonsiliasi harian yang membandingkan `BalanceLedger` dengan `Order` untuk menemukan reservasi yatim > 1 jam dan mengembalikannya.

---

### [MEDIUM] 8. Penyesuaian saldo admin dijepit ke `0` diam-diam, tanpa ledger

**File:** `backend/app/api/admin.py:484-515`
**Tipe:** CWE-778 Insufficient Logging / CWE-682 Incorrect Calculation

**Evidence:**
```python
503|    user.balance += payload.amount
504|    if user.balance < 0:
505|        user.balance = 0  # Don't allow negative balance
...
512|        balance=user.balance,
513|        message=f"{abs(payload.amount)} credits {action} {user.email}. New balance: {user.balance}",
```
`BalanceHistoryResponse` (`api/admin.py:210-215`) meski namanya/history hanya sebuah response model — tidak ada tabel `BalanceHistory`, tidak ada `db.add(...)` untuk audit. Perhatikan juga `action` dihitung dari `payload.amount` (`"added to"`/`"deducted from"`), bukan dari nilai yang benar-benar diterapkan — bila `amount=-500` dan saldo lama `200`, saldo menjadi `0`, tetapi pesan tetap menyatakan pengurangan 500 kredit memakai `user.balance` yang sudah dijepit, sehingga nilai pada pesan tidak pernah konsisten dengan nilai yang benar-benar tersimpan.

**Exploit/Impact:**
(1) Owner yang salah memasukkan nominal (mis. `amount=-999999`) tidak mendapat error, hanya diam-diam menjadi `0` — saldo yang seharusnya habis tersisa dan pengguna tidak pernah diberi tahu. (2) Karena tidak ada ledger, tidak ada cara membuktikan atau merekonstruksi perubahan saldo; penyalahgunaan internal atau bug tidak dapat dideteksi. (3) `db.flush()` tanpa `commit` (`:510`) mengandalkan commit otomatis `get_db` — jika respons gagal serialisasi, perubahan tetap commit.

**Fix:**
```python
    new_balance = user.balance + payload.amount
    if new_balance < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance: current={user.balance}, requested={payload.amount}",
        )
    user.balance = new_balance
    db.add(BalanceLedger(
        user_id=user.id,
        amount=payload.amount,          # nilai yang BENAR-BENAR diterapkan
        kind="admin_adjust",
        ref=f"admin:{current_user.id}",
        reason=payload.reason or None,
        created_from_ip=ip,
    ))
    await db.flush()
```

---

### [MEDIUM] 9. Margin platform hilang ketika `buy_price` NULL

**File:** `backend/app/services/marketplace_service.py:469-474` (perhitungan), `:200-204` (penetapan saat listing)
**Tipe:** CWE-682 Incorrect Calculation / business logic

**Evidence:**
```python
469|    # The buyer pays the listing's buy_price; the seller receives its sell_price.
470|    # The difference is the platform margin. buy_price is floored at sell_price
471|    # so a misconfigured rule can never pay the seller more than the buyer owes.
472|    sell_price = account.sell_price or 7000
473|    buy_price = max(getattr(account, "buy_price", None) or sell_price, sell_price)
474|
...
489|    if buyer.balance < buy_price:
...
493|    buyer.balance -= buy_price
497|        seller.balance += sell_price
```
`buy_price` adalah kolom nullable — lihat `models/telegram_account.py:58` (`nullable=True, default=None`) dan migrasi `database_migrator.py:245-247` yang menambah kolom dengan `DEFAULT NULL`. `services/user_account_price_service.py:244-249` juga menyatakan `buy_price` sengaja **tidak dipersistensikan** pada baris tertentu ("attached as a transient attribute ... not persisted").

**Exploit/Impact:**
Setiap listing yang berasal dari listing lama (sebelum kolom ada), listing yang dibatalkan lalu di-listed ulang melalui jalur yang tidak menetapkan `buy_price` (bandingkan `marketplace_service.py:200-204` yang menyetelnya, vs `:313-317` `_cancel_listing` yang meng-`None`-kan keduanya), atau account yang di-fallback di mana `resolve_buy_price_for_telegram_id` tidak mengembalikan nilai → `buy_price` jatuh ke `sell_price`. Pembeli membayar 7000, penjual menerima 7000, margin platform **nol** dan tidak tercatat sebagai anomali. Kerugian pendapatan langsung per transaksi; pada skala penuh berarti platform tidak menghasilkan pendapatan sama sekali dari jalur itu.

**Fix:**
```python
    sell_price = account.sell_price or 7000
    configured_buy = account.buy_price
    if configured_buy is None or configured_buy < sell_price:
        logger.warning(
            "listing %s has no/invalid buy_price (buy=%r sell=%s) — re-resolving from rules",
            account.id, configured_buy, sell_price,
        )
        configured_buy = await resolve_buy_price_for_telegram_id(db, account)
    buy_price = max(configured_buy, sell_price)
    if buy_price <= sell_price:
        raise ValueError("Marketplace margin is misconfigured for this account.")
```

---

### [MEDIUM] 10. Kredensial database default hanya dijaga di balik env flag

**File:** `backend/app/config.py:16-17`, `:132-138`
**Tipe:** CWE-798 Use of Hard-coded Credentials / CWE-1188 Insecure Default Initialization

**Evidence:**
```python
16|    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos"
17|    DATABASE_URL_SYNC: str = "postgresql://postgres:***@localhost:5432/telebos"
...
132|    if s.DATABASE_URL == "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos":
133|        import os
134|        if os.environ.get("TELEBOS_ENV") == "production":
135|            raise RuntimeError(
136|                "DATABASE_URL is still set to the default dev value. "
137|                "Set the DATABASE_URL env var for production."
138|            )
```
Bandingkan `APP_SECRET_KEY` (`config.py:122-126`) dan `ENCRYPTION_KEY` (`config.py:127-131`) yang **selalu** menolak nilai default tanpa syarat. `DATABASE_URL` hanya menolak bila `TELEBOS_ENV=production` — variabel yang tidak dideklarasikan di `Settings`, tidak divalidasi, dan tidak muncul di guard lain.

**Exploit/Impact:** pada deployment yang lupa menyetel `TELEBOS_ENV` (atau menyetelnya dengan kapitalisasi/typő), aplikasi tetap start dengan `postgres:postgres` — kredensial Postgres yangzoontoh. Selain itu `DATABASE_URL_SYNC` (`config.py:17`) tidak punya guard sama sekali.

**Fix:**
```python
    if s.DATABASE_URL == "postgresql+asyncpg://postgres:postgres@localhost:5432/telebos" and s.PRODUCTION:
        raise RuntimeError("DATABASE_URL is still the insecure default. Refusing to start.")
    if "postgres:postgres@" in s.DATABASE_URL_SYNC and s.PRODUCTION:
        raise RuntimeError("DATABASE_URL_SYNC still contains default credentials.")
```
dan set `PRODUCTION=True` di `.env` produksi agar `config.py:13` aktif dipakai sebagai satu-satunya sumber kebenaran (hapus cek `TELEBOS_ENV` yang tersebar).

---

### [MEDIUM] 11. Pembagian harga integer per-order membuat order kecil gratis

**File:** `backend/app/services/order_service.py:428-436`, dipakai di `:130` dan `:241`
**Tipe:** CWE-682 Incorrect Calculation (money)

**Evidence:**
```python
428|def _calculate_price(price_per_unit: int, quantity: int) -> int:
429|    """Calculate total price from per-unit price and quantity.
430|
431|    The SMM panel prices are typically per 1000 units.
432|    """
433|    # If price is for 1k units
434|    if price_per_unit > 0:
435|        return max(1, (price_per_unit * quantity) // 1000)
436|    return 0
```
Pembulatan terjadi **per order**, bukan per batch dan bukan pada total. `quantity` dibatasi minimum `ge=1` di `schemas/order.py:26` dan `:34`.

**Exploit/Impact:** untuk layanan berharga murah — mis. `price_per_unit = 500` (setengah dari harga per 1000, lihat `models/user_account_price.py:7` yang menyebut `sell_price=1500` untuk prefix tertentu) — `quantity=1` menghasilkan `500*1//1000 = 0`, dipaksa `max(1, …)` = **1 credit**. Order 1 followers dihargai 1 credit, bukan 0,5. Untuk `quantity` besar, `//1000` memangkas hingga 999/1000 dari harga yang seharusnya — kebocoran pendapatan yang selalu menguntungkan pengguna dan tidak pernah tercatat. Menambah `quantity` juga menambah `total_price` secara linear sehingga tidak ada exploit untuk mendapat diskonproporsional, tetapi pendapatan per-1000-unit tetap berkurang karena pembulatan terjadi per order.

**Fix:** bulatkan ke atas hanya sekali pada total, dan tolak order yang nilainya nol:
```python
def _calculate_price(price_per_unit: int, quantity: int) -> int:
    """Charge the SMM per-1000 rate, rounding UP once so rounding never favours the buyer."""
    if price_per_unit <= 0:
        raise ValueError("Service has no valid price")
    total = (price_per_unit * quantity + 999) // 1000   # ceil, bukan floor
    return max(1, total)
```
Tambahkan assertion masuk: `if total_price <= 0: raise ValueError("Order total resolves to zero credits")` di `place_order` sebelum baris `:138`.

---

### [MEDIUM] 12. Lookup sesi jatuh ke perbandingan token plaintext

**File:** `backend/app/dependencies.py:49-59` dan `:127-137`
**Tipe:** CWE-208 Observable Timing Discrepancy / CWE-256 Plaintext Storage of a Password

**Evidence:**
```python
54|            WHERE s.token_hash = :hashed_token
55|               OR (s.token_hash IS NULL AND s.token = :token)
56|            LIMIT 1
...
58|        {"hashed_token": hashed_token, "token": token},
```
Branch kedua membandingkan kolom `token` **plaintext** milik Better Auth. Karena klausa `OR`, perbandingan string terhadap `session.token` tetap dieksekusi pada setiap permintaan.

**Exploit/Impact:** (1) `session.token` yang tidak ter-hash masih menyimpan secret aktif di DB — tepat risiko yang-documented di `utils/session_token.py:1-16`, jadi fallback ini menetralkan sebagian proteksi yang ada. (2) Perbandingan `=` pada kolom teks di PostgreSQL bersifat time-of-compare dan dapat dielabolasi lewat timing untuk menebak token byte-per-byte pada sesi lama. (3) `OR` tambahan juga merusak planned index pada `token_hash`, memperlambat setiap lookup autentikasi.

**Fix:** hapus fallback setelah memastikan seluruh sesi lama sudah ter-backfill, lalu jalankan backfill sekali jalan:
```sql
UPDATE session SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;
```
```diff
-            WHERE s.token_hash = :hashed_token
-               OR (s.token_hash IS NULL AND s.token = :token)
+            WHERE s.token_hash = :hashed_token
             LIMIT 1
-        {"hashed_token": hashed_token, "token": token},
+        {"hashed_token": hashed_token},
```
Bila kompatibilitas ke belakang benar-benar wajib, jadikan gated oleh config flag yang akan dihapus, bukan jalur default.

---

### [MEDIUM] 13. Jalur `token_or_header` melewati auto-downgrade langganan kedaluwarsa

**File:** `backend/app/dependencies.py:103-105` (ada di `get_current_user`) vs `:110-174` (tidak ada di `get_current_user_from_token_or_header`)
**Tipe:** CWE-613 Insufficient Session Expiration / business logic

**Evidence:**
```python
103|    # Auto-downgrade expired subscriptions
104|    from app.services.redeem_service import auto_downgrade_if_expired
105|    user = await auto_downgrade_if_expired(db, user)
106|
107|    return user
```
Fungsi kembaragency berakhir di:
```python
169|    if user is None or not user.is_active:
170|        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
174|    return user          # ← tidak ada auto_downgrade_if_expired
```
Endpoint yang memakai `get_current_user_from_token_or_header`: `api/media.py:212` dan `api/media.py:298` — keduanya adalah endpoint berat yang menghasilkan unduhan media berbiaya tinggi.

**Exploit/Impact:** pengguna dengan `role` = `premium`/`pro` yang `subscription_expires_at`-nya sudah lewat tetap terbaca sebagai premium pada semua pemeriksaan entitlement/limit berbasis role yang berada di jalur `token_or_header`, sampai kebetulan membuat permintaan melalui `get_current_user`. Akibatnya kuota premium (batas unduhan, batas ukuran, limit concurrent) tidak pernah ditegakkan untuk akun yang sudah berhenti|langganan — pendapatan yang hilang dan tidak konsisten dengan `api/redeem.py:43-66` yang countdown_hari aktif.

**Fix:** faktorkan validasi bersama agar tidak bisa berbeda antara dua fungsi:
```python
async def _resolve_session_user(db: AsyncSession, token: str) -> User:
    ...  # query + expiry + UUID map seperti sekarang

async def get_current_user(request: Request, db=Depends(get_db)) -> User:
    token = _extract_token(request)
    user = await _resolve_session_user(db, token)
    return await auto_downgrade_if_expired(db, user)   # selalu jalan

async def get_current_user_from_token_or_header(request: Request, db=Depends(get_db)) -> User:
    user = await _resolve_session_user(db, _extract_token(request))
    return await auto_downgrade_if_expired(db, user)   # ← tambahkan
```

---

### [MEDIUM] 14. Upload voice tanpa batas ukuran — memory DoS

**File:** `backend/app/api/media.py:546-562`
**Tipe:** CWE-400 Uncontrolled Resource Consumption

**Evidence:**
```python
546| async def upload_and_send_voice(
...
556|    try:
557|        content = await file.read()          # ← seluruh file ke RAM, tanpa batas
558|        suffix = os.path.splitext(file.filename or "")[1] or ".ogg"
559|        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
560|            tmp.write(content)
```
Bandingkan `send_media` di berkas yang sama yang sudah benar: `api/media.py:495-497`
```python
495|    # 1. Enforce file size limit (20MB) safely using chunked streaming reading
496|    MAX_FILE_SIZE = 20 * 1024 * 1024
497|    file_bytes = await read_file_chunked(file, max_size=MAX_FILE_SIZE, detail="File too large (max 20MB)")
```
Endpoint voice tidak punya rate limiter juga — `grep` menunjukkan `api/media.py:486` hanya berlaku pada `send_media`.

**Exploit/Impact:** unggah voice beberapa kali secara paralel dengan body besar membuat worker FastAPI kehabisan memori (read()aterialize seluruh payload di heap sebelum ditulis ke disk), memicu OOM-killer pada container dan renovarfallen seluruh service. Tidak ada batas ukuran, tidak ada rate limit, tidak ada validasi `content_type`.

**Fix:**
```python
    ip = request.client.host
    if not await rate_limiter.check(f"voice_send:ip:{ip}"):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    account = await account_service.get_account(db, account_id, str(user.id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if (file.content_type or "") not in ("audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="File must be audio")
    from app.utils.file_upload import read_file_chunked
    content = await read_file_chunked(file, max_size=20 * 1024 * 1024, detail="File too large (max 20MB)")
    suffix = os.path.splitext(os.path.basename(file.filename or ""))[1] or ".ogg"
    if not re.fullmatch(r"\.[A-Za-z0-9]{1,8}", suffix):
        suffix = ".ogg"
```

---

### [LOW] 15. Rate limiter *fail-open* secara default

**File:** `backend/app/config.py:60`, `backend/app/utils/rate_limiter.py:133`
**Tipe:** CWE-400 Uncontrolled Resource Consumption

**Evidence:**
```python
60|    RATE_LIMIT_FAILS_OPEN: bool = True
...
133|        fails_open=s.RATE_LIMIT_FAILS_OPEN,
```
**Exploit/Impact:** ketika Redis tidak tersedia (restart, eviction, jaringan putus), setiap `rate_limiter.check()` mengembalikan True dan **seluruh** limit dimatikan sekaligus — termasuk limit sensitif `redeem` (`api/redeem.py:32-35`), `2fa` (`api/settings.py:111-236`), `admin` (`api/admin.py:493,526,550`), dan `upload_session` (`api/accounts.py:510`). Redundansi `api/accounts.py:363` (check IP **atau** user dengan `or`) memperburuk: cukup gagalkan satu sisi checks untuk melewati limit.

**Fix:**
```python
    RATE_LIMIT_FAILS_OPEN: bool = False   # default fail-CLOSED
```
Dan perbaiki operator precedence di `api/accounts.py:363`:
```diff
-    if not await rate_limiter.check(f"{namespace}:ip:{ip}") or not await rate_limiter.check(f"{namespace}:user:{user_id}"):
+    if not (await rate_limiter.check(f"{namespace}:ip:{ip}") and await rate_limiter.check(f"{namespace}:user:{user_id}")):
```
Alternatif yang lebih baik: cache lokal in-memory sebagai fallback fail-closed agar limit tidak hilang total saat Redis mati.

---

### [LOW] 16. N+1 query pada statistik admin dan sinkronisasi profil

**File:** `backend/app/api/admin.py:301-307`, `backend/app/services/profile_sync_service.py:207` (dan `utils/account_service.py:1278`)
**Tipe:** CWE-1059 Insufficient Technical / CWE-1049 Loop with Multiple Database Queries

**Evidence:**
```python
302|    role_counts = {"basic": 0, "pro": 0, "premium": 0, "owner": 0}
303|    for role in role_counts:
304|        r = await db.execute(
305|            select(func.count(User.id)).where(User.role == role)
306|        )
307|        role_counts[role] = r.scalar() or 0
```
Empat round-trip berurutan ke Postgres hanya untuk menghitung empat nilai. `refresh_all_pending_orders` (`services/order_service.py:416-418`) melakukan satu panggilan jaringan SMM **per order** dalam loop tanpa batas ukuran — `api/orders.py:300-307` membukanya untuk semua order non-terminal milik pengguna tanpa pagination.

**Exploit/Impact:** pada tabel `users` besar, `/admin/stats` memerlukan 4× latency DB; `refresh-all` dengan hundreds order pending memicu hundreds HTTP call ke SMM dalam satu request, memungkinkan timeout/gateway error dan membuat panel SMM rate-limit atau memblokir IP backend. Ini bukan celah keamanan langsung, tetapi vektor amplifikasi DoS dan sumber permintaan lambat yang mahal.

**Fix:**
```python
    rows = (await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )).all()
    role_counts = {"basic": 0, "pro": 0, "premium": 0, "owner": 0}
    for role, cnt in rows:
        role_counts[role] = role_counts.get(role, 0) + (cnt or 0)
```
Untuk `refresh_all_pending_orders`, beri batas keras dan jalankan sebagai background task:
```python
query = query.limit(50)   # batasi satu siklus
```
```diff
 # api/orders.py
-    count = await order_service.refresh_all_pending_orders(db, str(user.id))
-    await db.commit()
+    count = await order_service.refresh_all_pending_orders(db, str(user.id), limit=50)
+    await db.commit()
+    if count >= 50:
+        logger.info("refresh-all truncated at 50 pending orders for user %s", user.id)
```

---

## Catatan Positive (tidak perlu acted upon)

Beberapa area yang sering disalah duga ternyata sudah benar dan tidak dilaporkan sebagai temuan:
- **`account_service.get_account`** (`services/account_service.py:767-782`) memfilter `TelegramAccount.user_id == user_id` — scoped dengan benar; dipakai secara konsisten di sebagian besar handler.
- **`marketplace_service.buy_account`** memakai `FOR UPDATE` dengan **deterministic lock ordering** berdasarkan UUID terurut (`:479-485`) untuk mencegah deadlock, dan mengunci baris akun sebelum mengecek `for_sale`/`is_sold`.
- **`redeem_service.redeem_code`** memakai `SELECT ... FOR UPDATE` pada kode maupun baris user, plus pengecekan `RedeemLog` per pengguna (`services/redeem_service.py:86-113`) — redeem ganda & race terproteksi.
- **Semua router admin** (`api/admin.py`, `api/admin_smm.py`, `api/admin_account_prices.py`) menerapkan `require_role(["owner"])` pada setiap endpoint; tidak ditemukan endpoint admin yang bisa diakses tanpa role.
- **Ownership mapping via user ID (UUID), bukan email** (`dependencies.py:79-91`) — mencegah serangan duplicate-email.
- **`create_safe_file_response`** (`api/media.py:177-203`) sudah memitigasi stored XSS pada file upload dengan `Content-Disposition`, `X-Content-Type-Options: nosniff`, dan downgrade `text/html`/`image/svg+xml` ke `application/octet-stream`.
- **`file_upload.read_file_chunked`** mencegah buffer in-memory tak terbatas (namun belum dipakai di endpoint voice — temuan #14).
- Tidak ditemukan SQL injection dari input pengguna; semua query berparameter. Tidak ditemukan command injection. Tidak ada `except:` telanjang di codebase.
- `database_migrator.py` memakai f-string SQL hanya untuk identifier internal hardcoded — bukan bug.

## Prioritas Perbaikan (urutan kerja)

1. **Segera (hari ini):** #1, #2, #3 — endpoint anonim yang membocorkan foto chat + LFI + IDOR media. Tambal dengan penambahan dependency auth + filter `user_id` + sanitasi `photo_version` + namespace cache per-`account_id`.
2. **Minggu ini:** #4, #5, #6 — hapus `?token=`, jadikan `decrypt()` gagal keras, dan implementasikan refund untuk order `Failed`/`Partial` (butuh kolom `refunded_at` + `refund_amount`).
3. **Minggu ini:** #7 — ledger reservasi saldo + rekonsiliasi background crash-orphan.
4. **Berikutnya:** #9, #11, #13 — perbaiki margin marketplace, pembulatan harga, dan samakan auto-downgrade di kedua jalur auth.
5. **Jadwal:** #8, #10, #12, #14, #15, #16 — ledger audit admin, guard kredensial default, hapus fallback token plaintext, limit ukuran voice, fail-closed rate limiter, dan optimalkan query.

**Catatan kompatibilitas:** perbaikan #2 mengubah sumber `photo_version` menjadi numerik ketat. Semua nilai non-numerik yang sudah tersimpan di DB (`api/media.py:99` bisa menyimpan `"None"` sebagai string historis bila pernah terjadi) harus di-backfill ke `NULL` sebelum deploy, atau endpoint tersebut akan mengembalikan 404 sampai foto di-refresh.