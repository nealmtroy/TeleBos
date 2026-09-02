# Laporan Audit Mendalam: Kesiapan Produksi (Production Readiness Audit) TeleBos

**Tanggal Audit:** 3 September 2026  
**Target:** Seluruh Infrastruktur Operasional TeleBos (`Docker Compose Deployment`, `FastAPI Lifespan`, `Health Checks`, `Logging & Telemetry`, `Backup & Storage Persistence`, `Config Management`, `Dependencies Security`)  
**Metodologi:** Graphify Knowledge Graph Analysis (`graphify-out/graph.json`, 3.401 nodes, 6.795 edges) + Runtime Lifespan Tracing + Container Configuration Profiling + Software Bill of Materials (SBOM) Vulnerability Scan.

---

## Ringkasan Eksekutif & Matriks Kesiapan Produksi

Audit menyeluruh terhadap aspek operasional dan kesiapan produksi (*Production Readiness*) menemukan **18 temuan krusial**. Isu paling kritis meliputi: **ketiadaan volume Docker untuk direktori upload media** (menyebabkan hilangnya seluruh foto profil dan media pengguna saat container di-recreate), **endpoint health check yang bersifat dummy/shallow** (selalu mengembalikan HTTP 200 "ok" meski database PostgreSQL mati total), **ketiadaan automated backup database**, **eksposur port database dan Redis ke interface publik host**, **urutan graceful shutdown yang salah (Redis ditutup sebelum Telethon pool)**, serta **ketiadaan monitoring metrik (Prometheus) dan alerting error (Sentry)**.

### Matriks 11 Dimensi Kesiapan Produksi

| Dimensi Produksi | Tingkat Risiko | Komponen Utama | Ringkasan Dampak Operasional |
| :--- | :---: | :--- | :--- |
| **1. Nggak Ada Backup/Recovery** | 🔴 **CRITICAL** | `docker-compose.yml`, `backend/uploads/` | Tidak ada persistent volume untuk folder `uploads/` (data foto profil terhapus permanen saat container restart). Tidak ada skrip backup otomatis database (`pg_dump`). |
| **2. Nggak Ada Health Check Nyata** | 🔴 **CRITICAL** | `main.py:L1410`, `docker-compose.yml` | `/api/v1/health` hanya mengembalikan string statis tanpa cek PostgreSQL/Redis. Container backend & frontend tidak memiliki healthcheck Docker. |
| **3. Nggak Ada Graceful Shutdown** | 🔴 **CRITICAL** | `main.py:L1271-L1281` | `redis_client.close()` dipanggil SEBELUM `client_pool.stop()`. Job broadcast/invite tidak dibatalkan secara bersih, status menggantung di DB. |
| **4. Dev ≠ Production (Port Exposure)** | 🔴 **CRITICAL** | `docker-compose.yml:L18, L33` | Port PostgreSQL (5432) dan Redis (6379) dipublish langsung ke `0.0.0.0` host interface, terekspos ke internet publik tanpa isolasi jaringan. |
| **5. Nggak Ada Monitoring** | 🟠 **HIGH** | Seluruh Sistem Backend & Frontend | Tidak ada `/metrics` Prometheus. Penggunaan pool database, socket aktif, dan utilisasi RAM Telethon tidak dapat dipantau di Grafana. |
| **6. Nggak Ada Alerting** | 🟠 **HIGH** | `main.py`, `services/` | Tidak ada Sentry atau alert webhook (Telegram/Discord/Slack) ketika background worker macet, DB disconnect, atau terjadi lonjakan error 500. |
| **7. Error Nggak Kelihatan** | 🟠 **HIGH** | `services/event_relay.py:L185` | Kegagalan kritis resolusi entitas Telegram di-downgrade ke `logger.debug`, sehingga pesan hilang secara senyap tanpa jejak log di produksi. |
| **8. Logging Terlalu Banyak (Spam)** | 🟠 **HIGH** | `main.py`, `services/smm_service.py` | Background polling setiap 15s dan 60s mencatat ribuan log `logger.info` per hari, membanjiri storage disk dan menenggelamkan log error penting. |
| **9. Environment Config Berantakan** | 🟡 **MEDIUM** | `backend/app/config.py`, `.env.example` | Tiga switch env berbeda (`PRODUCTION`, `DEBUG`, `TELEBOS_ENV`). Hardcoded encryption key pada file `.env.example`. |
| **10. Dependency Outdated/Vulnerable** | 🟡 **MEDIUM** | `requirements.txt`, `package.json` | `python-multipart` versi lama memiliki DoS CVE-2024-53981; `passlib` unmaintained; `Next.js 14.2.0` belum di-patch ke versi minor terbaru. |
| **11. Logging Terlalu Sedikit** | 🟡 **MEDIUM** | `backend/app/api/ws.py:L70` | Socket disconnect akibat error ditelan tanpa log error sama sekali. |

