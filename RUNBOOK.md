# Runbook Migrasi RenusPro

Panduan langkah demi langkah menjalankan migrasi dari Google Sheets + Apps
Script ke Supabase + Vercel. Latar belakang dan alasan setiap keputusan ada di
[`MIGRATION_PLAN.md`](MIGRATION_PLAN.md); berkas ini hanya **cara melakukannya**.

**Prinsip yang berlaku sepanjang runbook:** sampai Tahap 6, sistem lama tetap
menjadi sumber kebenaran dan tidak ada satu pun langkah yang tidak bisa
dibatalkan. Yang perlu kehati-hatian sungguhan hanya Tahap 6.

**Tidak punya komputer?** Seluruh langkah bisa dijalankan dari browser tablet
atau HP — lihat [bagian berikutnya](#menjalankan-tanpa-komputer-tablet--hp).
Perintah `npm`/`supabase` di tiap tahap punya padanan tombol di GitHub Actions.

---

---

## Menjalankan tanpa komputer (tablet / HP)

Seluruh runbook ini bisa dijalankan **hanya dari browser di tablet Android
atau HP**. Dua langkah yang tampaknya butuh komputer — menerapkan skema dan
menjalankan importer — dipindahkan ke GitHub Actions, jadi Anda cukup menekan
tombol.

### Sebelum mulai: jadikan repository PRIVAT

Kredensial database dan kunci `service_role` **tidak boleh** disimpan sebagai
Actions secret pada repository publik. Pastikan repository sudah privat sebelum
melanjutkan ke langkah berikutnya.

> GitHub → **Settings** → gulir ke **Danger Zone** → **Change repository
> visibility** → **Make private**

Sekalian tinjau isi repository terhadap data yang sebaiknya tidak terbuka —
data contoh pada berkas inisialisasi sheet, dan kredensial default yang
disebut di dokumentasi.

### Sekali saja: isi Secrets

GitHub → **Settings** → **Secrets and variables** → **Actions** → tombol
**New repository secret**, satu per satu:

| Nama secret | Diambil dari |
|-------------|--------------|
| `SUPABASE_PROJECT_REF` | Supabase → Settings → General |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | password yang Anda tetapkan saat provision |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `SHEET_ID` | dari URL spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **seluruh isi** berkas JSON service account |

Lalu di tab **Variables** (bukan Secrets), tambahkan `AUTH_EMAIL_DOMAIN`
berisi domain email perusahaan, mis. `renusglobal.co.id`.

Nilai secret tidak bisa dibaca kembali setelah disimpan, tidak ikut ter-commit,
dan disensor otomatis dari log. Anda cukup mengetiknya sekali.

### Menjalankan tiap langkah

GitHub → tab **Actions** → **Migrasi RenusPro** → tombol **Run workflow** →
pilih langkah → **Run workflow**.

| Pilihan | Menggantikan tahap |
|---------|--------------------|
| `1-terapkan-skema` | Tahap 1.3 (`supabase db push`) |
| `2-buat-daftar-user` | Tahap 3.1 (`--emit-user-template`) |
| `3-impor-percobaan` | Tahap 3.2 (`--dry-run`) |
| `4-impor-sungguhan` | Tahap 4.1 (`--create-auth-users`) |
| `5-rekonsiliasi-saja` | `npm run reconcile` |

Laporan rekonsiliasi muncul di **halaman ringkasan** run tersebut — bukan di
log mentah — supaya terbaca nyaman di layar kecil.

**Langkah 4 minta konfirmasi:** ketik `IMPOR` di kolom konfirmasi. Itu satu-
satunya langkah yang menulis ke database produksi, dan dropdown di layar
sentuh terlalu mudah tersenggol.

> ⚠ **Tombol "Run workflow" hanya muncul kalau berkas workflow sudah ada di
> branch `main`.** Merge dulu branch migrasi ke `main` lewat Pull Request —
> bisa dilakukan sepenuhnya dari browser.

### Mengisi users.csv dari tablet

Setelah menjalankan `2-buat-daftar-user`, daftar username tampil di ringkasan
run. Buat berkasnya langsung di GitHub:

**Add file** → **Create new file** → nama `tools/importer/users.csv` → isi:

```
username,email
admin,direktur@renusglobal.co.id
sales1,budi@renusglobal.co.id
```

Baris hanya perlu ditulis untuk user yang emailnya **berbeda** dari pola
`username@AUTH_EMAIL_DOMAIN`. Commit, lalu jalankan ulang langkah 3.

### Tahap lain yang memang sudah berbasis browser

| Tahap | Cara di tablet |
|-------|----------------|
| 0 — Backup spreadsheet | Google Sheets: **File → Make a copy** |
| 1.1 — Provision Supabase | dashboard Supabase di browser |
| 2 — Service account Google | console.cloud.google.com; aktifkan **mode desktop** di browser, tampilannya padat |
| 4.2 — Undangan password | Supabase → Authentication → Users → Send recovery |
| 5 — Deploy Vercel | vercel.com/new, impor dari GitHub |
| 6 — Cutover Apps Script | script.google.com; menyunting `.gs` di tablet bisa, tapi sempit |

### Kalau butuh terminal sungguhan

Untuk hal di luar runbook — memeriksa sesuatu secara langsung, menjalankan
query ad-hoc — **Google Cloud Shell** ([shell.cloud.google.com](https://shell.cloud.google.com))
memberi terminal Linux lengkap di dalam browser, gratis, sudah berisi Node,
`git`, dan `psql`. Dari tablet ia berfungsi seperti komputer.

Menyunting kode di tablet juga tidak perlu editor: buka repository di
[github.dev](https://github.dev) — tekan tombol titik (`.`) pada halaman repo —
dan Anda mendapat VS Code di browser.

---

## Tahap 0 — Persiapan (± 30 menit)

### 0.1 Backup spreadsheet

Lakukan ini lebih dulu, sebelum apa pun.

1. Buka spreadsheet RenusPro
2. **File → Make a copy** → beri nama `RenusPro BACKUP <tanggal>`
3. Simpan di folder terpisah

Importer hanya membaca (service account cukup diberi akses *Viewer*), tapi
backup adalah syarat yang tidak dinegosiasikan.

### 0.2 Yang perlu disiapkan

- Akun **Supabase** (Free cukup untuk uji coba; Pro $25/bln untuk produksi)
- Akun **Vercel** (Hobby cukup untuk uji coba)
- Akun **Google Cloud** untuk service account

Kalau punya komputer:

- **Node.js 20+** dan **Supabase CLI** (`npm install -g supabase`)

Kalau hanya punya tablet/HP: lewati keduanya — lihat
[Menjalankan tanpa komputer](#menjalankan-tanpa-komputer-tablet--hp) di atas.

### 0.3 Catat angka "sebelum"

Untuk pembanding nanti. Buka sistem lama dan catat:

| Yang dicatat | Nilai |
|--------------|-------|
| Jumlah baris `Penawaran_Main` | |
| Jumlah baris `Invoice_Main` | |
| Total piutang di laporan Finance | |
| Waktu muat halaman Penawaran (detik) | |
| Waktu export PDF saat 3 user bersamaan | |

Dua baris terakhir yang paling berguna — itulah keluhan yang ingin diselesaikan,
dan tanpa angka awal Anda tidak bisa membuktikan perbaikannya.

**✔ Lulus tahap ini bila:** backup sudah ada dan angka "sebelum" tercatat.

---

## Tahap 1 — Provision Supabase (± 20 menit)

### 1.1 Buat proyek

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. **Region: `Southeast Asia (Singapore)`** — jangan default US.
   Salah region menghapus sebagian besar keuntungan latensi yang dikejar migrasi
   ini, dan region **tidak bisa diubah** setelah proyek dibuat.
3. Simpan **Database Password** yang Anda tetapkan

### 1.2 Catat kredensial

Dari **Project Settings**:

| Nilai | Lokasi | Dipakai untuk |
|-------|--------|---------------|
| Project Reference ID | Settings → General | `supabase link` |
| Project URL | Settings → API | Vercel & importer |
| `anon` key | Settings → API | Vercel (aman di browser) |
| `service_role` key | Settings → API | **RAHASIA** — importer saja |
| Connection string | Settings → Database | importer |

> `service_role` melewati seluruh RLS. Kunci itu tidak boleh masuk ke aplikasi
> web, tidak boleh di-commit, dan tidak boleh dikirim lewat chat.

### 1.3 Jalankan migration

```bash
git clone <repo> && cd renuspro
git checkout claude/erp-migration-railway-vercel-l5qzzv

supabase login
supabase link --project-ref <project-ref-anda>
supabase db push
```

`db push` menjalankan seluruh berkas di `supabase/migrations/` secara berurutan.

### 1.4 Verifikasi

Di **SQL Editor** Supabase:

```sql
select
  (select count(*) from pg_tables   where schemaname = 'public') as tabel,
  (select count(*) from pg_views    where schemaname = 'public') as view,
  (select count(*) from pg_policies where schemaname = 'public') as policy;
```

**✔ Lulus tahap ini bila:** hasilnya `16 | 9 | 35`.

> Kalau ingin menguji lebih dulu tanpa menyentuh cloud, jalankan
> `./tools/verify-schema.sh` terhadap Postgres lokal — skrip itu juga
> menjalankan tes perilaku (penomoran, otomasi Deal→Work Order, isolasi RLS).

---

## Tahap 2 — Akses Google Sheets (± 15 menit)

### 2.1 Buat service account

1. [console.cloud.google.com](https://console.cloud.google.com) → buat project
2. **APIs & Services → Library** → aktifkan **Google Sheets API**
3. **APIs & Services → Credentials → Create Credentials → Service account**
4. Buka service account → **Keys → Add key → JSON** → unduh

### 2.2 Bagikan spreadsheet

Buka file JSON, salin nilai `client_email`
(bentuknya `nama@project.iam.gserviceaccount.com`).

Di spreadsheet RenusPro: **Share** → tempel email itu → beri akses **Viewer**.

> Langkah ini yang paling sering terlewat. Tanpa berbagi, importer akan gagal
> dengan pesan "file not found" walau kredensialnya benar.

### 2.3 Konfigurasi importer

```bash
cd tools/importer
npm install
cp .env.example .env
```

Isi `.env`:

> **Ambil `DATABASE_URL` dari tombol hijau `Connect` di bar atas dashboard**,
> bukan dari halaman Database Settings. Di modal itu pilih **Session pooler** —
> bukan *Direct connection* (hanya IPv6, sedangkan runner GitHub hanya IPv4)
> dan bukan *Transaction pooler* (tidak mendukung perintah tingkat sesi,
> padahal importer perlu menonaktifkan trigger). Jangan lupa mengganti
> `[YOUR-PASSWORD]` dengan password yang sebenarnya.

```bash
DATABASE_URL=postgresql://postgres.xxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
SHEET_ID=<dari URL spreadsheet>
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
AUTH_EMAIL_DOMAIN=renusglobal.co.id      # domain email perusahaan Anda
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Letakkan file JSON tadi sebagai `tools/importer/service-account.json`.
(`.gitignore` sudah menutup `.env` dan `service-account*.json`.)

**✔ Lulus tahap ini bila:** `npm test` lulus dan `.env` terisi.

---

## Tahap 3 — Impor percobaan (± 1–3 jam, tergantung kualitas data)

Tahap ini **tidak menulis apa pun**. Ulangi sebanyak yang diperlukan.

### 3.1 Siapkan daftar email user

`Master_User` tidak punya kolom email, sedangkan Supabase Auth memerlukannya.

```bash
npm run import -- --emit-user-template
```

Menghasilkan `users.csv`. Isi kolom `email` untuk user yang emailnya **berbeda**
dari `username@AUTH_EMAIL_DOMAIN`. Yang sudah sesuai pola boleh dikosongkan.

### 3.2 Jalankan impor kering

```bash
npm run import -- --dry-run
```

Seluruh transaksi di-`ROLLBACK` di akhir — database tetap kosong.

### 3.3 Baca laporannya

Ada tiga bagian, dan semuanya penting:

**REKONSILIASI** — jumlah baris *dan* total nilai, dibandingkan Sheets vs
Postgres. Semua harus `✓`. Kalau ada `✗`, ada data yang salah baca; jangan
lanjut sebelum selisihnya bisa dijelaskan.

**NAMA "DIBUAT OLEH" YANG TIDAK COCOK** — inilah yang paling butuh mata manusia.
Kolom itu menyimpan nama lengkap, bukan ID (`Dashboard.gs:38` membandingkan
string nama), jadi user yang sudah resign atau berganti nama tidak akan ketemu.

Untuk tiap nama yang muncul, putuskan:
- masih ada orangnya, namanya berubah → perbaiki di `Master_User` atau `users.csv`
- sudah resign → biarkan; penawarannya masuk dengan `owner_id` kosong, dan nama
  aslinya tetap tersimpan di `owner_name_legacy` sehingga bisa diperbaiki
  kapan saja lewat `UPDATE` biasa, tanpa impor ulang

**PERINGATAN** — klien yang dirujuk tapi sudah dihapus, tanggal yang tidak
terbaca, invoice yatim. Sebagian besar bisa diabaikan; bacalah sekilas untuk
memastikan tidak ada yang mengagetkan.

### 3.4 Ulangi

Perbaiki data di sheet bila perlu, lalu jalankan `--dry-run` lagi.

**✔ Lulus tahap ini bila:** seluruh baris rekonsiliasi `✓`, dan setiap nama yang
tidak cocok sudah Anda putuskan nasibnya.

---

## Tahap 4 — Impor sungguhan & autentikasi (± 1 jam)

### 4.1 Impor

```bash
npm run import -- --create-auth-users
```

Ini yang benar-benar menulis: memuat seluruh data **dan** membuat user di
Supabase Auth (tanpa password).

Aman dijalankan berkali-kali — impor bersifat idempoten, tidak menggandakan data.

### 4.2 Kirim undangan password

Dashboard Supabase → **Authentication → Users** → tiap user → **Send recovery**.

Password lama dari sheet **tidak pernah** diimpor. Ia tersimpan plaintext
(`Auth.gs:60`); memindahkannya berarti mewariskan kerentanannya.

Kabarkan ke tim: *"Password lama tidak berlaku. Cek email untuk membuat password
baru."*

### 4.3 Uji RLS dengan akun sungguhan

Ini pengujian terpenting di seluruh runbook. Login sebagai masing-masing peran
dan pastikan:

| Peran | Harus bisa | Harus TIDAK bisa |
|-------|-----------|------------------|
| sales | melihat penawarannya sendiri | melihat penawaran sales lain |
| sales | mengubah status penawarannya | menerbitkan invoice |
| finance | melihat semua penawaran & invoice | mengubah data penawaran |
| admin | semuanya | — |

> Kalau ternyata tim sales memang perlu saling melihat penawaran, ubah **satu**
> policy: `quotations_select` di
> `supabase/migrations/20260804080000_rls.sql`, lalu `supabase db push`.

**✔ Lulus tahap ini bila:** tiap peran berperilaku sesuai tabel di atas.

---

## Tahap 5 — Deploy aplikasi web (± 30 menit)

### 5.1 Vercel

1. [vercel.com/new](https://vercel.com/new) → import repository
2. **Root Directory: `apps/web`** ← wajib, kalau tidak build akan gagal
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` (opsional, agar login bisa pakai username)
4. **Settings → Functions → Region: `Singapore (sin1)`** ← jangan dilewat

> Jangan pernah memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke Vercel. Kunci itu
> melewati seluruh RLS; menaruhnya di aplikasi web membuat semua kebijakan
> keamanan yang sudah dipasang jadi tidak ada artinya.

### 5.2 Sambungkan URL ke Supabase

Dashboard Supabase → **Authentication → URL Configuration** → isi **Site URL**
dengan domain Vercel Anda, agar tautan reset password mengarah ke tempat yang benar.

### 5.3 Uji

Buka aplikasi, login, lalu periksa:

- Dashboard menampilkan angka yang **sama** dengan sistem lama
- Daftar Produk & Klien lengkap, pencarian bekerja
- Daftar Penawaran lengkap; buka satu penawaran, cek rincian item dan riwayat revisi
- Bandingkan waktu muat dengan angka "sebelum" dari Tahap 0.3

**✔ Lulus tahap ini bila:** angka dashboard cocok dan seluruh data terlihat benar.

---

## Tahap 6 — Cutover per modul (2–4 minggu)

Inilah satu-satunya tahap yang mengubah cara tim bekerja. Kerjakan **satu modul
pada satu waktu**.

> **Aturan yang tidak boleh dilanggar: satu tabel hanya boleh punya satu pemilik
> tulis.** Selama sebuah modul masih bisa ditulis dari dua tempat, datanya akan
> menyimpang — dan menyimpangnya diam-diam, baru ketahuan berminggu-minggu
> kemudian. Ini penyebab kegagalan migrasi bertahap yang paling umum.

### Urutan

| # | Modul | Status kesiapan |
|---|-------|-----------------|
| 1 | Produk & Jasa | siap (CRUD lengkap) |
| 2 | Klien | siap (CRUD lengkap) |
| 3 | Penawaran (buat, revisi, ubah status) | siap |
| 4 | Work Order (catatan, permintaan invoice) | siap |
| 5 | Invoice (terbitkan, pelunasan) + Kwitansi otomatis | siap |

Seluruh modul bisa di-cutover sekarang.

> **Catatan untuk Penawaran:** export PDF belum ada di aplikasi baru. Selama
> Fase 5 belum selesai, penawaran tetap dibuat di aplikasi baru tapi PDF-nya
> masih digenerate dari Apps Script. Itu tidak melanggar aturan satu-pemilik-
> tulis — Apps Script hanya MEMBACA untuk mencetak, tidak menulis.
>
> Agar itu bekerja selama transisi, jalankan `npm run import` secara berkala
> supaya data di kedua sisi tetap selaras, atau cetak PDF sebelum cutover.

### Langkah untuk tiap modul

**a. Impor ulang final**

```bash
cd tools/importer && npm run import
```

Menyelaraskan perubahan yang terjadi sejak impor sebelumnya.

**b. Umumkan ke tim**

> "Mulai hari ini, Produk & Klien dikelola di aplikasi baru. Menu lama sudah
> dinonaktifkan. Data lain belum berubah."

**c. Matikan tulis di Apps Script**

Untuk modul Produk, ubah fungsi tulis di `Produk.gs` agar menolak:

```javascript
function simpanProduk(nama, unit, harga, hpp) {
  return { success: false,
           message: 'Produk kini dikelola di aplikasi baru: https://<domain-anda>' };
}
```

Lakukan hal yang sama untuk `editProduk` dan `hapusProduk` — lalu `clasp push`.

Sengaja menolak dengan pesan, bukan menghapus fungsinya: pengguna yang masih
membuka menu lama mendapat arahan, bukan error yang membingungkan.

**d. Jalan paralel satu minggu**

Sistem lama masih bisa **membaca** modul itu, sehingga kalau ada yang terlewat
masih terlihat. Bandingkan sekali di akhir minggu:

```sql
select count(*) from products;   -- harus sama dengan jumlah baris Master_Produk
```

**e. Sembunyikan menu lama**

Setelah seminggu tanpa masalah, hapus menu modul itu dari sidebar
`Index.html` di Apps Script.

### Kalau perlu mundur

Selama Anda belum menghapus data di spreadsheet — dan runbook ini tidak pernah
menyuruhnya — pembatalan cukup dengan mengembalikan fungsi di langkah (c) ke
semula lalu `clasp push`. Data lama masih utuh.

---

## Tahap 7 — Setelah semua modul pindah

Baru dilakukan ketika **seluruh** modul sudah di aplikasi baru dan berjalan
mulus minimal sebulan:

1. Set spreadsheet menjadi **read-only** (Share → Viewer untuk semua)
2. Cabut deployment web app Apps Script (Deploy → Manage deployments → Archive)
3. Uji **restore** backup Supabase — bukan cuma memastikan backup-nya ada.
   Backup yang belum pernah dipulihkan belum terbukti bisa dipulihkan.

---

## Jalur paralel: Fase 0 (opsional, ± 1–2 minggu)

Tahap 6 masih beberapa bulan lagi. Kalau pengguna sedang sangat terganggu,
perbaikan berikut bisa dikerjakan **bersamaan** dan tidak terbuang:

1. **Pindahkan sheet `Template_Quotation`, `Template_Invoice`, dan
   `Template_Kwitansi` ke spreadsheet terpisah.** Perubahan tunggal dengan
   dampak terbesar: `PdfExport.gs:23` memegang `LockService.getScriptLock()`
   selama 25 detik, dan lock itu berlaku seluruh aplikasi — satu orang generate
   PDF membuat semua orang lain antre.
2. Hapus `t&c.gs` (duplikat identik `TnC.gs`, masing-masing 611 KB)
3. Pindahkan base64 PDF T&C ke file Drive, ambil lewat file ID
4. Ganti `access: ANYONE_ANONYMOUS` di `appsscript.json`

---

---

## Pemecahan masalah

### `Invalid URL` atau `DATABASE_URL tidak bisa diurai`

Sheets terbaca normal, lalu gagal saat menyambung ke database. Penyebabnya
selalu pada isi `DATABASE_URL`, dan importer akan menyebutkan yang mana:

| Gejala | Penyebab |
|--------|----------|
| menyebut *placeholder* | `[YOUR-PASSWORD]` belum diganti |
| menyebut *perintah psql* | yang tersalin `psql postgresql://...`, bukan URL-nya saja |
| menyebut *karakter #, /, atau ?* | password memuat salah satu karakter itu |

Dua karakter itu — `#`, `/`, `?` — memulai bagian baru di dalam URL, sehingga
sisa password terpotong. Cara tercepat mengatasinya bukan meng-encode manual,
melainkan **reset password database** dengan kombinasi huruf dan angka saja:

> Supabase → **Settings** → **Database** → **Reset database password**

Lalu perbarui **dua** secret sekaligus: `DATABASE_URL` dan `SUPABASE_DB_PASSWORD`.

Catatan: `@` dan spasi pada password justru **aman** — parser URL menanganinya
dengan benar. Jadi kalau password Anda hanya memuat itu, masalahnya di tempat lain.

### Koneksi timeout / `ENETUNREACH`

`DATABASE_URL` memakai *Direct connection* yang hanya melayani IPv6, sedangkan
runner GitHub Actions hanya punya IPv4. Ganti ke **Session pooler**.

### `users.csv` tidak muncul di repository

Memang tidak akan muncul — itu perilaku yang benar. Workflow berjalan di mesin
sementara yang dibuang setelah selesai, jadi berkas yang ditulis di sana tidak
ikut ter-commit.

Daftar username-nya dicetak di **halaman ringkasan run** langkah
`2-buat-daftar-user`. Salin dari sana, lalu buat berkasnya sendiri lewat
**Add file → Create new file** dengan nama `tools/importer/users.csv`.

### Semua nama "Dibuat Oleh" dilaporkan tidak cocok

Wajar pada impor percobaan pertama. Pembuatan user memerlukan Supabase Auth,
yang hanya aktif dengan `--create-auth-users` — tanpa itu tidak ada profil yang
masuk, sehingga tidak ada nama yang bisa dicocokkan.

Jalankan `4-impor-sungguhan` sekali (aman diulang), lalu ulangi impor percobaan.
Daftar tersebut akan menyusut menjadi hanya nama yang benar-benar bermasalah.
Laporan importer juga menyebutkan hal ini bila terdeteksi.

---

## Ringkasan waktu

| Tahap | Durasi | Bisa dibatalkan? |
|-------|--------|------------------|
| 0 Persiapan | 30 menit | — |
| 1 Provision Supabase | 20 menit | ya |
| 2 Akses Sheets | 15 menit | ya |
| 3 Impor percobaan | 1–3 jam | ya (tidak menulis) |
| 4 Impor & auth | 1 jam | ya |
| 5 Deploy Vercel | 30 menit | ya |
| 6 Cutover per modul | 2–4 minggu | ya, sampai Tahap 7 |
| 7 Dekomisi | 1 hari | **tidak** |

Tahap 1–5 bisa diselesaikan dalam **satu hari kerja**. Setelah itu Anda punya
sistem baru yang berjalan berdampingan dengan yang lama, dan bisa mengambil
keputusan cutover berdasarkan sistem yang benar-benar sudah bisa dilihat —
bukan berdasarkan rencana di atas kertas.
