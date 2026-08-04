# Panduan Implementasi Migrasi RenusPro → Vercel + Supabase

Panduan operasional (langkah-demi-langkah) untuk mengeksekusi migrasi. Semua
artefak sudah tersedia di repo. Kerjakan **berurutan**; setiap fase menghasilkan
sistem yang tetap berfungsi.

## Peta artefak
| File | Dipakai di |
|---|---|
| `00-migrasi-supabase-vercel.md` | Rencana besar per fase |
| `00-kamus-data-supabase.md` | Referensi kolom sheet→tabel |
| `00-ddl-supabase.sql` | Skema Postgres (Fase 2) |
| `00-ddl-supabase-2-trigger-rls.sql` | Trigger updated_at + RLS (Fase 2/3) |
| `migrasi/apps-script-router.gs` | Router `doPost` di Apps Script lama (Fase 1) |
| `migrasi/gs-run-shim.js` | Shim `google.script.run` di browser (Fase 1) |
| `migrasi/build.mjs` | Concat frontend → `dist/` (Fase 1) |
| `migrasi/vercel-proxy.js` | `api/gs.js` di Vercel (Fase 1) |
| `migrasi/apps-script-export.gs` | Export semua sheet → JSON (Fase 3) |
| `migrasi/mapping.mjs` + `migrasi/import-supabase.mjs` | Import data → Supabase (Fase 3) |

## Prasyarat
- Node.js 18+ terpasang lokal.
- Akun **Vercel** & **Supabase** (gratis cukup untuk mulai).
- Akses **editor Apps Script** project lama + izin deploy Web App.
- (Bot WhatsApp Baileys tetap server eksternal yang ada — tak diubah.)

---

## FASE 1 — Frontend ke Vercel (backend LAMA masih Sheets)
> Target: aplikasi identik jalan di Vercel, data dari Sheets. Nol risiko data.

### 1.1 Pasang router di Apps Script lama
1. Buka project Apps Script, tambah file baru, tempel isi `migrasi/apps-script-router.gs`.
2. **Deploy** → New deployment → **Web app** → Execute as: **Me**, Who has access:
   **Anyone**. Salin **URL `/exec`**.
   > Uji: `curl -L -X POST <URL_EXEC> -H "Content-Type: application/json" -d '{"fn":"getProdukList","args":[]}'`

### 1.2 Build frontend jadi statis
Dari root repo Apps Script:
```bash
node migrasi/build.mjs
# → dist/index.html + dist/gs-run-shim.js  (0 sisa scriptlet)
```

### 1.3 Siapkan project Vercel
Buat repo/proyek baru dengan struktur:
```
renuspro-web/
├── index.html          ← salin dari dist/index.html
├── gs-run-shim.js      ← salin dari dist/gs-run-shim.js
├── api/
│   └── gs.js           ← salin dari migrasi/vercel-proxy.js
└── vercel.json         ← (opsional) lihat di bawah
```
`vercel.json` (opsional; Vercel auto-detect api/):
```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "cleanUrls": true }
```
Import repo ke Vercel → Framework Preset: **Other** → tanpa build command.
Set **Environment Variable**: `APPS_SCRIPT_EXEC_URL = <URL_EXEC dari 1.1>`.

### 1.4 Deploy & uji
Deploy → buka URL Vercel. **Uji regresi menyeluruh**: login, semua menu, buat/edit
data, export PDF, dsb. Tampilan HARUS identik & fitur berjalan (via Sheets lama).
> Bila error CORS: pastikan frontend memanggil `/api/gs` (bukan `/exec` langsung).
> Bila 500: cek `APPS_SCRIPT_EXEC_URL` & allowlist di router.

✅ **Fase 1 selesai**: sistem live di Vercel, UI tak berubah.

---

## FASE 2 — Fondasi Supabase (DB + Auth + Storage)

### 2.1 Buat project Supabase
Catat: **Project URL**, **anon key**, **service_role key** (Settings → API).

### 2.2 Jalankan skema
SQL Editor → jalankan **`00-ddl-supabase.sql`** (43 tabel + view `work_order`).
> Belum jalankan trigger/RLS — biarkan tabel terbuka dulu untuk impor.

### 2.3 Storage buckets
Storage → buat bucket: `bukti`, `invoice`, `ded`, `quotation` (private).

### 2.4 Auth
Authentication → aktifkan Email/Password (atau provider pilihan). Provisioning
user dilakukan di Fase 3 (setelah `app_user` terisi).

---

## FASE 3 — Migrasi Data

### 3.1 Export dari Apps Script
Tempel `migrasi/apps-script-export.gs` ke Apps Script lama → jalankan
`exportSemuaSheetKeJSON()` → unduh file `renus-export-YYYYMMDD.json` dari Drive.

