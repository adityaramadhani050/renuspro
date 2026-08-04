-- ============================================================================
-- RenusPro — 07. View dashboard & laporan
-- ----------------------------------------------------------------------------
-- Inilah bagian dengan dampak performa terbesar. Sekarang Dashboard.gs
-- mengirim SELURUH baris penawaran ke browser lalu KPI dihitung di sana
-- (JS_Dashboard.html, 37 KB). Setelah migrasi, browser hanya menerima belasan
-- angka hasil agregasi.
--
-- Seluruh logika "cari revisi terakhir" yang berulang di Dashboard.gs:42,
-- Penawaran.gs:60, WorkOrder.gs:63 dan SalesReport.gs digantikan oleh
-- quotations.current_revision_id yang dijaga trigger.
-- ============================================================================

-- ── Penawaran + revisi terkini  (pengganti getPenawaranList) ───────────────
create view v_quotations as
select
  q.id,
  q.quote_number,
  q.status,
  q.project_name,
  q.deal_date,
  q.created_at,
  q.owner_id,
  p.full_name            as owner_name,
  q.customer_id,
  c.name                 as customer_name,
  c.company              as customer_company,
  r.id                   as revision_id,
  r.rev,
  r.issue_date,
  r.valid_until,
  r.subtotal,
  r.discount,
  r.tax_amount,
  r.grand_total,
  r.total_cost,
  r.est_profit,
  r.margin_pct,
  r.contract_value,
  -- FinanceReport.gs:126 — nilai kontrak bruto = (subtotal - diskon) + PPN
  r.contract_value + r.tax_amount as contract_value_gross,
  w.id                   as work_order_id,
  w.wo_number,
  (select count(*) from quotation_revisions rr where rr.quotation_id = q.id) as revision_count
from quotations q
join customers          c on c.id = q.customer_id
left join profiles      p on p.id = q.owner_id
left join quotation_revisions r on r.id = q.current_revision_id
left join work_orders   w on w.quotation_id = q.id;

comment on view v_quotations is
  'Satu baris per penawaran, sudah memakai revisi terkini. Menggantikan '
  'getPenawaranList() beserta loop latestRevMap di 4 file berbeda.';


-- ── Penagihan per Work Order  (pengganti _getTagihanMap) ───────────────────
-- Invoice.gs:74 memakai basis DPP (pre-tax) untuk menghitung sisa yang boleh
-- ditagih, sedangkan FinanceReport.gs:120 memakai total (termasuk PPN) untuk
-- laporan piutang. Keduanya disediakan agar tidak tertukar.
create view v_wo_billing as
select
  w.id                                   as work_order_id,
  w.wo_number,
  coalesce(sum(i.dpp), 0)                as billed_dpp,
  coalesce(sum(i.total), 0)              as billed_total,
  coalesce(sum(i.total) filter (where i.payment_status = 'Lunas'), 0) as paid_total,
  coalesce(sum(i.total), 0)
    - coalesce(sum(i.total) filter (where i.payment_status = 'Lunas'), 0) as outstanding,
  count(i.id)                            as invoice_count
from work_orders w
left join invoices i on i.work_order_id = w.id
group by w.id, w.wo_number;


-- ── Penagihan pre-deal per penawaran  (pengganti _getTagihanMapByPenawaran) ─
create view v_predeal_billing as
select
  i.quotation_id,
  coalesce(sum(i.dpp), 0)   as billed_dpp,
  coalesce(sum(i.total), 0) as billed_total,
  coalesce(sum(i.total) filter (where i.payment_status = 'Lunas'), 0) as paid_total,
  count(*)                  as invoice_count
from invoices i
where i.work_order_id is null
  and i.quotation_id is not null
group by i.quotation_id;


-- ── Dashboard Work Order  (pengganti getWorkOrderDashboard) ────────────────
create view v_work_orders as
select
  w.id,
  w.wo_number,
  w.notes,
  w.created_at,
  q.id                      as quotation_id,
  q.quote_number,
  q.project_name,
  q.deal_date,
  q.owner_id,
  po.full_name              as owner_name,
  c.id                      as customer_id,
  c.name                    as customer_name,
  r.contract_value,
  r.tax_amount,
  r.contract_value + r.tax_amount            as contract_value_gross,
  b.billed_dpp,
  b.billed_total,
  b.paid_total,
  b.outstanding,
  b.invoice_count,
  -- Sisa yang masih boleh ditagih (basis DPP, dipakai form invoice)
  greatest(r.contract_value - b.billed_dpp, 0)                        as remaining_dpp,
  -- Nilai kontrak yang belum ditagih (basis bruto, dipakai laporan finance)
  greatest((r.contract_value + r.tax_amount) - b.billed_total, 0)     as uninvoiced_gross
from work_orders w
join quotations q            on q.id = w.quotation_id
join customers  c            on c.id = q.customer_id
left join profiles po        on po.id = q.owner_id
left join quotation_revisions r on r.id = q.current_revision_id
join v_wo_billing b          on b.work_order_id = w.id;


-- ── Invoice + umur piutang  (pengganti getInvoiceList + _agingBucket) ──────
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
  i.work_order_id,
  w.wo_number,
  i.quotation_id,
  q.quote_number,
  (i.work_order_id is null)                       as is_predeal,
  i.customer_id,
  coalesce(c.name, i.customer_snapshot ->> 'name')          as customer_name,
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
  -- FinanceReport.gs:93-99 — bucket umur piutang, hanya untuk yang belum lunas
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
  -- Kwitansi pertama per invoice (_getKwitansiInvoiceMap, Invoice.gs:489)
  select r2.receipt_number
    from receipts r2
   where r2.invoice_id = i.id
   order by r2.receipt_number
   limit 1
) rc on true;


