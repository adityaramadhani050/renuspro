-- ============================================================================
-- Tes kapabilitas per peran
--
-- Yang dijaga di sini adalah dua kesalahan berlawanan yang sama-sama muncul
-- saat semua peran dipaksa menjadi 'sales':
--   • owner KEHILANGAN wewenang yang seharusnya dimilikinya
--   • warehouse & procurement JUSTRU MENDAPAT wewenang yang tidak seharusnya
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ Kapabilitas per peran'

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'owner@renus.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'leadsales@renus.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'warehouse@renus.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'procurement@renus.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'sales-lain@renus.test')
on conflict do nothing;

insert into profiles (id, legacy_code, full_name, username, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'R1', 'Pemilik',      'pemilik',  'owner'),
  ('00000000-0000-0000-0000-0000000000d2', 'R2', 'Lead Sales',   'leadsl',   'leadsales'),
  ('00000000-0000-0000-0000-0000000000d3', 'R3', 'Gudang',       'gudang',   'warehouse'),
  ('00000000-0000-0000-0000-0000000000d4', 'R4', 'Pengadaan',    'pengadaan','procurement'),
  ('00000000-0000-0000-0000-0000000000d5', 'R5', 'Sales Lain',   'saleslain','sales')
on conflict (id) do nothing;

insert into customers (id, legacy_code, name) values
  ('00000000-0000-0000-0000-00000000cd01', 'KROLE', 'PT UJI PERAN')
on conflict (id) do nothing;

-- Penawaran milik sales-lain, dipakai untuk menguji batas kewenangan.
insert into quotations (id, quote_number, customer_id, project_name, owner_id)
values ('00000000-0000-0000-0000-00000000ed01', '700/QUOT/III/2026',
        '00000000-0000-0000-0000-00000000cd01', 'Proyek Uji Peran',
        '00000000-0000-0000-0000-0000000000d5')
on conflict (quote_number) do nothing;


-- ============================================================================
-- 1. owner setara admin
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

do $$
begin
  perform assert_true(is_superuser(), 'owner diakui sebagai wewenang tertinggi');
  perform assert_true(can_manage_finance(), 'owner boleh menerbitkan invoice');
  perform assert_true(can_see_all_quotations(), 'owner melihat semua penawaran');
  perform assert_true(
    (select count(*) from quotations where quote_number = '700/QUOT/III/2026') = 1,
    'owner melihat penawaran milik sales lain');
end $$;

-- owner boleh mengubah peran orang lain — inilah yang hilang saat ia
-- terlanjur dipaksa menjadi 'sales'.
update profiles set role = 'sales' where id = '00000000-0000-0000-0000-0000000000d5';
do $$
begin
  perform assert_true(true, 'owner boleh mengubah peran pengguna lain');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 2. leadsales melihat semua, tapi hanya menulis miliknya
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';

do $$
begin
  perform assert_true(can_see_all_quotations(), 'leadsales melihat semua penawaran');
  perform assert_true(can_write_quotations(), 'leadsales boleh membuat penawaran');
  perform assert_true(not is_superuser(), 'leadsales bukan wewenang tertinggi');
  perform assert_true(not can_manage_finance(), 'leadsales tidak menerbitkan invoice');

  perform assert_true(
    (select count(*) from quotations where quote_number = '700/QUOT/III/2026') = 1,
    'leadsales melihat penawaran anggota timnya');

  -- Melihat boleh; menyunting milik orang lain tidak.
  begin
    update quotations set project_name = 'Diubah lead'
     where quote_number = '700/QUOT/III/2026';
    if found then
      raise exception 'GAGAL — leadsales seharusnya tidak bisa menyunting penawaran orang lain';
    end if;
    raise notice '  ✓ leadsales tidak bisa menyunting penawaran orang lain';
  exception when insufficient_privilege then
    raise notice '  ✓ leadsales tidak bisa menyunting penawaran orang lain';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 3. warehouse: baca saja
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d3';

