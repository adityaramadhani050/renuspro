-- ============================================================================
-- Tes create_invoice() & set_invoice_payment_status()
--
-- Yang dibuktikan:
--   1. DPP dihitung benar untuk tiap jenis tagihan (DP / Termin / Pelunasan / Penuh)
--   2. Penagihan tidak bisa melebihi sisa kontrak — inti perlindungannya
--   3. Sisa kontrak berkurang secara akumulatif antar invoice
--   4. Pelunasan menerbitkan kwitansi otomatis, dan tidak menggandakannya
--   5. Sales tidak bisa menerbitkan invoice (RLS), finance bisa
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ create_invoice() & set_invoice_payment_status()'

-- ── Data uji: satu penawaran Deal bernilai kontrak 100.000.000 + PPN 11% ────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000fa01', 'inv-finance@renus.test'),
  ('00000000-0000-0000-0000-00000000fa02', 'inv-sales@renus.test')
on conflict do nothing;

insert into profiles (id, legacy_code, full_name, username, role) values
  ('00000000-0000-0000-0000-00000000fa01', 'IF1', 'Inv Finance', 'invfinance', 'finance'),
  ('00000000-0000-0000-0000-00000000fa02', 'IS1', 'Inv Sales',   'invsales',   'sales')
on conflict (id) do nothing;

insert into customers (id, legacy_code, name, company) values
  ('00000000-0000-0000-0000-00000000cb01', 'KINV', 'PT UJI INVOICE', 'Industri')
on conflict (id) do nothing;

insert into quotations (id, quote_number, customer_id, project_name, owner_id)
values ('00000000-0000-0000-0000-00000000eb01', '800/QUOT/III/2026',
        '00000000-0000-0000-0000-00000000cb01', 'Proyek Uji Invoice',
        '00000000-0000-0000-0000-00000000fa02')
on conflict (quote_number) do nothing;

insert into quotation_revisions (
  id, quotation_id, rev, issue_date,
  subtotal, discount, tax_amount, grand_total, total_cost, est_profit, margin_pct)
values ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000eb01',
        0, '2026-03-01', 100000000, 0, 11000000, 111000000, 60000000, 40000000, 40)
on conflict (quotation_id, rev) do nothing;

update quotations set status = 'Deal', deal_date = '2026-03-05'
 where id = '00000000-0000-0000-0000-00000000eb01';

-- Counter invoice & kwitansi disemai tinggi agar nomornya pasti.
insert into document_counters (doc_type, period, last_seq) values
  ('invoice', '-', 800), ('receipt', '-', 800)
on conflict (doc_type, period) do update set last_seq = excluded.last_seq;


-- ============================================================================
-- 1. RLS: sales tidak boleh menerbitkan invoice
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa02';   -- sales

do $$
declare v_wo uuid;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';

  begin
    perform create_invoice(jsonb_build_object(
      'work_order_id', v_wo, 'issue_date', '2026-03-10',
      'type', 'DP', 'input_mode', 'persen', 'percent', 30));
    raise exception 'GAGAL — sales seharusnya tidak bisa menerbitkan invoice';
  exception when insufficient_privilege then
    raise notice '  ✓ sales tidak bisa menerbitkan invoice';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 2. Perhitungan DPP per jenis tagihan
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa01';   -- finance

-- DP 30% dari kontrak 100.000.000
do $$
declare v_wo uuid; v_res jsonb;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';

  v_res := create_invoice(jsonb_build_object(
    'work_order_id', v_wo, 'issue_date', '2026-03-10',
    'type', 'DP', 'input_mode', 'persen', 'percent', 30,
    'po_number', 'PO-001'));

  perform assert_eq(v_res ->> 'invoice_number', '801/RGI/INV/III/2026', 'nomor invoice terbit otomatis');
  perform assert_eq((v_res ->> 'dpp')::numeric,        30000000::numeric, 'DPP = 30% × nilai kontrak');
  perform assert_eq((v_res ->> 'vat_amount')::numeric,  3300000::numeric, 'PPN 11% dari DPP');
  perform assert_eq((v_res ->> 'total')::numeric,      33300000::numeric, 'total = DPP + PPN');
  perform assert_eq((v_res ->> 'remaining_after')::numeric, 70000000::numeric, 'sisa kontrak setelah DP');
end $$;

-- Termin dengan input NOMINAL
do $$
declare v_wo uuid; v_res jsonb;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';

  v_res := create_invoice(jsonb_build_object(
    'work_order_id', v_wo, 'issue_date', '2026-04-10',
    'type', 'Termin', 'input_mode', 'nominal', 'dpp', 20000000));

  perform assert_eq((v_res ->> 'dpp')::numeric, 20000000::numeric, 'DPP dari input nominal');
  perform assert_eq(
    (select percent from invoices where invoice_number = v_res ->> 'invoice_number'),
    20::numeric, 'persen diturunkan dari nominal');
  perform assert_eq((v_res ->> 'remaining_after')::numeric, 50000000::numeric,
                    'sisa berkurang akumulatif antar invoice');
end $$;

-- Penagihan melebihi sisa kontrak harus DITOLAK — ini inti perlindungannya
do $$
declare v_wo uuid; v_count_before int; v_count_after int;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';
  select count(*)::int into v_count_before from invoices where work_order_id = v_wo;

  begin
    perform create_invoice(jsonb_build_object(
      'work_order_id', v_wo, 'issue_date', '2026-05-10',
      'type', 'Termin', 'input_mode', 'nominal', 'dpp', 60000000));  -- sisa hanya 50 juta
    raise exception 'GAGAL — tagihan melebihi sisa kontrak seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ tagihan melebihi sisa kontrak ditolak';
  end;

  select count(*)::int into v_count_after from invoices where work_order_id = v_wo;
  perform assert_eq(v_count_after, v_count_before,
                    'penolakan tidak meninggalkan invoice separuh jadi');
