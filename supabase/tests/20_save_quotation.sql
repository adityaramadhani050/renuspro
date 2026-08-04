-- ============================================================================
-- Tes save_quotation()
--
-- Yang dibuktikan di sini, berurut dari yang paling penting:
--   1. Nilai uang dihitung SERVER, bukan diterima dari klien
--   2. Penomoran, revisi, dan pointer revisi terkini berperilaku benar
--   3. Aturan bisnis "Deal tidak bisa direvisi" ditegakkan
--   4. Kegagalan bersifat atomik — tidak meninggalkan penawaran separuh jadi
--   5. RLS tetap berlaku di dalam fungsi (sales tidak bisa merevisi milik orang lain)
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ save_quotation()'

-- Data uji terpisah dari 10_behaviour.sql agar tidak saling bergantung.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ba01', 'sq-sales@renus.test'),
  ('00000000-0000-0000-0000-00000000ba02', 'sq-lain@renus.test')
on conflict do nothing;

insert into profiles (id, legacy_code, full_name, username, role) values
  ('00000000-0000-0000-0000-00000000ba01', 'SQ1', 'SQ Sales', 'sqsales', 'sales'),
  ('00000000-0000-0000-0000-00000000ba02', 'SQ2', 'SQ Lain',  'sqlain',  'sales')
on conflict (id) do nothing;

insert into customers (id, legacy_code, name) values
  ('00000000-0000-0000-0000-00000000ca99', 'KSQ', 'PT UJI SIMPAN')
on conflict (id) do nothing;

insert into products (id, legacy_code, name, unit, price, cost) values
  ('00000000-0000-0000-0000-00000000da99', 'PSQ', 'Panel Uji', 'unit', 1000000, 700000)
on conflict (id) do nothing;

-- Semai counter ke angka tinggi supaya nomor yang terbit di sini pasti dan
-- tidak bertabrakan dengan penawaran yang dibuat 10_behaviour.sql.
insert into document_counters (doc_type, period, last_seq)
values ('quotation', '-', 900)
on conflict (doc_type, period) do update set last_seq = 900;


-- ============================================================================
-- 1. Nilai uang dihitung server
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';

do $$
declare
  v_result jsonb;
  v_id uuid;
  r record;
begin
  -- subtotal = 10 × 1.000.000 + 2 × 500.000 = 11.000.000
  -- netto    = 11.000.000 − 1.000.000 = 10.000.000
  -- PPN 11%  = 1.100.000  →  grand total = 11.100.000
  -- HPP      = 10 × 700.000 + 2 × 300.000 = 7.600.000
  -- profit   = 10.000.000 − 7.600.000 = 2.400.000  →  margin 24,0%
  v_result := save_quotation(jsonb_build_object(
    'customer_id',  '00000000-0000-0000-0000-00000000ca99',
    'project_name', 'PLTS Uji Simpan',
    'issue_date',   '2026-03-10',
    'valid_until',  '2026-04-10',
    'discount',     1000000,
    'tax_percent',  11,
    'terms',        jsonb_build_object('pembayaran', 'DP 30%'),
    'groups', jsonb_build_array(
      jsonb_build_object(
        'code', 'A', 'name', 'PAKET UTAMA',
        'items', jsonb_build_array(
          jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000da99',
                             'description', 'Panel Uji', 'qty', 10, 'unit', 'unit',
                             'price', 1000000, 'cost', 700000),
          jsonb_build_object('description', 'Jasa pasang', 'qty', 2, 'unit', 'ls',
                             'price', 500000, 'cost', 300000)
        )
      )
    )
  ));

  v_id := (v_result ->> 'quotation_id')::uuid;

  perform assert_eq(v_result ->> 'quote_number', '901/QUOT/III/2026', 'nomor penawaran terbit otomatis');
  perform assert_eq((v_result ->> 'rev')::int, 0, 'penawaran baru mulai dari rev 0');

  select * into r from quotation_revisions where quotation_id = v_id and rev = 0;

  perform assert_eq(r.subtotal,    11000000::numeric, 'subtotal dihitung dari item');
  perform assert_eq(r.discount,     1000000::numeric, 'diskon tersimpan');
  perform assert_eq(r.tax_amount,   1100000::numeric, 'PPN dihitung dari netto, bukan subtotal');
  perform assert_eq(r.grand_total, 11100000::numeric, 'grand total');
  perform assert_eq(r.total_cost,   7600000::numeric, 'total HPP dihitung dari item');
  perform assert_eq(r.est_profit,   2400000::numeric, 'estimasi keuntungan');
  perform assert_eq(r.margin_pct,        24.0::numeric, 'margin persen');
  perform assert_eq(r.contract_value, 10000000::numeric, 'nilai kontrak = subtotal − diskon');
end $$;

-- Angka palsu dari klien harus DIABAIKAN — ini inti perbaikannya.
do $$
declare v_result jsonb; v_grand numeric;
begin
  v_result := save_quotation(jsonb_build_object(
    'customer_id',  '00000000-0000-0000-0000-00000000ca99',
    'project_name', 'Uji Angka Palsu',
    'issue_date',   '2026-03-11',
    'tax_percent',  11,
    -- Klien "melaporkan" total yang mengada-ada; fungsi tidak menerimanya.
    'subtotal',     999999999,
    'grand_total',  999999999,
    'total_cost',   0,
    'groups', jsonb_build_array(jsonb_build_object(
      'name', 'X',
      'items', jsonb_build_array(jsonb_build_object(
        'description', 'Satu item', 'qty', 1, 'price', 100000, 'cost', 60000))))
  ));

  select grand_total into v_grand
    from quotation_revisions
   where quotation_id = (v_result ->> 'quotation_id')::uuid and rev = 0;

  perform assert_eq(v_grand, 111000::numeric,
                    'angka uang kiriman klien diabaikan, dihitung ulang dari item');
