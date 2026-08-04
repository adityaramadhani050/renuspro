# Rencana Migrasi RenusPro: Google Sheets + Apps Script → Vercel + Supabase

> Dokumen acuan untuk migrasi bertahap. Tujuan: **UI/UX dipertahankan 100%**,
> pindah database ke Supabase (Postgres), backend ke Supabase (Edge Functions /
> RPC / RLS), hosting frontend ke Vercel. **Tanpa Railway.**
> Prinsip utama: *strangler pattern* — sistem lama tetap hidup sampai tiap modul
> selesai dipindah.

---

## 1. Arsitektur Target

| Lapisan | Sekarang | Target |
|---|---|---|
| Frontend | Apps Script HTML Service (`Index.html` + include) | **Vercel** — file statis (HTML/Tailwind/JS vanilla existing) |
| Data | Google Sheets | **Supabase Postgres** |
| Auth | `Master_User` + sessionStorage | **Supabase Auth** (UI login tetap) |
| File (bukti, invoice, DED) | Google Drive | **Supabase Storage** |
| Logika bisnis (`.gs`) | Apps Script | **Supabase Edge Functions** (Deno/TS) + **Postgres RPC** + **RLS** |
| Cron (reminder expired, HO) | Apps Script trigger | **Vercel Cron** atau **Supabase pg_cron** |
| Google Meet (Hand Over) | Advanced Calendar Service | **Edge Function → Google Calendar API** |
| WhatsApp | Server Baileys eksternal (HTTP) | **Tetap** server Baileys eksternal, dipanggil via HTTP dari Edge Function |
| PDF | Template Sheet (server) + jsPDF (client) | **jsPDF client** (utama). Opsi: Vercel serverless + `puppeteer-core`+`@sparticuz/chromium` |

**Kenapa tanpa Railway:** semua kebutuhan tercakup Supabase + Vercel. Satu-satunya
komponen yang butuh server persisten adalah bot WhatsApp (Baileys), dan itu **sudah**
server eksternal terpisah (`WA_ENDPOINT`) — tidak berubah.

---

## 2. Prinsip Kunci (agar UI tidak berubah)

1. **Pertahankan "kontrak" fungsi.** Backend baru meniru **nama fungsi** & **bentuk
   return** lama (`{ success, message, list, ... }`). Dengan begitu
   `withSuccessHandler`/`withFailureHandler` di frontend tak perlu diubah.
2. **Shim `google.script.run`.** Objek JS peniru API Apps Script yang menerjemahkan
   tiap panggilan → `fetch()`. Punya **tabel routing per-endpoint** (bisa arahkan
   ke *lama* / *baru* satu per satu). Ini alat inti migrasi bertahap.
3. **Strangler / vertical-slice.** Migrasi **per modul**, bukan per lapisan. Sistem
   lama = jaring pengaman; cutover per modul; reversible.
4. **Skema data dirancang di awal** (fondasi semua endpoint).

---

## 3. Fase-Fase Migrasi

### FASE 0 — Inventarisasi & Fondasi Desain
**Tujuan:** tahu persis apa yang dimigrasi sebelum menulis kode.
- [ ] **Kamus data**: daftar semua sheet → calon tabel, tiap kolom + tipe + relasi.
      (Sheet utama: `Penawaran_Main`, `Work_Order`, `Invoice_Main`, `Kwitansi`,
      `Master_Produk`, `Master_Klien`, `Master_User`, `Master_Supplier`, `Pricelist`,
      `BOM_Item`, `BOM_Project`, `BOM_Assignment`, `DED_*`, `QC_*`, `Schedule_*`,
      `Stok`, `Mutasi_Stok`, `Purchase_Order`, `PO_Item`, `Pembayaran_PO`,
      `PO_PaymentRequest`, `Pengeluaran`, `HandOver`, `SiteSurvey`, `WorkOrder_*`,
      `Penerimaan_*`, dll.)
