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

## Setelah ini
1. **Provisioning Auth** → ikuti `PANDUAN-CLOUD-SHELL.md` (buat akun login user).
2. **Aktifkan RLS** → jalankan `00-ddl-supabase-2-trigger-rls.sql` di SQL Editor.

---

## Kalau ada masalah
| Pesan / gejala | Solusi |
|---|---|
| `Set env SUPABASE_URL...` | Langkah 5 belum dijalankan / salah ketik |
| Banyak baris `✗ ... FK` gagal | Master belum masuk. Ulang tabel master, mis. `node migrasi/import-supabase.mjs ~/export.json --only=klien,produk,supplier,pricelist_kategori,pricelist,akun_pembayaran` lalu jalankan penuh lagi |
| Mau ulang 1 tabel saja | `node migrasi/import-supabase.mjs ~/export.json --only=namatabel` |
| Tanggal kosong/aneh | Format sheet tak dikenal; kirim contoh nilainya, nanti disesuaikan |
| Sesi Cloud Shell tertutup | Buka lagi; ulangi Langkah 5 (kunci `export` hilang tiap sesi baru) |

> Aman diulang: import memakai *upsert* — menjalankan ulang tidak menggandakan
> data (baris dengan ID sama ditimpa, bukan ditambah).
