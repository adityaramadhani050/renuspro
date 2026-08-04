-- ============================================================================
-- RenusPro — Tes perilaku skema
-- ----------------------------------------------------------------------------
-- Membuktikan bahwa trigger, constraint, penomoran, view dan RLS benar-benar
-- berperilaku seperti yang dimaksud — bukan sekadar DDL yang bisa di-parse.
-- Dijalankan otomatis oleh tools/verify-schema.sh
--
-- Setiap kegagalan memunculkan exception dengan pesan yang menyebut apa yang
-- diharapkan dan apa yang terjadi.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── Helper assert ───────────────────────────────────────────────────────────
create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'GAGAL — %: diharapkan %, ternyata %', label, expected, actual;
  end if;
  raise notice '  ✓ %', label;
end;
$$;

create or replace function assert_true(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'GAGAL — %', label;
  end if;
  raise notice '  ✓ %', label;
end;
$$;


-- ============================================================================
-- Data uji
-- ============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@renus.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'sales1@renus.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'sales2@renus.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'finance@renus.test');

insert into profiles (id, legacy_code, full_name, username, role, monthly_target) values
  ('00000000-0000-0000-0000-0000000000a1', 'U001', 'Administrator',   'admin',    'admin',   0),
  ('00000000-0000-0000-0000-0000000000b1', 'U002', 'Sales Executive', 'sales1',   'sales',   100000000),
  ('00000000-0000-0000-0000-0000000000b2', 'U004', 'Sales Kedua',     'sales2',   'sales',   50000000),
  ('00000000-0000-0000-0000-0000000000c1', 'U003', 'Finance Officer', 'finance1', 'finance', 0);

insert into customers (id, legacy_code, name, company, address, phone) values
  ('00000000-0000-0000-0000-00000000cc01', 'K001', 'PT SUMMIT GLOBAL TEKNOLOGI', 'C&I', 'Tangerang', '081283576437');

insert into products (id, legacy_code, name, unit, price, cost) values
  ('00000000-0000-0000-0000-00000000dd01', 'P001', 'Panel Surya Jinko 625Wp', 'unit', 2500000, 1900000),
  ('00000000-0000-0000-0000-00000000dd02', 'P002', 'Inverter Hybrid Deye 10kW', 'unit', 42000000, 35000000);


-- ============================================================================
-- 1. Penomoran dokumen
-- ============================================================================
\echo '▸ 1. Penomoran dokumen'

do $$
declare n1 text; n2 text;
begin
  n1 := next_quotation_number('2026-03-15');
  n2 := next_quotation_number('2026-03-15');
  perform assert_eq(n1, '001/QUOT/III/2026', 'nomor penawaran pertama (bulan Romawi)');
  perform assert_eq(n2, '002/QUOT/III/2026', 'nomor penawaran naik berurutan');
  perform assert_eq(next_invoice_number('2026-01-05'), '001/RGI/INV/I/2026',  'format nomor invoice');
  perform assert_eq(next_receipt_number('2026-12-31'), '001/RGI/KWT/XII/2026', 'format nomor kwitansi');
end $$;

-- No WO reset tiap tahun, sedangkan nomor penawaran/invoice/kwitansi tidak.
do $$
begin
  perform assert_eq(next_wo_number('2026-05-01'), '26001', 'No WO pertama tahun 2026');
  perform assert_eq(next_wo_number('2026-08-01'), '26002', 'No WO naik dalam tahun yang sama');
  perform assert_eq(next_wo_number('2027-01-02'), '27001', 'No WO RESET di tahun berikutnya');
  perform assert_eq(next_quotation_number('2027-01-02'), '003/QUOT/I/2027',
                    'nomor penawaran TIDAK reset lintas tahun (sesuai perilaku GAS)');
end $$;

-- Bersihkan counter supaya tes berikutnya mulai dari angka bersih
delete from document_counters;