- [ ] **Kontrak endpoint**: daftar semua fungsi `.gs` yang dipanggil frontend +
      parameter + bentuk return. (Sumber: semua `google.script.run.xxx` di `JS_*.html`.)
- [ ] **Peta modul → tabel → endpoint** (untuk urutan migrasi).
- [ ] Buat project **Supabase** + project **Vercel** (kosong).
- [ ] Tentukan strategi **Auth**, **Storage bucket**, **RLS per role**.

**Deliverable:** dokumen skema + daftar endpoint + peta modul.

---

### FASE 1 — Port Frontend ke Vercel (masih pakai backend LAMA)
**Tujuan:** UI jalan di Vercel, data tetap dari Sheets. Nol migrasi data, nol risiko.
- [ ] **Build step**: skrip Node/Vite yang menggabungkan `Index.html` +
      `Page_*.html` + `JS_*.html` + `Modals.html` → satu `index.html` statis
      (mengganti `<?!= include() ?>`).
- [ ] **Shim `google.script.run`** (pakai `Proxy`) + **tabel routing** (default:
      semua → Apps Script lama).
- [ ] **Router `doPost(e)`** JSON di Apps Script (satu pintu → dispatch ke fungsi
      by nama) + **proxy serverless** di Vercel untuk mengatasi **CORS**.
- [ ] Sesuaikan aset: Tailwind CDN tetap; pastikan jsPDF/pdf.js/FontAwesome ter-load.
- [ ] Deploy ke Vercel. **Uji regresi**: UI identik, semua fitur berjalan.

**Deliverable:** aplikasi di Vercel, fungsional penuh dengan backend Sheets lama.
**Risiko:** CORS Apps Script → diatasi proxy. Latensi masih ada (masih Apps Script).

---

### FASE 2 — Fondasi Supabase (DB + Auth + Storage)
**Tujuan:** infrastruktur data baru siap (belum dipakai frontend).
- [ ] Tulis **migrations** skema Postgres final (tabel, FK, index, constraint,
      enum untuk status/role). Tambah kolom `created_at/updated_at`.
- [ ] **RLS policy** per role (sales/finance/site engineer/dst) — pengganti gating
      role di frontend, kini di level DB.
- [ ] **Supabase Auth**: skema migrasi user. **Password wajib di-hash** (yang lama
      kemungkinan plaintext) → set ulang / kirim reset.
- [ ] **Storage buckets** (`bukti`, `invoice`, `ded`, `quotation`) + kebijakan akses.
- [ ] Pasang `@supabase/supabase-js` di frontend (klien) — belum di-route.

**Deliverable:** Postgres + Auth + Storage siap, ter-seed data master.

---

### FASE 3 — Migrasi Modul per Vertical-Slice
**Pola per modul:** buat tabel → migrasi data (CSV export sheet → import Postgres) →
implement endpoint (Edge Function / RPC / supabase-js) **meniru kontrak lama** →
arahkan **routing shim** modul itu ke Supabase → **uji paralel** (bandingkan hasil
lama vs baru) → **cutover**. Kalau bermasalah, balikkan routing ke lama.

**Urutan modul (rendah risiko → tinggi keterkaitan):**
1. **Master data**: Produk/Jasa, Supplier, Pricelist, Klien, User/Auth.
2. **Penawaran** (+ items, hitung subtotal/HPP/hidden cost/margin) → **Work Order**
   (proyeksi/`view` dari penawaran Deal).
3. **Invoice**, **Kwitansi**, **Pembayaran** & status tagih.
4. **Engineering**: BOM → DED → QC → Schedule (assignment, review, gating HO).
5. **Inventory** (stok, mutasi), **Purchase Order**, **Penerimaan barang**.
6. **Hand Over**, **Pengeluaran / Realisasi HPP & Margin**, **Laporan**.
7. **Settings**, konfigurasi WA, jenis WO (Jasa/Material), dsb.

