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
| **Select** | [select.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/select.tsx) | `@radix-ui/react-select` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa** (seluruh 37+ lokasi telah dimigrasi ke `<Select>`) | **Tuntas (P0)** |
| **Switch** | [switch.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/switch.tsx) | `@radix-ui/react-switch` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa** (seluruh class `.tg-toggle` & `peer-checked` dimigrasi ke `<Switch>`) | **Tuntas (P0)** |
| **Checkbox** | [checkbox.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/checkbox.tsx) | `@radix-ui/react-checkbox` | 🟢 **SELESAI (100% Migrasi)** | **0 sisa di dashboard** (seluruh 24 lokasi tabel & modal dimigrasi ke `<Checkbox>`) | **Tuntas (P0)** |
| **Sidebar** | [sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/sidebar.tsx) | Shadcn Sidebar v4 | 🔴 **0 file (0%)** | [sidebar.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/layout/sidebar.tsx) (917 baris) dibuat manual dari nol | **Sedang (P2)** |
| **Dialog / Modal** | [dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/dialog.tsx) | `@radix-ui/react-dialog` | ⚠️ **5 file** | **20+ modal** manual dengan `fixed inset-0` | **Tinggi (P1)** |
| **Tabs** | [tabs.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tabs.tsx) | `@radix-ui/react-tabs` | ⚠️ **1 file** | **9 modul** membuat tab manual via `useState` | **Tinggi (P1)** |
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