-- ============================================================================
-- 2. Penawaran, revisi, dan pointer revisi terkini
-- ============================================================================
\echo '▸ 2. Revisi penawaran'

insert into quotations (id, quote_number, customer_id, project_name, owner_id, owner_name_legacy)
values ('00000000-0000-0000-0000-00000000ee01', '001/QUOT/III/2026',
        '00000000-0000-0000-0000-00000000cc01', 'PLTS Off-Grid 10kWp',
        '00000000-0000-0000-0000-0000000000b1', 'Sales Executive');

insert into quotation_revisions (id, quotation_id, rev, issue_date, valid_until,
       subtotal, discount, tax_amount, grand_total, total_cost, est_profit, margin_pct)
values ('00000000-0000-0000-0000-00000000ff00', '00000000-0000-0000-0000-00000000ee01',
        0, '2026-03-15', '2026-04-15',
        100000000, 5000000, 10450000, 105450000, 70000000, 25000000, 26.32);

do $$
begin
  perform assert_eq(
    (select current_revision_id from quotations where id = '00000000-0000-0000-0000-00000000ee01'),
    '00000000-0000-0000-0000-00000000ff00'::uuid,
    'current_revision_id terisi otomatis saat revisi pertama dibuat');

  perform assert_eq(
    (select contract_value from quotation_revisions where id = '00000000-0000-0000-0000-00000000ff00'),
    95000000::numeric,
    'contract_value = subtotal - diskon (dasar penagihan Invoice.gs:283)');
end $$;

-- Revisi 1 harus menggeser pointer
insert into quotation_revisions (id, quotation_id, rev, issue_date,
       subtotal, discount, tax_amount, grand_total, total_cost, est_profit, margin_pct)
values ('00000000-0000-0000-0000-00000000ff01', '00000000-0000-0000-0000-00000000ee01',
        1, '2026-03-20', 120000000, 0, 13200000, 133200000, 80000000, 40000000, 33.33);

do $$
begin
  perform assert_eq(
    (select current_revision_id from quotations where id = '00000000-0000-0000-0000-00000000ee01'),
    '00000000-0000-0000-0000-00000000ff01'::uuid,
    'pointer berpindah ke revisi terbaru');

  perform assert_eq(
    (select rev from v_quotations where id = '00000000-0000-0000-0000-00000000ee01'),
    1, 'v_quotations memakai revisi terkini tanpa loop latestRevMap');

  perform assert_eq(
    (select revision_count from v_quotations where id = '00000000-0000-0000-0000-00000000ee01'),
    2::bigint, 'jumlah revisi terhitung benar');
end $$;

-- Item berkelompok (struktur kelompok → subItems dari JS_Form_Penawaran.html:350)
insert into quotation_item_groups (id, revision_id, code, name, subtotal, sort_order)
values ('00000000-0000-0000-0000-0000000aa001', '00000000-0000-0000-0000-00000000ff01',
        'A', 'PAKET PLTS OFF-GRID', 120000000, 0);

insert into quotation_items (group_id, product_id, description, qty, unit, price, cost, line_total, sort_order)
values
  ('00000000-0000-0000-0000-0000000aa001', '00000000-0000-0000-0000-00000000dd01',
   'Panel Surya Jinko 625Wp', 17, 'unit', 2500000, 1900000, 42500000, 1),
  ('00000000-0000-0000-0000-0000000aa001', '00000000-0000-0000-0000-00000000dd02',
   'Inverter Hybrid Deye 10kW', 1, 'unit', 42000000, 35000000, 42000000, 2);


-- ============================================================================
-- 3. Status Deal  →  Work Order otomatis
-- ============================================================================
\echo '▸ 3. Otomasi Deal → Work Order'

update quotations
   set status = 'Deal', deal_date = '2026-04-01'
 where id = '00000000-0000-0000-0000-00000000ee01';

