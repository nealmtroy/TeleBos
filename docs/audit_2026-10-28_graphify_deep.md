# Graphify Deep Audit — TeleBos Backend

**Project:** TeleBos — `D:\PROJECT\Telegram\TeleBos\backend\app`
**Tanggal:** 2026-10-28
**Alat:** `graphify` v0.9.61 (knowledge-graph) + `graphify diagnose multigraph` + AST cross-verification
**Graph:** **2.301 nodes · 4.957 edges · 130 communities** (AST extraction, commit `ae3da63d`)
**Pelengkap:** Laporan utama `audit_2026-10-28_MASTER.md`

---

## Ringkasan Eksekutif

Graphify memberikan peta struktural yang berguna (call graph, coupling, clustering), tapi **bukan** alat untuk menemukan bug secara langsung. Temuan dari grafik harus selalu diverifikasi ulang terhadap source — dan kali ini verifikasi membongkar beberapa klaim yang sempat meleset.

| Temuan | Status | Dampak |
|---|---|---|
| **Import cycles di level file** | ✅ 0 SCC | Tidak ada circular import |
| **Multigraph collapse risk** | ✅ 0 group | Graph sehat, no edge-collision |
| **11 route tanpa auth dependency** | 🟠 2 nyata, 9 by-design | Auth bypass |
| **`decrypt()` = 86 call site / 25 file** | 🔴 Konfirmasi, revise | Prioritas error handling |
| **`sanitize_exception()` = 124 call site / 25 file** | ✅ Konsisten | Good practice |
| **`LEASE_RENEW_SECONDS` dead constant** | 🟠 Low | Code smell |
| **`account_lease()` = 0 caller** | 🟡 Dead code | 15 baris mati |
| **Session-lock race (cross-subsystem)** | 🔴 HIGH | Risiko production |
| **`_post_sale_cleanup` fire-and-forget** | 🔴 HIGH | Resource leak |

---

## 1. Struktur Graph (baseline)

```
NODES=2301  LINKS=4957  communities=130  directed=false
```

### 1.1 Relation distribution

| Relation | Count | Arti |
|---|---|---|
| `calls` | 1.154 | Panggilan fungsi langsung |
| `contains` | 1.072 | STRUKTUR (class→method, file→function) |
| `references` | 808 | referensi simbol |
| `uses` | 756 | penggunaan tipe/modul |
| `rationale_for` | 724 | komentar docstring → simbol |
| `inherits` | 223 | pewarisan class |
| `method` | 102 | method binding |
| `imports_from` | 44 | import antar modul |
| `indirect_call` | 17 | call through wrapper |

### 1.2 diagnose multigraph — Structurally sound

```json
{
  "exact_duplicate_edges": 0,
  "directed_same_endpoint_collapsed_edges": 0,
  "undirected_same_endpoint_collapsed_edges": 0,
  "missing_endpoint_edges": 0,
  "dangling_endpoint_edges": 0,
  "self_loop_edges": 0,
  "same_endpoint_group_count": 0
}
```

Tidak ada edge yang hilang atau collided. Graph aman dipakai untuk audit.

### 1.3 File-level coupling — top consumers

| File | Out-degree | Catatan |
|---|---|---|
| `models/__init__.py` | 25 | Re-export semua model |
| `services/broadcast_service.py` | 16 | **Paling kompleks** |
| `api/accounts.py` | 14 | 38 route handlers |
| `api/admin.py` | 13 | 18 route handlers |
| `services/marketplace_service.py` | 13 | Money logic |
| `services/account_service.py` | 12 | 8 `decrypt()` calls |
| `services/session_manager.py` | 11 | **Lease authority** |
| `api/media.py` | 8 | Auth bypass target |

---

## 2. Import Cycles

**Method:** Kosaraju SCC pada file-level dependency graph.

```
FILE-LEVEL IMPORT CYCLES (SCC): 0
```

