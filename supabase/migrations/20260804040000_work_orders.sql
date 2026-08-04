-- ============================================================================
-- RenusPro — 04. Work Order
-- ----------------------------------------------------------------------------
-- Di sheet, Work Order bukan entitas sendiri: ia hanya kolom 18 ('No WO') pada
-- Penawaran_Main, ditambah sheet terpisah WorkOrder_Catatan (1:1 by No WO).
-- Padahal No WO adalah referensi utama untuk Invoice & Kwitansi
-- (lihat komentar WorkOrder.gs:5-7), jadi ia dipromosikan menjadi tabel.
--
-- Catatan: WorkOrder.gs:333 menulis No WO dengan setValue(Number(noWO)) —
-- tersimpan sebagai ANGKA di sheet. Format [YY][NNN] selalu 5 digit untuk
-- tahun >= 2010 sehingga tidak ada masalah leading zero, tapi importer tetap
-- harus meng-cast ke text dengan hati-hati.
-- ============================================================================

create table work_orders (
  id               uuid primary key default gen_random_uuid(),
  wo_number        text not null unique,          -- format [YY][NNN], reset tiap tahun
  quotation_id     uuid not null unique references quotations(id) on delete restrict,

  -- Sheet WorkOrder_Catatan: No WO | Catatan | Diupdate Oleh | Diupdate Pada
  notes            text,
  notes_updated_by uuid references profiles(id) on delete set null,
  notes_updated_at timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint work_orders_number_format check (wo_number ~ '^[0-9]{5,}$')
);

create index work_orders_created_idx on work_orders (created_at desc);

create trigger work_orders_set_updated_at
  before update on work_orders
  for each row execute function set_updated_at();

comment on table work_orders is
  'Dibuat otomatis saat status penawaran berubah menjadi Deal — lihat trigger '
  'di migrasi 06 yang menggantikan otomasi manual di Penawaran.gs:327-348.';


-- ── invoice_requests  (sheet WO_RequestInvoice) ─────────────────────────────
-- Sheet: No WO | Klien | Project | Sales | Pesan | Status | Tanggal
-- Kolom Klien/Project/Sales adalah denormalisasi yang bisa diturunkan lewat
-- join, jadi tidak diikutkan.
create table invoice_requests (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  requested_by  uuid references profiles(id) on delete set null,
  message       text,
  status        request_status not null default 'Pending',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index invoice_requests_status_idx on invoice_requests (status, created_at desc);
create index invoice_requests_wo_idx     on invoice_requests (work_order_id);
