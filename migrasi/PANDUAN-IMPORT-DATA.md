# Panduan Import Data ke Supabase (via Cloud Shell, pemula)

Tujuan: memindahkan isi Google Sheets ke database Supabase, lewat **Google Cloud
Shell** (terminal di browser — tanpa instal apa pun di PC).

> **Kerjakan SETELAH**: skema dibuat (jalankan `00-ddl-supabase.sql` di Supabase
> SQL Editor). **Provisioning Auth** dilakukan SETELAH import ini
> (`PANDUAN-CLOUD-SHELL.md`).

## Yang perlu disiapkan lebih dulu
1. **File export JSON** dari Apps Script:
   - Tempel `apps-script-export.gs` ke Apps Script lama → jalankan
     `exportSemuaSheetKeJSON()` → **unduh** file `renus-export-YYYYMMDD-HHMM.json`
     dari Google Drive ke komputer/HP Anda.
2. **2 kunci Supabase** (Project Settings → API): **Project URL** & **service_role** key.

---

## Langkah 1 — Buka Cloud Shell
Buka **https://console.cloud.google.com** → klik ikon terminal **`>_`** kanan atas.

## Langkah 2 — Ambil skrip (clone repo)
Kalau **belum pernah** clone repo di Cloud Shell:
```bash
gh auth login        # ikuti: GitHub.com → HTTPS → Yes → Login with a web browser
gh repo clone adityaramadhani050/renuspro
```
Kalau **sudah pernah**:
```bash
cd ~/renuspro && git pull
```

## Langkah 3 — Unggah file export JSON ke Cloud Shell
1. Di jendela Cloud Shell, klik menu **titik-tiga (⋮)** → **Upload**.
2. Pilih file `renus-export-....json` dari komputer/HP Anda. Tunggu selesai.
3. Rapikan namanya biar mudah (jalankan di terminal):
   ```bash
   mv ~/renus-export-*.json ~/export.json
   ```

## Langkah 4 — Cek dulu tanpa menulis (aman)
```bash
cd ~/renuspro
node migrasi/import-supabase.mjs ~/export.json --dry
```
Akan tampil jumlah baris per tabel + contoh hasil transform. Kalau terlihat wajar,
lanjut. (Langkah ini belum menyentuh database.)

## Langkah 5 — Pasang paket & tempel kunci Supabase
```bash
npm install @supabase/supabase-js
export SUPABASE_URL="https://ISI-PROJECT-URL-ANDA.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="ISI-SERVICE-ROLE-KEY-ANDA"
```
> Tanpa spasi di sekitar `=`. `service_role` = kunci rahasia; jangan dibagikan.

## Langkah 6 — Import data sungguhan
```bash
node migrasi/import-supabase.mjs ~/export.json
```
Skrip mengimpor semua tabel **berurutan** (master dulu → transaksi), otomatis
mengubah teks kosong → NULL, tanggal `dd/MM/yyyy` → date, `Ya/TRUE` → boolean,
kolom JSON → jsonb, dan **melewati password** (tidak diimpor).

Di akhir muncul ringkasan, mis. `✓ klien : 42 ok`, `✓ penawaran : 130 ok`, dst.

## Langkah 7 — Verifikasi
Buka Supabase → **Table Editor** → cek beberapa tabel (mis. `klien`, `produk`,
`penawaran`) sudah berisi data. Bandingkan beberapa angka penting dengan sistem lama.

---

## (Opsional) Mode REPLACE — ganti TOTAL data

Import biasa memakai **upsert**: baris ber-ID sama ditimpa & baris baru ditambah,
tapi **baris lama yang tak ada di sheet TIDAK dihapus** (jadi gabung, bukan ganti
bersih). Kalau mau **replace total** (buang semua data lama, isi ulang dari sheet):

**1. Backup dulu** (jaga-jaga):
```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  --data-only --schema=public -f backup-sebelum-import.sql
```

**2. Kosongkan tabel data** — jalankan di **Supabase → SQL Editor**.
> ⚠️ SENGAJA **tidak** mengosongkan `app_user` (akun login/Auth) & `app_config`
> (config WA Bot + S&K). Jadi login lama & pengaturan tetap aman.
```sql
truncate table
  klien, produk, supplier, supplier_produk, pricelist_kategori, pricelist,
  template_paket, akun_pembayaran, penawaran, work_order_catatan,
  work_order_jenis_override, invoice, kwitansi, bom_project, bom_item,
  bom_assignment, ded_checklist, ded_project, ded_item, ded_assignment,
  qc_section, qc_checklist, qc_project, qc_item, qc_assignment,
  schedule_project, schedule_task, stok, mutasi_stok, purchase_order,
  po_item, pembayaran_po, po_payment_request, penerimaan_po_log,
  penerimaan_tanpa_po, pengiriman, pengiriman_request, pengeluaran,
  pemasukan, ayat_silang, hand_over, site_survey, wo_dokumen
cascade;
```
> Kalau muncul error `foreign key`, jalankan sekali `migrasi/fix-migrasi-import.sql`
> (melepas semua FK) lalu ulangi truncate.

**3. Import — JANGAN sertakan `app_user`.** Pakai `--skip=app_user` supaya akun
login & tautan Auth yang sudah ada **tak tersentuh** (data user dari sheet tidak
diimpor):
```bash
node migrasi/import-supabase.mjs ~/export.json --skip=app_user
```

Hasilnya: semua tabel data terganti bersih dari sheet, sementara **user & login
tetap seperti semula** (tak perlu provisioning Auth ulang).

> Kalau memang ingin mengganti daftar user juga, hapus `--skip=app_user` dan
> tambahkan `app_user` ke daftar truncate — TAPI setelahnya wajib **provisioning
> Auth ulang** untuk semua user (langkah di bawah), karena `auth_uid` ikut hilang.

---

## Setelah ini
1. **Provisioning Auth** → ikuti `PANDUAN-CLOUD-SHELL.md` (buat akun login user).
   *(Lewati jika pakai Mode Replace dengan `--skip=app_user` — user lama tetap ada.)*
2. **Aktifkan RLS** → jalankan `00-ddl-supabase-2-trigger-rls.sql` di SQL Editor.

---

## Kalau ada masalah
| Pesan / gejala | Solusi |
|---|---|
| `Set env SUPABASE_URL...` | Langkah 5 belum dijalankan / salah ketik |
| Banyak baris `✗ ... fkey` gagal (referensi yatim data lama) | Jalankan sekali `migrasi/fix-migrasi-import.sql` di Supabase SQL Editor (melepas semua Foreign Key), lalu `git pull` di Cloud Shell, lalu jalankan import lagi (aman diulang). |
| Mau ulang 1 tabel saja | `node migrasi/import-supabase.mjs ~/export.json --only=namatabel` |
| Tanggal kosong/aneh | Format sheet tak dikenal; kirim contoh nilainya, nanti disesuaikan |
| Sesi Cloud Shell tertutup | Buka lagi; ulangi Langkah 5 (kunci `export` hilang tiap sesi baru) |

> Aman diulang: import memakai *upsert* — menjalankan ulang tidak menggandakan
> data (baris dengan ID sama ditimpa, bukan ditambah).