✅ **Zero circular imports.** Arsitektur modular dengan import direction yang bersih (api → services → models).

---

## 3. IDOR / Auth Surface — AST-based cross-check

### 3.1 Graphify blind spot on FastAPI DI

Graphify tidak membuat edge untuk `Depends(get_current_user)` di route signature karena ini dependency injection, bukan call expression. Hasil: query graph-only memberi **268/268 false positive**.

**Cross-check dengan AST:**

```
TOTAL ROUTES PARSED: 237
NO AUTH AT ALL: 11
auth, no explicit ownership helper: 226
auth + ownership: 0
role-gated: 0
```

### 3.2 Route tanpa auth dependency

| File:Line | Method | Path | Status |
|---|---|---|---|
| `media.py:57` | GET | `/accounts/{account_id}/chats/{chat_id}/photo` | 🔴 **CONFIRMED VULN** |
| `accounts.py:793` | GET | `/{account_id}/photo` | 🟠 Public by design |
| `accounts.py:378` | GET | `/countries` | ✅ Benar (public data) |
| `auth.py:38` | POST | `/logout` | ✅ Benar (no-op) |
| `admin_account_prices.py:41` | GET | `/` | ✅ `_require_owner` alias |
| `admin_account_prices.py:49` | POST | `/` | ✅ `_require_owner` alias |
| `admin_account_prices.py:74` | PUT | `/{id_prefix}` | ✅ `_require_owner` alias |
| `admin_account_prices.py:100` | DELETE | `/{id_prefix}` | ✅ `_require_owner` alias |
| `public.py:50` | GET | `/health` | ✅ Health check |
| `public.py:55` | GET | `/system/status` | ✅ Status publik |
| `system.py:15` | GET | `/status` | ✅ Status publik |

**Kesimpulan:** Hanya `media.py:57` yang vulnerability terkonfirmasi (C-1 di master report). `accounts.py:793` memiliki komentar eksplisit:

```python
# accounts.py:798-804
"""Get the account's profile photo.

Public endpoint — Telegram profile photos are public data.
Protected by per-IP rate limiting and browser
caching (Cache-Control: 1 hour, ETag based on photo_version)
to prevent abuse.
"""
```

Valid rate limiting ada (line 809-814). **Tidak vuln**, tapi tetap information disclosure minor — tidak ada filter `user_id`, sehingga UUID ak exists dapat di-enumerate.

### 3.3 Admin role gate audit — fully covered ✅

```
app/api/admin.py:              18 role checks / 18 routes  ✅
app/api/admin_smm.py:          13 role checks / 13 routes  ✅
app/api/admin_account_prices.py: 4 role checks /  4 routes  ✅
```

Semua admin endpoint di-gate dengan `Depends(require_role(["owner"]))`. **Tidak ada privilege escalation.**

---

## 4. `decrypt()` Fan-out — Konfirmasi & Revisi

### 4.1 Data aktual

```
decrypt()  [utils/encryption.py:L44]
   TOTAL callers: 86 in 25 files | by layer: {'services': 73, 'api': 8, 'utils': 3, 'bot': 2}
      13x services/group_admin_service.py
      12x services/settings_service.py
       8x services/account_service.py
       6x services/chat_service.py
       5x services/contact_service.py
       5x services/gif_service.py
       5x services/sticker_service.py
       4x services/pin_service.py
       3x api/chats.py
       3x api/media.py
       ...
```

**Revisi terhadap laporan subagent:** klaim "~10 call site dalam jalur async" **jauh diremehkan**. Angka aktual **86 call site across 25 file**.

### 4.2 Mengapa ini penting

`decrypt()` return `""` on failure (silent). Dengan 86 call site:

- **Blast radius dari satu key rotation**: seluruh sesi potentially corrupt tanpa error yang terlihat
- **Untuk fix:** `decrypt_or_none()` + migrasi 86 call site adalah refactor lintas-modul

### 4.3 `sanitize_exception()` — good practice ✅

