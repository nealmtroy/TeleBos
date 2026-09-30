# 📋 Laporan Audit Arsitektur API & Profile Picture TeleBos

**Tanggal Audit:** 30 September 2026  
**Tools Analisis:** Graphify Knowledge Graph, Static Code AST Analysis, Network Dependency Mapping  
**Cakupan Sistem:**
- Frontend: Next.js 14 App Router, TanStack React Query, Zustand Store, Axios HTTP Client, WebSocket Client
- Backend: FastAPI, SQLAlchemy (AsyncPG), PostgreSQL, Telethon (Telegram MTProto Client Pool)

---

## 📌 Ringkasan Eksekutif (Executive Summary)

Audit ini dilakukan untuk menganalisis seluruh aliran panggilan API dari frontend Next.js ke backend FastAPI pada ekosistem TeleBos, mengidentifikasi pemanggilan yang redundan (*wasteful / duplicated calls*), pemborosan bandwidth/database (*overfetching*), potensi anomali cache TanStack Query, serta audit menyeluruh terhadap siklus hidup dan konsistensi tampilan **Profile Picture & Avatar** di seluruh halaman aplikasi.

### Ringkasan Temuan Kritis API & Performa:
1. **Redundansi Berat di Halaman Akun (`/accounts`):** Frontend mengeksekusi `GET /api/v1/accounts?limit=1000` (mengambil seluruh 300+ akun beserta perhitungan harga dan umur akun) bersamaan dengan `GET /api/v1/accounts?page=1&limit=12` dan `GET /api/v1/accounts/summary`. Data hasil panggilan 1.000 akun tersebut **tidak pernah di-render ke UI** dan hanya dipakai sebagai fallback satu angka statistik.
2. **Overfetching di Halaman Dashboard (`/dashboard`):** Memanggil `GET /api/v1/accounts?limit=1000` hanya untuk menampilkan **5 baris akun teratas** pada widget recent accounts.
3. **Konflik Cache Key & Data Shape di Modul Chat:** Komponen [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) dan [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) menggunakan query key yang sama (`["chat-members", accountId, chatId]`) namun menyimpan struktur data yang berbeda (Array vs Object), memicu potensi kegagalan render member list.
4. **Stale Query Refetch pada Card Akun:** Pemanggilan `useMarketplacePricing()` pada setiap kartu akun tanpa `staleTime` eksplisit, memicu potensi evaluasi refetch berulang saat browser berganti fokus (*window focus*).

### Ringkasan Temuan Khusus Profile Picture & Avatar:
1. **Redundansi Upload Foto:** Setelah user mengunggah foto baru ke Telegram, backend mengunduh ulang foto tersebut via MTProto padahal file lokal sudah ada di server.
2. **Dead-Code Endpoint `/photo-token`:** Endpoint token foto profil di backend tidak pernah digunakan karena endpoint foto sudah berstatus publik.
3. **Inkonsistensi URL String:** `ChatRightColumn.tsx` merangkai URL foto secara manual alih-alih menggunakan helper terpusat `getChatPhotoUrl()`.
4. **Inkonsistensi Visual (Solid vs Gradient):** Halaman Akun menggunakan warna solid datar, sedangkan modul Chat menggunakan gradasi miring. Disepakati untuk **diseragamkan ke warna solid flat** mengikuti [AccountAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-avatar.tsx).
5. **Inkonsistensi Guard Akun Nonaktif:** Komponen chat dan halaman invite tidak memeriksa status `isActive` akun, sehingga akun expired memicu error 404 di browser console.
6. **Inkonsistensi Absolute Path di Database:** Kolom `profile_photo_path` menyimpan absolute path sistem file lokal yang rentan rusak saat migrasi OS/container.
7. **Missing Props di Halaman Member Invite:** `AccountAvatar` di [invite/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx) tidak menerima `telegramId`, `hasProfilePhoto`, `isActive`, dan `profilePhotoPath`.
8. **Inkonsistensi Color Index di Chat AccountSwitcher:** [AccountSwitcher.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/AccountSwitcher.tsx) menggunakan indeks array `activeAccounts.indexOf(acc)` alih-alih `color_id` / `telegram_id`, menyebabkan warna avatar berubah-ubah saat posisi akun bergeser.

---

## 🧭 1. Peta Lengkap API Frontend ke Backend

Frontend TeleBos terpusat pada modul [api.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/api.ts) dengan injeksi header `x-better-auth-token`. Berikut katalog lengkap API yang dikonsumsi frontend berdasarkan modul:

### 1.1 Autentikasi & Profil Pengguna
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/auth/me` | `GET` | [auth-store.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/store/auth-store.ts) | Verifikasi sesi, mengambil role user, status aktif, dan saldo balance. |
| `/api/v1/auth/logout` | `POST` | [auth-store.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/store/auth-store.ts) | Menghapus token sesi di backend sebelum pembersihan Better Auth client. |

### 1.2 Manajemen Akun Telegram (Accounts)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/accounts` | `GET` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Mengambil daftar akun (unpaginated default `limit=1000` atau paginated dengan `page`, `limit`, `search`, `status`, `folder_id`). |
| `/api/v1/accounts/summary` | `GET` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Menghitung agregat status akun: total, active, expired, selling, limited. |
| `/api/v1/accounts/{id}` | `GET` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Mengambil detail 1 akun tertentu. |
| `/api/v1/accounts/{id}` | `DELETE` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Menghapus akun dari sistem TeleBos. |
| `/api/v1/accounts/{id}/stats` | `GET` | [use-account-stats.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-stats.ts) | Mengambil metrik total grup, owned groups, total channels, owned channels. |
| `/api/v1/accounts/{id}/2fa` | `GET` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Mengecek status 2FA, hint password, dan recovery email akun. |
| `/api/v1/accounts/{id}/check-spam` | `POST` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Memicu pengecekan status spam via `@SpamBot` Telegram. |
| `/api/v1/accounts/transfer` | `POST` | [use-accounts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-accounts.ts) | Memindahkan kepemilikan akun Telegram ke pengguna lain (Role Owner). |
| `/api/v1/accounts/search-users` | `GET` | [transfer-accounts-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx) | Autocomplete pencarian email user tujuan transfer akun. |
| `/api/v1/accounts/{id}/profile` | `PUT` | [account-settings-page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx) | Memperbarui nama depan, nama belakang, username, dan bio akun. |
| `/api/v1/accounts/{id}/privacy` | `GET` / `PUT` | [account-settings-page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx) | Membaca & mengubah privasi Telegram (phone number, last seen, forwards, dll). |
| `/api/v1/accounts/{id}/photo` | `POST` / `DELETE` | [account-settings-page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx) | Mengunggah / menghapus foto profil Telegram. |
| `/api/v1/accounts/{id}/profile-color` | `POST` | [account-settings-page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx) | Mengatur warna aksen profil (Telegram Premium). |