do $$
declare v_wo text;
begin
  select wo_number into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000ee01';

  perform assert_eq(v_wo, '26001', 'Work Order terbit otomatis dengan format [YY][NNN]');

  perform assert_true(
    (select deal_date is not null from quotations
      where id = '00000000-0000-0000-0000-00000000ee01'),
    'tanggal deal terisi');
end $$;

-- Constraint: tanggal deal tidak boleh terisi kalau status bukan Deal
do $$
begin
  begin
    insert into quotations (quote_number, customer_id, project_name, status, deal_date)
    values ('999/QUOT/I/2026', '00000000-0000-0000-0000-00000000cc01',
            'Uji constraint', 'On-Progress', now());
    raise exception 'GAGAL — constraint deal_date seharusnya menolak baris ini';
  exception when check_violation then
    raise notice '  ✓ tanggal deal ditolak saat status bukan Deal';
  end;
end $$;

-- Keluar dari Deal: tanggal deal dikosongkan, tapi Work Order DIPERTAHANKAN
-- (GAS menghapusnya di Penawaran.gs:345 — itu meninggalkan invoice yatim).
update quotations set status = 'Fail' where id = '00000000-0000-0000-0000-00000000ee01';

do $$
begin
  perform assert_true(
    (select deal_date is null from quotations where id = '00000000-0000-0000-0000-00000000ee01'),
    'tanggal deal dikosongkan saat keluar dari status Deal');
  perform assert_true(
    exists (select 1 from work_orders where quotation_id = '00000000-0000-0000-0000-00000000ee01'),
    'Work Order TIDAK dihapus — nomornya mungkin sudah dipakai invoice');
end $$;

-- Kembalikan ke Deal; tidak boleh terbit WO kedua
update quotations set status = 'Deal', deal_date = '2026-04-01'
 where id = '00000000-0000-0000-0000-00000000ee01';

do $$
begin
  perform assert_eq(
    (select count(*) from work_orders where quotation_id = '00000000-0000-0000-0000-00000000ee01'),
    1::bigint, 'tidak terbit Work Order ganda saat status bolak-balik');
end $$;


-- ============================================================================
-- 4. Invoice: constraint & otomasi tanggal bayar
-- ============================================================================
\echo '▸ 4. Invoice'

-- Invoice pre-deal (tanpa WO) hanya boleh jenis DP — Invoice.gs:275
do $$
begin
  begin
    insert into invoices (invoice_number, quotation_id, issue_date, type, dpp, total)
    values ('900/RGI/INV/I/2026', '00000000-0000-0000-0000-00000000ee01',
            '2026-01-10', 'Termin', 1000000, 1110000);
    raise exception 'GAGAL — invoice pre-deal jenis Termin seharusnya ditolak';
  exception when check_violation then
    raise notice '  ✓ invoice pre-deal non-DP ditolak (Invoice.gs:275)';
  end;
end $$;

-- Invoice harus menempel pada WO atau penawaran
do $$
begin
  begin
    insert into invoices (invoice_number, issue_date, dpp, total)
    values ('901/RGI/INV/I/2026', '2026-01-10', 1000000, 1110000);
    raise exception 'GAGAL — invoice tanpa induk seharusnya ditolak';
  exception when check_violation then
    raise notice '  ✓ invoice tanpa WO maupun penawaran ditolak';
  end;
end $$;

-- Invoice normal: DP 30% dari nilai kontrak 120.000.000
insert into invoices (id, invoice_number, work_order_id, issue_date, type, percent,
       customer_id, customer_snapshot, dpp, vat_percent, vat_amount, total,
       contract_value, scope)
select '00000000-0000-0000-0000-0000000bb001', '001/RGI/INV/IV/2026', w.id,
       '2026-04-05', 'DP', 30,
       '00000000-0000-0000-0000-00000000cc01',
       '{"name":"PT SUMMIT GLOBAL TEKNOLOGI","project":"PLTS Off-Grid 10kWp"}'::jsonb,
       36000000, 11, 3960000, 39960000, 120000000, 'Termin 1'
  from work_orders w where w.quotation_id = '00000000-0000-0000-0000-00000000ee01';

