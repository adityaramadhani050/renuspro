-- ============================================================================
-- RenusPro — 03. Penawaran
-- ----------------------------------------------------------------------------
-- Sheet Penawaran_Main (19 kolom) dipecah menjadi 4 tabel.
--
-- ALASAN PEMECAHAN (lihat MIGRATION_PLAN.md §5.3a):
-- Di sheet, setiap revisi adalah baris baru dengan kunci majemuk
-- (No Penawaran, Rev) dan seluruh header diduplikasi. Status (kol.17),
-- No WO (kol.18) dan Tanggal Deal (kol.19) disimpan PER-REVISI padahal
-- maknanya PER-PENAWARAN: updateStatusPenawaran() (Penawaran.gs:316) menulis
-- ke satu baris revisi tertentu, sementara semua pembaca mengambil revisi
-- terakhir (Dashboard.gs:42, Penawaran.gs:60, WorkOrder.gs:63, SalesReport.gs).
-- Memisahkannya menutup kelas bug tersebut sekaligus menghapus seluruh
-- logika "cari revisi terakhir" yang berulang di 4 file.
--
-- Struktur 'Rincian Item (JSON)' (kol.16) BUKAN array datar, melainkan
-- daftar kelompok — lihat JS_Form_Penawaran.html:350-352:
--   [{ kelompok: "A", namaKelompok: "...", subtotal: n,
--      subItems: [{ noItem, produkId, deskripsi, qty, unit, harga, hpp, total }] }]
-- Karena itu ada dua tabel: quotation_item_groups → quotation_items.
-- ============================================================================

-- ── quotations : identitas & keadaan penawaran ──────────────────────────────
create table quotations (
  id                  uuid primary key default gen_random_uuid(),
  quote_number        text not null unique,              -- kol.1  'No Penawaran'
  customer_id         uuid not null references customers(id) on delete restrict,  -- kol.6
  project_name        text not null,                     -- kol.5  'Nama Project'
  owner_id            uuid references profiles(id) on delete set null,             -- kol.7  'Dibuat Oleh'
  owner_name_legacy   text,                              -- nama mentah dari sheet, untuk audit
  status              quotation_status not null default 'On-Progress',             -- kol.17
  deal_date           timestamptz,                       -- kol.19 'Tanggal Deal'
  current_revision_id uuid,                              -- FK ditambahkan di bawah
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Penawaran.gs:336-348 — tanggal deal hanya terisi saat status Deal
  constraint quotations_deal_date_consistency
    check ((status = 'Deal') or (deal_date is null))
);

create index quotations_status_deal_idx on quotations (status, deal_date desc nulls last);
create index quotations_owner_idx       on quotations (owner_id);
create index quotations_customer_idx    on quotations (customer_id);
create index quotations_created_idx     on quotations (created_at desc);

create trigger quotations_set_updated_at
  before update on quotations
  for each row execute function set_updated_at();

comment on column quotations.owner_name_legacy is
  'Nilai mentah kolom "Dibuat Oleh" dari sheet (berupa NAMA, bukan ID — '
  'Dashboard.gs:38 membandingkan string nama). Disimpan agar pemetaan '
  'nama→profiles bisa diaudit ulang setelah impor.';


-- ── quotation_revisions : isi penawaran per revisi ──────────────────────────
create table quotation_revisions (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  rev          int  not null default 0 check (rev >= 0),   -- kol.2  'Rev'
  issue_date   date not null,                              -- kol.3  'Tanggal'
  valid_until  date,                                       -- kol.4  'Valid Hingga'

  subtotal     numeric(15,2) not null default 0,           -- kol.8
  discount     numeric(15,2) not null default 0,           -- kol.9  'Diskon'
  tax_amount   numeric(15,2) not null default 0,           -- kol.10 'Pajak (PPN)'
  grand_total  numeric(15,2) not null default 0,           -- kol.11
  total_cost   numeric(15,2) not null default 0,           -- kol.12 'Total HPP'
  est_profit   numeric(15,2) not null default 0,           -- kol.13 'Estimasi Keuntungan'
  margin_pct   numeric(7,2)  not null default 0,           -- kol.14 'Margin Profit (%)'

  terms        jsonb not null default '{}'::jsonb,         -- kol.15 'Syarat Ketentuan (JSON)'

  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (quotation_id, rev)
);

create index quotation_revisions_quotation_idx on quotation_revisions (quotation_id, rev desc);

-- Nilai kontrak = subtotal - diskon (belum termasuk PPN).
-- Rumus ini dipakai Invoice.gs:283 sebagai dasar penagihan.
alter table quotation_revisions
  add column contract_value numeric(15,2)
  generated always as (greatest(subtotal - discount, 0)) stored;

alter table quotations
  add constraint quotations_current_revision_fkey
  foreign key (current_revision_id) references quotation_revisions(id) on delete set null;


-- ── quotation_item_groups : "kelompok" / sub-paket ──────────────────────────
create table quotation_item_groups (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references quotation_revisions(id) on delete cascade,
  code        text,                                        -- JSON 'kelompok'    → "A", "B", ...
  name        text not null default '',                    -- JSON 'namaKelompok'
  subtotal    numeric(15,2) not null default 0,            -- JSON 'subtotal'
  sort_order  int not null default 0
);

create index quotation_item_groups_revision_idx on quotation_item_groups (revision_id, sort_order);


-- ── quotation_items : subItems di dalam kelompok ────────────────────────────
create table quotation_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references quotation_item_groups(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,   -- JSON 'produkId'
  description text not null,                                     -- JSON 'deskripsi'
  qty         numeric(15,3) not null default 0,                  -- JSON 'qty'
  unit        text not null default 'unit',
  price       numeric(15,2) not null default 0,                  -- JSON 'harga'
  cost        numeric(15,2) not null default 0,                  -- JSON 'hpp'
  line_total  numeric(15,2) not null default 0,                  -- JSON 'total'
  sort_order  int not null default 0                             -- JSON 'noItem'
);

create index quotation_items_group_idx   on quotation_items (group_id, sort_order);
create index quotation_items_product_idx on quotation_items (product_id);

comment on table quotation_items is
  'Hasil normalisasi kolom "Rincian Item (JSON)". Inilah yang membuat laporan '
  'seperti "produk terlaris" menjadi satu query SQL, bukan parsing JSON di loop.';


-- ── Jaga current_revision_id selalu menunjuk revisi tertinggi ───────────────
-- SECURITY DEFINER: pointer revisi terkini dijaga sistem, bukan ditulis klien.
create or replace function sync_current_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quotation_id uuid := coalesce(new.quotation_id, old.quotation_id);
begin
  update quotations q
     set current_revision_id = (
           select r.id
             from quotation_revisions r
            where r.quotation_id = v_quotation_id
            order by r.rev desc
            limit 1
         )
   where q.id = v_quotation_id;
  return null;
end;
$$;

create trigger quotation_revisions_sync_current
  after insert or update of rev or delete on quotation_revisions
  for each row execute function sync_current_revision();