### 1.3 Perangkat & Sesi Telegram (Devices)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/accounts/{id}/devices` | `GET` | [devices/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/devices/page.tsx) | Daftar sesi/perangkat aktif yang terhubung pada akun Telegram. |
| `/api/v1/accounts/{id}/devices` | `DELETE` | [devices/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/devices/page.tsx) | Mengakhiri seluruh sesi lain (*terminate other sessions*). |
| `/api/v1/accounts/{id}/devices/{hash}` | `DELETE` | [devices/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/devices/page.tsx) | Mengakhiri satu sesi perangkat tertentu berdasarkan hash. |

### 1.4 Folder Akun Kustom (Account Folders)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/account-folders` | `GET` | [use-account-folders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-folders.ts) | Mengambil daftar folder akun buatan user. |
| `/api/v1/account-folders` | `POST` | [use-account-folders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-folders.ts) | Membuat folder akun baru. |
| `/api/v1/account-folders/{id}` | `PUT` | [use-account-folders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-folders.ts) | Mengubah nama folder akun. |
| `/api/v1/account-folders/{id}` | `DELETE` | [use-account-folders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-folders.ts) | Menghapus folder akun. |
| `/api/v1/account-folders/{id}/accounts` | `POST` / `DELETE` | [use-account-folders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-account-folders.ts) | Menambahkan atau mengeluarkan akun dari suatu folder. |

