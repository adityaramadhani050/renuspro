-- ============================================================================
-- RenusPro — 01. Extensions & Enum
-- ----------------------------------------------------------------------------
-- Nilai enum sengaja dipertahankan dalam bahasa Indonesia persis seperti yang
-- tersimpan di Google Sheets, supaya impor data tidak perlu penerjemahan —
-- satu sumber bug yang tidak perlu.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- pg_trgm, bukan tsvector: pencarian di aplikasi ini berupa SUBSTRING
-- (filterTabel() di JS_Pagination.html mencocokkan potongan teks di mana saja),
-- dan hanya index trigram yang bisa mempercepat ILIKE '%...%'.
create extension if not exists "pg_trgm";

-- Master_User kolom 'Role'  (Auth.gs:57 — default 'sales')
create type user_role as enum ('admin', 'sales', 'finance');

-- Penawaran_Main kolom 17 'Status'  (Penawaran.gs:316)
create type quotation_status as enum ('On-Progress', 'Deal', 'Fail');

-- Invoice_Main kolom 5 'Jenis'  (Invoice.gs:19)
create type invoice_type as enum ('DP', 'Termin', 'Pelunasan', 'Penuh');

-- Invoice_Main kolom 17 'Status Bayar'  (Invoice.gs:31)
create type payment_status as enum ('Belum Lunas', 'Lunas');

-- WO_RequestInvoice kolom 6 'Status'  (WorkOrder.gs:312 — hanya menulis 'Pending')
create type request_status as enum ('Pending', 'Diproses', 'Selesai', 'Ditolak');

-- Invoice.gs:326 — meta.inputMode
create type invoice_input_mode as enum ('persen', 'nominal');


-- ── Helper: updated_at otomatis ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