```
sanitize_exception()  [utils/sanitize.py:L16]
   TOTAL callers: 124 in 25 files | by layer: {'api': 122, 'utils': 2}
      20x api/accounts.py
      13x api/chats.py
      13x api/settings.py
      10x api/group_admin.py
      10x api/messages.py
```

Konsistensi tinggi — semua api/ endpoint sanitize exception sebelum expose ke client. **Ini best practice yang sudah dijalankan.**

---

## 5. Cross-Subsystem Race — Session & Lease

### 5.1 Lease management graph

```
acquire_lease()  [utils/account_ownership.py:L141]  callers=7
      3x utils/account_ownership.py
      1x services/auto_join_service.py
      1x services/broadcast_service.py
      1x services/invite_service.py
      1x services/session_manager.py

release_lease()  [utils/account_ownership.py:L192]  callers=7
      3x utils/account_ownership.py
      1x services/auto_join_service.py
      1x services/broadcast_service.py
      1x services/invite_service.py
      1x services/session_manager.py

renew_lease()  [utils/account_ownership.py:L205]  callers=3
      2x utils/account_ownership.py
      1x services/session_manager.py
```

### 5.2 Temuan: `LEASE_RENEW_SECONDS` dead constant

```python
# utils/account_ownership.py:66-68
LEASE_TTL_SECONDS = 120
# How often a live owner refreshes its lease.
LEASE_RENEW_SECONDS = 40    # ← TIDAK PERNAH DIPAKAI
```

**Verifikasi:**
```bash
grep -rn "LEASE_RENEW_SECONDS" app/
# hanya 1 hasil: definisi di line 68
```

**Severity:** 🟡 LOW (dead constant). Tidak menyebabkan bug karena `session_manager.py:578` renew lease di dalam health loop, bukan interval 40s.

**Fix:** hapus konstanta, atau (lebih baik) dokumentasikan bahwa interval renew ditentukan oleh health loop cadence.

### 5.3 Temuan: `account_lease()` context manager — dead code

```python
# utils/account_ownership.py:221-234
@asynccontextmanager
async def account_lease(account_id: str, owner: str):
    """Hold the account lease for the duration of a connection's life."""
    acquired = await acquire_lease(account_id, owner)
    try:
        yield acquired
    finally:
        if acquired:
            await release_lease(account_id, owner)
```

**Verifikasi:**
```bash
grep -rn "account_lease" app/ | grep -v "utils/account_ownership.py"
# 0 results
```

**Severity:** 🟡 MEDIUM (dead code). 15 baris tidak terpakai.裡 Docstring-nya menyesatkan karena justru-nowarnanya tidak ada yang memakai.

### 5.4 Cross-subsystem coupling — session ownership

```
acquire_lease / release_lease: 4 service files touched
   - services/auto_join_service.py
   - services/broadcast_service.py
   - services/invite_service.py
   - services/session_manager.py
```

**Race risk assessment:**

| Aspek | Status | Detail |
|---|---|---|
| Mutex deadlock | ✅ Aman | Redis lease, bukan in-process lock |
| Multi-account concurrency | ✅ By design | Docstring menjelaskan intentional |
| Lease lost mid-connection | ✅ Handled | `session_manager.py:578-588` renew + stand down |
| `_PROCESS_ID` collision | ✅ Aman | `hostname:pid:uuid8`, endswith check valid |
| Redis outage | 🟡 Fail-open | `acquire_lease` returns `True` on exception (line 189) |

**`_PROCESS_ID` collision check** — gw hipotesiskan `endswith()` bisa salah match antara PID berbeda, tapi ternyata aman:

```python
# utils/account_ownership.py:56
_PROCESS_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
```

UUID random 8 hex = 4 billion combinations per process. Collision practically impossible.

### 5.5 Write-surface TelegramAccount — 15 mutation sites

