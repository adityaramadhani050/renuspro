# Arsitektur Final (Hybrid) — RenusPro di Vercel + Supabase

Status migrasi: **216/240 fungsi server memakai Supabase (override klien di
`migrasi/overrides/`), 0 fungsi rusak.** Sisanya **sengaja** tetap di Apps Script
sebagai "layanan" yang dipanggil lewat proxy `/api/gs`.

## Pembagian tanggung jawab
- **Supabase** — SUMBER KEBENARAN untuk semua DATA + LOGIKA:
  master (klien/produk/supplier/akun), penawaran, PO, stok/inventory, BOM/DED/QC,
  pengiriman, hand over, pembayaran, kas, upload file (Storage), manajemen user
  (Edge Function `user-ops`), invoice (Edge Function `invoice-ops`), serta
  **dashboard & laporan sales** (agregasi klien-side).
- **Apps Script** — hanya "layanan" yang belum/ tak perlu dipindah:
  1. **Pencetak PDF** (invoice, kwitansi, PO, penawaran) — di-generate dari
     **template Google Sheets** (`Template_Invoice`, dst). Dipertahankan karena
     dokumen menghadap pelanggan & harus persis; memindahkan = bangun ulang
     seluruh layout di klien (besar & berisiko). Termasuk `getTcPdf*B64`
     (halaman T&C statik) dan config tanda tangan (`getDocSignConfig`,
     `saveDocSignConfig`, `saveSignatureImage`, `clearSignatureImage`,
     `getPOTCOptions`) yang **kopel** dengan pencetak PDF.
  2. **Google Calendar** — `hoGenerateMeet` (buat link meeting hand over).

**Notifikasi WhatsApp — SUDAH DIMIGRASI (gated `ENABLE_WA`, default false).**
Pengirim jadi Edge Function `wa-send` (token di server), config di `app_config`
`WA_CONFIG`, komposer pesan + reminder harian (`wa-reminder` + pg_cron) di sisi
Supabase, dan notifikasi tertanam (review/assign/PO/pembayaran) sudah dipasang
kembali. Aktifkan dengan set `ENABLE_WA = true` di `overrides/830-whatsapp.js`
setelah deploy Edge Function + isi config — lihat `PANDUAN-WHATSAPP.md`. Selama
false, WA tetap lewat Apps Script.

> **PENTING (pelajaran):** memindahkan *config* sebuah subsistem TANPA
> memindahkan *konsumennya* = split-brain (config di Supabase, tapi pembaca lama
> di Apps Script). Karena itu WA-config & DocSign-config HARUS dipindah satu
> paket dengan mesinnya (pengirim WA / pencetak PDF), bukan sendiri-sendiri.

## Kalau nanti mau melepas Apps Script sepenuhnya
Perlu proyek terpisah per subsistem:
- **PDF**: bangun ulang tiap dokumen dengan jsPDF/pdfmake di klien (atau Edge
  Function + lib PDF). Uji visual per dokumen.
- **WhatsApp**: pindah pengirim ke Edge Function + jadwal reminder ke cron
  (pg_cron / Vercel Cron / trigger Supabase) + tabel config (`app_config`).
- **Calendar**: OAuth Google dari klien atau Edge Function.

Selama itu belum dilakukan, hybrid ini **stabil & disengaja** — Apps Script
cukup jadi layanan PDF/WA/Calendar, semua data & laporan sudah di Supabase.

## Konfigurasi & deploy
- Key Supabase INLINE di `migrasi/overrides/000-head.js` (bukan file terpisah),
  supaya `dist/` hasil build selalu membawa key → deploy tak pernah "kehilangan
  konfig".
- `node migrasi/build.mjs` meng-assemble `migrasi/overrides/*.js` (urut nama) →
  `dist/supabase-overrides.js`. Deploy: salin `dist/{index.html,gs-run-shim.js,
  supabase-overrides.js}` ke repo Vercel.
