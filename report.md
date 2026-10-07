# 📋 LAPORAN AUDIT FRONTEND DASHBOARD TELEBOS
## Analisis Komponen Shadcn / Radix UI vs Re-Implementasi Manual (Ad-hoc / Bypassed)

> **Tanggal Audit:** 8 Oktober 2026  
> **Cakupan:** `frontend/src/app/(dashboard)` & `frontend/src/components`  
> **Tujuan:** Mengidentifikasi komponen UI yang telah disediakan oleh Shadcn UI / Radix UI di `frontend/src/components/ui/` namun dibuat ulang secara manual (ad-hoc / raw HTML) di berbagai modul dashboard.

---

## 📌 1. Ringkasan Eksekutif (Executive Summary)

Frontend TeleBos telah mengonfigurasi dan menginstal dependensi `@radix-ui/*` lengkap dengan koleksi komponen resmi di `frontend/src/components/ui/`. Namun, dalam penerapannya di dashboard, terjadi fenomena **Severe UI Bypassing**:
1. **Komponen Menganggur (Zero-Import - 0% Utilisasi):** Terdapat komponen kelas utama yang sudah siap pakai di `components/ui/` seperti `Select`, `Switch`, `Checkbox`, dan `Sidebar`, tetapi **sama sekali tidak diimpor (0 file)** di seluruh dashboard.
2. **Duplikasi Kode Berulang:** Fitur-fitur fundamental seperti modal/dialog, toggle switch, tab navigation, dan status badge dibuat ulang secara manual puluhan kali menggunakan tag HTML mentah (`<select>`, `<input type="checkbox">`) dan kombinasi Tailwind inline (`fixed inset-0`, `rounded-full`, dll).
3. **Dampak Langsung:**
   - **Aksesibilitas Rendah (A11y):** Modal manual tidak memiliki focus trap dan keyboard navigation (Escape); select mentah tidak memiliki keyboard shortcut navigasi arrow; switch manual tidak memiliki `role="switch"`.
   - **Inkonsistensi Dark/Light Mode:** Dropdown native browser tampil kaku tanpa styling tema yang mulus.
   - **Beban Pemeliharaan (Maintenance Debt):** Memperbaiki satu interaksi UI membutuhkan perubahan di puluhan file berbeda.

---

## 📊 2. Matriks Inventaris Komponen UI

| Komponen Shadcn / Radix UI | File UI Library | Primitif Dasar | Status Penggunaan Resmi | Jumlah Bypassed / Re-implementasi | Tingkat Urgensi |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Select** | [select.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/select.tsx) | `@radix-ui/react-select` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa** (seluruh 37+ lokasi telah dimigrasi ke `<Select>`) | **Tuntas (P0 - Fase 1)** |
| **Switch** | [switch.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/switch.tsx) | `@radix-ui/react-switch` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa** (seluruh class `.tg-toggle` & `peer-checked` dimigrasi ke `<Switch>`) | **Tuntas (P0 - Fase 1)** |
| **Checkbox** | [checkbox.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/checkbox.tsx) | `@radix-ui/react-checkbox` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa di dashboard** (seluruh 24 lokasi tabel & modal dimigrasi ke `<Checkbox>`) | **Tuntas (P0 - Fase 1)** |
| **Dialog / Modal** | [dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/dialog.tsx) | `@radix-ui/react-dialog` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa di modul dashboard** (seluruh 20+ modal dimigrasikan ke `<Dialog>`) | **Tuntas (P1 - Fase 2)** |
| **Tabs** | [tabs.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tabs.tsx) | `@radix-ui/react-tabs` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa di dashboard** (seluruh 12 modul tab dimigrasikan ke `<Tabs>`) | **Tuntas (P1 - Fase 2)** |
| **Sidebar** | [sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/sidebar.tsx) | Shadcn Sidebar v4 | 🔴 **0 file (0%)** | [sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/sidebar.tsx) (917 baris) dibuat manual dari nol | **Sedang (P2)** |
| **Avatar** | [avatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/avatar.tsx) | `@radix-ui/react-avatar` | ⚠️ **1 file** | [ChatAvatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatAvatar.tsx) membuat ulang fallback logic | **Sedang (P2)** |
| **Badge** | [badge.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/badge.tsx) | Shadcn CVA Badge | ⚠️ **4 file** | **36+ lokasi** manual `<span className="rounded-full">` | **Sedang (P2)** |
| **Tooltip** | [tooltip.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tooltip.tsx) | `@radix-ui/react-tooltip` | ⚠️ **1 file** | **50+ icon button** memakai atribut native `title="..."` | **Rendah (P3)** |
| **Sheet / Drawer** | [sheet.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/sheet.tsx) | `@radix-ui/react-dialog` | ⚠️ **2 file** | Panel kanan chat & mobile drawer dibuat manual | **Sedang (P2)** |
| **Input & Label** | [input.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/input.tsx), [label.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/label.tsx) | Native + `@radix-ui/react-label` | ⚠️ **3 file & 1 file** | Hampir seluruh form admin & transaksi memakai tag mentah | **Sedang (P2)** |

