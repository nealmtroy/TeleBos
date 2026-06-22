# Sell & Buy Accounts Feature

## Overview

Tambahkan fitur jual beli akun pada halaman Orders dengan 2 tab terpisah:

- Buy Accounts
- Sell Accounts

Semua user diperbolehkan menjual akun.

---

## Sell Accounts

### Rules

- Semua role dapat menjual akun.
- Role Basic tetap memiliki limit maksimal 1 akun aktif pada sistem.
- Limit tersebut tidak membatasi jumlah akun yang dapat dijual.

### Sell Accounts Page

Halaman Sell Accounts menampilkan seluruh akun yang memenuhi syarat untuk dijual.

Contoh:

USER ID 1 - Rp5.500

User dapat memilih salah satu atau beberapa akun yang tersedia untuk dijual.

### Sell From Accounts Page

Pada halaman /accounts tambahkan tombol:

Sell Account

Saat tombol diklik, tampilkan modal konfirmasi yang berisi:

- User ID akun
- Harga jual akun
- Saldo yang akan diterima
- Tombol Confirm
- Tombol Cancel

### Account Deactivation

Ketika akun berhasil dijual:

- Semua jobs yang terkait akun tersebut harus langsung dihentikan.
- Broadcast dihentikan.
- Member Inviter dihentikan.
- Auto Reply dihentikan.
- Semua automation lainnya dihentikan.
- Akun tidak boleh lagi digunakan oleh seller.

---

## Buy Accounts

### Buy Accounts Page

Menampilkan daftar stok akun yang tersedia.

Contoh:

+62
ID 7
READY STOCK: 10

User dapat memilih salah satu kategori stok untuk melihat detail akun yang tersedia.

### Account Summary

Saat user membuka detail akun, tampilkan informasi terbatas:

Contoh:

USER ID 7777777

Field yang boleh ditampilkan:

- User ID
- Status TwoFA (Enabled / Disabled)
- Recovery Email Available (Yes / No)

Field berikut tidak boleh ditampilkan:

- Nomor telepon lengkap
- Username
- Nama akun
- Kode negara lengkap
- Informasi sensitif lainnya

Data sensitif hanya diberikan setelah transaksi berhasil.

---

## Pricing Management

Harga jual dan harga beli akun tidak bersifat fixed.

Admin harus dapat mengatur melalui Admin Panel:

- Buy Price
- Sell Price

Perubahan harga harus berlaku untuk transaksi berikutnya tanpa perlu deploy ulang sistem.

---

## Security Requirements

- User tidak dapat membeli akun tanpa saldo mencukupi.
- User tidak dapat menjual akun yang bukan miliknya.
- User tidak dapat menjual akun yang sudah dijual sebelumnya.
- Validasi kepemilikan wajib dilakukan di backend.
- Harga transaksi wajib divalidasi di backend.
- Semua request harus menggunakan server-side authorization.
- Tidak boleh ada nilai harga, user ID, atau ownership yang dapat dimanipulasi dari frontend.
- Transaksi harus atomic untuk mencegah double purchase.
- Saat akun dibeli, akun langsung di-lock agar tidak dapat dibeli user lain pada saat yang sama.
- Audit log wajib disimpan untuk seluruh aktivitas jual dan beli akun.