> Catatan: perhitungan sensitif (HPP = item + hidden cost, margin exclude PPN, dll)
> harus **diuji paralel** angka lama vs baru per modul sebelum cutover.

**Deliverable per modul:** tabel + data termigrasi + endpoint + shim ter-route + lulus uji.

---

### FASE 4 — Fitur Khusus (non-CRUD)
- [ ] **PDF**: bangun ulang 4 PDF berbasis template (PO / Invoice / Kwitansi /
      Quotation) ke **jsPDF client** (WO/BAST/Garansi/Kontrak sudah client-side).
      Alternatif: **Vercel serverless** + `puppeteer-core` + `@sparticuz/chromium`.
- [ ] **Notifikasi WA**: Edge Function memanggil server Baileys eksternal (kontrak
      pesan sama seperti sekarang).
- [ ] **Cron**: reminder penawaran expired + reminder HO → **Vercel Cron** atau
      **pg_cron** (jadwalkan Edge Function).
- [ ] **Google Meet** (Hand Over online): Edge Function → **Google Calendar API**
      (OAuth service account / refresh token).
- [ ] **Realtime (opsional)**: Supabase Realtime untuk BOM/QC/Schedule → hilangkan
      tombol "Muat Ulang".

---

### FASE 5 — Cutover Final & Pensiun Sistem Lama
- [ ] Migrasi **data delta** terakhir; bekukan penulisan ke Sheets.
- [ ] Arahkan **semua** routing shim → Supabase.
- [ ] Hapus proxy Apps Script; **arsipkan spreadsheet** (read-only) sebagai backup.
- [ ] Pemantauan error + **rencana rollback** (routing balik ke lama bila perlu).
- [ ] Dokumentasi operasional (deploy, env, backup Postgres).

---

## 4. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| CORS Apps Script (Fase 1) | Router `doPost` JSON + proxy serverless Vercel |
| Password plaintext | Hash saat migrasi Auth; paksa reset password |
| Bot WA butuh server persisten | Tetap server Baileys eksternal (tak berubah) |
| PDF template berbasis Sheet | Rebuild ke jsPDF client (atau Vercel+puppeteer) |
| Selisih angka (HPP/margin/PPN) | Uji paralel lama vs baru per modul sebelum cutover |
| Atomicity/lock (dulu LockService) | Transaksi Postgres + constraint (lebih kuat) |
| Role/akses data | RLS Postgres (lebih aman dari gating frontend) |
| Data dinamis besar | Index + query (bukan scan sheet) → jauh lebih cepat |

---

## 5. Yang Sudah "Siap Pindah" (aset yang tidak perlu ditulis ulang)
- **Seluruh UI**: HTML + Tailwind + JS render (`Page_*`, `JS_*`) → dipertahankan.
- **PDF client**: WO, BAST, Garansi, Kontrak (jsPDF) → jalan di mana saja.
- **Integrasi WA**: sudah HTTP eksternal → tinggal dipanggil dari Edge Function.

## 6. Yang PASTI Ditulis Ulang (inti pekerjaan)
- Semua logika `.gs` (SpreadsheetApp/LockService/DriveApp tidak ada di Supabase).
- Skema relasional + migrasi data.
- Auth + hashing + RLS.
- 4 PDF berbasis template Sheet.

---

## 7. Langkah Konkret Pertama (saat sesi migrasi dibuka)
1. Rancang **skema Supabase** (dari kamus data Fase 0).
2. Tulis **shim `google.script.run` + tabel routing**.
3. Buat **router `doPost` + proxy** untuk Apps Script lama.
4. **Port frontend ke Vercel** & buktikan jalan dengan data lama (Fase 1 selesai).
5. Migrasi **modul pertama** (Master data) end-to-end sebagai patokan pola.

---

*Catatan: dokumen ini rencana tingkat tinggi. Detail teknis (DDL skema, isi shim,
mapping endpoint) disusun saat sesi migrasi khusus.*