end $$;

-- Pelunasan mengambil TEPAT sisa yang tersisa
do $$
declare v_wo uuid; v_res jsonb;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';

  v_res := create_invoice(jsonb_build_object(
    'work_order_id', v_wo, 'issue_date', '2026-06-10', 'type', 'Pelunasan'));

  perform assert_eq((v_res ->> 'dpp')::numeric, 50000000::numeric,
                    'Pelunasan menagih tepat sisa kontrak');
  perform assert_eq((v_res ->> 'remaining_after')::numeric, 0::numeric,
                    'kontrak tertagih penuh');
end $$;

-- Setelah lunas tertagih, tidak boleh ada tagihan lagi
do $$
declare v_wo uuid;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';
  begin
    perform create_invoice(jsonb_build_object(
      'work_order_id', v_wo, 'issue_date', '2026-07-10',
      'type', 'Termin', 'input_mode', 'persen', 'percent', 10));
    raise exception 'GAGAL — kontrak yang sudah tertagih penuh tidak boleh ditagih lagi';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ kontrak yang sudah tertagih penuh tidak bisa ditagih lagi';
  end;
end $$;

-- Total tagihan harus sama persis dengan nilai kontrak
do $$
declare v_wo uuid;
begin
  select id into v_wo from work_orders
   where quotation_id = '00000000-0000-0000-0000-00000000eb01';

  perform assert_eq(
    (select billed_dpp from v_wo_billing where work_order_id = v_wo),
    100000000::numeric, 'total DPP tertagih = nilai kontrak');

  perform assert_eq(
    (select remaining_dpp from v_work_orders where id = v_wo),
    0::numeric, 'sisa yang boleh ditagih habis');
end $$;


-- ============================================================================
-- 3. Pelunasan menerbitkan kwitansi otomatis
-- ============================================================================
do $$
declare v_inv uuid; v_res jsonb; v_res2 jsonb;
begin
  select id into v_inv from invoices where invoice_number = '801/RGI/INV/III/2026';

  v_res := set_invoice_payment_status(v_inv, 'Lunas');

  perform assert_true((v_res ->> 'receipt_created')::boolean,
                      'kwitansi terbit otomatis saat invoice dilunasi');
  perform assert_eq(v_res ->> 'receipt_number', '801/RGI/KWT/'
                    || (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])
                       [extract(month from current_date)::int]
                    || '/' || extract(year from current_date)::int,
                    'nomor kwitansi mengikuti format sistem lama');

  perform assert_eq(
    (select amount from receipts where invoice_id = v_inv),
    33300000::numeric, 'nilai kwitansi = total invoice (termasuk PPN)');

  perform assert_eq(
    (select received_from from receipts where invoice_id = v_inv),
    'PT UJI INVOICE', 'kwitansi memakai nama klien dari snapshot invoice');

  perform assert_eq(
    (select paid_at from invoices where id = v_inv),
    current_date, 'tanggal bayar terisi lewat trigger');

  -- Melunasi ulang tidak boleh menggandakan kwitansi
  v_res2 := set_invoice_payment_status(v_inv, 'Lunas');
  perform assert_true(not (v_res2 ->> 'receipt_created')::boolean,
                      'kwitansi tidak digandakan saat invoice dilunasi ulang');
  perform assert_eq(
    (select count(*)::int from receipts where invoice_id = v_inv),
    1, 'tetap hanya satu kwitansi');
end $$;


-- ============================================================================
-- 4. Invoice pre-deal
-- ============================================================================
-- Penyiapan datanya dilakukan di luar peran finance: finance memang TIDAK
-- boleh membuat penawaran (kebijakan quotations_insert), dan itu justru
-- perilaku yang benar.
reset role;
reset request.jwt.claim.sub;

insert into quotations (id, quote_number, customer_id, project_name, owner_id)
values ('00000000-0000-0000-0000-00000000eb02', '801/QUOT/III/2026',
        '00000000-0000-0000-0000-00000000cb01', 'Proyek Belum Deal',
        '00000000-0000-0000-0000-00000000fa02')
on conflict (quote_number) do nothing;

insert into quotation_revisions (
  id, quotation_id, rev, issue_date,
  subtotal, discount, tax_amount, grand_total, total_cost, est_profit, margin_pct)
values ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000eb02',
        0, '2026-03-01', 50000000, 0, 5500000, 55500000, 30000000, 20000000, 40)
on conflict (quotation_id, rev) do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000fa01';   -- finance

do $$
declare v_res jsonb;
begin
  -- Jenis selain DP harus ditolak untuk pre-deal
  begin
    perform create_invoice(jsonb_build_object(
      'quotation_id', '00000000-0000-0000-0000-00000000eb02',
      'issue_date', '2026-03-15', 'type', 'Termin',
      'input_mode', 'persen', 'percent', 20));
    raise exception 'GAGAL — invoice pre-deal non-DP seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ invoice pre-deal hanya boleh jenis DP';
  end;

  v_res := create_invoice(jsonb_build_object(
    'quotation_id', '00000000-0000-0000-0000-00000000eb02',
    'issue_date', '2026-03-15', 'type', 'DP',
    'input_mode', 'persen', 'percent', 20));

  perform assert_eq((v_res ->> 'dpp')::numeric, 10000000::numeric,
                    'DP pre-deal dihitung dari nilai penawaran');
  perform assert_true(
    (select work_order_id is null from invoices
      where invoice_number = v_res ->> 'invoice_number'),
    'invoice pre-deal tidak menempel ke Work Order');
end $$;

reset role;
reset request.jwt.claim.sub;

\echo '✓ Tes invoice lulus.'