---

## 🔍 3. Rincian Temuan & Lokasi Kode Bypassed

### 3.1 `Select` (`@radix-ui/react-select` -> `components/ui/select.tsx`)
* **Kondisi Komponen:** File [select.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/select.tsx) (161 baris) telah mengimplementasikan `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue` dengan animasi popover, scrolling button, dan focus state rapi.
* **Tingkat Penggunaan:** **0 import (0%)**.
* **Re-implementasi Manual (37 Titik):**
  1. [orders/smm-order-manager.tsx#L496](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/orders/smm-order-manager.tsx#L496) — Filter kategori layanan SMM.
  2. [PollDialog.tsx#L163](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx#L163) — Pilihan durasi polling pesan.
  3. [spam-appeal-dialog.tsx#L322](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/spam-appeal-dialog.tsx#L322) — Pilihan alasan banding spamblock.
  4. [account-settings-page.tsx#L333](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx#L333) — Pilihan privasi & 2FA akun.
  5. [wallet/page.tsx#L914](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx#L914), [L939](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx#L939), [L1180](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx#L1180) — Filter jenis transaksi, filter status dompet, dan pilihan bank pencairan dana.
  6. [settings/page.tsx#L1676](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/settings/page.tsx#L1676) — Dropdown daftar bank penarikan saldo.
  7. [invite/page.tsx#L319](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx#L319), [L367](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx#L367) — Pilihan akun pengirim invite & interval delay.
  8. [invite/logs/page.tsx#L120](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/logs/page.tsx#L120), [L133](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/logs/page.tsx#L133) — Filter akun & status eksekusi invite.
  9. [orders/page.tsx#L1066](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L1066) — Filter status riwayat pesanan (Semua, Pending, Selesai, Batal).
  10. [orders/buy-accounts/page.tsx#L443](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/buy-accounts/page.tsx#L443) — Filter negara akun marketplace.
  11. [contacts/page.tsx#L339](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx#L339) — Filter akun kontak Telegram.
  12. [groups-channels/public/page.tsx#L209](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/public/page.tsx#L209) — Filter akun grup publik.
  13. [groups-channels/auto-join/page.tsx#L665](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/auto-join/page.tsx#L665) — Pilihan akun target auto-join.
  14. [groups-channels/page.tsx#L238](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L238) — Filter akun grup/channel.
  15. [broadcast/group-lists/page.tsx#L414](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/group-lists/page.tsx#L414) — Filter daftar target grup.
  16. [broadcast/logs/page.tsx#L191](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/logs/page.tsx#L191), [L237](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/logs/page.tsx#L237) — Filter siklus & status siaran.
  17. [broadcast/new/page.tsx#L408](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx#L408), [L454](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx#L454) — Pilihan template pesan & target penerima broadcast.
  18. [admin/users/page.tsx#L488](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx#L488), [L921](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx#L921) — Filter role user & opsi status blokir akun.
  19. [admin/transactions/page.tsx#L386](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/transactions/page.tsx#L386) — Filter tipe transaksi admin.
  20. [admin/smm/services/page.tsx#L213](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/smm/services/page.tsx#L213), [L321](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/smm/services/page.tsx#L321) — Filter kategori & status layanan SMM.
  21. [admin/smm/orders/page.tsx#L133](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/smm/orders/page.tsx#L133) — Filter status pesanan SMM admin.
  22. [admin/redeem-codes/page.tsx#L172](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/redeem-codes/page.tsx#L172), [L188](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/redeem-codes/page.tsx#L188) — Tipe benefit kupon & masa berlaku kupon.
  23. [admin/broadcasts/page.tsx#L630](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L630), [L647](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L647), [L661](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L661) — Filter broadcast admin.
  24. [date-time-picker.tsx#L128](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/date-time-picker.tsx#L128), [L141](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/date-time-picker.tsx#L141) — Pilihan angka jam dan menit.

---

### 3.2 `Switch` (`@radix-ui/react-switch` -> `components/ui/switch.tsx`)
* **Kondisi Komponen:** File [switch.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/switch.tsx) (30 baris) menggunakan `@radix-ui/react-switch` dengan styling focus ring dan transisi thumb checked.
* **Tingkat Penggunaan:** **0 import (0%)**.
* **Re-implementasi Manual:**
  1. **Custom CSS Class `.tg-toggle` di [chat.css#L842-L870](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/chat.css#L842-L870)**:
     - [ChatRightColumn.tsx#L317](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx#L317): Toggle notifikasi percakapan (`<button className={`tg-toggle${notificationsOn ? " is-on" : ""}`}>`).
     - [ChatLeftColumn.tsx#L408](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatLeftColumn.tsx#L408): Toggle dark/light theme pada modul chat (`<button className={`tg-toggle${tgTheme === "dark" ? " is-on" : ""}`}>`).
  2. **Tailwind Pseudo-Element `peer-checked:after:translate-x-full`**:
     - [auto-reply/page.tsx#L321](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L321), [L558](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L558), [L618](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L618): Toggle status aktif auto-reply akun Telegram.
     - [account-settings-page.tsx#L995](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx#L995): Toggle switch status akun.

---

### 3.3 `Checkbox` (`@radix-ui/react-checkbox` -> `components/ui/checkbox.tsx`)
* **Kondisi Komponen:** File [checkbox.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/checkbox.tsx) (31 baris) menggunakan `@radix-ui/react-checkbox` dengan icon `Check` dan status checked otomatis.
* **Tingkat Penggunaan:** **0 import (0%)**.
* **Re-implementasi Manual (24 Titik):**
  1. Dibuat komponen terpisah [public-checkbox.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/public/public-checkbox.tsx) yang membungkus native input checkbox.
  2. [orders/sell-accounts/page.tsx#L390](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/sell-accounts/page.tsx#L390), [L424](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/sell-accounts/page.tsx#L424), [L509](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/sell-accounts/page.tsx#L509) — Checkbox "Select All" dan pemilihan akun marketplace.
  3. [folder-manager-dialog.tsx#L262](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/folder-manager-dialog.tsx#L262) — Checkbox pemilihan akun masuk folder.
  4. [transfer-accounts-dialog.tsx#L563](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx#L563) — Checkbox memilih akun untuk ditransfer.
  5. [PollDialog.tsx#L136](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx#L136), [L148](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx#L148) — Checkbox opsi polling (Multiple Answers & Anonymous Voting).
  6. [settings/page.tsx#L1447](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/settings/page.tsx#L1447), [L1738](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/settings/page.tsx#L1738) — Checkbox hak akses izin API Key & notifikasi.
  7. [invite/page.tsx#L279](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/invite/page.tsx#L279) — Checkbox memilih akun eksekutor invite massal.
  8. [broadcast/new/page.tsx#L368](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx#L368), [L490](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx#L490), [L547](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/new/page.tsx#L547) — Checkbox broadcast.
  9. [auto-reply/page.tsx#L316](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L316), [L400](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L400), [L439](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L439), [L553](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L553), [L613](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/auto-reply/page.tsx#L613) — Checkbox auto-reply.
  10. [admin/settings/page.tsx#L654](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/settings/page.tsx#L654), [L694](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/settings/page.tsx#L694), [L714](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/settings/page.tsx#L714) — Checkbox pengaturan konfigurasi sistem admin.

---

### 3.4 `Dialog` / Modal (`@radix-ui/react-dialog` -> `components/ui/dialog.tsx`) — 🟢 **SELESAI (100% Migrasi)**
* **Kondisi Komponen:** File [dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/dialog.tsx) lengkap dengan `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, dan `DialogDescription`.
* **Status Implementasi:** **100% Selesai di Fase 2**. Seluruh modal manual berbasis `fixed inset-0` dan `createPortal` telah dimigrasikan ke Shadcn `<Dialog>`.
* **Keuntungan yang Diperoleh:** Focus trap otomatis, penutupan dengan tombol `Escape`, backdrop scroll locking bawaan Radix, dan penghilangan duplikasi CSS keyframe kustom.
* **Daftar File yang Telah Dimigrasi:**
  1. [groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx) — Modal gabung grup/channel publik & privat.
  2. [orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx) — Modal struk rincian pesanan.
  3. [wallet/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx) — Modal rincian & bukti mutasi saldo.
  4. [contacts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx) — Modal Import Kontak (manual/file) & Export Kontak.
  5. [orders/buy-accounts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/buy-accounts/page.tsx) — Modal serah terima custody akun Telegram.
  6. [admin/users/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx) — Modal Detail User, Penyesuaian Saldo, & Suspend User.
  7. [admin/transactions/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/transactions/page.tsx) — Modal Audit Transaksi & Alasan Tolak.
  8. [admin/redeem-codes/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/redeem-codes/page.tsx) — Modal Buat Kode Redeem Kupon.
  9. [admin/broadcasts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx) — Modal Rincian Job Broadcast & Peringatan Konflik Duplikat.
  10. [admin/auto-replies/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/auto-replies/page.tsx) — Modal Preview Pesan Auto-Reply.
  11. [spam-appeal-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/spam-appeal-dialog.tsx) — Wizard Dialog Banding Spamblock (Idle, Warning, Captcha, Success).
  12. [transfer-accounts-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx) — Dialog Transfer Kepemilikan Akun Telegram.
  13. [folder-manager-dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/folder-manager-dialog.tsx) — Dialog Manajemen Folder Akun & Anggota.
  14. [ScheduleModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduleModal.tsx) — Modal Jadwalkan Pesan Obrolan.
  15. [ScheduledQueueModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduledQueueModal.tsx) — Modal Antrean Pesan Terjadwal.
  16. [ForwardModal.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ForwardModal.tsx) — Modal Teruskan Pesan ke Chat Lain.
  17. [PollDialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx) — Modal Buat Polling / Kuis Telegram.

---

### 3.5 `Tabs` (`@radix-ui/react-tabs` -> `components/ui/tabs.tsx`) — 🟢 **SELESAI (100% Migrasi)**
* **Kondisi Komponen:** File [tabs.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tabs.tsx) (50 baris) menyediakan `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` dengan accessibility `role="tab"` dan keyboard navigation otomatis (panah kiri/kanan).
* **Status Implementasi:** **100% Selesai di Fase 2**. Seluruh implementasi tab tombol manual telah distandarisasi ke `<Tabs>`.
* **Daftar File yang Telah Dimigrasi:**
  1. [groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx) — Filter tab Grup vs Channel.
  2. [groups-channels/public/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/public/page.tsx) — Tab navigasi Channel Publik.
  3. [accounts/[id]/groups-channels/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/groups-channels/page.tsx) — Tab Grup vs Channel per akun.
  4. [accounts/add/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/add/page.tsx) — Tab metode tambah akun (QR Code vs Nomor Telepon vs Session File).
  5. [text-editor.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/text-editor.tsx) — Tab mode Tulis vs Preview pesan.
  6. [EmojiPicker.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/EmojiPicker.tsx) — Tab kategori Emoji, Stiker, dan GIF.
  7. [ChatRightColumn.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx) — Tab Berkas, Media, Tautan obrolan.
  8. [orders/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx) — Ribbon tabs kategori pesanan (All, SMM, Accounts, Topup, Withdraw).
  9. [wallet/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx) — Tab Topup vs Withdraw & Tab filter jenis mutasi dompet.
  10. [contacts/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx) — Tab mode Import Kontak (Manual vs File CSV/VCF).
  11. [admin/transactions/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/transactions/page.tsx) — Tab filter tipe transaksi sistem.
  12. [admin/auto-replies/page.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/auto-replies/page.tsx) — Tab filter status bot responder (All, Running, Stopped).

---

### 3.6 `Sidebar` (`components/ui/sidebar.tsx`)
* **Kondisi Komponen:** File [sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/sidebar.tsx) (23.7 KB) adalah komponen sidebar modern standar Shadcn UI v4 lengkap dengan `SidebarProvider`, `SidebarTrigger`, `SidebarRail`, responsive sheet drawer mobile, dan shortcut `Cmd+B`.
* **Tingkat Penggunaan:** **0 import (0%)**.
* **Re-implementasi Manual:** Seluruh sidebar dashboard dibangun manual di [components/layout/sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/sidebar.tsx) sepanjang 917 baris kode, dengan custom state Zustand (`useAppStore`), custom animasi expand/collapse, manual backdrop overlay mobile, dan custom submenu rendering.

---

### 3.7 `Avatar` (`@radix-ui/react-avatar` -> `components/ui/avatar.tsx`)
* **Kondisi Komponen:** File [avatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/avatar.tsx) mengelola status loading, fallback gambar error, dan inisial teks secara otomatis.
* **Tingkat Penggunaan:** Hanya di [account-avatar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-avatar.tsx#L4).
* **Re-implementasi Manual:** [ChatAvatar.tsx#L61-L125](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatAvatar.tsx#L61-L125) membuat ulang seluruh logika Radix Avatar:
  - Menyimpan state `const [failedUrl, setFailedUrl] = useState<string | null>(null);`
  - Menangani error gambar manual dengan `onError={() => setFailedUrl(photoUrl)}` pada tag `<img>`.
  - Merender fallback initials di dalam wrapper `div` manual alih-alih menggunakan `<AvatarFallback>`.

---

### 3.8 `Badge` (`components/ui/badge.tsx`)
* **Kondisi Komponen:** File [badge.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/badge.tsx) menyediakan varian semantik standar: `default`, `secondary`, `destructive`, `success`, `warning`, `info`, `outline`.
* **Tingkat Penggunaan:** Hanya di 4 file (`settings-cards.tsx`, `settings/page.tsx`, `groups-channels/auto-join/page.tsx`, `dashboard/page.tsx`).
* **Re-implementasi Manual (36+ Titik):**
  Menggunakan pola span ad-hoc: `<span className="px-2 py-0.5 rounded-full text-xs font-medium ...">` dengan class warna yang berbeda-beda:
  - [account-card.tsx#L276-L300](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-card.tsx#L276-L300) (Status akun: Active, Banned, Spamblock, Expired).
  - [transfer-accounts-dialog.tsx#L417](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx#L417).
  - [navbar.tsx#L186](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/navbar.tsx#L186) & [sidebar.tsx#L688](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/sidebar.tsx#L688) (Role badge).
  - [admin/users/page.tsx#L689](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx#L689).
  - [admin/transactions/page.tsx#L517](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/transactions/page.tsx#L517).
  - [admin/broadcasts/page.tsx#L620, L1006](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L620).
  - [broadcast/logs/page.tsx#L209, L335, L361](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/logs/page.tsx#L209).
  - [broadcast/history/page.tsx#L140](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/broadcast/history/page.tsx#L140).
  - [accounts/[id]/page.tsx#L202-L268](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/page.tsx#L202-L268).

---

### 3.9 `Tooltip` (`@radix-ui/react-tooltip` -> `components/ui/tooltip.tsx`)
* **Kondisi Komponen:** File [tooltip.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tooltip.tsx) sudah mendukung portal popover dan delay animasi.
* **Tingkat Penggunaan:** Hanya diimpor oleh sidebar layout.
* **Re-implementasi Manual (50+ Tombol):**
  Menggunakan atribut native browser `title="..."` pada tombol icon di modul Chat ([MessagePane.tsx#L717](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/MessagePane.tsx#L717), [ChatSearchBar.tsx#L82](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatSearchBar.tsx#L82)), Orders ([orders/page.tsx#L791, L1110, L1291](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L791)), Wallet, dan Settings. Tooltip native ini lambat muncul (1–2 detik) dan bentuknya tidak mengikuti tema dark/light aplikasi.

---

## 🎯 4. Rencana Aksi Refactoring (Action Plan)

### Fase 1: Prioritas P0 (Quick Wins & Dampak Visual Terbesar) — ✅ **SELESAI (COMPLETED)**
*Status: 100% Selesai & Lulus Typecheck (`npm run typecheck` 0 errors)*

1. **Migrasi Dropdown `<select>` ke `Select` Shadcn:** ✅
   - Seluruh 37+ lokasi `<select>` mentah di seluruh modul dashboard dan dialog kini telah diganti dengan Shadcn `<Select>` (`@radix-ui/react-select`).
   - Penanganan sentinel value `_none` / `all` telah diterapkan untuk opsi default/reset agar tidak memicu error Radix `value=""`.
   - Modul yang dimigrasi: `wallet`, `orders`, `buy-accounts`, `smm-order-manager`, `invite`, `invite/logs`, `broadcast/new`, `broadcast/logs`, `broadcast/group-lists`, `settings`, `admin/users`, `admin/transactions`, `admin/broadcasts`, `admin/redeem-codes`, `admin/smm/services`, `admin/smm/orders`, `contacts`, `groups-channels`, `groups-channels/public`, `groups-channels/auto-join`, `PollDialog`, `spam-appeal-dialog`, `account-settings-page`, `date-time-picker`.
2. **Migrasi Toggle ke `Switch` Shadcn:** ✅
   - Class CSS `.tg-toggle` di `ChatRightColumn.tsx` & `ChatLeftColumn.tsx` diganti dengan `<Switch>`.
   - Pseudo-element `peer-checked` di `account-settings-page.tsx`, `auto-reply/page.tsx`, dan `admin/settings/page.tsx` diganti dengan `<Switch>`.
3. **Migrasi Checkbox ke `Checkbox` Shadcn:** ✅
   - Standarisasi seluruh 24 input checkbox tabel header ("Select All"), tabel rows, batch actions, dan modal ke `<Checkbox>` (`@radix-ui/react-checkbox`).
   - Modul yang dimigrasi: `auto-reply`, `orders/sell-accounts`, `invite`, `broadcast/new`, `settings`, `admin/settings`, `groups-channels/auto-join`, `PollDialog`, `folder-manager-dialog`, `transfer-accounts-dialog`.

### Fase 2: Prioritas P1 (Aksesibilitas & Menghilangkan Duplikasi Overlay / Tabs) — ✅ **SELESAI (COMPLETED)**
*Status: 100% Selesai & Lulus Typecheck (`npx tsc --noEmit` 0 errors, Next.js build 60/60 routes sukses, Deployed to VPS `94.237.73.186`)*

1. **Standarisasi 20+ Modal ke `Dialog` Shadcn (`@radix-ui/react-dialog`):** ✅
   - Seluruh modal custom berbasis `fixed inset-0 z-50` dan `createPortal(..., document.body)` telah diganti dengan `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`.
   - Mengeliminasi kode repetitif event listener `Escape`, manual backdrop, dan scroll lock kustom.
   - Modul yang dimigrasi:
     - `groups-channels/page.tsx` (Modal Join Group/Channel)
     - `orders/page.tsx` (Modal struk detail pesanan)
     - `wallet/page.tsx` (Modal struk rincian mutasi)
     - `contacts/page.tsx` (Modal Import & Export Kontak)
     - `orders/buy-accounts/page.tsx` (Modal serah terima custody akun)
     - `admin/users/page.tsx` (Modal Detail User, Saldo, Suspend)
     - `admin/transactions/page.tsx` (Modal Audit & Alasan Tolak)
     - `admin/redeem-codes/page.tsx` (Modal Buat Kode Redeem)
     - `admin/broadcasts/page.tsx` (Modal Detail Job & Conflict Warning)
     - `admin/auto-replies/page.tsx` (Modal Preview Pesan Auto-Reply)
     - `spam-appeal-dialog.tsx` (Modal wizard banding spamblock)
     - `transfer-accounts-dialog.tsx` (Modal transfer kepemilikan akun)
     - `folder-manager-dialog.tsx` (Modal kelola folder & anggota akun)
     - `ScheduleModal.tsx` (Modal jadwalkan pesan obrolan)
     - `ScheduledQueueModal.tsx` (Modal antrean pesan terjadwal)
     - `ForwardModal.tsx` (Modal teruskan pesan obrolan)
     - `PollDialog.tsx` (Modal buat polling & kuis)

2. **Migrasi Button Tab ke `Tabs` Shadcn (`@radix-ui/react-tabs`):** ✅
   - Seluruh navigasi tab tombol berbasis state manual `useState` telah distandarisasi ke `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`.
   - Modul yang dimigrasi:
     - `groups-channels/page.tsx` (Tab Grup vs Channel)
     - `groups-channels/public/page.tsx` (Tab Channel Publik)
     - `accounts/[id]/groups-channels/page.tsx` (Tab Grup vs Channel per akun)
     - `accounts/add/page.tsx` (Tab metode tambah akun)
     - `text-editor.tsx` (Tab Tulis vs Preview)
     - `EmojiPicker.tsx` (Tab kategori Emoji/Stiker)
     - `ChatRightColumn.tsx` (Tab Berkas & Media obrolan)
     - `orders/page.tsx` (Ribbon tabs kategori pesanan)
     - `wallet/page.tsx` (Tab Topup vs Withdraw & Tab filter transaksi)
     - `contacts/page.tsx` (Tab mode Import Manual vs File)
     - `admin/transactions/page.tsx` (Tab filter tipe transaksi)
     - `admin/auto-replies/page.tsx` (Tab filter status bot responder)

### Fase 3: Prioritas P2 (Konsistensi Desain & Pembersihan Dead Code) — ⏳ **BERIKUTNYA**
1. **Unified Status Badge:**
   - Ganti span `rounded-full` ad-hoc dengan `<Badge variant="...">`.
2. **Standardisasi Tooltip:**
   - Ganti atribut `title="..."` pada icon action buttons penting dengan `<Tooltip>`.
3. **Pembersihan / Integrasi Sidebar:**
   - Putuskan apakah akan mengintegrasikan `components/ui/sidebar.tsx` atau menghapus file tersebut jika arsitektur custom sidebar `components/layout/sidebar.tsx` tetap dipertahankan sebagai domain-specific component.
