# Panduan Milestone 2 — Menyiapkan Supabase (untuk pemula)

Tujuan: membuat database Supabase + skema tabel, siap menerima data (Milestone 3).
Sebagian besar dilakukan lewat **website Supabase** (klik-klik) — tidak perlu Cloud Shell.

> Belum menyentuh data & belum dipakai aplikasi. Aman.

---

## Langkah 1 — Buat akun & project
1. Buka **https://supabase.com** → **Sign in** (paling mudah: *Continue with GitHub*).
2. Klik **New project**.
3. Isi:
   - **Name**: `renuspro`
   - **Database Password**: klik *Generate* → **SIMPAN password ini** (di catatan aman).
   - **Region**: pilih **Southeast Asia (Singapore)** — paling dekat = paling cepat.
4. Klik **Create new project**. Tunggu ~2 menit sampai project siap.

---

## Langkah 2 — Simpan 3 kunci (untuk Milestone 3)
1. Di kiri bawah, klik ikon **gigi (Project Settings)** → menu **API**.
2. Catat/simpan (jangan dibagikan ke publik):
   - **Project URL** — contoh `https://abcd1234.supabase.co`
   - **anon** `public` key (untuk aplikasi/frontend nanti)
   - **service_role** `secret` key (untuk skrip import & provisioning — RAHASIA)

> Ketiga kunci ini dipakai di Milestone 3 (import data, buat akun login). Simpan dulu.

---

## Langkah 3 — Jalankan skema (buat semua tabel)
1. Buka file **`00-ddl-supabase.sql`** di repo Anda (GitHub) → klik tombol **Raw**
   → pilih semua (**Ctrl+A**) → salin (**Ctrl+C**).
2. Di Supabase, sidebar kiri → **SQL Editor** → **New query**.
3. **Tempel** (Ctrl+V) ke kotak query → klik **Run** (atau Ctrl+Enter).
4. Harus muncul **"Success. No rows returned"** (atau sejenisnya, tanpa error merah).

> Kalau ada error "already exists" (karena dijalankan 2×), abaikan atau hapus dulu
> lalu jalankan ulang. Untuk pertama kali harusnya bersih.

---

## Langkah 4 — Verifikasi tabel
Sidebar kiri → **Table Editor**. Harus terlihat banyak tabel (klien, produk,
penawaran, bom_item, invoice, dst — **43 tabel**) + view `work_order`. Semuanya
masih **kosong** (itu benar; diisi di Milestone 3).

---

## Langkah 5 — Buat tempat penyimpanan file (Storage)
Sidebar kiri → **Storage** → **New bucket**. Buat **4 bucket** (biarkan **Private**):
- `bukti`
- `invoice`
- `ded`
- `quotation`

(Diisi nanti saat migrasi file dari Google Drive.)

---

## Langkah 6 — Aktifkan login (Auth)
1. Sidebar kiri → **Authentication** → **Providers** (atau **Sign In / Providers**).
2. Pastikan **Email** dalam keadaan **Enabled**.
3. (Opsional, mempermudah) Pada pengaturan Email, **matikan "Confirm email"** —
   karena akun user nanti dibuat sudah terkonfirmasi otomatis oleh skrip.

> Membuat akun user dilakukan di Milestone 3 (`PANDUAN-CLOUD-SHELL.md`), setelah
> tabel `app_user` terisi.

---

## ✅ Milestone 2 selesai bila:
- Project Supabase aktif, 3 kunci sudah disimpan.
- SQL skema jalan tanpa error, 43 tabel + view `work_order` muncul di Table Editor.
- 4 bucket Storage dibuat, provider Email aktif.

## ⛔ JANGAN dulu di tahap ini
- **Jangan** jalankan `00-ddl-supabase-2-trigger-rls.sql` sekarang. File RLS itu
  dijalankan **di akhir Milestone 3** (setelah data & akun login siap), supaya
  proses import tidak terblokir.

## Lanjut ke Milestone 3
Import data → `PANDUAN-IMPORT-DATA.md`, lalu buat akun login →
`PANDUAN-CLOUD-SHELL.md`, terakhir aktifkan RLS.

---

## Kalau ada masalah
| Gejala | Solusi |
|---|---|
| SQL error merah saat Run | Pastikan menyalin **seluruh** isi file (dari Raw), bukan sebagian |
| "relation already exists" | Skema sudah pernah dibuat; abaikan, atau hapus tabel lalu jalankan ulang |
| Bingung cari kunci API | Project Settings (ikon gigi) → API |
| Region salah pilih | Tidak masalah untuk uji; untuk produksi buat ulang project region Singapore |
