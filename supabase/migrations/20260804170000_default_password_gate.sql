-- ============================================================================
-- RenusPro — 17. Pagar password default
-- ----------------------------------------------------------------------------
-- Seluruh user dibekali satu password awal yang sama supaya bisa masuk tanpa
-- menunggu email. Itu keputusan yang wajar untuk memulai — tapi password awal
-- yang sama, di aplikasi yang terbuka di internet, berarti satu tebakan
-- membuka seluruh data penawaran beserta HPP-nya.
--
-- Pagar ini membuat password default hanya berguna SATU KALI: selama masih
-- dipakai, aplikasi tidak menampilkan apa pun selain layar ganti password.
--
-- Rancangannya sengaja TANPA kolom penanda seperti `must_change_password`.
-- Kolom semacam itu adalah salinan dari kenyataan, dan salinan bisa berbeda
-- dari aslinya: ia bisa dimatikan sendiri oleh pengguna lewat PostgREST, lupa
-- dinyalakan ulang saat admin mereset password, atau tertinggal `false` pada
-- akun yang passwordnya dikembalikan ke default. Di sini keadaannya DIBACA
-- LANGSUNG dari password yang sebenarnya tersimpan, jadi tidak ada yang bisa
-- meleset — begitu passwordnya berubah, pagarnya terbuka dengan sendirinya,
-- dan begitu dikembalikan ke default, ia terpasang lagi tanpa perlu diingat.
-- ============================================================================

-- Satu-satunya tempat password awal dituliskan. Kalau nilainya diganti, ganti
-- di sini — pagar dan skrip pembagian password ikut memakai nilai yang sama.
create or replace function default_bootstrap_password()
returns text language sql immutable
as $$ select '123456'::text $$;

comment on function default_bootstrap_password() is
  'Password awal yang dibagikan ke seluruh user saat cutover. Bukan rahasia: '
  'nilainya memang diketahui semua orang, dan justru karena itu pagar di '
  'sedang_pakai_password_default() dibutuhkan.';


-- Membaca auth.users perlu SECURITY DEFINER — tabel itu tidak terbuka untuk
-- peran authenticated, dan memang tidak boleh. Fungsi ini hanya memeriksa
-- baris milik pemanggil sendiri dan hanya mengembalikan boolean, jadi tidak
-- ada hash yang bisa keluar lewat sini.
create or replace function sedang_pakai_password_default()
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  hash text;
begin
  select u.encrypted_password into hash
    from auth.users u
   where u.id = auth.uid();

  if hash is null then
    return false;   -- login lewat cara lain (magic link); tidak ada yang dipagari
  end if;

  return hash = crypt(default_bootstrap_password(), hash);
end;
$$;

comment on function sedang_pakai_password_default() is
  'true selama pengguna masih memakai password awal. Dipakai aplikasi untuk '
  'menahan seluruh halaman sampai password diganti.';

revoke all on function sedang_pakai_password_default() from public;
grant execute on function sedang_pakai_password_default() to authenticated;
grant execute on function default_bootstrap_password() to authenticated;
