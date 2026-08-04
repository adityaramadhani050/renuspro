# Rencana Migrasi RenusPro

**Dari:** Google Sheets + Apps Script (web app)
**Ke:** Supabase (Postgres) + Railway (backend/worker) + Vercel (frontend)

Dokumen ini disusun dari pembacaan seluruh kode di repo ini (16 modul `.gs`,
~20 partial frontend). Semua referensi baris merujuk ke kode yang ada saat
dokumen ini dibuat.

---

## 1. Ringkasan eksekutif

Migrasi **direkomendasikan**, dengan tiga catatan:

1. **Kerjakan Fase 0 lebih dulu.** Migrasi penuh realistis 3–4 bulan. Perbaikan
   cepat di sistem sekarang bisa memberi kelegaan dalam 1–2 minggu, dan
   pekerjaannya tidak terbuang.
2. **PDF dimigrasi terakhir.** Ini komponen termahal dan paling tidak punya
   padanan langsung. Selama transisi, Apps Script tetap dipakai sebagai
   *PDF service* yang dipanggil lewat webhook.
3. **Masalah keamanan diperbaiki sekarang, bukan nanti.** Lihat §3.

**Estimasi biaya setelah migrasi:** ±$30–65/bulan (Supabase Pro $25 + Railway
$5–20 + Vercel $0–20). Saat ini ±$0.

---

## 2. Diagnosa: penyebab lambat

Bukan sekadar "data sudah banyak". Ada empat masalah struktural:

| # | Masalah | Bukti di kode | Dampak |
|---|---------|---------------|--------|
| 1 | Semua baca = full table scan | 69× `getDataRange().getValues()` di 14 file (`Penawaran.gs` 13×, `Invoice.gs` 10×) | Biaya tiap request tumbuh linear terhadap total baris, walau user cuma lihat 10 baris |
| 2 | Pagination di browser, bukan server | `JS_Pagination.html:199` — `state.data.slice(...)`; `Dashboard.gs` kirim **semua** penawaran lalu KPI dihitung di klien | Payload besar + serialisasi `google.script.run` yang lambat |
| 3 | **Global lock 25 detik saat export PDF** | `PdfExport.gs:23` — `LockService.getScriptLock()` + `waitLock(25000)`, menulis ke sheet `Template_Quotation` di spreadsheet yang sama | `ScriptLock` berlaku **seluruh aplikasi, bukan per user**. Satu orang generate PDF ⇒ semua orang lain antre. Ini penyebab dominan saat user banyak |
| 4 | Bundle script kelebihan beban | `TnC.gs` dan `t&c.gs` **identik**, masing-masing 611 KB base64 PDF | Apps Script mem-parse semua `.gs` tiap eksekusi. (Kalau keduanya ter-push, `const TC_PDF_JASA_B64` bentrok deklarasi) |

**Kesimpulan:** masalah #3 dan #4 tidak akan hilang dengan menambah data lebih
rapi — dan bisa diperbaiki tanpa migrasi.

---

## 3. Temuan keamanan (prioritas tinggi)

| Temuan | Lokasi | Risiko |
|--------|--------|--------|
| `access: ANYONE_ANONYMOUS` + `executeAs: USER_DEPLOYING` | `appsscript.json` | Siapa pun yang punya URL menjalankan script dengan hak akses penuh pemilik spreadsheet |
| Password disimpan **plaintext**, dibandingkan dengan `===` | `Auth.gs:60`, sheet `Master_User` kolom D | Siapa pun yang bisa buka spreadsheet melihat semua password |
| Tidak ada session token; identitas user hanya state di browser | `JS_Auth_Users.html` | Panggilan `google.script.run` bisa dipanggil langsung tanpa login |
| Otorisasi role dicek di frontend | tersebar di `JS_*.html` | Bisa di-bypass; backend tidak memverifikasi ulang |

**Aturan mutlak saat migrasi:** password plaintext **tidak boleh** diimpor ke
Supabase. Semua user melakukan reset password saat cutover auth (Fase 2).

---