### 3.4 `Dialog` / Modal (`@radix-ui/react-dialog` -> `components/ui/dialog.tsx`)
* **Kondisi Komponen:** File [dialog.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/dialog.tsx) lengkap dengan `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, dan `DialogClose`.
* **Tingkat Penggunaan:** Hanya dipakai di 5 file (`confirm-dialog.tsx`, `text-editor.tsx`, `profile-card.tsx`, `subscriptions/page.tsx`, `group-lists/page.tsx`).
* **Re-implementasi Manual (20+ File Overlay Kustom):**
  - Menggunakan pola overlay: `<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm ...">`
  - Tidak ada penanganan tombol Escape keyboard terintegrasi.
  - Membuka modal berisiko bentrok z-index dengan dropdown/popover lain.
  - **Daftar File Bypassed:**
    1. [spam-appeal-dialog.tsx#L193](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/spam-appeal-dialog.tsx#L193)
    2. [transfer-accounts-dialog.tsx#L263](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/transfer-accounts-dialog.tsx#L263)
    3. [folder-manager-dialog.tsx#L191](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/folder-manager-dialog.tsx#L191)
    4. [smm-order-manager.tsx#L849](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/orders/smm-order-manager.tsx#L849)
    5. [LightboxModal.tsx#L30](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/LightboxModal.tsx#L30)
    6. [ScheduledQueueModal.tsx#L43](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduledQueueModal.tsx#L43)
    7. [ScheduleModal.tsx#L43](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ScheduleModal.tsx#L43)
    8. [PollDialog.tsx#L49](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/PollDialog.tsx#L49)
    9. [ForwardModal.tsx#L51](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ForwardModal.tsx#L51)
    10. [ChatLeftColumn.tsx#L925, L973](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatLeftColumn.tsx#L925)
    11. [wallet/page.tsx#L1326](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx#L1326)
    12. [orders/buy-accounts/page.tsx#L776](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/buy-accounts/page.tsx#L776)
    13. [orders/page.tsx#L1736](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L1736)
    14. [groups-channels/page.tsx#L447](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L447)
    15. [contacts/page.tsx#L652, L818](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/contacts/page.tsx#L652)
    16. [admin/users/page.tsx#L673, L835, L899](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/users/page.tsx#L673)
    17. [admin/transactions/page.tsx#L580, L685](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/transactions/page.tsx#L580)
    18. [admin/redeem-codes/page.tsx#L137](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/redeem-codes/page.tsx#L137)
    19. [admin/broadcasts/page.tsx#L998](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/broadcasts/page.tsx#L998)
    20. [admin/auto-replies/page.tsx#L439](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/auto-replies/page.tsx#L439)

---

### 3.5 `Tabs` (`@radix-ui/react-tabs` -> `components/ui/tabs.tsx`)
* **Kondisi Komponen:** File [tabs.tsx](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/tabs.tsx) (50 baris) menyediakan `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` dengan accessibility `role="tab"` dan keyboard navigation otomatis (panah kiri/kanan).
* **Tingkat Penggunaan:** Hanya di 1 file ([admin/settings/page.tsx#L41](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/admin/settings/page.tsx#L41)).
* **Re-implementasi Manual (9 Modul):**
  Semua modul berikut membuat state `const [activeTab, setActiveTab] = useState(...)` dan merender tombol `<button onClick={() => setActiveTab(...)} className="...">` secara manual:
  1. [orders/page.tsx#L170](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/orders/page.tsx#L170) — Tab All, SMM, Accounts, Deposits, Withdrawals.
  2. [wallet/page.tsx#L136](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/wallet/page.tsx#L136) — Tab Topup vs Withdraw.
  3. [settings/page.tsx#L83](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/settings/page.tsx#L83) — Tab Profile, Security, 2FA, API Keys, Rekening, dsb.
  4. [groups-channels/page.tsx#L46](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/page.tsx#L46) & [public/page.tsx#L41](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/groups-channels/public/page.tsx#L41) & [accounts/[id]/groups-channels/page.tsx#L24](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/%5Bid%5D/groups-channels/page.tsx#L24) — Tab Groups vs Channels.
  5. [accounts/add/page.tsx#L15](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/app/%28dashboard%29/accounts/add/page.tsx#L15) — Tab OTP vs Upload vs QR.
  6. [ChatRightColumn.tsx#L65](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/ChatRightColumn.tsx#L65) — Tab Info, Members, Admins, Permissions, Links.
  7. [EmojiPicker.tsx#L143](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/chat/EmojiPicker.tsx#L143) — Tab Emoji, Sticker, GIF.
  8. [text-editor.tsx#L48](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/ui/text-editor.tsx#L48) — Tab Edit vs Preview.
  9. [account-settings-page.tsx#L504](file:///d:/PROJECT/Telegram/TeleBos/frontend/src/components/accounts/account-settings-page.tsx#L504) — Tab Main, Change, Forgot, Recovery.

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

### Fase 2: Prioritas P1 (Aksesibilitas & Menghilangkan Duplikasi Overlay)
1. **Standarisasi 20+ Modal ke `Dialog` Shadcn:**
   - Ganti wrapper `fixed inset-0` dengan `<Dialog>` dan `<DialogContent>`.
   - Mengeliminasi potensi bug z-index stacking context serta otomatis mendukung penutupan modal via tombol `Esc`.
2. **Migrasi Button Tab ke `Tabs` Shadcn:**
   - Konversikan navigasi tab di `orders/page.tsx`, `wallet/page.tsx`, dan `settings/page.tsx` ke `<Tabs>`, `<TabsList>`, dan `<TabsTrigger>`.

### Fase 3: Prioritas P2 (Konsistensi Desain & Pembersihan Dead Code)
1. **Unified Status Badge:**
   - Ganti seluruh span `rounded-full` ad-hoc dengan `<Badge variant="...">`.
2. **Standardisasi Tooltip:**
   - Ganti atribut `title="..."` pada icon action buttons penting dengan `<Tooltip>`.
3. **Pembersihan / Integrasi Sidebar:**
   - Putuskan apakah akan mengintegrasikan `components/ui/sidebar.tsx` atau menghapus file tersebut jika arsitektur custom sidebar `components/layout/sidebar.tsx` tetap dipertahankan sebagai domain-specific component.