### 3.2 Import ke Supabase (dry-run dulu!)
```bash
npm i @supabase/supabase-js
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."

# 1) Uji transformasi tanpa menulis:
node migrasi/import-supabase.mjs renus-export-YYYYMMDD.json --dry

# 2) Impor master dulu (target FK):
node migrasi/import-supabase.mjs renus-export-YYYYMMDD.json \
  --only=klien,produk,app_user,supplier,pricelist_kategori,pricelist,supplier_produk,akun_pembayaran,template_paket

# 3) Impor sisanya (urutan mapping sudah dependency-aware):
node migrasi/import-supabase.mjs renus-export-YYYYMMDD.json
```
> Script mengubah '' → NULL, `dd/MM/yyyy` → date, `Ya/TRUE` → boolean, kolom JSON
> → jsonb. Baris tanpa PK dilewati. Gunakan `--only=` untuk ulang per tabel.

### 3.3 Provisioning Auth (password TIDAK diimpor)
Untuk tiap `app_user`: buat user di Supabase Auth (email + password sementara),
lalu isi `app_user.auth_uid` dengan `auth.users.id`-nya. Bisa via skrip Admin API
(`supabase.auth.admin.createUser`) — minta saya buatkan bila perlu. Umumkan ke
tim untuk reset password.

### 3.4 Trigger + RLS
Setelah data & `auth_uid` terisi, jalankan **`00-ddl-supabase-2-trigger-rls.sql`**
(trigger updated_at + aktifkan RLS + policy STARTER). Perketat policy per-role
bertahap (template ada di file itu).

### 3.5 Verifikasi angka
Bandingkan beberapa nilai kritis (Total HPP, margin, saldo) antara Supabase vs
sistem lama untuk beberapa WO/penawaran.

---

## FASE 4 — Migrasi Logika per Modul (cutover bertahap)
Untuk tiap modul, buat endpoint baru lalu **alihkan routing shim** tanpa menyentuh UI:

**Opsi A — supabase-js langsung dari frontend** (CRUD sederhana):
```js
// tambahkan setelah gs-run-shim.js + inisialisasi supabase client:
gsRoute('getProdukList', { mode:'fn', handler: async () => {
  const { data, error } = await supabase.from('produk').select('*').order('id');
  if (error) return { success:false, message:error.message };
  return { success:true, list:data };   // ← bentuk return SAMA seperti .gs lama
}});
```
**Opsi B — Edge Function** (logika kompleks/transaksi/hitung HPP):
```js
gsRoute('simpanPenawaran', { mode:'api', url:'/functions/v1/simpanPenawaran' });
```
Frontend perlu klien Supabase (anon key) — muat sebelum shim:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>window.supabase = supabase.createClient('<URL>','<ANON_KEY>');</script>
```
> Fungsi yang belum di-`gsRoute` tetap jalan lewat proxy Apps Script lama →
> migrasi aman & reversible. Uji per modul (bandingkan hasil), baru lanjut.

Urutan modul disarankan (lihat `00-migrasi-supabase-vercel.md`):
Master → Penawaran/WO → Invoice/Kwitansi → BOM/DED/QC/Schedule → Inventory/PO →
HO/Realisasi/Laporan → Settings.

---

## FASE 5 — Fitur Khusus & Cutover Final
- **PDF template** (PO/Invoice/Kwitansi/Quotation): bangun ulang ke **jsPDF client**
  (WO/BAST/Garansi sudah). Alternatif: Vercel serverless + `puppeteer-core`.
- **Notifikasi WA**: Edge Function panggil server Baileys eksternal (kontrak sama).
- **Cron** (reminder expired/HO): **Vercel Cron** atau **pg_cron**.
- **Google Meet**: Edge Function → Google Calendar API.
- **Cutover**: migrasi data delta terakhir → alihkan SEMUA `gsRoute` ke baru →
  matikan proxy Apps Script → arsipkan spreadsheet (read-only). Simpan rencana
  rollback (kembalikan routing ke lama bila perlu).

---

## Checklist Ringkas
- [ ] F1: router.gs deploy + URL /exec
- [ ] F1: `node migrasi/build.mjs` → dist/
- [ ] F1: project Vercel (index.html + gs-run-shim.js + api/gs.js + env)
- [ ] F1: uji regresi UI OK
- [ ] F2: project Supabase + jalankan `00-ddl-supabase.sql`
- [ ] F2: buckets Storage + aktifkan Auth
- [ ] F3: export JSON dari Apps Script
- [ ] F3: import `--dry` → import master → import sisanya
- [ ] F3: provisioning Auth + isi auth_uid
- [ ] F3: jalankan trigger/RLS + verifikasi angka
- [ ] F4: migrasi modul per-slice via gsRoute (uji tiap modul)
- [ ] F5: PDF/WA/cron/Meet + cutover final + pensiun Sheets

## Troubleshooting cepat
| Gejala | Kemungkinan |
|---|---|
| CORS error di browser | Frontend memanggil `/exec` langsung; harus lewat `/api/gs` |
| 500 dari /api/gs | `APPS_SCRIPT_EXEC_URL` salah / fungsi tak ada di allowlist |
| Import gagal FK | Nilai '' belum jadi NULL (pastikan pakai import script), atau impor master belum jalan duluan |
| Tanggal null/salah | Format sheet tak dikenali → cek `toDate/toTs` di import-supabase.mjs |
| RLS blokir semua | Belum ada policy / `auth_uid` belum diisi → cek policy STARTER |
| Angka HPP beda | Bandingkan `total_hpp` (termasuk hidden cost) vs perhitungan lama |