## 4. Arsitektur target

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Vercel     │────▶│    Supabase      │◀────│      Railway       │
│  (frontend)  │     │  Postgres + Auth │     │  worker & service  │
│  region sin1 │     │  + Storage + RLS │     │  region Singapore  │
└──────────────┘     │  ap-southeast-1  │     └────────────────────┘
                     └──────────────────┘              │
                                                       ├─ PDF service
                                                       ├─ WhatsApp (Baileys)
                                                       └─ cron / laporan
```

**Pembagian tanggung jawab:**

- **Supabase** — sumber kebenaran data. CRUD biasa (produk, klien, penawaran,
  invoice) langsung lewat PostgREST + RLS. **Tidak perlu bikin API layer
  sendiri untuk ini** — itu kerja dua kali.
- **Railway** — hanya untuk yang tidak bisa serverless:
  - **PDF service** — butuh Chromium/Puppeteer, proses berat
  - **WhatsApp/Baileys** — butuh proses persisten dengan session state
    (`WhatsApp.gs` sekarang memanggil endpoint Baileys eksternal)
  - **Cron** — rekap laporan, reminder invoice jatuh tempo
- **Vercel** — frontend saja.

**Region wajib Singapore di ketiganya** (Supabase `ap-southeast-1`, Railway
`asia-southeast1`, Vercel function region `sin1`). Salah region bisa menghapus
sebagian besar keuntungan latensi yang dikejar.

---

## 5. Pemetaan Sheet → Tabel Postgres

### 5.1 Ringkasan pemetaan

| Sheet sekarang | Tabel target | Catatan |
|----------------|--------------|---------|
| `Master_Klien` | `customers` | langsung |
| `Master_Produk` | `products` | langsung |
| `Master_User` | `profiles` (+ `auth.users`) | password **tidak** dimigrasi |
| `Template_Paket` | `package_templates` + `package_template_items` | kolom JSON dinormalisasi |
| `Penawaran_Main` | `quotations` + `quotation_revisions` + `quotation_item_groups` + `quotation_items` | dipecah 4, lihat §5.3 |
| `Penawaran_Main` kol. 18–19 | `work_orders` | No WO & Tanggal Deal dipromosikan jadi tabel |
| `WorkOrder_Catatan` | `work_orders.notes` | 1:1, dilebur |
| `WO_RequestInvoice` | `invoice_requests` | kolom denormal dibuang |
| `Invoice_Main` | `invoices` | **tidak** punya tabel item — lihat §5.3b |
| `Kwitansi_Main` | `receipts` | langsung |
| ScriptProperties `BANK_ACCOUNTS` | `bank_accounts` | |
| ScriptProperties `TC_OPTIONS` | `app_settings` | |
| ScriptProperties `WA_*` | **env var Railway** | jangan simpan di DB |
| `Template_Quotation`, `Template_Invoice`, `Template_Kwitansi` | — | tidak dimigrasi; jadi HTML template di PDF service |

### 5.2 Struktur `Penawaran_Main` saat ini (19 kolom)

Hasil pembacaan `SheetInit.gs`, `Penawaran.gs:60-70`, `WorkOrder.gs:63`,
`Dashboard.gs:44`, `SalesReport.gs:234-235`:

| Idx | Kolom | Idx | Kolom |
|-----|-------|-----|-------|
| 0 | No Penawaran | 10 | Grand Total |
| 1 | Rev | 11 | Total HPP |
| 2 | Tanggal | 12 | Estimasi Keuntungan |
| 3 | Valid Hingga | 13 | Margin Profit (%) |
| 4 | Nama Project | 14 | Syarat Ketentuan (JSON) |
| 5 | Klien ID | 15 | Rincian Item (JSON) |
| 6 | Dibuat Oleh | 16 | Status |
| 7 | Subtotal | 17 | **No WO** |
| 8 | Diskon | 18 | **Tanggal Deal** |
| 9 | Pajak (PPN) | | |

### 5.3 Keputusan desain penting

**a) `Penawaran_Main` dipecah menjadi empat tabel.**

`quotations` (identitas & keadaan) → `quotation_revisions` (isi per revisi) →
`quotation_item_groups` (sub-paket) → `quotation_items` (baris item).

Saat ini setiap revisi adalah baris baru dengan kunci majemuk (No Penawaran, Rev),
dan seluruh header diduplikasi. Akibatnya pola "ambil revisi terakhir" muncul
berulang di `Dashboard.gs:42`, `Penawaran.gs:60`, `WorkOrder.gs:63`,
`SalesReport.gs`. Semua kode itu hilang dengan model yang benar.

Lebih penting: **Status, No WO, dan Tanggal Deal disimpan per-revisi padahal
maknanya per-penawaran.** `updateStatusPenawaran()` (`Penawaran.gs:316`) menulis
ke satu baris revisi tertentu, sementara semua pembaca mengambil revisi terakhir
— ini sumber inkonsistensi. Memisahkannya menutup satu kelas bug sekaligus.

> *Alternatif yang lebih konservatif:* pertahankan satu tabel `quotations`
> dengan unique (quote_number, rev) + kolom `is_current`. Lebih dekat ke sumber,
> tapi mewariskan masalah di atas. Rekomendasi tetap pemecahan.

**b) Kolom JSON dinormalisasi — dengan dua koreksi penting.**

*Koreksi pertama:* `Rincian Item (JSON)` pada `Penawaran_Main` (kol. 16) **bukan
array datar**, melainkan daftar kelompok. Lihat `JS_Form_Penawaran.html:350-352`:

```json
[{ "kelompok": "A", "namaKelompok": "PAKET UTAMA", "subtotal": 84500000,
   "subItems": [{ "noItem": 1, "produkId": "P001", "deskripsi": "...",
                  "qty": 17, "unit": "unit", "harga": 2500000,
                  "hpp": 1900000, "total": 42500000 }] }]
