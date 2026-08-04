-- ============================================================================
-- Tes pagar password default
--
-- Yang dijaga: pagar terbuka HANYA karena passwordnya benar-benar berubah.
-- Kalau ia bisa dibuka dengan cara lain — memanggil fungsi, menulis kolom
-- penanda, atau sekadar berganti peran — maka password default akan bertahan
-- di sebagian akun tanpa ada yang tahu akun mana.
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ Pagar password default'

insert into auth.users (id, email, encrypted_password) values
  ('00000000-0000-0000-0000-0000000000f1', 'default@renus.test',
   crypt('123456', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-0000000000f2', 'sudahganti@renus.test',
   crypt('KataSandiPanjang2026', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-0000000000f3', 'tanpahash@renus.test', null)
on conflict (id) do update set encrypted_password = excluded.encrypted_password;

insert into profiles (id, legacy_code, full_name, username, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'P1', 'Masih Default', 'masihdefault', 'sales'),
  ('00000000-0000-0000-0000-0000000000f2', 'P2', 'Sudah Ganti',   'sudahganti',   'sales'),
  ('00000000-0000-0000-0000-0000000000f3', 'P3', 'Tanpa Hash',    'tanpahash',    'sales')
on conflict (id) do nothing;


-- ============================================================================
-- 1. Password masih default → terpagari
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  perform assert_true(sedang_pakai_password_default(),
                      'akun dengan password awal dikenali terpagari');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 2. Password sudah diganti → bebas
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';

do $$
begin
  perform assert_true(not sedang_pakai_password_default(),
                      'akun yang sudah mengganti password tidak lagi terpagari');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 3. Tanpa hash sama sekali → tidak dipagari
--
-- Akun yang dibuat importer belum punya password sampai pemiliknya menetapkan
-- satu lewat tautan pemulihan. Memagari mereka berarti menyuruh mengganti
-- password yang belum pernah ada.
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';

do $$
begin
  perform assert_true(not sedang_pakai_password_default(),
                      'akun tanpa password sama sekali tidak ikut terpagari');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 4. Pagar mengikuti password, bukan penanda terpisah
--
-- Inti rancangannya: tidak ada yang perlu diingat untuk dinyalakan ulang.
-- Admin yang mengembalikan password seseorang ke default harus otomatis
-- memasang kembali pagarnya.
-- ============================================================================
update auth.users
   set encrypted_password = crypt('123456', gen_salt('bf', 10))
 where id = '00000000-0000-0000-0000-0000000000f2';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';

do $$
begin
  perform assert_true(sedang_pakai_password_default(),
                      'password dikembalikan ke default → pagar terpasang lagi sendiri');
end $$;

reset role;
reset request.jwt.claim.sub;


-- ============================================================================
-- 5. Hash tidak bisa dibaca lewat fungsi ini
--
-- Fungsinya SECURITY DEFINER dan menyentuh auth.users, jadi perlu dipastikan
-- ia tidak menjadi jalan pintas untuk membaca hash orang lain.
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  begin
    perform 1 from auth.users;
    raise exception 'GAGAL — peran authenticated seharusnya tidak membaca auth.users';
  exception when insufficient_privilege then
    raise notice '  ✓ auth.users tetap tertutup bagi pengguna biasa';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;

\echo '✓ Tes pagar password default lulus.'
