-- ============================================================================
-- RenusPro — 05. Invoice, Kwitansi, Settings
-- ----------------------------------------------------------------------------
-- KOREKSI PENTING terhadap pembacaan awal sheet:
-- Kolom 16 Invoice_Main berlabel 'Rincian Item (JSON)', tetapi yang benar-benar
-- ditulis ke sana adalah META, bukan item baris — lihat Invoice.gs:326-339:
--     const meta = { scope, nilaiKontrak, inputMode };
--     sheet.appendRow([ ..., JSON.stringify(meta), 'Belum Lunas', ... ]);
-- Invoice di sistem ini menagih PERSENTASE dari nilai kontrak dan tidak punya
-- line item sendiri; rincian barang tetap milik penawaran. Karena itu TIDAK ada
-- tabel invoice_items — ketiga field meta menjadi kolom biasa.
-- ============================================================================

-- ── bank_accounts  (dari ScriptProperties 'BANK_ACCOUNTS', Settings.gs:58) ──
create table bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  bank_name    text not null,
  account_no   text not null,
  account_name text not null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);


-- ── invoices  (sheet Invoice_Main, 21 kolom) ────────────────────────────────
create table invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique,                       -- kol.1

  -- Invoice normal menempel ke Work Order; invoice PRE-DEAL menempel langsung
  -- ke penawaran yang belum Deal (Invoice.gs:270-276).
  work_order_id     uuid references work_orders(id) on delete restrict,   -- kol.2
  quotation_id      uuid references quotations(id) on delete restrict,    -- kol.3

  issue_date        date not null,                              -- kol.4  'Tanggal'
  type              invoice_type not null default 'Penuh',      -- kol.5  'Jenis'
  percent           numeric(7,2) not null default 0,            -- kol.6  'Persen'
  po_number         text,                                       -- kol.7  'No PO'
  po_date           date,                                       -- kol.8  'Tgl PO'

  customer_id       uuid references customers(id) on delete set null,     -- kol.9
  -- kol.10 'Nama Klien' + kol.11 'Nama Project'.
  -- Duplikasi ini BUKAN kesalahan desain: invoice adalah dokumen legal, isinya
  -- harus mencerminkan keadaan saat diterbitkan dan tidak boleh ikut berubah
  -- ketika data klien diedit. Karena itu disimpan sebagai snapshot.
  customer_snapshot jsonb not null default '{}'::jsonb,

  dpp               numeric(15,2) not null default 0,           -- kol.12
  vat_percent       numeric(7,2)  not null default 0,           -- kol.13 'PPN (%)'
  vat_amount        numeric(15,2) not null default 0,           -- kol.14 'PPN Nominal'
  total             numeric(15,2) not null default 0,           -- kol.15 'Total'

  payment_status    payment_status not null default 'Belum Lunas',  -- kol.17
  notes             text,                                       -- kol.18 'Catatan'
  created_by        uuid references profiles(id) on delete set null,  -- kol.19
  bank_account_id   uuid references bank_accounts(id) on delete set null,  -- kol.20
  paid_at           date,                                       -- kol.21 'Tanggal Bayar'

  -- Dari meta JSON kol.16 (Invoice.gs:326)
  scope             text,
  contract_value    numeric(15,2) not null default 0,           -- meta.nilaiKontrak
  input_mode        invoice_input_mode not null default 'persen', -- meta.inputMode

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Setiap invoice harus menempel pada WO atau penawaran.
  constraint invoices_has_parent
    check (work_order_id is not null or quotation_id is not null),

  -- Invoice.gs:275 — "Invoice pre-deal hanya boleh jenis DP."
  constraint invoices_predeal_must_be_dp
    check (work_order_id is not null or type = 'DP'),

  -- FinanceReport.gs:20 — tanggal bayar dicatat saat status menjadi Lunas.
  constraint invoices_paid_at_consistency
    check ((payment_status = 'Lunas') or (paid_at is null))
);

create index invoices_work_order_idx on invoices (work_order_id);
create index invoices_quotation_idx  on invoices (quotation_id);
create index invoices_status_idx     on invoices (payment_status, issue_date desc);
create index invoices_customer_idx   on invoices (customer_id);
create index invoices_unpaid_idx     on invoices (issue_date) where payment_status = 'Belum Lunas';

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();


-- ── receipts  (sheet Kwitansi_Main) ─────────────────────────────────────────
-- Sheet: No Kwitansi | No Invoice | No WO | Tanggal | Terima Dari | Jumlah |
--        Untuk Pembayaran | Metode | Catatan | Dibuat Oleh
create table receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,                          -- kol.1
  invoice_id     uuid references invoices(id) on delete set null,     -- kol.2
  work_order_id  uuid references work_orders(id) on delete set null,  -- kol.3
  issue_date     date not null,                                 -- kol.4
  received_from  text not null,                                 -- kol.5 'Terima Dari'
  amount         numeric(15,2) not null default 0,              -- kol.6 'Jumlah'
  purpose        text,                                          -- kol.7 'Untuk Pembayaran'
  method         text not null default 'Transfer',              -- kol.8 'Metode'
  notes          text,                                          -- kol.9
  created_by     uuid references profiles(id) on delete set null,     -- kol.10
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index receipts_invoice_idx on receipts (invoice_id);
create index receipts_wo_idx      on receipts (work_order_id);
create index receipts_date_idx    on receipts (issue_date desc);

create trigger receipts_set_updated_at
  before update on receipts
  for each row execute function set_updated_at();


-- ── app_settings  (dari PropertiesService, Settings.gs) ─────────────────────
create table app_settings (
  key        text primary key,                                  -- 'TC_OPTIONS', ...
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

comment on table app_settings is
  'Pengganti PropertiesService untuk TC_OPTIONS dsb. '
  'Kredensial WhatsApp (WA_ENDPOINT/WA_TARGET) TIDAK disimpan di sini — '
  'itu env var di Railway.';