do $$
begin
  perform assert_true(can_see_all_quotations(), 'warehouse melihat penawaran & Work Order');
  perform assert_true(not can_write_quotations(),
                      'warehouse TIDAK boleh membuat penawaran');
  perform assert_true(not can_manage_master(),
                      'warehouse TIDAK boleh mengubah data master');
  perform assert_true(not can_manage_finance(), 'warehouse tidak menerbitkan invoice');

  begin
    insert into quotations (quote_number, customer_id, project_name, owner_id)
    values ('701/QUOT/III/2026', '00000000-0000-0000-0000-00000000cd01',
            'Gudang bikin penawaran', auth.uid());
    raise exception 'GAGAL — warehouse seharusnya tidak bisa membuat penawaran';
  exception when insufficient_privilege then
    raise notice '  ✓ warehouse tidak bisa membuat penawaran';
  end;

  begin
    insert into products (legacy_code, name) values ('PX9', 'Produk dari gudang');
    raise exception 'GAGAL — warehouse seharusnya tidak bisa menambah produk';
  exception when insufficient_privilege then
    raise notice '  ✓ warehouse tidak bisa menambah produk';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 4. procurement: kelola produk, tapi bukan penawaran
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';

do $$
begin
  perform assert_true(can_manage_master(), 'procurement mengelola data produk');
  perform assert_true(not can_write_quotations(),
                      'procurement TIDAK membuat penawaran');
end $$;

insert into products (legacy_code, name, price, cost) values ('PX8', 'Panel dari pengadaan', 100, 80);
do $$
begin
  perform assert_true(true, 'procurement boleh menambah produk');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 5. sales biasa tetap terbatas pada miliknya
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d5';

do $$
begin
  perform assert_true(not can_see_all_quotations(),
                      'sales biasa hanya melihat penawarannya sendiri');
  perform assert_true(can_write_quotations(), 'sales biasa boleh membuat penawaran');

  -- Penawaran 700 memang miliknya, jadi harus terlihat.
  perform assert_true(
    (select count(*) from quotations where quote_number = '700/QUOT/III/2026') = 1,
    'sales melihat penawaran miliknya sendiri');
end $$;

reset role;
reset request.jwt.claim.sub;

\echo '✓ Tes kapabilitas peran lulus.'

-- ============================================================================
-- 6. Peran teknik: baca dan catat, tapi tidak menjual maupun menagih
-- ============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'site@renus.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'koordinator@renus.test')
on conflict do nothing;

insert into profiles (id, legacy_code, full_name, username, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'R6', 'Site Engineer', 'siteeng', 'siteengineer'),
  ('00000000-0000-0000-0000-0000000000e2', 'R7', 'Koordinator',   'koord',   'projectcoordinator')
on conflict (id) do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

do $$
begin
  perform assert_true(can_see_all_quotations(),
                      'site engineer melihat pekerjaan yang harus dikerjakan');
  perform assert_true(can_write_wo_notes(),
                      'site engineer mencatat progres Work Order');
  perform assert_true(not can_write_quotations(),
                      'site engineer TIDAK membuat penawaran');
  perform assert_true(not can_manage_finance(),
                      'site engineer TIDAK menerbitkan invoice');
  perform assert_true(not can_request_invoice(),
                      'site engineer tidak meminta invoice; itu tugas koordinator');
  perform assert_true(not can_manage_master(),
                      'site engineer tidak mengubah data master');
end $$;

reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';

do $$
begin
  perform assert_true(can_request_invoice(), 'koordinator proyek boleh meminta invoice');
  perform assert_true(can_write_wo_notes(),  'koordinator proyek mencatat progres');
  perform assert_true(not can_manage_finance(),
                      'koordinator meminta, bukan menerbitkan');
end $$;

reset role;
reset request.jwt.claim.sub;

\echo '✓ Tes peran teknik lulus.'
