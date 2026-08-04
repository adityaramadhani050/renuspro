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
| `Penawaran_Main` | `quotations` + `quotation_revisions` + `quotation_items` | dipecah 3, lihat §5.3 |
| `Penawaran_Main` kol. 18–19 | `work_orders` | No WO & Tanggal Deal dipromosikan jadi tabel |
| `WorkOrder_Catatan` | `work_orders.notes` | 1:1, dilebur |
| `WO_RequestInvoice` | `invoice_requests` | kolom denormal dibuang |
| `Invoice_Main` | `invoices` + `invoice_items` | kolom JSON dinormalisasi |
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

**a) `Penawaran_Main` dipecah menjadi `quotations` + `quotation_revisions`.**

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

**b) Kolom JSON dinormalisasi jadi tabel item.**
`Rincian Item (JSON)` (`Penawaran_Main` kol. 15) dan `Rincian Item (JSON)`
(`Invoice_Main` kol. 15) menjadi `quotation_items` dan `invoice_items`. Ini yang
memungkinkan laporan seperti "produk terlaris" jadi satu query SQL, bukan
parsing JSON di loop.

`Syarat Ketentuan (JSON)` tetap `jsonb` — isinya memang bebas bentuk.

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

```sql
-- ══════════════════════════════════════════════════════════════
-- ENUM
-- ══════════════════════════════════════════════════════════════
create type user_role         as enum ('admin', 'sales', 'finance');
create type quotation_status  as enum ('On-Progress', 'Deal', 'Fail');
create type invoice_type      as enum ('DP', 'Termin', 'Pelunasan', 'Penuh');
create type payment_status    as enum ('Belum Lunas', 'Lunas');
create type request_status    as enum ('Pending', 'Diproses', 'Selesai', 'Ditolak');

-- ══════════════════════════════════════════════════════════════
-- MASTER
-- ══════════════════════════════════════════════════════════════

-- Master_User  →  auth.users (Supabase Auth) + profiles
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  legacy_code    text unique,                    -- 'U001'
  full_name      text not null,
  username       text not null unique,
  role           user_role not null default 'sales',
  is_active      boolean not null default true,
  monthly_target numeric(15,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- CATATAN: kolom Password TIDAK dimigrasi. Semua user reset password.

-- Master_Klien  →  customers
create table customers (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                        -- 'K001'
  name        text not null,                      -- Nama Klien
  company     text,                               -- Perusahaan
  address     text,                               -- Alamat
  phone       text,                               -- Kontak
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on customers using gin (to_tsvector('simple', name || ' ' || coalesce(company,'')));

-- Master_Produk  →  products
create table products (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                        -- 'P001'
  name        text not null,                      -- Nama Jasa/Produk
  unit        text not null default 'unit',
  price       numeric(15,2) not null default 0,   -- Harga Satuan
  cost        numeric(15,2) not null default 0,   -- HPP
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on products using gin (to_tsvector('simple', name));

-- Template_Paket  →  package_templates + items
create table package_templates (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                        -- 'PKT001'
  name        text not null,
  created_at  timestamptz not null default now()
);

create table package_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references package_templates(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  description text not null,
  qty         numeric(15,3) not null default 1,
  unit        text,
  price       numeric(15,2) not null default 0,
  cost        numeric(15,2) not null default 0,
  sort_order  int not null default 0
);
create index on package_template_items (template_id);

-- ══════════════════════════════════════════════════════════════
-- PENAWARAN
-- ══════════════════════════════════════════════════════════════

create table quotations (
  id                  uuid primary key default gen_random_uuid(),
  quote_number        text not null unique,       -- kol.0  'No Penawaran'
  customer_id         uuid not null references customers(id),
  project_name        text not null,              -- kol.4
  owner_id            uuid references profiles(id),  -- kol.6 'Dibuat Oleh' (dipetakan dari nama)
  status              quotation_status not null default 'On-Progress',  -- kol.16
  deal_date           timestamptz,                -- kol.18 'Tanggal Deal'
  current_revision_id uuid,                       -- FK ditambahkan setelah tabel revisi dibuat
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on quotations (status, deal_date desc);
create index on quotations (owner_id);
create index on quotations (customer_id);

create table quotation_revisions (
  id             uuid primary key default gen_random_uuid(),
  quotation_id   uuid not null references quotations(id) on delete cascade,
  rev            int  not null default 0,         -- kol.1
  issue_date     date not null,                   -- kol.2  'Tanggal'
  valid_until    date,                            -- kol.3  'Valid Hingga'
  subtotal       numeric(15,2) not null default 0,-- kol.7
  discount       numeric(15,2) not null default 0,-- kol.8
  tax_amount     numeric(15,2) not null default 0,-- kol.9  'Pajak (PPN)'
  grand_total    numeric(15,2) not null default 0,-- kol.10
  total_cost     numeric(15,2) not null default 0,-- kol.11 'Total HPP'
  est_profit     numeric(15,2) not null default 0,-- kol.12
  margin_pct     numeric(6,2)  not null default 0,-- kol.13
  terms          jsonb not null default '{}',     -- kol.14 'Syarat Ketentuan (JSON)'
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  unique (quotation_id, rev)
);
create index on quotation_revisions (quotation_id, rev desc);

alter table quotations
  add constraint quotations_current_revision_fkey
  foreign key (current_revision_id) references quotation_revisions(id);

-- kol.15 'Rincian Item (JSON)' dinormalisasi
create table quotation_items (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null references quotation_revisions(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  group_name   text,                              -- 'kelompok' pada JSON existing
  description  text not null,
  qty          numeric(15,3) not null default 1,
  unit         text,
  price        numeric(15,2) not null default 0,
  cost         numeric(15,2) not null default 0,  -- hpp
  sort_order   int not null default 0
);
create index on quotation_items (revision_id);
create index on quotation_items (product_id);

-- ══════════════════════════════════════════════════════════════
-- WORK ORDER  (dari Penawaran_Main kol.17 + sheet WorkOrder_Catatan)
-- ══════════════════════════════════════════════════════════════

create table work_orders (
  id               uuid primary key default gen_random_uuid(),
  wo_number        text not null unique,          -- format [YY][NNN], reset per tahun
  quotation_id     uuid not null unique references quotations(id),
  notes            text,                          -- WorkOrder_Catatan kol. 'Catatan'
  notes_updated_by uuid references profiles(id),
  notes_updated_at timestamptz,
  created_at       timestamptz not null default now()
);

-- WO_RequestInvoice
create table invoice_requests (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  requested_by  uuid references profiles(id),
  message       text,
  status        request_status not null default 'Pending',
  created_at    timestamptz not null default now()
);
create index on invoice_requests (status, created_at desc);

-- ══════════════════════════════════════════════════════════════
-- INVOICE & KWITANSI
-- ══════════════════════════════════════════════════════════════

create table bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  bank_name    text not null,
  account_no   text not null,
  account_name text not null,
  is_active    boolean not null default true,
  sort_order   int not null default 0
);

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  invoice_number   text not null unique,          -- kol.0
  -- Invoice pre-deal menempel ke penawaran; invoice normal menempel ke WO.
  work_order_id    uuid references work_orders(id),   -- kol.1
  quotation_id     uuid references quotations(id),    -- kol.2
  issue_date       date not null,                 -- kol.3
  type             invoice_type not null default 'Penuh',  -- kol.4  'Jenis'
  percent          numeric(6,2) not null default 0,-- kol.5  'Persen'
  po_number        text,                          -- kol.6
  po_date          date,                          -- kol.7
  customer_id      uuid references customers(id), -- kol.8
  customer_snapshot jsonb not null default '{}',  -- kol.9,10 — nama klien & project saat terbit
  dpp              numeric(15,2) not null default 0,-- kol.11
  vat_percent      numeric(6,2)  not null default 0,-- kol.12
  vat_amount       numeric(15,2) not null default 0,-- kol.13
  total            numeric(15,2) not null default 0,-- kol.14
  payment_status   payment_status not null default 'Belum Lunas', -- kol.16
  notes            text,                          -- kol.17
  created_by       uuid references profiles(id),  -- kol.18
  bank_account_id  uuid references bank_accounts(id), -- kol.19
  paid_at          date,                          -- kol.20 'Tanggal Bayar'
  -- dari meta JSON (Invoice.gs:326)
  scope            text,
  contract_value   numeric(15,2) not null default 0,
  input_mode       text not null default 'persen',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint invoice_has_parent
    check (work_order_id is not null or quotation_id is not null),
  constraint predeal_must_be_dp
    check (work_order_id is not null or type = 'DP')  -- Invoice.gs:275
);
create index on invoices (work_order_id);
create index on invoices (payment_status, issue_date);
create index on invoices (customer_id);

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  qty         numeric(15,3) not null default 1,
  unit        text,
  price       numeric(15,2) not null default 0,
  sort_order  int not null default 0
);
create index on invoice_items (invoice_id);

create table receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,            -- kol.0 'No Kwitansi'
  invoice_id     uuid references invoices(id),    -- kol.1
  work_order_id  uuid references work_orders(id), -- kol.2
  issue_date     date not null,                   -- kol.3
  received_from  text not null,                   -- kol.4 'Terima Dari'
  amount         numeric(15,2) not null default 0,-- kol.5 'Jumlah'
  purpose        text,                            -- kol.6 'Untuk Pembayaran'
  method         text not null default 'Transfer',-- kol.7 'Metode'
  notes          text,                            -- kol.8
  created_by     uuid references profiles(id),    -- kol.9
  created_at     timestamptz not null default now()
);
create index on receipts (invoice_id);

-- ══════════════════════════════════════════════════════════════
-- SETTINGS  (dari PropertiesService)
-- ══════════════════════════════════════════════════════════════
create table app_settings (
  key        text primary key,                    -- 'TC_OPTIONS', dst.
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
-- WA_ENDPOINT / kredensial WhatsApp → env var di Railway, BUKAN tabel ini.
```

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

## 10. Langkah berikutnya

1. Konfirmasi keputusan desain §5.3 — terutama pemecahan `Penawaran_Main`
   menjadi `quotations` + `quotation_revisions` (5.3a)
2. Mulai Fase 0, dengan pencatatan angka *sebelum* sebagai pembanding
3. Provision Supabase dan terapkan DDL §5.4 sebagai migration file pertama