-- ── Ringkasan finance  (pengganti summary di getFinanceReportData) ─────────
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


-- ============================================================================
-- Dashboard & laporan sales
-- ============================================================================

-- KPI utama. Menggantikan getDashboardRawData() + seluruh kalkulasi di
-- JS_Dashboard.html. Filter tanggal & pemilik dilakukan di database.
create or replace function dashboard_summary(
  p_from     date default null,
  p_to       date default null,
  p_owner_id uuid default null
)
returns table (
  total_quotations  bigint,
  total_deal        bigint,
  total_fail        bigint,
  total_progress    bigint,
  revenue           numeric,
  pipeline_value    numeric,
  total_cost        numeric,
  est_profit        numeric,
  avg_margin_pct    numeric,
  win_rate_pct      numeric
)
language sql
stable
as $$
  with base as (
    select v.*
      from v_quotations v
     where (p_owner_id is null or v.owner_id = p_owner_id)
       and (p_from is null or v.issue_date >= p_from)
       and (p_to   is null or v.issue_date <= p_to)
  )
  select
    count(*),
    count(*) filter (where status = 'Deal'),
    count(*) filter (where status = 'Fail'),
    count(*) filter (where status = 'On-Progress'),
    coalesce(sum(grand_total) filter (where status = 'Deal'), 0),
    coalesce(sum(grand_total) filter (where status = 'On-Progress'), 0),
    coalesce(sum(total_cost)  filter (where status = 'Deal'), 0),
    coalesce(sum(est_profit)  filter (where status = 'Deal'), 0),
    round(coalesce(avg(margin_pct) filter (where status = 'Deal'), 0), 2),
    round(
      case when count(*) filter (where status in ('Deal', 'Fail')) = 0 then 0
           else count(*) filter (where status = 'Deal')::numeric * 100
                / count(*) filter (where status in ('Deal', 'Fail'))
      end, 2)
  from base;
$$;


-- Tren bulanan berdasarkan tanggal deal (SalesReport.gs:377)
create view v_sales_monthly as
select
  date_trunc('month', coalesce(q.deal_date, r.issue_date::timestamptz))::date as month,
  q.owner_id,
  count(*)                                                        as deal_count,
  coalesce(sum(r.grand_total), 0)                                 as revenue,
  coalesce(sum(r.est_profit), 0)                                  as profit
from quotations q
join quotation_revisions r on r.id = q.current_revision_id
where q.status = 'Deal'
group by 1, 2;


-- Leaderboard sales: realisasi vs target bulanan (Master_User kol.7)
create view v_sales_leaderboard as
select
  p.id                       as owner_id,
  p.full_name,
  p.monthly_target,
  count(q.id) filter (where q.status = 'Deal')        as deal_count,
  count(q.id)                                          as quotation_count,
  coalesce(sum(r.grand_total) filter (where q.status = 'Deal'), 0) as revenue,
  round(
    case when p.monthly_target > 0
         then coalesce(sum(r.grand_total) filter (where q.status = 'Deal'), 0)
              * 100 / p.monthly_target
         else 0 end, 2)                                as target_achievement_pct
from profiles p
left join quotations q            on q.owner_id = p.id
left join quotation_revisions r   on r.id = q.current_revision_id
where p.role = 'sales' and p.is_active
group by p.id, p.full_name, p.monthly_target;


-- Produk terlaris — kemampuan baru yang praktis mustahil di Sheets karena
-- datanya terkubur di dalam kolom JSON.
create view v_product_sales as
select
  pr.id                        as product_id,
  pr.name                      as product_name,
  pr.unit,
  count(distinct q.id)         as quotation_count,
  coalesce(sum(qi.qty), 0)     as total_qty,
  coalesce(sum(qi.line_total), 0) as total_value
from products pr
join quotation_items qi        on qi.product_id = pr.id
join quotation_item_groups g   on g.id = qi.group_id
join quotation_revisions r     on r.id = g.revision_id
join quotations q              on q.id = r.quotation_id
                              and q.current_revision_id = r.id
                              and q.status = 'Deal'
group by pr.id, pr.name, pr.unit;


-- ============================================================================
-- PENTING — security_invoker
-- ----------------------------------------------------------------------------
-- Secara default, view di Postgres dieksekusi dengan hak PEMILIK view, sehingga
-- kebijakan RLS pada tabel di bawahnya TIDAK berlaku. Tanpa baris-baris di
-- bawah ini, seorang sales bisa membaca seluruh penawaran milik orang lain
-- cukup lewat v_quotations — lubang yang persis ingin ditutup oleh RLS.
--
-- Setiap view BARU yang ditambahkan kemudian wajib ikut di-set seperti ini.
-- ============================================================================
alter view v_quotations       set (security_invoker = true);
alter view v_wo_billing       set (security_invoker = true);
alter view v_predeal_billing  set (security_invoker = true);
alter view v_work_orders      set (security_invoker = true);
alter view v_invoices         set (security_invoker = true);
alter view v_finance_summary  set (security_invoker = true);
alter view v_sales_monthly    set (security_invoker = true);
alter view v_sales_leaderboard set (security_invoker = true);
alter view v_product_sales    set (security_invoker = true);