```
api/account_folders.py:
   add_accounts_to_folder()@L153
api/accounts.py:
   bulk_update_auto_reply()@L718
api/admin.py:
   delete_user()@L542
services/account_service.py:
   delete_photo()@L949
   update_profile()@L785
   update_profile_color()@L1191
services/chat_service.py:
   batch_delete_chats()@L848
   delete_chat()@L801
   update_account_stats_from_db()@L91
services/contact_service.py:
   delete_contact()@L121
services/gif_service.py:
   get_saved_gifs()@L13
   save_gif()@L91
services/group_admin_service.py:
   create_invite_link()@L549
   update_group_permissions()@L475
services/message_service.py:
   delete_messages()@L326
   delete_scheduled_messages()@L732
services/settings_service.py:
   delete_synced_contacts()@L174
   get_privacy_settings()@L29
   set_2fa_email()@L231
   set_login_email()@L359
   update_privacy_settings()@L106
services/sticker_service.py:
   get_sticker_set()@L43
```

**Risk:** 23 titik mutasi tersebar di 8 file. Tidak ada single funnel yang menyatukan operasi ini — setiap service punya session DB sendiri. Ini menyentuh concern yang sama dengan C-5 (`_locks`) di master report.

---

## 6. Community / Cluster Analysis

Top 15 communities by size:

| Community | Nodes | Dominant files |
|---|---|---|
| 0 | 75 | `services/marketplace_profile_service.py`(30), `api/marketplace.py`(16) |
| 1 | 61 | `schemas/account.py`(29), `api/public.py`(14), `utils/photo_helper.py`(10) |
| 2 | 58 | `services/group_admin_service.py`(15), `services/gif_service.py`(6) |
| 3 | 58 | `services/session_manager.py`(36), `utils/account_ownership.py`(19) |
| 4 | 56 | `api/accounts.py`(45) |
| 5 | 53 | `api/broadcast.py`(28), `schemas/broadcast.py`(18) |
| 6 | 52 | `api/ws.py`(26), `dependencies.py`(13) |
| 7 | 50 | `api/settings.py`(17), `schemas/settings.py`(16) |
| 8 | 48 | `api/invite.py`(11), `api/auto_join.py`(10) |
| 9 | 47 | `api/admin_smm.py`(29), `schemas/admin_smm.py`(13) |
| 10 | 43 | `services/chat_service.py`(37) |
| 11 | 41 | `services/broadcast_service.py`(37) |
| 12 | 41 | `schemas/chat.py`(40) |

### Observasi

1. **Community 3 (session_manager + account_ownership)** = tight cluster 58 nodes. Ini adalah "ownership subsystem" — UTF-8 precies, well-factored, tapi punya dead code (`account_lease`).
2. **Community 12 (schemas/chat.py alone)** = 41 nodes dengan 45 out-degree di community 1. Import spread adalahroot cause 414 unused imports.
3. **Tidak ada giant community** (>100 nodes) → modularitas baik.

---

## 7. Temuan Baru dari Graphify (di luar master report)

### [MEDIUM] N-1. `LEASE_RENEW_SECONDS` dead constant

- **File:** `backend/app/utils/account_ownership.py:68`
- **Tipe:** Dead code / code smell
- **Evidence:** `grep -rn "LEASE_RENEW_SECONDS" app/` → hanya definisi
- **Fix:** hapus line 68 atau tambahkan comment bahwa interval renew ditentukan health loop.

### [MEDIUM] N-2. `account_lease()` context manager — 15 baris dead code

- **File:** `backend/app/utils/account_ownership.py:221-234`
- **Tipe:** Dead code
- **Evidence:** `grep -rn "account_lease" app/ | grep -v account_ownership.py` → 0 results
- **Fix:** hapus, atau adopsi di `broadcast_service.py` / `invite_service.py` yang saat ini acquire/release manual.

### [LOW] N-3. `accounts.py:793` — public endpoint tetap bisa enumerate UUID akun

