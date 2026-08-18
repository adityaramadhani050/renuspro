-- =============================================================================
--  stok_request — permintaan penambahan stok dari Warehouse ke Procurement
--  Jalankan 1x di Supabase → SQL Editor.
--
--  Alur: Warehouse klik "Request Stok" di tabel stok → baris status 'Menunggu'
--        + notifikasi WA ke Procurement. Procurement melihatnya di menu
--        Purchase Order → tab "Request Stok", lalu memprosesnya (Diproses /
--        Selesai / Ditolak) atau langsung "Buat PO" dari request tersebut.
-- =============================================================================
create table if not exists stok_request (
  id             text primary key,          -- REQ-STK-YYYYMM-###
  tanggal        date,
  id_produk      text,                       -- id stok existing (nullable utk item baru)
  nama_item      text not null,
  satuan         text,
  qty            numeric,
  catatan        text,                       -- catatan dari warehouse
  status         text default 'Menunggu',    -- Menunggu | Diproses | Selesai | Ditolak
  no_po          text,                        -- diisi saat procurement membuat PO
  catatan_proc   text,                        -- catatan / alasan dari procurement
  diminta_oleh   text,
  diproses_oleh  text,
  dibuat_pada    timestamptz default now(),
  diproses_pada  timestamptz
);

alter table stok_request enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stok_request' and policyname='stok_request_read') then
    create policy stok_request_read on stok_request for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stok_request' and policyname='stok_request_write') then
    create policy stok_request_write on stok_request for all to authenticated using (true) with check (true);
  end if;
end $$;
