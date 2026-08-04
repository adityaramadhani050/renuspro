-- ============================================================================
-- RenusPro — 06. Penomoran dokumen & otomasi status
-- ----------------------------------------------------------------------------
-- Keempat generator di GAS memakai pola "scan seluruh kolom, ambil maks, +1":
--   generateNextQuotationNumber  Penawaran.gs:245   NNN/QUOT/{ROMAWI}/{TAHUN}
--   generateNextInvoiceNumber    Invoice.gs:50      NNN/RGI/INV/{ROMAWI}/{TAHUN}
--   generateNextKwitansiNumber   Kwitansi.gs:30     NNN/RGI/KWT/{ROMAWI}/{TAHUN}
--   generateNextWONumber         WorkOrder.gs:17    [YY][NNN]  (reset tiap tahun)
--
-- Pola itu punya race condition: dua user menyimpan bersamaan bisa mendapat
-- nomor yang sama (ScriptLock hanya dipegang sebagian pemanggil). Di Postgres
-- diganti counter dengan row lock — aman tanpa mengunci apa pun yang lain.
--
-- Nomor urut penawaran/invoice/kwitansi bersifat GLOBAL (tidak reset per tahun),
-- persis seperti perilaku GAS sekarang. Hanya No WO yang reset per tahun.
-- ============================================================================

create table document_counters (
  doc_type text not null,        -- 'quotation' | 'invoice' | 'receipt' | 'work_order'
  period   text not null,        -- '-' untuk global, '2026' untuk reset tahunan
  last_seq int  not null default 0,
  primary key (doc_type, period)
);

comment on table document_counters is
  'Saat impor data lama, last_seq harus diisi dari nomor tertinggi yang sudah '
  'ada agar penomoran tidak menabrak dokumen historis (lihat tools/importer).';


-- ── Ambil nomor urut berikutnya (aman dari race) ────────────────────────────
-- SECURITY DEFINER: tabel document_counters dikunci penuh oleh RLS (migrasi 08).
-- Satu-satunya jalan menaikkan counter adalah lewat fungsi ini, sehingga tidak
-- ada klien yang bisa memundurkan atau memalsukan nomor dokumen.
-- search_path dipatok agar fungsi tidak bisa dibajak lewat schema bayangan.
create or replace function next_document_seq(p_type text, p_period text default '-')
returns int
language plpgsql
security definer
set search_path = public, pg_temp
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


-- ── Bulan Romawi (dipakai ketiga format nomor dokumen) ──────────────────────
create or replace function roman_month(p_date date default current_date)
returns text
language sql
immutable
as $$
  select (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])
         [extract(month from p_date)::int];
$$;


-- ── Generator nomor per jenis dokumen ───────────────────────────────────────

-- NNN/QUOT/{ROMAWI}/{TAHUN}  — Penawaran.gs:268
create or replace function next_quotation_number(p_date date default current_date)
returns text
language sql
as $$
  select lpad(next_document_seq('quotation')::text, 3, '0')
         || '/QUOT/' || roman_month(p_date)
         || '/' || extract(year from p_date)::int;
$$;

-- NNN/RGI/INV/{ROMAWI}/{TAHUN}  — Invoice.gs:71
create or replace function next_invoice_number(p_date date default current_date)
returns text
language sql
as $$
  select lpad(next_document_seq('invoice')::text, 3, '0')
         || '/RGI/INV/' || roman_month(p_date)
         || '/' || extract(year from p_date)::int;
$$;

-- NNN/RGI/KWT/{ROMAWI}/{TAHUN}  — Kwitansi.gs:51
create or replace function next_receipt_number(p_date date default current_date)
returns text
language sql
as $$
  select lpad(next_document_seq('receipt')::text, 3, '0')
         || '/RGI/KWT/' || roman_month(p_date)
         || '/' || extract(year from p_date)::int;
$$;

-- [YY][NNN], reset tiap tahun  — WorkOrder.gs:17
create or replace function next_wo_number(p_date date default current_date)
returns text
language sql
as $$
  select to_char(p_date, 'YY')
         || lpad(
              next_document_seq('work_order', extract(year from p_date)::text)::text,
              3, '0');
$$;


-- ============================================================================
-- Otomasi: status Deal  →  buat Work Order + set tanggal deal
-- ----------------------------------------------------------------------------
-- Menggantikan blok manual di Penawaran.gs:327-348, yang harus memegang
-- ScriptLock dan menulis dua kolom terpisah. Di sini semuanya atomik dalam
-- satu transaksi database.
-- ============================================================================

-- SECURITY DEFINER: penerbitan Work Order adalah keputusan sistem, bukan hak
-- pengguna. Sales boleh mengubah status penawarannya sendiri menjadi Deal,
-- tapi tidak boleh menyisipkan baris work_orders sembarangan.
create or replace function handle_quotation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Menjadi Deal → catat tanggal deal & terbitkan No WO (sekali saja)
  if new.status = 'Deal' and coalesce(old.status, 'On-Progress') <> 'Deal' then
    if new.deal_date is null then
      new.deal_date := now();
    end if;

    insert into work_orders (wo_number, quotation_id)
    values (next_wo_number(new.deal_date::date), new.id)
    on conflict (quotation_id) do nothing;

  -- Keluar dari Deal → kosongkan tanggal deal.
  -- Work Order sengaja TIDAK dihapus: nomor WO yang sudah terbit mungkin sudah
  -- dipakai di invoice/kwitansi. GAS menghapusnya (Penawaran.gs:345-348) —
  -- itu meninggalkan invoice yatim. Di sini dicegah oleh FK on delete restrict.
  elsif new.status <> 'Deal' and old.status = 'Deal' then
    new.deal_date := null;
  end if;

  return new;
end;
$$;

create trigger quotations_handle_status_change
  before update of status on quotations
  for each row execute function handle_quotation_status_change();

-- Penawaran yang langsung dibuat berstatus Deal
create or replace function handle_quotation_insert_deal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Deal' then
    insert into work_orders (wo_number, quotation_id)
    values (next_wo_number(coalesce(new.deal_date, now())::date), new.id)
    on conflict (quotation_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger quotations_handle_insert_deal
  after insert on quotations
  for each row execute function handle_quotation_insert_deal();


-- ── Konsistensi tanggal bayar invoice ───────────────────────────────────────
-- Menggantikan catatTanggalBayar() (FinanceReport.gs:20) yang harus dipanggil
-- manual setelah update status — kalau lupa dipanggil, data aging jadi salah.
create or replace function handle_invoice_payment_status()
returns trigger
language plpgsql
as $$
begin
  if new.payment_status = 'Lunas' and old.payment_status <> 'Lunas' then
    if new.paid_at is null then
      new.paid_at := current_date;
    end if;
  elsif new.payment_status <> 'Lunas' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger invoices_handle_payment_status
  before update of payment_status on invoices
  for each row execute function handle_invoice_payment_status();
