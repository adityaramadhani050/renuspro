-- ============================================================================
-- RenusPro — 13. Invoice warisan
-- ----------------------------------------------------------------------------
-- Impor data produksi menemukan 32 invoice senilai Rp 6,94 miliar — Rp 4,45
-- miliar di antaranya PIUTANG BERJALAN — yang kolom No Penawaran-nya terisi
-- tetapi penawarannya sudah tidak ada lagi di Penawaran_Main. Semuanya
-- dokumen 2025; sebagian bahkan merujuk nomor PO, bukan nomor penawaran.
--
-- Constraint invoices_has_parent berasumsi setiap invoice turun dari sebuah
-- penawaran. Untuk dokumen BARU asumsi itu benar dan berharga. Untuk dokumen
-- HISTORIS ia tidak benar — dan menegakkannya berarti membuang invoice nyata
-- beserta piutangnya, yang membuat laporan finance memahami piutang 82% lebih
-- rendah dari kenyataan.
--
-- Jalan tengahnya: izinkan invoice tanpa induk HANYA bila ditandai warisan,
-- dan simpan rujukan aslinya supaya jejaknya tidak hilang. Invoice baru tetap
-- wajib punya induk, karena create_invoice() tidak pernah menyalakan tanda itu.
-- ============================================================================

alter table invoices
  add column if not exists is_legacy boolean not null default false,
  add column if not exists legacy_reference text;

comment on column invoices.is_legacy is
  'Invoice hasil impor yang rujukan penawarannya tidak ditemukan. Hanya boleh '
  'diisi importer; create_invoice() tidak pernah menyalakannya, sehingga '
  'invoice baru tetap wajib menempel pada Work Order atau penawaran.';

comment on column invoices.legacy_reference is
  'Isi mentah kolom No WO / No Penawaran dari sheet, disimpan apa adanya agar '
  'invoice masih bisa ditelusuri ke dokumen aslinya di arsip.';

-- ── Longgarkan constraint, tanpa melepaskan jaminannya untuk data baru ──────
alter table invoices drop constraint if exists invoices_has_parent;
alter table invoices add constraint invoices_has_parent
  check (work_order_id is not null or quotation_id is not null or is_legacy);

-- Invoice warisan bisa berjenis apa saja; aturan "pre-deal hanya DP" memang
-- hanya berlaku pada alur penerbitan yang baru.
alter table invoices drop constraint if exists invoices_predeal_must_be_dp;
alter table invoices add constraint invoices_predeal_must_be_dp
  check (work_order_id is not null or is_legacy or type = 'DP');

create index if not exists invoices_legacy_idx on invoices (issue_date desc)
  where is_legacy;


-- ── View ikut membawa penandanya ────────────────────────────────────────────
-- Tanpa ini, invoice warisan tampak seperti invoice pre-deal biasa di
-- antarmuka — padahal keduanya sangat berbeda: yang satu menunggu penawaran
-- di-Deal, yang satu lagi penawarannya memang sudah tidak ada.
-- Dibuat ulang, bukan CREATE OR REPLACE: kolom baru disisipkan di tengah agar
-- terbaca berdekatan dengan kolom terkait, sedangkan REPLACE hanya mengizinkan
-- penambahan di ujung. v_finance_summary bergantung padanya, jadi ikut dibuat
-- ulang di bawah.
drop view if exists v_finance_summary;
drop view if exists v_invoices;

create view v_invoices as
select
  i.id,
  i.invoice_number,
  i.issue_date,
  i.type,
  i.percent,
  i.po_number,
  i.po_date,
  i.dpp,
  i.vat_percent,
  i.vat_amount,
  i.total,
  i.payment_status,
  i.paid_at,
  i.notes,
  i.scope,
  i.contract_value,
  i.is_legacy,
  i.legacy_reference,
  i.work_order_id,
  w.wo_number,
  i.quotation_id,
  q.quote_number,
  (i.work_order_id is null and not i.is_legacy)   as is_predeal,
  i.customer_id,
  coalesce(c.name, i.customer_snapshot ->> 'name')            as customer_name,
  coalesce(i.customer_snapshot ->> 'project', q.project_name) as project_name,
  i.created_by,
  pr.full_name                                    as created_by_name,
  ba.bank_name,
  ba.account_no,
  ba.account_name,
  rc.receipt_number,
  case when i.payment_status = 'Lunas' then null
       else current_date - i.issue_date
  end                                             as days_outstanding,
  case
    when i.payment_status = 'Lunas'          then null
    when current_date - i.issue_date >= 90   then 'gte90'
    when current_date - i.issue_date >= 60   then 'gte60'
    when current_date - i.issue_date >= 30   then 'gte30'
    else 'current'
  end                                             as aging_bucket
from invoices i
left join work_orders   w  on w.id  = i.work_order_id
left join quotations    q  on q.id  = coalesce(i.quotation_id, w.quotation_id)
left join customers     c  on c.id  = i.customer_id
left join profiles      pr on pr.id = i.created_by
left join bank_accounts ba on ba.id = i.bank_account_id
left join lateral (
  select r2.receipt_number
    from receipts r2
   where r2.invoice_id = i.id
   order by r2.receipt_number
   limit 1
) rc on true;

alter view v_invoices set (security_invoker = true);
grant select on v_invoices to authenticated;


-- Dibuat ulang persis seperti semula; hanya perlu karena bergantung pada view
-- di atas yang di-drop.
create view v_finance_summary as
select
  coalesce(sum(total), 0)                                             as total_tagihan,
  coalesce(sum(total) filter (where payment_status = 'Lunas'), 0)     as total_terbayar,
  coalesce(sum(total) filter (where payment_status <> 'Lunas'), 0)    as total_outstanding,
  coalesce(sum(total) filter (where aging_bucket = 'current'), 0)     as aging_current,
  coalesce(sum(total) filter (where aging_bucket = 'gte30'),   0)     as aging_gte30,
  coalesce(sum(total) filter (where aging_bucket = 'gte60'),   0)     as aging_gte60,
  coalesce(sum(total) filter (where aging_bucket = 'gte90'),   0)     as aging_gte90,
  count(*)                                                            as invoice_count,
  count(*) filter (where payment_status <> 'Lunas')                   as unpaid_count
from v_invoices;

alter view v_finance_summary set (security_invoker = true);
grant select on v_finance_summary to authenticated;