### 1.5 Obrolan & Pesan Web Messenger (Chats & Messages)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/accounts/{id}/chats` | `GET` | [ChatsContent.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatsContent.tsx) | Daftar chat (dialogs) Telegram akun terpilih (paginated 50 per page). |
| `/api/v1/accounts/{id}/folders` | `GET` | [ChatsContent.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatsContent.tsx) | Mengambil folder dialog asli Telegram (bukan folder lokal). |
| `/api/v1/accounts/{id}/chats/{chatId}/messages` | `GET` | [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Mengambil riwayat pesan obrolan. |
| `/api/v1/accounts/{id}/chats/{chatId}/messages` | `POST` | [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Mengirim pesan teks / file ke obrolan. |
| `/api/v1/accounts/{id}/chats/{chatId}/read` | `POST` | [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Menandai seluruh pesan dalam obrolan telah dibaca. |
| `/api/v1/accounts/{id}/chats/{chatId}/full` | `GET` | [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) | Mengambil info profil lengkap chat/grup/channel. |
| `/api/v1/accounts/{id}/chats/{chatId}/members` | `GET` | [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) / [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Mengambil anggota grup (hingga limit 100). |
| `/api/v1/accounts/{id}/chats/{chatId}/permissions` | `GET` | [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) | Mengambil hak akses member di grup. |
| `/api/v1/accounts/{id}/chats/{chatId}/pinned` | `GET` | [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Mengambil daftar pesan tersemat (pinned messages). |
| `/api/v1/accounts/{id}/chats/sync-groups-channels` | `POST` | [groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx) | Sinkronisasi manual database grup & channel dari Telegram. |
| `/api/v1/accounts/{id}/chats/join` | `POST` | [groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx) | Bergabung ke grup/channel via link tautan atau username publik. |

### 1.6 Kontak Telegram (Contacts)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/accounts/{id}/contacts` | `GET` | [use-contacts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-contacts.ts) | Daftar kontak akun Telegram secara paginasi. |
| `/api/v1/accounts/{id}/contacts/{contactId}` | `GET` | [use-contacts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-contacts.ts) | Detail profil satu kontak. |
| `/api/v1/accounts/{id}/contacts/{contactId}` | `DELETE` | [use-contacts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-contacts.ts) | Menghapus kontak dari akun Telegram. |
| `/api/v1/accounts/{id}/contacts/import` | `POST` | [use-contacts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-contacts.ts) | Impor kontak massal (manual teks / file vCard / CSV). |
| `/api/v1/accounts/{id}/contacts/export` | `GET` | [use-contacts.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-contacts.ts) | Ekspor daftar kontak menjadi format CSV, VCF, atau JSON. |

### 1.7 Penyiaran Pesan Massal (Broadcast / Blast)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/group-lists` | `GET` / `POST` / `PUT` / `DELETE` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Kelola koleksi target grup siaran. |
| `/api/v1/text-lists` | `GET` / `POST` / `PUT` / `DELETE` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Kelola template teks spintax pesan siaran. |
| `/api/v1/broadcast/history` | `GET` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Riwayat eksekusi pekerjaan siaran. |
| `/api/v1/broadcast/start` | `POST` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Menjalankan pekerjaan siaran baru. |
| `/api/v1/broadcast/{jobId}` | `GET` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Polling status pekerjaan siaran (jika WebSocket terputus). |
| `/api/v1/broadcast/{jobId}/{action}` | `POST` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Aksi kontrol pekerjaan: `pause`, `resume`, `stop`. |
| `/api/v1/broadcast/{jobId}/logs` | `GET` | [use-broadcast.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-broadcast.ts) | Log rinci per grup dari proses siaran. |

### 1.8 Pengundang Anggota Grup (Invite Members)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/invite/history` | `GET` | [use-invite.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-invite.ts) | Riwayat pekerjaan scrape & invite anggota. |
| `/api/v1/invite/start` | `POST` | [use-invite.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-invite.ts) | Menjalankan scraping dari grup sumber dan mengundang ke grup target. |
| `/api/v1/invite/{jobId}` | `GET` | [use-invite.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-invite.ts) | Status pekerjaan invite. |
| `/api/v1/invite/{jobId}/{action}` | `POST` | [use-invite.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-invite.ts) | Menghentikan atau melanjutkan pekerjaan invite. |
| `/api/v1/invite/{jobId}/logs` | `GET` | [use-invite.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-invite.ts) | Log pengundangan anggota secara mendalam. |

### 1.9 Balas Otomatis (Auto Reply)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/accounts/{id}/auto-reply` | `PUT` | [auto-reply/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx) | Mengatur pesan template auto-reply dan toggle aktif/nonaktif per akun. |
| `/api/v1/accounts/auto-reply/bulk` | `POST` | [auto-reply/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx) | Menerapkan konfigurasi auto-reply secara serentak ke banyak akun. |

### 1.10 Pesanan & Panel SMM Buzzer (Orders)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/orders/services` | `GET` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Mengambil katalog layanan SMM Telegram aktif dari BuzzerPanel. |
| `/api/v1/orders/services/all` | `GET` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Mengambil seluruh katalog layanan SMM (Multi-platform). |
| `/api/v1/orders` | `GET` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Riwayat pesanan SMM milik pengguna. |
| `/api/v1/orders` | `POST` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Membuat pesanan SMM tunggal. |
| `/api/v1/orders/mass` | `POST` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Membuat pesanan SMM massal (*mass order*). |
| `/api/v1/orders/refresh-all` | `POST` | [use-orders.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-orders.ts) | Menyinkronkan status pesanan aktif dari penyedia SMM. |

### 1.11 Pasar Akun (Marketplace)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/marketplace/pricing` | `GET` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Mengambil harga patokan beli dan jual akun saat ini. |
| `/api/v1/marketplace/stock` | `GET` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Jumlah stok akun siap beli dikelompokkan berdasarkan negara. |
| `/api/v1/marketplace/stock/{prefix}/accounts` | `GET` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Daftar akun siap beli dari kode negara tertentu. |
| `/api/v1/marketplace/sell-eligible` | `GET` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Akun pengguna yang memenuhi kriteria untuk dijual ke pasar. |
| `/api/v1/marketplace/sell` | `POST` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Memasukkan akun ke bursa jual. |
| `/api/v1/marketplace/buy/{id}` | `POST` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Membeli akun dari bursa menggunakan saldo balance. |
| `/api/v1/marketplace/cancel/{id}` | `POST` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Membatalkan penjualan akun. |
| `/api/v1/marketplace/history` | `GET` | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Riwayat transaksi bursa akun pengguna. |

### 1.12 Langganan & Sistem
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/subscriptions/me` | `GET` | [use-subscriptions.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-subscriptions.ts) | Status paket langganan aktif pengguna (Basic, Pro, Premium, Owner). |
| `/api/v1/redeem` | `POST` | [use-subscriptions.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-subscriptions.ts) | Tukar kode voucher untuk menambah saldo atau upgrade paket. |
| `/api/v1/notifications` | `GET` | [use-notifications.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-notifications.ts) | Polling notifikasi in-app pengguna (setiap 30 detik). |
| `/api/v1/notifications/{id}/read` | `PATCH` | [use-notifications.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-notifications.ts) | Menandai satu notifikasi telah dibaca. |
| `/api/v1/system/status` | `GET` | [announcement-banner.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/announcement-banner.tsx) | Status operasional platform (polling 10 menit dengan staleTime 5 menit). |
| `/api/v1/telegram-reg-date/estimate` | `GET` | [age-checker/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/age-checker/page.tsx) | Estimasi umur pembuatan akun Telegram berdasarkan ID numerik. |

### 1.13 Panel Admin (Khusus Role Owner)
| Endpoint | Metode | Hook / Komponen | Fungsi & Deskripsi |
| :--- | :---: | :--- | :--- |
| `/api/v1/admin/stats` | `GET` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Metrik komprehensif platform: pengguna, akun, broadcast, invite, auto-reply. |
| `/api/v1/admin/users` | `GET` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Daftar seluruh pengguna terdaftar berserta metrik jumlah akunnya. |
| `/api/v1/admin/users/balance` | `POST` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Penyesuaian saldo pengguna secara manual. |
| `/api/v1/admin/users/role` | `POST` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Mengubah tingkat role pengguna. |
| `/api/v1/admin/prefix-prices` | `GET` / `POST` / `PUT` / `DELETE` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Konfigurasi harga bursa akun berdasarkan kode awalan nomor negara. |
| `/api/v1/admin/smm/stats` & `profile` | `GET` | [use-admin-smm.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin-smm.ts) | Saldo dan status koneksi API BuzzerPanel. |
| `/api/v1/admin/broadcasts` | `GET` | [use-admin.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-admin.ts) | Pemantauan semua pekerjaan siaran lintas seluruh pengguna. |

---

## 🔍 2. Analisis Mendalam Pemanggilan Redundan & Inefisiensi API

---

### 🚨 Temuan 1: Pemanggilan Berat `GET /api/v1/accounts?limit=1000` di Halaman Akun
* **File Terdampak:** [accounts/page.tsx (baris 64-74 & 98)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/page.tsx#L64-L74)
* **Konteks Kode Saat Ini:**
  ```tsx
  const { data: accountsSummary } = useAccountsSummary();
  const { data: accountsData } = useAccounts(); // Mengirim GET /api/v1/accounts?limit=1000 !
  const { data: paginatedData, isLoading, error } = useAccountsPaginated({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    folder_id: selectedFolderId,
    status: statusFilter === "all" ? null : statusFilter,
  });

  const allAccounts = Array.isArray(accountsData) ? accountsData : [];
  const totalUsedAccounts = accountsSummary?.total ?? allAccounts.length;
  ```
* **Masalah Teknis & Analisis:**
  1. Halaman `/accounts` sudah menerapkan **paginasi server-side** dengan `useAccountsPaginated` (mengambil 12 akun per halaman).
  2. Statistik jumlah akun (`total`, `active`, `expired`, dll) sudah secara khusus diambil lewat endpoint ringan `useAccountsSummary()` (`GET /api/v1/accounts/summary`).
  3. Namun, baris 65 tetap memanggil `useAccounts()`. Di backend ([accounts.py baris 581](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/accounts.py#L581)), panggilan unpaginated mengeksekusi query database hingga 1.000 akun, kalkulasi harga bursa, dan kalkulasi usia Telegram setiap akun.
  4. Frontend menerima seluruh data tersebut hanya untuk satu baris ekspresi fallback: `accountsSummary?.total ?? allAccounts.length`. Padahal `accountsSummary?.total` sudah selalu disediakan oleh endpoint `/summary`.
* **Dampak:** Membuang CPU server dan ratusan kilobyte bandwidth jaringan.
* **Rekomendasi Perbaikan:** Hapus `useAccounts()` dari [accounts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/page.tsx) dan gunakan `accountsSummary?.total ?? paginatedData?.total ?? 0`.

---

### 🚨 Temuan 2: Overfetching di Halaman Dashboard (`/dashboard`)
* **File Terdampak:** [dashboard/page.tsx (baris 38-43 & 212)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/dashboard/page.tsx#L38-L43)
* **Konteks Kode Saat Ini:**
  ```tsx
  const { data: accountsSummary } = useAccountsSummary();
  const { data: accountsData, isLoading } = useAccounts(); // Mengirim GET /api/v1/accounts?limit=1000
  const accounts = Array.isArray(accountsData) ? (accountsData as unknown as Account[]) : [];
  ...
  {accounts.slice(0, 5).map((acc) => ( ... ))}
  ```
* **Masalah Teknis & Analisis:**
  - Dashboard hanya menampilkan statistik ringkas (yang sudah disediakan oleh `accountsSummary`) dan **5 akun teratas** pada widget "Connected Accounts".
  - Frontend memanggil `useAccounts()` tanpa parameter limit, sehingga memicu default `limit=1000` ke backend. Backend memproses ratusan akun dari database, lalu browser hanya memotong 5 akun menggunakan `accounts.slice(0, 5)`.
* **Rekomendasi Perbaikan:**
  Ganti pemanggilan di Dashboard menjadi paginasi berukuran kecil:
  ```tsx
  const { data: paginatedAccounts, isLoading } = useAccountsPaginated({ page: 1, limit: 5 });
  const accounts = paginatedAccounts?.accounts || [];
  ```

---

### ⚠️ Temuan 3: Konflik Cache Key & Inkonsistensi Return Shape pada Chat Members
* **File Terdampak:**
  - [MessagePane.tsx (baris 195-202)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx#L195-L202)
  - [ChatRightColumn.tsx (baris 90-99)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx#L90-L99)
* **Masalah Teknis & Analisis:**
  - Kedua komponen berbagi TanStack Query key yang sama: `["chat-members", accountId, chatId]`.
  - `MessagePane.tsx` menyimpan format Array (`data?.members || []`), sedangkan `ChatRightColumn.tsx` menyimpan format Object (`{ members: [...], total: ... }`).
  - Jika user mengetik `@` di input chat, `MessagePane` menyimpan Array ke dalam cache. Saat drawer kanan dibuka, `membersData?.members` menghasilkan `undefined` karena data cache berupa Array, bukan Object. Akibatnya daftar member di drawer kanan menjadi kosong.
* **Rekomendasi Perbaikan:**
  Pisahkan query key untuk autocomplete sugesti:
  `queryKey: ["chat-members-suggest", accountId, chatId]` pada [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx).

---

### ⚠️ Temuan 4: Pemanggilan `useMarketplacePricing()` Tanpa Cache Time di Kartu Akun
* **File Terdampak:**
  - [account-card.tsx (baris 80)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-card.tsx#L80)
  - [use-marketplace.ts (baris 46-54)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts#L46-L54)
* **Masalah Teknis & Analisis:**
  - Setiap komponen `AccountCard` memanggil `useMarketplacePricing()` tanpa `staleTime`.
  - Saat browser berpindah fokus (`refetchOnWindowFocus`), seluruh 12 kartu akun memicu evaluasi refetch harga pasar secara berulang.
* **Rekomendasi Perbaikan:** Tambahkan `staleTime: 5 * 60 * 1000` (5 menit) pada `useMarketplacePricing()`.

---

### ⚠️ Temuan 5: Pemanggilan Awal Terbuang Saat Auto-Sync di Halaman Groups & Channels
* **File Terdampak:** [groups-channels/page.tsx (baris 133-137 & 173-179)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L133-L137)
* **Masalah Teknis & Analisis:**
  - Saat akun belum pernah disinkronisasi (`!syncedAt`), komponen langsung memicu `useChats(...)` (`GET /accounts/{id}/chats`).
  - Secara bersamaan, `useEffect` memicu `handleSync()` (`POST /chats/sync-groups-channels`).
  - Begitu `handleSync()` selesai, query `chats` di-invalidasi dan dipanggil ulang. Request pertama saat mount menjadi terbuang percuma.
* **Rekomendasi Perbaikan:** Tambahkan kondisi `enabled: !!selectedAccount && !isSyncing` pada `useChats`.

---

## 🖼️ 3. Audit Khusus Profile Picture & Sistem Avatar Lintas Halaman

---

### 3.1 Siklus Hidup Profile Picture (Pengecekan, Download & Penyajian)

```
                  ┌────────────────────────────────────────┐
                  │          TELEGRAM SERVERS              │
                  └──────┬──────────────────────┬──────────┘
       1. Sync Berkala   │                      │ 2. Manual Upload
       (GetFullUserReq)  │                      │ (UploadPhotoReq)
                         ▼                      ▼
           ┌──────────────────────────────────────────┐
           │        BACKEND (FastAPI / Telethon)      │
           │                                          │
           │  • Bandingkan photo_id Telegram vs DB   │
           │  • Download via download_profile_photo() │
           │  • Simpan ke disk: uploads/.../{id}.jpg  │
           │  • Bump version: account.photo_version++ │
           └─────────────────────┬────────────────────┘
                                 │ 3. HTTP GET (Public + ETag)
                                 ▼
           ┌──────────────────────────────────────────┐
           │        FRONTEND (Next.js 14 Client)      │
           │                                          │
           │  • getAccountPhotoUrl(id, version)       │
           │  • <AccountAvatar> / <ChatAvatar>        │
           │  • Fallback initial huruf jika 404       │
           └──────────────────────────────────────────┘
```

1. **Pengecekan Otomatis (Background Sync):**
   - Background worker [background_tasks.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/schedulers/background_tasks.py) mengeksekusi `sync_all_profiles()` setiap 10 menit.
   - [profile_sync_service.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/profile_sync_service.py) memanggil `GetFullUserRequest("me")` ke Telegram.
   - Membandingkan `me.photo.photo_id` Telegram dengan `account.profile_photo_id` database.
   - Jika `photo_id` berbeda: mengunduh via `client.download_profile_photo(me)` dan menyimpannya ke `uploads/profile_photos/{account_id}.jpg`, lalu menaikkan `account.photo_version += 1`.
   - Jika foto dihapus di Telegram: menghapus file lokal `.jpg` dan mengosongkan path di database.
2. **Pengecekan On-Demand saat HTTP GET:**
   - Saat browser meminta `GET /api/v1/accounts/{account_id}/photo`, backend memeriksa file lokal.
   - Jika file belum ada di disk (misal setelah migrasi VPS/deploy container baru), backend memanggil `download_and_cache_photo()` secara on-the-fly ke Telegram lalu menyajikan gambar ke browser.

---

### 3.2 Inventarisasi Komponen & Halaman Pengguna Avatar

Berikut audit mendalam pada seluruh halaman dan komponen yang merender avatar/foto profil:

| Halaman / Komponen | Elemen Avatar | Props yang Diterima | Status Evaluasi |
| :--- | :--- | :--- | :--- |
| **Daftar Akun** ([account-card.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-card.tsx)) | `<AccountAvatar>` | Lengkap (`accountId`, `telegramId`, `phone`, `colorId`, `hasProfilePhoto`, `photoVersion`, `isActive`, `profilePhotoPath`) | ✅ Sempurna & aman dari 404. |
| **Detail Akun** ([accounts/[id]/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/page.tsx)) | `<AccountAvatar>` | Lengkap (`size="xl"`, full metadata) | ✅ Sempurna. |
| **Dashboard** ([dashboard/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/dashboard/page.tsx)) | `<AccountAvatar>` | Lengkap (`size="lg"`, full metadata) | ✅ Sempurna. |
| **Siaran Baru** ([broadcast/new/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx)) | `<AccountAvatar>` | Lengkap (`size="md"`, full metadata) | ✅ Sempurna. |
| **Auto-Reply** ([auto-reply/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx)) | `<AccountAvatar>` | Lengkap (`size="sm"`, full metadata) | ✅ Sempurna. |
| **Transfer Akun** ([transfer-accounts-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx)) | `<AccountAvatar>` | Lengkap (`size="sm"`, full metadata) | ✅ Sempurna. |
| **Layout Switcher** ([layout/account-switcher.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/account-switcher.tsx)) | `<AccountAvatar>` | Lengkap (`size="sm"/"lg"`, full metadata) | ✅ Sempurna. |
| **Undang Member** ([invite/page.tsx:L284](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx#L284)) | `<AccountAvatar>` | **TIDAK LENGKAP** (`telegramId`, `hasProfilePhoto`, `isActive`, `profilePhotoPath` TIDAK di-pass!) | 🚨 **Kurang Props!** Akun nonaktif bisa memicu 404 image load. |
| **Chat AccountSwitcher** ([chat/AccountSwitcher.tsx:L121,L280](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/AccountSwitcher.tsx#L121)) | `<ChatAvatar>` | **SALAH COLOR_ID** (`colorId={activeAccounts.indexOf(acc)}`) | 🚨 **Inkonsistensi Bug!** Menggunakan index urutan array alih-alih Telegram color_id. |
| **Chat Header Akun** ([ChatLeftColumn.tsx:L300](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatLeftColumn.tsx#L300)) | `<ChatAvatar>` | Memakai `ChatAvatar` untuk profil akun sendiri | ⚠️ Menggunakan gradient miring, tidak ada guard `isActive`. |
| **Chat Dialogs List** ([ChatLeftColumn.tsx:L738](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatLeftColumn.tsx#L738)) | `<ChatAvatar>` | Merender avatar obrolan / lawan bicara | ⚠️ Menggunakan gradient miring lokal. |
| **Chat Message Header** ([MessagePane.tsx:L683](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx#L683)) | `<ChatAvatar>` | Merender avatar obrolan aktif | ⚠️ Menggunakan gradient miring lokal. |
| **Chat Cover Photo** ([ChatRightColumn.tsx:L206](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx#L206)) | `<img>` manual | Hardcoded URL string | 🚨 **Inkonsistensi URL!** Tidak memakai helper `getChatPhotoUrl()`. |
| **Daftar Kontak** ([contacts/page.tsx:L438,L528](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx#L438)) | `<ChatAvatar>` | Merender kontak Telegram | ⚠️ Menggunakan gradient miring lokal. |
| **Grup & Saluran** ([groups-channels/page.tsx:L361](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L361)) | `<ChatAvatar>` | Merender avatar grup/channel | ⚠️ Menggunakan gradient miring lokal. |

---

### 3.3 Temuan Redundansi Terkait Foto Profil

#### 🚨 Redundansi Foto 1: Upload Foto -> Mengunduh Ulang dari Telegram
* **Lokasi:** [account_service.py (baris 892–904)](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/account_service.py#L892-L904)
* **Kondisi:**
  Saat user mengunggah foto baru:
  1. Backend menerima file asli dari browser (`tmp_path`).
  2. Backend mengunggah file ke Telegram: `client.upload_file()` + `UploadProfilePhotoRequest()`.
  3. **Lalu backend mendownload ulang file tersebut dari Telegram**:
     ```python
     me = await client.get_me()
     buf = io.BytesIO()
     downloaded = await client.download_profile_photo(me, file=buf)
     ```
* **Masalah:** File gambar sudah ada di server lokal (`tmp_path`). Mengunduhnya kembali menambah latensi 2–4 detik dan menghabiskan kuota MTProto secara percuma.
* **Solusi:** Langsung resize dan salin file `tmp_path` lokal ke `uploads/profile_photos/{account_id}.jpg` tanpa download ulang.

---

#### 🚨 Redundansi Foto 2: Endpoint Dead-Code `GET /{account_id}/photo-token`
* **Lokasi:** [accounts.py (baris 863–882)](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/accounts.py#L863-L882)
* **Kondisi:**
  Ada endpoint backend yang menghasilkan token sementara (TTL 5 menit):
  ```python
  @router.get("/{account_id}/photo-token")
  async def get_profile_photo_token(...):
  ```
* **Masalah:** Endpoint `GET /{account_id}/photo` sudah berstatus **PUBLIC** (dilindungi per-IP rate limiter). Frontend sama sekali tidak pernah memanggil endpoint `/photo-token`. Ini adalah *dead-code* yang mubazir.
* **Solusi:** Hapus router endpoint `/photo-token` dari [accounts.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/accounts.py).

---

#### 🚨 Redundansi Foto 3: Dobel & Inkonsistensi Penanganan Resize Gambar
* **Lokasi:** [account_service.py (baris 906 & 979)](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/account_service.py#L906) vs [profile_sync_service.py (baris 118–124)](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/profile_sync_service.py#L118-L124)
* **Masalah:**
  - Pada `account_service.py`, gambar di-resize menjadi thumbnail avatar via Pillow (`resize_to_avatar(data)`).
  - Pada `profile_sync_service.py` (sinkronisasi otomatis berkala), hasil unduhan dari Telegram langsung ditulis mentah-mentah ke disk tanpa resize.
* **Solusi:** Satukan pemanggilan agar semua jalur penyimpanan foto selalu melalui fungsi normalisasi dan resize avatar yang seragam.

---

### 3.4 Temuan Inkonsistensi Terkait Foto Profil & Avatar

---

#### ⚠️ Inkonsistensi 1: Hardcoded URL String di Chat Right Column
* **Lokasi:** [ChatRightColumn.tsx (baris 206)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx#L206)
* **Kondisi:**
  ```tsx
  src={`${getApiUrl()}/accounts/${accountId}/chats/${chatId}/photo?v=${photoVersion}`}
  ```
* **Masalah:** Semua komponen lain menggunakan helper `getChatPhotoUrl(...)` atau `getAccountPhotoUrl(...)`. Penggunaan manual string di file ini membuat format versi dan baseUrl tidak tersinkronisasi jika helper di [avatar.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/avatar.ts) diubah.
* **Solusi:** Ubah menjadi `src={getChatPhotoUrl(accountId, chatId, photoVersion)}`.

---

#### ⚠️ Inkonsistensi 2: Tampilan Visual Fallback (Warna Solid vs Gradasi Miring)
* **Lokasi:** [AccountAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-avatar.tsx) vs [ChatAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatAvatar.tsx)
* **Kondisi:**
  - `AccountAvatar.tsx` (Akun, Dashboard, Broadcast, Auto-Reply): Menggunakan **warna solid datar** (`TELEGRAM_AVATAR_COLORS` di [avatar.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/avatar.ts)).
  - `ChatAvatar.tsx` (Chat list, Kontak, Grup, Header obrolan): Mendefinisikan palet lokal sendiri dengan **linear gradient miring 135°** (`AVATAR_COLORS = [{ top: ..., bottom: ... }]`).
* **Keputusan Solusi:**
  **Terapkan warna SOLID flat** di seluruh sistem mengikuti [AccountAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-avatar.tsx) / [avatar.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/avatar.ts). Hapus implementasi gradasi miring lokal pada `ChatAvatar.tsx` agar tampilan visual avatar seragam di semua menu.

---

#### ⚠️ Inkonsistensi 3: Logika Guard Pengecekan Akun Inactive/Expired
* **Lokasi:** [AccountAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-avatar.tsx) vs [ChatAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatAvatar.tsx)
* **Kondisi:**
  - `AccountAvatar.tsx` memiliki guard proteksi:
    ```tsx
    const isPhotoCached = !!profilePhotoPath;
    const isImageLoadable = isActive !== false || isPhotoCached;
    const shouldRenderImage = (hasProfilePhoto ?? (photoVersion ?? 0) > 0) && isImageLoadable;
    ```
    Jika akun tidak aktif/expired dan foto belum ada di disk, komponen tidak akan mencoba me-load URL gambar (mencegah error 404).
  - `ChatAvatar.tsx` tidak memiliki pengecekan `isActive` / `isPhotoCached`. Akun yang offline atau expired tetap menembak URL gambar ke backend, memicu error 404 merah di Network tab dan console browser.
* **Solusi:** Tambahkan guard `isImageLoadable` yang sama pada `ChatAvatar.tsx` ketika merender foto akun.

---

#### ⚠️ Inkonsistensi 4: Penyimpanan Absolute Path di Database
* **Lokasi:** Tabel `telegram_accounts`, kolom `profile_photo_path`
* **Kondisi:** Kolom database menyimpan absolute path OS lokal (misal: `D:\PROJECT\Telegram\TeleBos\backend\uploads\profile_photos\xxx.jpg`).
* **Masalah:** Jika aplikasi dijalankan di Linux VPS atau Docker container (`/app/uploads/...`), absolute path Windows tersebut menjadi rusak/tidak valid. Padahal helper [photo_helper.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/utils/photo_helper.py) selalu menghitung path file secara dinamis: `os.path.join(_PHOTO_DIR, f"{account_id}.jpg")`.
* **Solusi:** Di database cukup jadikan penanda status foto dan versi (`photo_version`). Backend tidak boleh bergantung pada absolute path di database untuk membaca file.

---

#### ⚠️ Inkonsistensi 5: Missing Props di Halaman Member Invite
* **Lokasi:** [invite/page.tsx (baris 284–291)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx#L284-L291)
* **Kondisi:**
  ```tsx
  <AccountAvatar
    accountId={acc.id}
    firstName={acc.first_name}
    phone={acc.phone}
    photoVersion={acc.photo_version}
    colorId={acc.color_id}
    size="sm"
  />
  ```
* **Masalah:**
  - `telegramId` tidak di-pass -> color hashing jatuh ke ID UUID string, bukan Telegram ID.
  - `hasProfilePhoto` tidak di-pass.
  - `isActive` dan `profilePhotoPath` tidak di-pass -> guard pencegah 404 tidak bekerja pada akun expired yang ada di daftar invite.
* **Solusi:** Tambahkan `telegramId={acc.telegram_id}`, `hasProfilePhoto={acc.has_profile_photo}`, `isActive={acc.is_active}`, dan `profilePhotoPath={acc.profile_photo_path}` di [invite/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx).

---

#### ⚠️ Inkonsistensi 6: Chat AccountSwitcher Menggunakan Index Array Sebagai `colorId`
* **Lokasi:** [AccountSwitcher.tsx (baris 124 & 283)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/AccountSwitcher.tsx#L124)
* **Kondisi:**
  ```tsx
  <ChatAvatar
    accountId={selectedAcc.id}
    chatTitle={displayName}
    colorId={activeAccounts.indexOf(selectedAcc)} // <-- MENGGUNAKAN INDEX ARRAY (0, 1, 2...) !
    hasProfilePhoto={selectedAcc.has_profile_photo}
    photoVersion={selectedAcc.photo_version}
    sizeClassName="w-[36px] h-[36px] text-sm"
  />
  ```
* **Masalah:** Menggunakan nomor index urutan array (`0, 1, 2...`) alih-alih `selectedAcc.color_id` atau `selectedAcc.telegram_id`. Akibatnya, jika posisi akun bergeser (misal ada akun baru login atau filter berubah), warna avatar akun tersebut langsung berubah warna!
* **Solusi:** Ganti `colorId={activeAccounts.indexOf(...)}` menjadi `colorId={acc.color_id}`.

---

## 🎨 5. Audit Shadcn UI & Analisis Komponen Desain Sistem

Pemeriksaan menyeluruh dilakukan terhadap seluruh komponen di `frontend/src/components/ui/` (23 file), mendeteksi pemanfaatan komponen, dead code, komponen yang underused, serta area di mana kode ad-hoc/mentah mem-bypass standar UI library.

### 5.1 Matriks Inventaris Komponen Shadcn UI (23 File)

| Nama Komponen | Status Penggunaan | Jumlah File Pengguna | Catatan Penggunaan & Keterangan |
| :--- | :---: | :---: | :--- |
| **`accordion.tsx`** | ❌ **Dead Code (0%)** | 0 file | Sama sekali tidak pernah diimpor. Halaman `/broadcast/logs` malah membuat komponen manual `CycleAccordion`. |
| **`demo.tsx`** | ❌ **Dead Code (0%)** | 0 file | File boilerplate demo `Banner` & `Navbar5`. Tidak pernah dipakai di production. |
| **`navigation-menu.tsx`** | ❌ **Dead Code (0%)** | 0 file | Komponen Radix Navigation Menu menganggur 100%. |
| **`table.tsx`** | ⚠️ **Severely Underused** | 1 file | **Hanya digunakan di** [admin/smm/orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/smm/orders/page.tsx). 16 halaman tabel lainnya memakai tag HTML `<table>` mentah! |
| **`date-picker-range.tsx`** | ⚠️ **Single-use** | 1 file | **Hanya digunakan di** [orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx). Komponen pencarian chat dan filter lain memakai `<input type="date">` mentah. |
| **`calendar.tsx`** | ⚠️ **Internal Only** | 1 file | Hanya diimpor oleh `date-picker-range.tsx`. |
| **`popover.tsx`** | ⚠️ **Internal Only** | 1 file | Hanya diimpor oleh `date-picker-range.tsx`. |
| **`sheet.tsx`** | ⚠️ **Internal Only** | 1 file | Hanya dipakai di dalam [navbar-5.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/navbar-5.tsx) untuk drawer navigasi mobile landing page. |
| **`dialog.tsx`** | ⚠️ **Severely Underused** | 2 file | Hanya dipakai di `broadcast/group-lists/page.tsx` dan `subscriptions/page.tsx`. Ada 29 modal lain yang memakai `div fixed inset-0` manual! |
| **`avatar.tsx`** | ⚠️ **Underused** | 1 file | Hanya dipakai di `AccountAvatar.tsx`. Modul chat membuat komponen avatar terpisah (`ChatAvatar.tsx`). |
| **`label.tsx`** | ⚠️ **Underused** | 1 file | Hanya dipakai di `account-settings-page.tsx`. Form lain memakai tag `<label>` biasa. |
| **`banner.tsx`** | ℹ️ **Terbatas** | 2 file | Digunakan di `announcement-banner.tsx` dan `demo.tsx`. |
| **`badge.tsx`** | ✅ **Aktif** | 6 file | Dashboard, Orders, Auto-Join, SMM Order Manager. |
| **`brand-logo.tsx`** | ✅ **Aktif** | 8 file | Halaman autentikasi, Not Found, Sidebar, Footer, Navbar. |
| **`button.tsx`** | ✅ **Sangat Aktif** | 25 file | Komponen tombol universal di seluruh dashboard dan admin. |
| **`card.tsx`** | ✅ **Aktif** | 8 file | Admin, Dashboard, Orders Buy/Sell, SMM. |
| **`confirm-dialog.tsx`** | ✅ **Sangat Aktif** | 21 file | Dialog konfirmasi hapus akun, terminate device, clear logs, dll. |
| **`input.tsx`** | ✅ **Sedang** | 3 file | Admin auto-replies, account settings, admin general. |
| **`navbar-5.tsx`** | ✅ **Aktif** | 7 file | Halaman publik: Landing, Help, API Docs, Privacy, ToS. |
| **`skeleton.tsx`** | ✅ **Aktif** | 5 file | Loading placeholder akun dan settings. |
| **`skeleton-cards.tsx`** | ✅ **Sangat Aktif** | 17 file | Grid loading state di hampir seluruh halaman dashboard. |
| **`textarea.tsx`** | ✅ **Sedang** | 5 file | Broadcast teks, list grup, auto-join, bio akun. |
| **`toast.tsx`** | ✅ **Sangat Aktif** | 13 file | Notifikasi sukses/error berbasis toast di seluruh aksi CRUD. |

---

### 5.2 Temuan Kritis: Inkonsistensi & Bypassing Komponen UI

#### 1. Masalah Kritis Pagination: Tidak Ada `pagination.tsx` (11+ Implementasi Terfragmentasi)
* **Status:** Di `frontend/src/components/ui/` **sama sekali belum ada komponen `pagination.tsx`**.
* **Dampak:** Sebanyak **11 halaman/komponen berbeda** membuat sistem paginasi sendiri-sendiri dari nol dengan logika, markup, dan styling yang tidak seragam:
  1. [accounts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/page.tsx#L341): Menggunakan tag `<nav>`, tombol manual dengan ukuran `size-9`, dan helper `generatePageNumbers(page, totalPages)`.
  2. [auto-reply/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L617): Menggunakan `Array.from({ length: totalPages }).map`, ukuran padding `p-2`, algoritma elipsis buatan sendiri (`Math.abs(pageNum - page) > 2`), dan tombol Prev/Next **kehilangan class dark mode** (`bg-white border-gray-300 text-gray-700`).
  3. [orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L756): Membuat 2 tata letak terpisah (mobile `sm:hidden` & desktop `hidden sm:flex`), mengimpor shadcn `<Button>` tetapi melakukan iterasi halaman dan elipsis `...` secara manual.
  4. [contacts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx#L466): Pagination sederhana dengan tombol Prev/Next manual.
  5. [groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L182): Pagination manual tanpa elipsis.
  6. [public/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/public/page.tsx#L63): Pagination manual.
  7. [admin/users/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx#L543): Pagination manual dengan deretan nomor halaman.
  8. [admin/auto-replies/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/auto-replies/page.tsx#L421): Pagination manual.
  9. [admin/broadcasts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L151): Pagination manual.
  10. [admin/redeem-logs/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/redeem-logs/page.tsx#L103): Pagination manual dengan `generatePageNumbers()`.
  11. [cycle-accordion.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/broadcast/cycle-accordion.tsx#L132): Paginasi mini berupa teks `Page {page} of {totalPages}` dan tombol panah.

#### 2. Masalah Date Picker: Terisolasi di `/orders` Saja
* **Status:** Komponen [date-picker-range.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/date-picker-range.tsx) (beserta `calendar.tsx` & `popover.tsx`) sudah rapi dan siap pakai, namun **hanya terpasang di 1 halaman** ([orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx)).
* **Temuan Terkait:**
  - [ChatSearchBar.tsx (baris 90 & 97)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatSearchBar.tsx#L90): Fitur pencarian pesan Telegram berdasarkan rentang tanggal menggunakan tag HTML mentah `<input type="date" className="px-2 py-1 border border-slate-200 ...">` yang tampilan kalendernya bergantung pada UI browser bawaan OS.
  - [ScheduleModal.tsx (baris 67)](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduleModal.tsx#L67): Fitur jadwal kirim pesan chat menggunakan `<input type="datetime-local">` mentah.
  - Halaman riwayat tugas (Broadcast History, Broadcast Logs, Invite History, Invite Logs, Admin Broadcasts) sama sekali belum dilengkapi filter rentang tanggal.

#### 3. Bypassing Modal / Dialog (29 Tempat Menggunakan Overlay Manual)
* **Status:** Alih-alih memanfaatkan shadcn `<Dialog>` (yang berbasis `@base-ui/react/dialog` dengan penanganan fokus, accessibility, dan animasi backdrop otomatis), terdapat **29 tempat** yang membuat modal manual:
  - File bernama `-dialog.tsx` seperti [folder-manager-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/folder-manager-dialog.tsx#L191), [spam-appeal-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/spam-appeal-dialog.tsx#L193), dan [transfer-accounts-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx#L263) ternyata membuat overlay modal manual menggunakan `<div className="fixed inset-0 z-50 ...">`.
  - Seluruh modal di modul Chat ([ScheduleModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduleModal.tsx), [ScheduledQueueModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduledQueueModal.tsx), [ForwardModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ForwardModal.tsx), [PollDialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx)) dibuat manual.
  - Modal di Admin Users, Admin Auto-Replies, Admin Broadcasts, Groups-Channels Join, Contacts Import dibuat manual.

#### 4. Bypassing Table (16 Halaman Memakai `<table>` Mentah)
* **Status:** Shadcn [table.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/table.tsx) menyediakan wrapper responsif (`<Table>`, `<TableHeader>`, `<TableRow>`, `<TableHead>`, `<TableBody>`, `<TableCell>`), namun hanya dipakai di 1 file.
* Sebanyak 16 halaman lainnya (termasuk [orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L476), `admin/users`, `admin/broadcasts`, `broadcast/history`, `invite/logs`, dll.) mengulang penulisan class Tailwind manual pada tag `<table>`, `<th>`, dan `<td>`.

#### 5. Ketiadaan Komponen `Select` (28 Titik Menggunakan `<select>` HTML Mentah)
* Terdapat 28 tag `<select>` HTML mentah dengan border dan padding yang ditulis secara inline di setiap halaman, sehingga gaya dropdown antar halaman berbeda-beda saat di-hover/focus.

---

## 🛠️ 6. Rencana Aksi Perbaikan Lengkap (Action Plan)

| Prioritas | Target File | Tindakan Perbaikan | Dampak Efisiensi / Kualitas |
| :---: | :--- | :--- | :--- |
| **P0 (Tinggi)** | [accounts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/page.tsx) | Hapus `useAccounts()` (`limit=1000`) dan gunakan data `accountsSummary` / `paginatedData`. | Menghilangkan transfer ratusan KB JSON & mengurangi beban DB query drastis pada halaman Akun. |
| **P0 (Tinggi)** | [dashboard/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/dashboard/page.tsx) | Ubah `useAccounts()` menjadi `useAccountsPaginated({ page: 1, limit: 5 })`. | Dashboard memuat lebih instan, backend hanya menarik 5 record dari DB alih-alih 1.000 record. |
| **P1 (Selesai)** | [pagination.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/pagination.tsx) | ✅ **Selesai:** Komponen unified `Pagination` / `DataPagination` berbasis Base UI dibuat dan diintegrasikan ke 12 halaman/komponen. | Seluruh pagination kini seragam, mendukung penuh dark-mode, dan menghilangkan 12 duplikasi kode ad-hoc. |
| **P1 (Sedang)** | `frontend/src/components/ui/` | Hapus dead-code `accordion.tsx`, `demo.tsx`, dan `navigation-menu.tsx`. | Mengurangi ukuran bundle dan membersihkan dead code yang membingungkan developer. |
| **P1 (Sedang)** | [MessagePane.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx) | Ubah queryKey autocomplete member menjadi `["chat-members-suggest", accountId, chatId]`. | Menghilangkan konflik cache key dan mencegah bug daftar member grup kosong di drawer kanan. |
| **P1 (Sedang)** | [use-marketplace.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/hooks/use-marketplace.ts) | Tambahkan `staleTime: 5 * 60 * 1000` pada `useMarketplacePricing`. | Mengeliminasi re-fetch harga bursa berulang saat window focus pada 12 kartu akun. |
| **P1 (Sedang)** | [account_service.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/services/account_service.py) | Simpan file upload lokal langsung tanpa download ulang dari Telegram. | Menghemat 2–4 detik latensi saat user mengganti foto profil akun. |
| **P1 (Sedang)** | [accounts.py](file:///d:/PROJECT/Telegram/TeleBos/backend/app/api/accounts.py) | Hapus endpoint dead-code `GET /{account_id}/photo-token`. | Menghapus kode mubazir yang tidak pernah dipakai. |
| **P1 (Sedang)** | [ChatAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatAvatar.tsx) & [avatar.ts](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/lib/avatar.ts) | Seragamkan palet warna fallback ke **solid flat** mengikuti `AccountAvatar.tsx`. | Menghilangkan inkonsistensi visual avatar antar halaman. |
| **P1 (Sedang)** | [invite/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx) | Teruskan props lengkap (`telegramId`, `hasProfilePhoto`, `isActive`, `profilePhotoPath`) ke `<AccountAvatar>`. | Menghilangkan error console 404 pada akun expired di halaman invite. |
| **P1 (Sedang)** | [AccountSwitcher.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/AccountSwitcher.tsx) | Ganti `colorId={activeAccounts.indexOf(acc)}` menjadi `colorId={acc.color_id}`. | Menjaga konsistensi warna avatar akun agar tidak berubah-ubah saat posisi array bergeser. |
| **P2 (Rendah)** | [ChatSearchBar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatSearchBar.tsx) | Ganti native `<input type="date">` dengan `DatePickerWithRange` / `Calendar`. | Desain kalender konsisten dan modern mengikuti tema aplikasi (dark/light). |
| **P2 (Rendah)** | [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) | Ganti hardcoded URL string cover photo menjadi `getChatPhotoUrl()`. | Konsistensi pemanggilan URL foto. |
| **P2 (Rendah)** | Halaman-halaman tabel (16 file) | Bertahap migrasikan tag `<table>` mentah ke komponen `<Table>` shadcn. | Konsistensi padding, border, hover state, dan scroll container tabel. |

---

*Laporan audit ini disimpan secara permanen di repositori pada file `audit-telebos.md` untuk referensi arsitektur dan panduan optimasi performa.*