end $$;


-- ============================================================================
-- 2. Revisi
-- ============================================================================
do $$
declare
  v_id uuid;
  v_result jsonb;
  v_current uuid;
begin
  select id into v_id from quotations where quote_number = '901/QUOT/III/2026';

  v_result := save_quotation(jsonb_build_object(
    'quotation_id', v_id,
    'customer_id',  '00000000-0000-0000-0000-00000000ca99',
    'project_name', 'PLTS Uji Simpan (revisi)',
    'issue_date',   '2026-03-20',
    'tax_percent',  11,
    'groups', jsonb_build_array(jsonb_build_object(
      'code', 'A', 'name', 'PAKET REVISI',
      'items', jsonb_build_array(jsonb_build_object(
        'description', 'Panel lebih banyak', 'qty', 20, 'price', 1000000, 'cost', 700000))))
  ));

  perform assert_eq((v_result ->> 'rev')::int, 1, 'revisi berikutnya = rev 1');
  perform assert_eq(v_result ->> 'quote_number', '901/QUOT/III/2026',
                    'nomor penawaran TIDAK berubah saat direvisi');

  select current_revision_id into v_current from quotations where id = v_id;
  perform assert_eq(
    (select rev from quotation_revisions where id = v_current),
    1, 'pointer revisi terkini berpindah ke rev 1');

  perform assert_eq(
    (select project_name from quotations where id = v_id),
    'PLTS Uji Simpan (revisi)', 'header penawaran ikut diperbarui');

  -- Revisi lama tetap utuh — inilah gunanya menormalisasi item.
  perform assert_eq(
    (select count(*)::int
       from quotation_items qi
       join quotation_item_groups g on g.id = qi.group_id
       join quotation_revisions r on r.id = g.revision_id
      where r.quotation_id = v_id and r.rev = 0),
    2, 'item revisi 0 tidak ikut terhapus saat revisi baru dibuat');
end $$;


-- ============================================================================
-- 3. Validasi & atomisitas
-- ============================================================================
do $$
declare v_before int; v_after int;
begin
  select count(*)::int into v_before from quotations;

  begin
    perform save_quotation(jsonb_build_object(
      'customer_id',  '00000000-0000-0000-0000-00000000ca99',
      'project_name', 'Tanpa Item',
      'groups', jsonb_build_array(jsonb_build_object('name', 'Kosong', 'items', '[]'::jsonb))));
    raise exception 'GAGAL — penawaran tanpa item seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ penawaran tanpa baris item ditolak';
  end;

  select count(*)::int into v_after from quotations;
  perform assert_eq(v_after, v_before,
                    'penolakan tidak meninggalkan penawaran separuh jadi (atomik)');
end $$;

do $$
begin
  begin
    perform save_quotation(jsonb_build_object('project_name', 'Tanpa Klien',
      'groups', jsonb_build_array(jsonb_build_object('name', 'A',
        'items', jsonb_build_array(jsonb_build_object('qty', 1, 'price', 1))))));
    raise exception 'GAGAL — penawaran tanpa klien seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ penawaran tanpa klien ditolak';
  end;
end $$;


-- ============================================================================
-- 4. Aturan bisnis: penawaran Deal tidak bisa direvisi
-- ============================================================================
reset role;
reset request.jwt.claim.sub;

update quotations set status = 'Deal', deal_date = now()
 where quote_number = '901/QUOT/III/2026';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';

do $$
declare v_id uuid;
begin
  select id into v_id from quotations where quote_number = '901/QUOT/III/2026';

  begin
    perform save_quotation(jsonb_build_object(
      'quotation_id', v_id,
      'customer_id',  '00000000-0000-0000-0000-00000000ca99',
      'project_name', 'Coba revisi setelah Deal',
      'groups', jsonb_build_array(jsonb_build_object('name', 'A',
        'items', jsonb_build_array(jsonb_build_object('qty', 1, 'price', 1))))));
    raise exception 'GAGAL — penawaran Deal seharusnya tidak bisa direvisi';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ penawaran berstatus Deal tidak bisa direvisi (Penawaran.gs:457)';
  end;
end $$;


-- ============================================================================
-- 5. RLS tetap berlaku di dalam fungsi
-- ============================================================================
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';   -- sales LAIN

do $$
declare v_id uuid;
begin
  -- Penawaran 901 dibuat oleh sales pertama (ba01) di bagian 1.
  select id into v_id from quotations where quote_number = '901/QUOT/III/2026';

  perform assert_true(v_id is null,
    'sales lain bahkan tidak bisa MELIHAT penawaran milik orang lain');

  -- ...sehingga upaya merevisinya pun ditolak, bukan diam-diam berhasil.
  begin
    perform save_quotation(jsonb_build_object(
      'quotation_id', '00000000-0000-0000-0000-00000000ee01',
      'customer_id',  '00000000-0000-0000-0000-00000000ca99',
      'project_name', 'Membajak penawaran orang lain',
      'groups', jsonb_build_array(jsonb_build_object('name', 'A',
        'items', jsonb_build_array(jsonb_build_object('qty', 1, 'price', 1))))));
    raise exception 'GAGAL — revisi atas penawaran orang lain seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice '  ✓ revisi atas penawaran orang lain ditolak';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;

\echo '✓ Tes save_quotation lulus.'
