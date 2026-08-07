# Panduan Deploy M8 — Tulis Transaksi (PO, Stok, BOM, Pengiriman, HandOver, User, Config)

Batch ini memindahkan **tulis transaksi** ke Supabase. Sebagian besar aktif
**langsung** setelah build & push (override klien). Hanya **manajemen user** yang
butuh Edge Function.

> ⚠️ **Uji dulu dengan data uji.** Logika stok/HPP/pembayaran ini rumit dan
> belum diuji ke DB nyata. Setelah aktif, data tak lagi sinkron ke Google Sheets
> lama untuk modul-modul ini. Kalau ada yang keliru, cukup revert commit-nya
> (semuanya override — sistem lama kembali jalan).

---

## Ringkasan: apa yang perlu di-deploy

| Bagian | Perlu SQL? | Perlu Edge Function? | Perlu flag? |
|---|---|---|---|
| Penawaran, Stok, PO, BOM proc, Pengiriman, HandOver | tidak* | tidak | tidak (langsung aktif) |
| Config Syarat & Ketentuan (TC) | **ya** `00-ddl-app-config.sql` | tidak | tidak |
| Manajemen user (tambah/edit/hapus) | tidak | **ya** `user-ops` | `ENABLE_EDGE_USER=true` |

\* Semua tabel transaksi sudah ada dari `00-ddl-supabase.sql`. Bila upload
bukti/foto belum jalan, pastikan `00-storage-uploads.sql` juga sudah dijalankan.

---

## Langkah 1 — Jalankan SQL (Supabase → SQL Editor)

Jalankan **1×** (aman diulang, pakai `if not exists`):

```sql
-- isi file 00-ddl-app-config.sql
```
Buka Supabase → **SQL Editor** → tempel isi `00-ddl-app-config.sql` → **Run**.
Ini membuat tabel `app_config` (dipakai default Syarat & Ketentuan).

> Kalau belum pernah: jalankan juga `00-storage-uploads.sql` (bucket `uploads`
> untuk upload bukti/foto).

---

## Langkah 2 — Build & push frontend (mengaktifkan mayoritas fitur)

Di Cloud Shell:
```bash
cd ~/renuspro
git pull origin claude/eloquent-heisenberg-swy9m6
node migrasi/build.mjs
cp dist/index.html            ~/renuspro-web/index.html
cp dist/gs-run-shim.js        ~/renuspro-web/gs-run-shim.js
cp dist/supabase-overrides.js ~/renuspro-web/supabase-overrides.js
cd ~/renuspro-web && git add . && git commit -m "Deploy M8 tulis transaksi" && git push
```
Vercel deploy ulang (~1 menit). **Setelah ini aktif:** hapus/status penawaran,
semua tulis stok, terima & bayar PO, BOM procurement, pengiriman, hand over,
dan config Syarat & Ketentuan.

### Uji cepat (wajib, pakai data uji)
1. **Stok** — Penerimaan tanpa PO → cek `qty_tersedia`, `harga_beli_terakhir`,
   dan baris `mutasi_stok` bertambah. Penyesuaian +/− → cek saldo.
2. **PO** — Terima barang PO → stok naik, HPP produk ikut ter-update, ada
   `penerimaan_po_log`. Approve pembayaran PO ber-WO → muncul 2 pengeluaran
   (DPP project + PPN “Pajak”).
3. **Pengiriman** — Proses kirim → stok keluar + surat jalan + pengeluaran
   “Penggunaan Stok” (akun `AP001`). Terima pengiriman → status `Diterima`.
4. **Penawaran** — Ubah status ke **Deal** → No WO otomatis muncul; keluar Deal
   → No WO kosong lagi.
5. Bandingkan angka dengan sistem lama. **Kalau menyimpang:** revert commit M8,
   build & push → kembali ke Apps Script.

---

## Langkah 3 — (Opsional) Aktifkan manajemen user via `user-ops`

Login RenusPro pakai **Supabase Auth** (email+password); tambah/hapus akun butuh
**Auth admin** (service_role) → wajib Edge Function.

```bash
cd ~/renuspro
# CLI (sekali per sesi Cloud Shell, kalau belum ada)
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz -o /tmp/supabase.tar.gz
tar -xzf /tmp/supabase.tar.gz -C ~/ && sudo mv ~/supabase /usr/local/bin/supabase
supabase login
supabase link --project-ref ISI-PROJECT-REF-ANDA

# Salin & deploy function
mkdir -p supabase/functions/_shared
cp migrasi/edge-functions/_shared/cors.ts  supabase/functions/_shared/cors.ts
cp -r migrasi/edge-functions/user-ops       supabase/functions/user-ops
supabase functions deploy user-ops
```

Lalu nyalakan di frontend:
```bash
cloudshell edit migrasi/supabase-overrides.js
# ubah:  var ENABLE_EDGE_USER = false;  →  true   (Ctrl+S)
```
Build & push seperti **Langkah 2**.

### Uji user
- Tambah user baru (**email wajib**, password ≥ 6 karakter) → coba **login**
  pakai email+password itu.
- Edit user: isi password hanya bila mau ganti (kosong = password lama tetap).
- Kalau bermasalah: balik `ENABLE_EDGE_USER = false`, build & push → Apps Script.

---

## Yang BELUM dimigrasi (sengaja — jangan diaktifkan tanpa subsistemnya)

| Fungsi | Alasan ditunda |
|---|---|
| `saveWAConfig`, `saveWAReminderScheduleConfig` | Pengirim WA masih di Apps Script (endpoint + time-trigger). Config di Supabase saja → pengirim baca yang lama (split-brain). |
| `saveDocSignConfig`, `saveSignatureImage` | Generator PDF invoice/kwitansi masih Apps Script. |
| `ajukanReviewBOM`, `kirimHasilReviewBOM` | Murni notifikasi WA (tanpa tulis DB). |
| Dashboard/laporan sales | Sesuai kesepakatan, dikerjakan terpisah. |

Ketiga config di atas sebaiknya dimigrasi **satu paket** bersama subsistemnya
(WA sender / PDF generator) di milestone berikutnya.

---

## Rollback cepat
- **Satu fungsi bermasalah:** `git revert <commit>` di `~/renuspro`, build & push.
- **Semua M8:** revert commit M8 (`4b28127` tulis transaksi, `b79b4e2` user+config),
  build & push. Karena semuanya override, sistem Apps Script lama otomatis aktif
  lagi (selama Apps Script masih terhubung).