```

Karena itu dibutuhkan **dua** tabel — `quotation_item_groups` →
`quotation_items` — bukan satu. Penawaran lama yang masih berupa array datar
(dari sebelum fitur sub-paket ada) tetap ditangani importer: dibungkus menjadi
satu kelompok tanpa nama sehingga tidak ada data yang hilang.

Normalisasi inilah yang membuat laporan seperti "produk terlaris" menjadi satu
query SQL (`v_product_sales`), bukan parsing JSON di dalam loop.

*Koreksi kedua:* kolom `Invoice_Main` yang **berlabel** `Rincian Item (JSON)`
(kol. 16) sebenarnya **tidak berisi item baris sama sekali**. Yang ditulis ke
sana adalah meta — lihat `Invoice.gs:326-339`:

```js
const meta = { scope, nilaiKontrak, inputMode };
sheet.appendRow([ ..., JSON.stringify(meta), 'Belum Lunas', ... ]);
```

Invoice di sistem ini menagih **persentase dari nilai kontrak**; rincian
barangnya tetap milik penawaran. Karena itu **tidak ada tabel `invoice_items`** —
ketiga field meta menjadi kolom biasa (`scope`, `contract_value`, `input_mode`).

`Syarat Ketentuan (JSON)` tetap `jsonb` karena isinya memang bebas bentuk.

**c) Invoice menyimpan snapshot data klien.**
`Invoice_Main` sekarang menduplikasi Klien ID, Nama Klien, Nama Project. Itu
**bukan kesalahan** — invoice adalah dokumen legal, isinya harus mencerminkan
keadaan saat diterbitkan, bukan ikut berubah kalau nama klien diedit. Karena itu
`invoices` tetap punya `customer_snapshot jsonb` di samping FK `customer_id`.

**d) `Dibuat Oleh` menyimpan nama lengkap, bukan ID.**
`Dashboard.gs:38` membandingkan `pembuat !== namaUser.trim()`. Ini rapuh: dua
user dengan nama sama, atau satu user ganti nama, membuat data historis putus.
**Skrip migrasi harus memetakan nama → `user_id`,** dan setiap nama yang tidak
cocok masuk laporan agar direview manual. Jangan diam-diam di-`NULL`-kan.

**e) Penomoran dokumen diganti dengan counter transaksional.**
Keempat generator (`generateNextQuotationNumber` `Penawaran.gs:245`,
`generateNextInvoiceNumber` `Invoice.gs:50`, `generateNextWONumber`
`WorkOrder.gs:17`, `generateNextKwitansiNumber` `Kwitansi.gs:30`) memakai pola
"scan seluruh kolom, ambil maks, +1" — *race condition* saat dua user menyimpan
bersamaan. Diganti fungsi SQL dengan row lock (lihat §5.5).

**f) Nilai enum dipertahankan dalam bahasa Indonesia** (`'On-Progress'`,
`'Deal'`, `'Fail'`, `'Belum Lunas'`, `'Lunas'`, `'DP'`, `'Termin'`,
`'Pelunasan'`, `'Penuh'`) agar impor data tidak perlu penerjemahan — satu
sumber bug yang tidak perlu.

### 5.4 DDL

DDL lengkapnya **bukan di dokumen ini**, melainkan di
[`supabase/migrations/`](supabase/migrations/) sebagai migration file yang
benar-benar bisa dijalankan. Menyalinnya ke sini hanya akan membuat dokumen dan
kode berbeda pelan-pelan tanpa ada yang menyadari.

| Berkas | Isi |
|--------|-----|
| `20260804010000_extensions_and_enums.sql` | Extension & enum |
| `20260804020000_master_tables.sql` | `profiles`, `customers`, `products`, template paket |
| `20260804030000_quotations.sql` | Penawaran, revisi, kelompok item, item |
| `20260804040000_work_orders.sql` | Work Order & permintaan invoice |
| `20260804050000_invoices_receipts.sql` | Invoice, kwitansi, pengaturan |
| `20260804060000_numbering.sql` | Penomoran transaksional & otomasi status |
| `20260804070000_views.sql` | View dashboard & laporan |
| `20260804080000_rls.sql` | Row Level Security |

Verifikasi seluruhnya pada database bersih:

```bash
./tools/verify-schema.sh
```

Skrip itu menjalankan setiap migration secara berurutan, lalu menjalankan
[`supabase/tests/10_behaviour.sql`](supabase/tests/10_behaviour.sql) yang
membuktikan perilakunya — penomoran, pointer revisi terkini, otomasi
Deal→Work Order, constraint invoice pre-deal, perhitungan view, dan isolasi
RLS antar role.

### 5.4a Catatan keamanan pada view

Secara default, view di Postgres dieksekusi dengan hak **pemilik view**,
sehingga RLS pada tabel di bawahnya tidak berlaku. Tanpa `security_invoker`,
seorang sales bisa membaca seluruh penawaran milik orang lain cukup lewat
`v_quotations` — persis lubang yang ingin ditutup RLS. Semua view di migrasi 07
karena itu di-set `security_invoker = true`, dan setiap view baru wajib ikut.

### 5.5 Penomoran dokumen yang aman dari race

Menggantikan keempat generator "scan maks + 1":

```sql
create table document_counters (
  doc_type  text not null,        -- 'quotation' | 'invoice' | 'wo' | 'receipt'
  period    text not null,        -- '2026' untuk yang reset tahunan, '-' untuk global
  last_seq  int  not null default 0,
  primary key (doc_type, period)
);