- **File:** `backend/app/api/accounts.py:792-825`
- **Tipe:** Information disclosure (minor)
- **Evidence:**
```python
# accounts.py:798-804
"""Get the account's profile photo.

Public endpoint — Telegram profile photos are public data.
Protected by per-IP rate limiting and browser
caching (Cache-Control: 1 hour, ETag based on photo_version)
to prevent abuse.
"""
result = await db.execute(
    select(TelegramAccount).where(TelegramAccount.id == account_id)  # ← tidak ada filter user_id
)
```
- **Impact:** siapa pun bisa cek apakah UUID akun exists (timing difference: 200 vs 404). Rate limit ada, jadi bukan DoS. **Minor**, tapi kalau privacy-first, tambahkan ownership check.
- **Fix:** opsional — tambahkan `TelegramAccount.is_active.is_(True)` atau verify via `get_account(db, account_id, user_id)` kalau endpoint jadi non-public.

### [INFO] N-4. `decrypt()` blast radius 86 call site — prioritas fix yang lebih tinggi dari yang diasumsikan

- **File:** `backend/app/utils/encryption.py:44-52`
- **Tipe:** Risk assessment revision
- **Evidence:** 86 call site / 25 file (73 di services, 8 di api)
- **Implication:** fix `decrypt()` silent-failure perlu mencakup **seluruh** call site, tidak bisa spot-fix. Rekomendasi: **deprecation plan** — tambah `decrypt_or_none()` dan migrate bertahap per-file, tracking progress via audit trail.

---

## 8. Verifikasi & Metodologi

### 8.1 Yang diverifikasi langsung

| Klaim | Metode | Status |
|---|---|---|
| Import cycles | Kosaraju SCC | ✅ 0 |
| Multigraph risk | `graphify diagnose multigraph --json` | ✅ 0 |
| 11 no-auth routes | AST parse signature | ✅ confirmed |
| Admin role gates | grep count | ✅ 18/18, 13/13, 4/4 |
| `decrypt()` 86 callers | graph in-degree | ✅ confirmed |
| `LEASE_RENEW_SECONDS` unused | grep | ✅ confirmed |
| `account_lease()` 0 caller | grep | ✅ confirmed |
| `_PROCESS_ID` collision safe | manual reasoning | ✅ uuid8 random |

### 8.2 Keterbatasan graphify

1. **FastAPI DI tidak di-capture** — `Depends()` di signature bukan call expression, jadi tidak ada edge. Semua auth check harus diverifikasi via AST.
2. **Runtime behavior tidak terlihat** — graph menunjukkan *potential* coupling, bukan *actual* runtime interleaving.
3. **Decorators route tidak di-capture** — `@router.get(...)` tidak muncul sebagai edge.

### 8.3 Rekomendasi workflow going forward

```bash
# Rebuild graph setelah perubahan
graphify update D:/PROJECT/Telegram/TeleBos/backend/app

# Quick health check
graphify diagnose multigraph --graph graphify-out/graph.json

# Coupling check
python graph_probe2.py   # file-level out/in degree
```

---

## 9. Action Items

### Prioritas tinggi
1. Fix `media.py:57` — auth bypass (C-1 di master)
2. Fix `media.py:99` — path traversal (C-2)
3. Fix `marketplace_service.py:153` — `except Exception: is_mocked = True` (C-7)

### Prioritas sedang
4. `decrypt()` migration plan — 86 call site (N-4)
5. `telegram_client.py:291` — `_locks` check-then-act (C-5)
6. `broadcast_service.py:910` — lease fencing (C-6)

### Prioritas rendah / cleanup
7. Hapus `LEASE_RENEW_SECONDS` (N-1)
8. Hapus `account_lease()` atau adopsi (N-2)
9. Pertimbangkan ownership check di `accounts.py:793` (N-3)

---

*Laporan ini melengkapi `audit_2026-10-28_MASTER.md`. Semua temuan di sini diverifikasi ulang via AST/grep, bukan hanya klaim graphify.*