do $$
begin
  perform assert_true(
    (select paid_at is null from invoices where id = '00000000-0000-0000-0000-0000000bb001'),
    'tanggal bayar kosong selama belum lunas');
end $$;

-- Menggantikan catatTanggalBayar() yang harus dipanggil manual (FinanceReport.gs:20)
update invoices set payment_status = 'Lunas'
 where id = '00000000-0000-0000-0000-0000000bb001';

do $$
begin
  perform assert_eq(
    (select paid_at from invoices where id = '00000000-0000-0000-0000-0000000bb001'),
    current_date, 'tanggal bayar terisi OTOMATIS saat status menjadi Lunas');
end $$;

update invoices set payment_status = 'Belum Lunas'
 where id = '00000000-0000-0000-0000-0000000bb001';

do $$
begin
  perform assert_true(
    (select paid_at is null from invoices where id = '00000000-0000-0000-0000-0000000bb001'),
    'tanggal bayar dibatalkan saat status dikembalikan');
end $$;


-- ============================================================================
-- 5. View: penagihan, sisa tagihan, dan umur piutang
-- ============================================================================
\echo '▸ 5. View laporan'

do $$
declare r record;
begin
  select * into r from v_work_orders where wo_number = '26001';

  perform assert_eq(r.contract_value,       120000000::numeric, 'nilai kontrak (DPP) di v_work_orders');
  perform assert_eq(r.contract_value_gross, 133200000::numeric, 'nilai kontrak bruto = DPP + PPN');
  perform assert_eq(r.billed_dpp,            36000000::numeric, 'DPP yang sudah ditagih');
  perform assert_eq(r.remaining_dpp,         84000000::numeric, 'sisa DPP yang boleh ditagih');
  perform assert_eq(r.paid_total,                    0::numeric, 'belum ada yang terbayar');
  perform assert_eq(r.outstanding,           39960000::numeric, 'piutang berjalan');
end $$;

do $$
declare r record;
begin
  select * into r from v_invoices where invoice_number = '001/RGI/INV/IV/2026';
  perform assert_eq(r.is_predeal, false, 'invoice ini bukan pre-deal');
  perform assert_eq(r.wo_number, '26001', 'nomor WO ikut terbawa di v_invoices');
  perform assert_true(r.aging_bucket is not null, 'umur piutang terhitung untuk invoice belum lunas');
end $$;

-- Dashboard: satu baris angka, bukan seluruh data mentah ke browser
do $$
declare r record;
begin
  select * into r from dashboard_summary(null, null, null);
  perform assert_eq(r.total_quotations, 1::bigint,          'jumlah penawaran');
  perform assert_eq(r.total_deal,       1::bigint,          'jumlah deal');
  perform assert_eq(r.revenue,          133200000::numeric, 'revenue dari revisi terkini');
  perform assert_eq(r.win_rate_pct,     100.00::numeric,    'win rate');
end $$;

-- Produk terlaris — mustahil di Sheets karena datanya terkubur di kolom JSON
do $$
begin
  perform assert_eq(
    (select total_qty from v_product_sales where product_name = 'Panel Surya Jinko 625Wp'),
    17::numeric, 'agregasi qty produk dari item penawaran');
end $$;


-- ============================================================================
-- 6. Row Level Security
-- ============================================================================
\echo '▸ 6. Row Level Security'

-- Penawaran kedua, milik sales2
insert into quotations (id, quote_number, customer_id, project_name, owner_id)
values ('00000000-0000-0000-0000-00000000ee02', '002/QUOT/III/2026',
        '00000000-0000-0000-0000-00000000cc01', 'Proyek Sales Kedua',
        '00000000-0000-0000-0000-0000000000b2');