create or replace function next_document_seq(p_type text, p_period text)
returns int
language plpgsql
as $$
declare
  v_seq int;
begin
  insert into document_counters (doc_type, period, last_seq)
  values (p_type, p_period, 1)
  on conflict (doc_type, period)
    do update set last_seq = document_counters.last_seq + 1
  returning last_seq into v_seq;
  return v_seq;
end;
$$;
```

Contoh No WO (format `[YY][NNN]`, reset per tahun — `WorkOrder.gs:17`):

```sql
select to_char(now(), 'YY') ||
       lpad(next_document_seq('wo', to_char(now(), 'YYYY'))::text, 3, '0');
```

Saat impor data lama, `last_seq` diisi dari nomor tertinggi yang sudah ada.

### 5.6 Row Level Security

Menggantikan pengecekan role yang sekarang tersebar di frontend:

```sql
alter table quotations enable row level security;

create or replace function current_role_name() returns user_role
language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- Sales hanya lihat penawaran miliknya; admin & finance lihat semua.
create policy quotations_select on quotations for select
  using (
    current_role_name() in ('admin', 'finance')
    or owner_id = auth.uid()
  );

create policy quotations_insert on quotations for insert
  with check (owner_id = auth.uid() or current_role_name() = 'admin');

create policy quotations_update on quotations for update
  using (current_role_name() = 'admin' or owner_id = auth.uid());