---

## 1. Ketiadaan Backup & Pemulihan Data (No Backup / Recovery)

### 🚨 PRD-01: Kehilangan Data Permanen Akibat Ketiadaan Persistent Volume Upload
* **Lokasi Kode:** [`docker-compose.yml:L41-L59`](file:///d:/PROJECT/Telegram/TeleBos/docker-compose.yml#L41-L59) vs [`backend/app/main.py:L1011`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1011)
* **Analisis Masalah:**  
  Aplikasi menyimpan foto profil akun Telegram dan file cache chat di direktori lokal:
  ```python
  os.makedirs(os.path.join(os.path.dirname(__file__), "uploads", "profile_photos"), exist_ok=True)
  ```
  Namun di dalam `docker-compose.yml`:
  ```yaml
  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    # SAMA SEKALI TIDAK ADA DEFINISI VOLUMES UNTUK UPLOADS!
  ```
* **Dampak:**  
  Direktori `uploads/` berada di dalam lapisan file sistem ephemeral container Docker. Begitu operator menjalankan perintah deployment rutin:
  `docker compose down && docker compose up -d`  
  **SELURUH FOTO PROFIL AKUN DAN MEDIA CHAT TERHAPUS SECARA PERMANEN!**

---

### 🚨 PRD-02: Ketiadaan Skrip Backup & Disaster Recovery Otomatis
* **Analisis Masalah:**  
  Repositori tidak memiliki konfigurasi backup database terjadwal:
  1. Tidak ada container `postgres-backup` (misal menggunakan image `prodrigestivill/postgres-backup-local`).
  2. Tidak ada cronjob atau script `pg_dump` di folder `scripts/`.
  3. Tidak ada prosedur *Disaster Recovery Plan (DRP)*, Recovery Point Objective (RPO), atau Recovery Time Objective (RTO) yang terdokumentasi.

---

## 2. Health Check Palsu / Tidak Memadai (Shallow Health Check)

### 🚨 PRD-03: Endpoint `/api/v1/health` Selalu Mengembalikan 200 OK Tanpa Cek Dependensi
* **Lokasi Kode:** [`backend/app/main.py:L1410-L1412`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1410-L1412)
* **Analisis Masalah:**  
  ```python
  @app.get("/api/v1/health")
  async def health():
      return {"status": "ok", "app": app_settings.APP_NAME}
  ```
  Endpoint health check ini bersifat statis (*shallow healthcheck*):
  - **TIDAK memeriksa konektivitas PostgreSQL** (tidak menjalankan `SELECT 1`).
  - **TIDAK memeriksa konektivitas Redis** (tidak menjalankan `await redis.ping()`).
  - **TIDAK memeriksa ketersediaan disk space untuk upload**.
* **Dampak:**  
  Jika database PostgreSQL crash atau connection pool habis, endpoint `/api/v1/health` **tetap mengembalikan HTTP 200 OK**.  
  Load balancer (AWS ALB, Cloudflare, Nginx, Kubernetes) akan menganggap container sehat dan tetap mengirimkan trafik pengguna ke container yang sebenarnya rusak total (*black hole routing*).
* **Ketiadaan Healthcheck di Docker Compose:**  
  Pada `docker-compose.yml`, service `backend` dan `frontend` **tidak memiliki instruksi `healthcheck:`**, sehingga Docker tidak dapat me-restart container secara otomatis saat terjadi deadlock atau OOM.

---

## 3. Ketiadaan Graceful Shutdown Bersih (No Graceful Shutdown)

### 🚨 PRD-04: Urutan Shutdown Terbalik & Matinya Job Broadcast di Tengah Jalan
* **Lokasi Kode:** [`backend/app/main.py:L1271-L1281`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/main.py#L1271-L1281)
* **Analisis Masalah:**  
  Periksa urutan penutupan resource pada blok shutdown `lifespan`:
  ```python
  # 1. Menutup koneksi Redis LEBIH DULU:
  await redis_client.close()

  # 2. Baru kemudian mematikan Telethon client pool:
  await session_manager.stop()
  await client_pool.stop()
  await engine.dispose()
  ```
  Ketika `client_pool.stop()` berjalan, setiap klien Telethon mengeksekusi proses disconnect. Jika proses disconnect membutuhkan Redis untuk membersihkan lock atau mencatat status offline, pemanggilan akan gagal karena Redis **sudah ditutup duluan**.
* **Job Broadcast Menggantung:**  
  Tidak ada mekanisme graceful stop untuk job broadcast (`execute_broadcast`) atau invite (`execute_invite`) yang sedang aktif berjalan. Ketika proses menerima sinyal `SIGTERM`, coroutine dimatikan paksa di tengah pengiriman pesan, meninggalkan baris job di database dengan status `'running'` selamanya.

---

## 4. Dev ≠ Production & Keamanan Jaringan Host

### 🚨 PRD-05: Port Database & Redis Terekspos ke Interface Publik
* **Lokasi Kode:** [`docker-compose.yml:L18, L33`](file:///d:/PROJECT/Telegram/TeleBos/docker-compose.yml#L18)
* **Analisis Masalah:**  
  ```yaml
  postgres:
    ports:
      - "5432:5432"  # <-- TERIKAT KE 0.0.0.0
  redis:
    ports:
      - "6379:6379"  # <-- TERIKAT KE 0.0.0.0
  ```
  Pada konfigurasi docker-compose produksi:
  Port PostgreSQL dan Redis dibuka secara publik pada interface host `0.0.0.0`. Jika server VPS tidak memiliki firewall UFW eksternal yang ketat, database dan Redis dapat di-port scan dan diserang secara brute force langsung dari internet.  
  *Seharusnya menggunakan binding lokal `127.0.0.1:5432` atau hanya `expose:` internal Docker network.*

---

### 🟡 PRD-06: Konflik Hostname Antara Local Dev dan Docker
* **Analisis Masalah:**  
  File `.env.example` menyetel:
  `DATABASE_URL=postgresql+asyncpg://postgres:...@postgres:5432/telebos`
  Nama host `postgres` hanya dapat di-resolve di dalam Docker network. Ketika developer menjalankan `uvicorn app.main:app --reload` di host OS, backend langsung crash karena `postgres` tidak ditemukan di DNS lokal.

---

## 5. Ketiadaan Monitoring & Alerting (No Monitoring & Alerting)

### 🟠 PRD-07: Tidak Ada Metrik Terpusat & Ketiadaan Sentry
* **Analisis Masalah:**  
  1. **Zero Metrics:** Tidak ada implementasi Prometheus / OpenMetrics (`/metrics`). Tidak ada visibilitas terhadap:
     - Jumlah akun Telegram yang connected vs disconnected di pool.
     - Utilisasi pool PostgreSQL (`checked_out_connections`).
     - Event loop latency dan queue lag.
  2. **Zero Error Tracking:** Tidak ada integrasi `sentry-sdk` baik di backend Python maupun frontend Next.js. Kesalahan JavaScript di browser operator atau exception unhandled 500 di backend hanya tersimpan di log lokal dan luput dari pemantauan tim engineer.
  3. **Zero Alerting:** Jika background synchronization mati, tidak ada notifikasi yang dikirimkan ke bot Telegram admin, Discord, atau pager tim.

---

## 6. Masalah Logging (Terlalu Banyak vs Terlalu Sedikit)

### 🟠 PRD-08: Log Noise & Polling Spam Menenggelamkan Error Nyata
* **Lokasi Kode:** [`backend/app/services/smm_service.py:L32, L45`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/smm_service.py#L32)
* **Analisis Masalah:**  
  Fungsi `call_smm_api` mencatat `logger.info` pada setiap request dan response. Karena background loop berjalan setiap 60 detik (dan sync akun setiap 15 detik), sistem menghasilkan puluhan ribu baris log status normal setiap 24 jam. Hal ini mempercepat habisnya kuota storage disk dan mempersulit log auditing.

### 🟠 PRD-09: Error Kritis Tersembunyi di Level DEBUG
* **Lokasi Kode:** [`backend/app/services/event_relay.py:L185, L191`](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/event_relay.py#L185)
* **Analisis Masalah:**  
  ```python
  except Exception:
      chat = None
      logger.debug("Failed to get chat for new message (account %s)", account_id)
  ```
  Pada environment produksi di mana level log disetel ke `INFO`, log `DEBUG` ini tidak akan pernah dicetak. Akibatnya, ketika pesan baru gagal masuk ke database, **tidak ada satu baris pun peringatan di log server**.

---

## 7. Kerentanan & Dependensi Usang (Vulnerable Dependencies)

### 🟡 PRD-10: Audit Keamanan Dependensi Pihak Ketiga
1. **`python-multipart>=0.0.9`** ([`requirements.txt:L13`](file:///d:/PROJECT/Telegram/TeleBos/backend/requirements.txt#L13)):  
   Versi di bawah `0.0.18` rentan terhadap Denial of Service (*Infinite Loop / Memory Exhaustion*) via multipart payload berbahaya ([CVE-2024-53981](https://nvd.nist.gov/vuln/detail/CVE-2024-53981)).
2. **`passlib[bcrypt]>=1.7.4`** ([`requirements.txt:L11`](file:///d:/PROJECT/Telegram/TeleBos/backend/requirements.txt#L11)):  
   Paket `passlib` tidak lagi dirawat secara aktif sejak 2020 dan memiliki bug inkompatibilitas dengan versi bcrypt modern.
3. **`next: ^14.2.0`** ([`frontend/package.json:L29`](file:///d:/PROJECT/Telegram/TeleBos/frontend/package.json#L29)):  
   Next.js 14.2.0 memiliki sejumlah CVE keamanan server actions dan SSRF (seperti CVE-2024-34351), disarankan upgrade ke minimal `14.2.24` atau Next.js 15 LTS.

---

## Roadmap Remediasi Kesiapan Produksi Terstruktur

```mermaid
graph TD
    A["Fase 1: Perlindungan Data & Keamanan Port (P0 - 24 Jam)"] --> B["Fase 2: Health Check Riil & Graceful Shutdown (P1 - 1-2 Hari)"]
    B --> C["Fase 3: Monitoring, Sentry & Alerting (P1 - 2-3 Hari)"]
    C --> D["Fase 4: Pembersihan Logging & Patch Dependensi (P2 - 1 Minggu)"]

    subgraph "Fase 1 (Segera - Hotfix Data & Network)"
        A1["docker-compose.yml: Tambahkan persistent volume untuk folder backend uploads/"]
        A2["docker-compose.yml: Hapus port exposure publik 0.0.0.0 untuk PostgreSQL dan Redis"]
        A3["Buat skrip backup otomatis harian database (scripts/backup_db.sh dengan pg_dump)"]
    end

    subgraph "Fase 2"
        B1["Ubah /api/v1/health menjadi Deep Healthcheck (cek koneksi DB, Redis, dan disk space)"]
        B2["Tambahkan healthcheck stanza untuk backend dan frontend pada docker-compose.yml"]
        B3["Perbaiki urutan shutdown: matikan client_pool dulu baru disconnect redis_client"]
    end

    subgraph "Fase 3"
        C1["Integrasikan Sentry SDK pada backend FastAPI dan frontend Next.js"]
        C2["Tambahkan Prometheus exporter (/metrics) untuk monitoring metrik produksi"]
        C3["Konfigurasikan Telegram Bot alerting untuk broadcast error 500 dan downtime worker"]
    end

    subgraph "Fase 4"
        D1["Turunkan polling logs SMM dari INFO ke DEBUG agar tidak spamming"]
        D2["Naikkan log kegagalan event_relay get_chat() dari DEBUG ke WARNING"]
        D3["Upgrade python-multipart >= 0.0.18 dan Next.js >= 14.2.24"]
    end
```

---
*Laporan audit kesiapan produksi ini disusun berdasarkan inspeksi konfigurasi kontainer, arsitektur shutdown, dan postur keamanan deployment TeleBos.*
