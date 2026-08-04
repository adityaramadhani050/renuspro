# Panduan Provisioning Auth via Google Cloud Shell (untuk pemula)

Panduan ini untuk membuat akun **login** di Supabase dari data `app_user`, dijalankan
lewat **Google Cloud Shell** (terminal di browser — tidak perlu instal apa pun di PC).

> **Kerjakan ini SETELAH**: skema Supabase dibuat (`00-ddl-supabase.sql`) dan data
> sudah diimpor (tabel `app_user` sudah terisi). Jangan dulu jalankan file RLS
> sebelum langkah ini selesai.

---

## Langkah 0 — Siapkan 2 kunci dari Supabase
1. Buka dashboard Supabase → pilih project Anda.
2. Klik ikon **gigi (Project Settings)** di kiri bawah → menu **API**.
3. Catat/simpan 2 hal ini (nanti ditempel ke Cloud Shell):
   - **Project URL** — contoh: `https://abcd1234.supabase.co`
   - **service_role** key (di bagian *Project API keys* → klik *Reveal* → *Copy*).
     ⚠️ Ini **kunci rahasia super-admin**. Jangan dibagikan / jangan di-screenshot ke publik.

---

## Langkah 1 — Buka Google Cloud Shell
1. Buka **https://console.cloud.google.com** (login akun Google).
2. Klik ikon **terminal `>_`** di kanan atas ("Activate Cloud Shell"). Tunggu
   sampai muncul baris terminal hitam di bawah layar.

---

## Langkah 2 — Buat file skrip
1. Ketik perintah ini di Cloud Shell lalu tekan **Enter**:
   ```bash
   cloudshell edit provision-auth.mjs
   ```
   Ini membuka **Editor** (di atas) dengan file kosong bernama `provision-auth.mjs`.
2. Buka file skrip dari repo Anda di GitHub: `migrasi/provision-auth.mjs` → klik
   tombol **Raw** → pilih semua teks (**Ctrl+A**) → salin (**Ctrl+C**).
3. Kembali ke Editor Cloud Shell → klik di area file → **tempel** (**Ctrl+V**).
4. Simpan: **Ctrl+S** (atau menu File → Save).

> Alternatif (kalau bisa git): `git clone <URL repo Anda>` lalu
> `cd renuspro/migrasi`. Tapi cara tempel di atas paling mudah.

---

## Langkah 3 — Pasang paket yang diperlukan
Ketik di terminal, Enter, tunggu selesai (~30 detik):
```bash
npm install @supabase/supabase-js
```

---

## Langkah 4 — Tempel kunci Supabase (ganti isi tanda kutip)
Salin blok ini ke terminal, **ganti** nilai di dalam kutip dengan milik Anda,
lalu Enter. (Password default dipakai untuk SEMUA user — mereka bisa ganti nanti.)
```bash
export SUPABASE_URL="https://ISI-PROJECT-URL-ANDA.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="ISI-SERVICE-ROLE-KEY-ANDA"
export DEFAULT_PASSWORD="Renus#2025"
```
> Tanpa spasi di sekitar tanda `=`. Kalau ada user tanpa email, skrip otomatis
> membuat email login `username@renus.local` (bisa diubah lewat `export EMAIL_DOMAIN="..."`).

---

## Langkah 5 — Uji dulu (aman, belum membuat akun)
```bash
node provision-auth.mjs --dry
```
Akan tampil daftar user yang AKAN dibuat. Bila daftarnya wajar, lanjut.

## Langkah 6 — Coba 2 user dulu
```bash
node provision-auth.mjs --limit=2
```
Cek di Supabase → **Authentication → Users**: harus muncul 2 user baru.
Coba login ke aplikasi pakai email + password default. Kalau berhasil → lanjut.

## Langkah 7 — Jalankan untuk semua user
```bash
node provision-auth.mjs
```
Selesai. Skrip juga mengisi kolom `auth_uid` di `app_user` otomatis.

---

## Langkah 8 — Ambil daftar akun
Skrip membuat file `provisioned-users.csv` (berisi id, nama, email login,
password, role). Unduh ke komputer:
```bash
cloudshell download provisioned-users.csv
```
Bagikan email + password ke masing-masing user; minta mereka **ganti password**
setelah login pertama.

---

## Langkah 9 — Aktifkan keamanan (RLS)
Setelah semua user punya `auth_uid`, buka Supabase → **SQL Editor** → tempel &
jalankan isi file **`00-ddl-supabase-2-trigger-rls.sql`** (trigger + RLS).

---

## Kalau ada masalah
| Pesan | Artinya / solusi |
|---|---|
| `Set dulu SUPABASE_URL...` | Langkah 4 belum dijalankan / salah ketik |
| `Gagal baca app_user` | Tabel belum ada / data belum diimpor / key salah |
| `GAGAL: ... already registered` | Email sudah ada → skrip otomatis menautkan (aman) |
| Cloud Shell "timeout"/tertutup | Buka lagi; ulangi Langkah 4 (env hilang saat sesi baru) |

> Catatan: Cloud Shell bersifat sementara. Bila sesi berganti, `export` di
> Langkah 4 perlu ditempel ulang sebelum menjalankan `node ...` lagi.