-- Invoice: hanya finance & admin yang boleh menulis.
alter table invoices enable row level security;

create policy invoices_select on invoices for select
  using (auth.uid() is not null);

create policy invoices_write on invoices for all
  using (current_role_name() in ('admin', 'finance'))
  with check (current_role_name() in ('admin', 'finance'));
```

Ini menutup temuan §3 baris 4: otorisasi berpindah ke database, tidak bisa
di-bypass dari klien.

---

## 6. Pemetaan fungsi backend

Dipakai sebagai checklist progres migrasi.

| Modul GAS | Fungsi | Target |
|-----------|--------|--------|
| `Customer.gs` | `getCustomerList`, `simpanCustomer`, `editCustomer`, `hapusCustomer` | PostgREST `customers` |
| `Produk.gs` | `getProdukList`, `simpanProduk`, `editProduk`, `hapusProduk` | PostgREST `products` |
| `TemplatePaket.gs` | `getTemplatePaketMap`, `simpanTemplatePaket`, `hapusTemplatePaket` | PostgREST + RPC |
| `Auth.gs` | `loginUser`, `getUserList`, `simpanUser`, `editUser`, `hapusUser`, `gantiPassword` | Supabase Auth + `profiles` |
| `Penawaran.gs` | `getPenawaranList`, `getRiwayatRevisi`, `getInitialData` | PostgREST + view |
| | `generateNextQuotationNumber` | RPC `next_document_seq` |
| | `simpanPenawaranKeSheet`, `editPenawaran` | RPC transaksional (header + item sekaligus) |
| | `updateStatusPenawaran` | RPC — sekaligus buat `work_orders` saat status Deal |
| `WorkOrder.gs` | `getWorkOrderList`, `getWorkOrderDashboard` | view SQL |
| | `simpanCatatanWO`, `requestInvoice` | PostgREST |
| `Invoice.gs` | `getInvoiceList`, `getInvoiceInitialData` | view SQL |
| | `simpanInvoice`, `editInvoice`, `updateStatusBayarInvoice` | RPC transaksional |
| | `terbilangIndo` | pindah ke frontend (fungsi murni) |
| `Kwitansi.gs` | seluruh CRUD | PostgREST + RPC |
| `Dashboard.gs` | `getDashboardRawData` | **view SQL teragregasi** — bukan kirim data mentah |
| `SalesReport.gs` | `getSalesReportData` | view SQL / materialized view |
| `FinanceReport.gs` | `getFinanceReportData`, `_agingBucket` | view SQL dengan aging bucket |
| `Settings.gs` | `getTCOptions`, `saveTCOptions`, `getBankAccounts`, `saveBankAccounts` | `app_settings`, `bank_accounts` |
| `WhatsApp.gs` | `sendWANotif`, `notif*` | service Railway |
| `PdfExport.gs`, `InvoicePdf.gs`, `KwitansiPdf.gs` | seluruhnya | **PDF service Railway (Fase 5)** |
| `SheetInit.gs`, `Main.gs` | — | dihapus |

**Catatan khusus Dashboard & Report.** Ini justru bagian termudah dan paling
besar dampaknya. `Dashboard.gs` sekarang mengirim seluruh penawaran ke browser
untuk dihitung di sana; setelah migrasi ia menjadi satu query agregat yang
mengembalikan belasan angka. Perbaikan terasa paling dramatis di sini.

---

## 7. Rencana bertahap

### Fase 0 — Perbaikan cepat di sistem sekarang · 1–2 minggu

Tidak menyentuh arsitektur. Tujuannya memberi kelegaan sekarang, karena migrasi
penuh butuh 3–4 bulan.

- [ ] Hapus `t&c.gs` (duplikat identik `TnC.gs`)
- [ ] Pindahkan base64 PDF T&C ke file di Drive, ambil lewat file ID —
      menghilangkan ~600 KB literal yang di-parse tiap eksekusi
- [ ] **Pindahkan sheet `Template_Quotation`/`Template_Invoice`/`Template_Kwitansi`
      ke spreadsheet terpisah** sehingga lock PDF tidak memblokir seluruh aplikasi.
      Perubahan tunggal dengan dampak terbesar
- [ ] Ganti `getDataRange()` → `getRange(baris, kolom, n, m)` untuk daftar
      berpaginasi; pindahkan pagination ke server
- [ ] Cache `Master_Klien` & `Master_Produk` dengan `CacheService`
- [ ] Ganti `access: ANYONE_ANONYMOUS` (§3)

**Ukuran keberhasilan:** waktu muat halaman Penawaran & Dashboard, dan waktu
tunggu export PDF saat 3+ user bersamaan. Catat angka *sebelum* mulai.

### Fase 1 — Fondasi data · ±2 minggu

- [ ] Provision Supabase (region `ap-southeast-1`)
- [ ] Terapkan DDL §5.4 sebagai migration file (bukan lewat dashboard — harus
      masuk version control)
- [ ] Tulis skrip impor Node yang **idempoten dan bisa dijalankan berulang**:
      Sheets API → Postgres. Bukan sinkronisasi realtime — itu akan dibuang.
- [ ] Laporan hasil pemetaan `Dibuat Oleh` → `profiles` (§5.3d); review manual
      yang tidak cocok
- [ ] Validasi: jumlah baris, total grand total penawaran, total nilai invoice,
      dan saldo piutang harus **sama persis** antara Sheets dan Postgres

Sheets masih sumber kebenaran. Risiko nol.

### Fase 2 — Autentikasi · ±1 minggu

- [ ] Provision user di Supabase Auth (tanpa password lama)
- [ ] Semua user reset password lewat email
- [ ] Aktifkan RLS §5.6 dan uji per role (admin/sales/finance)
- [ ] Frontend shell di Vercel: login + layout, belum ada modul

### Fase 3 — Migrasi per modul · 6–10 minggu

**Aturan mutlak: satu tabel hanya boleh punya satu pemilik tulis.** Jangan
dual-write — di situlah data jadi tidak konsisten. Tiap modul dipindah utuh
(read + write), lalu tulis di GAS dimatikan untuk tabel itu.

Urutan (dari risiko terendah):

1. [ ] **Produk & Klien** — `Produk.gs` cuma 3 KB, CRUD murni
2. [ ] **Template Paket**
3. [ ] **Dashboard & Laporan** (read-only, tidak ada risiko tulis; dampak paling terasa)
4. [ ] **Penawaran** — modul terbesar, termasuk revisi
5. [ ] **Work Order**
6. [ ] **Invoice**
7. [ ] **Kwitansi**

Tiap modul: impor ulang final → alihkan tulis → jalankan paralel 1 minggu →
matikan menu lama di GAS.

### Fase 4 — Layanan Railway · ±2 minggu

- [ ] Pindahkan integrasi WhatsApp/Baileys ke Railway (kredensial jadi env var)
- [ ] Cron: reminder invoice jatuh tempo, rekap harian

### Fase 5 — PDF · 3–4 minggu

Dikerjakan terakhir, tanpa tekanan waktu, karena sampai titik ini Apps Script
masih melayani PDF lewat webhook.

- [ ] Bangun ulang template quotation/invoice/kwitansi sebagai HTML
- [ ] Render dengan Puppeteer di Railway
- [ ] Gabungkan lampiran T&C (file PDF di Supabase Storage)
- [ ] Bandingkan hasil dengan PDF lama berdampingan sebelum cutover

### Fase 6 — Dekomisi

- [ ] Spreadsheet jadi read-only, disimpan sebagai arsip
- [ ] Cabut deployment web app Apps Script
- [ ] Backup terjadwal Supabase terverifikasi (uji *restore*-nya, bukan cuma backup-nya)

---

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Dual-write bikin data tidak konsisten | Satu pemilik tulis per tabel; migrasi per modul utuh, bukan per layer |
| PDF baru tidak sama persis dengan yang lama | Dikerjakan terakhir, dibandingkan berdampingan; GAS tetap jadi fallback sampai disetujui |
| Pemetaan `Dibuat Oleh` gagal untuk data historis | Laporan ketidakcocokan + review manual sebelum cutover (§5.3d) |
| Migrasi molor, user terlanjur kecewa | Fase 0 memberi perbaikan nyata dalam 1–2 minggu |
| Salah region ⇒ latensi tetap buruk | Kunci Singapore di ketiga platform sejak provisioning |
| Biaya naik dari $0 | Dianggarkan $30–65/bulan sejak awal |
| Vendor lock-in Supabase | Datanya Postgres standar; `pg_dump` bisa pindah ke mana saja |

---

## 9. Estimasi

| Fase | Durasi (part-time) |
|------|--------------------|
| 0 — Perbaikan cepat | 1–2 minggu |
| 1 — Fondasi data | 2 minggu |
| 2 — Autentikasi | 1 minggu |
| 3 — Migrasi per modul | 6–10 minggu |
| 4 — Layanan Railway | 2 minggu |
| 5 — PDF | 3–4 minggu |
| **Total** | **±15–21 minggu (3,5–5 bulan)** |

Full-time bisa ditekan ke ±8–10 minggu.

---

## 10. Status pengerjaan

### Sudah selesai & terverifikasi

| Bagian | Lokasi | Bukti |
|--------|--------|-------|
| Skema Postgres (16 tabel, 9 view, 35 policy RLS) | `supabase/migrations/` | `./tools/verify-schema.sh` — seluruh migrasi jalan pada database bersih |
| Tes perilaku skema | `supabase/tests/10_behaviour.sql` | penomoran, otomasi Deal→WO, constraint invoice, isolasi RLS antar role |
| Importer Sheets → Supabase | `tools/importer/` | 22 tes lulus (15 parser + 7 integrasi ke Postgres sungguhan) |
| Aplikasi web: Dashboard, Penawaran, Work Order, Invoice, Kwitansi, Produk, Klien | `apps/web/` | `npm run build` lolos (18 route), termasuk pemeriksaan tipe |
| RPC `save_quotation()` transaksional | `supabase/migrations/20260804090000_save_quotation.sql` | 22 assertion di `supabase/tests/20_save_quotation.sql` |
| RPC `create_invoice()` & `set_invoice_payment_status()` | `supabase/migrations/20260804100000_invoice_functions.sql` | 23 assertion di `supabase/tests/30_invoice.sql` |

### Belum dikerjakan

| Bagian | Fase |
|--------|------|
| Laporan Sales & Finance sebagai halaman (view SQL-nya sudah ada) | 3 |
| Service WhatsApp/Baileys di Railway | 4 |
| PDF service (Puppeteer) | 5 |
| Fase 0 — perbaikan cepat di Apps Script | 0 |

**Belum diverifikasi saat dijalankan:** aplikasi web belum pernah dihubungkan ke
Supabase sungguhan — itu butuh kredensial proyek. Yang sudah terbukti baru
kompilasi dan pemeriksaan tipe; skema dan importer sudah teruji terhadap
Postgres nyata.

### Yang perlu keputusan Anda

1. **Visibilitas penawaran bagi sales.** Kode lama tidak konsisten:
   `getPenawaranList()` mengembalikan semua penawaran, sedangkan
   `getDashboardRawData()` memfilter milik sendiri untuk non-admin. RLS saat ini
   memakai yang lebih ketat (sales hanya melihat miliknya). Kalau tim sales
   memang perlu saling melihat, ubah satu policy: `quotations_select` di
   `supabase/migrations/20260804080000_rls.sql`.

2. **Email untuk tiap user.** `Master_User` tidak punya kolom email, sedangkan
   Supabase Auth memerlukannya. Tetapkan `AUTH_EMAIL_DOMAIN` (email diturunkan
   dari username) atau isi `users.csv` per user.

3. **Fase 0 dijalankan atau dilewati.** Migrasi penuh masih 3–4 bulan. Kalau
   pengguna sedang sangat terganggu, memindahkan sheet template PDF ke
   spreadsheet terpisah saja sudah menghilangkan antrean lock 25 detik yang jadi
   penyebab dominan lambatnya sistem.