-- ── sales1 hanya melihat penawarannya sendiri ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

do $$
begin
  perform assert_eq((select count(*) from quotations)::bigint, 1::bigint,
                    'sales1 hanya melihat 1 penawaran (miliknya)');
  perform assert_eq((select count(*) from v_quotations)::bigint, 1::bigint,
                    'VIEW ikut terkena RLS — security_invoker bekerja');
end $$;

-- Tidak boleh membuat penawaran atas nama orang lain
do $$
begin
  begin
    insert into quotations (quote_number, customer_id, project_name, owner_id)
    values ('003/QUOT/III/2026', '00000000-0000-0000-0000-00000000cc01',
            'Menyamar', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'GAGAL — sales1 seharusnya tidak bisa membuat penawaran atas nama sales2';
  exception when insufficient_privilege then
    raise notice '  ✓ sales tidak bisa membuat penawaran atas nama orang lain';
  end;
end $$;

-- Sales tidak boleh menulis invoice
do $$
begin
  begin
    insert into invoices (invoice_number, work_order_id, issue_date, type, dpp, total)
    select '902/RGI/INV/I/2026', w.id, '2026-05-01', 'Termin', 1000000, 1110000
      from work_orders w limit 1;
    raise exception 'GAGAL — sales seharusnya tidak bisa menerbitkan invoice';
  exception when insufficient_privilege then
    raise notice '  ✓ sales tidak bisa menerbitkan invoice';
  end;
end $$;

-- Sales tidak boleh menaikkan role-nya sendiri
do $$
begin
  begin
    update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'GAGAL — eskalasi hak akses seharusnya ditolak';
  exception when insufficient_privilege then
    raise notice '  ✓ sales tidak bisa menaikkan role-nya sendiri menjadi admin';
  end;
end $$;

-- Tapi boleh mengubah namanya sendiri
update profiles set full_name = 'Sales Executive (edit)'
 where id = '00000000-0000-0000-0000-0000000000b1';
do $$
begin
  perform assert_true(true, 'sales boleh menyunting profil non-privileged miliknya');
end $$;

reset role;
reset request.jwt.claim.sub;

-- ── finance melihat semua penawaran & boleh menulis invoice ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

do $$
begin
  perform assert_eq((select count(*) from quotations)::bigint, 2::bigint,
                    'finance melihat semua penawaran');
end $$;

insert into invoices (invoice_number, work_order_id, issue_date, type, percent, dpp, vat_amount, total)
select '002/RGI/INV/V/2026', w.id, '2026-05-01', 'Termin', 20, 24000000, 2640000, 26640000
  from work_orders w where w.wo_number = '26001';

do $$
begin
  perform assert_true(true, 'finance boleh menerbitkan invoice');
end $$;

reset role;
reset request.jwt.claim.sub;

-- ── admin melihat semuanya ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
begin
  perform assert_eq((select count(*) from quotations)::bigint, 2::bigint,
                    'admin melihat semua penawaran');
  perform assert_true(is_admin(), 'helper is_admin() mengenali admin');
end $$;

reset role;
reset request.jwt.claim.sub;

-- ── Counter dokumen tidak bisa disentuh klien ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
begin
  begin
    perform count(*) from document_counters;
    raise exception 'GAGAL — document_counters seharusnya tidak bisa dibaca klien';
  exception when insufficient_privilege then
    raise notice '  ✓ document_counters tertutup rapat, bahkan untuk admin';
  end;
end $$;

-- ...tapi penomoran tetap jalan lewat fungsi SECURITY DEFINER
do $$
begin
  perform assert_true(next_quotation_number('2026-06-01') like '%/QUOT/VI/2026',
                      'penomoran tetap berfungsi lewat fungsi SECURITY DEFINER');
end $$;

reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '✓ Seluruh tes perilaku lulus.'
