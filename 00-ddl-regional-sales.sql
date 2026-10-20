-- =============================================================================
--  RenusPro — Sistem REGIONAL sales (menggantikan assign ke Lead Sales)
--  • Kolom app_user.regional: 'Timur' (Surabaya) | 'Barat' (Jakarta) | null.
--  • Role 'Lead Sales' dihapus → user lead sales dijadikan Sales biasa.
--  • Assignment lama (app_user.lead_id) dikosongkan (kolom dibiarkan, tak dipakai).
--
--  Jalankan SEKALI di Supabase → SQL Editor. Aman diulang (idempotent).
--  Aman saat aplikasi live: hanya menambah kolom + memperbarui data user.
-- =============================================================================

-- 1) Kolom regional + batasan nilai
alter table app_user add column if not exists regional text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_user_regional_chk') then
    alter table app_user add constraint app_user_regional_chk
      check (regional is null or regional in ('Timur', 'Barat'));
  end if;
end $$;

-- 2) Hapus role Lead Sales → jadi Sales
update app_user set role = 'sales'
where lower(replace(role, ' ', '')) = 'leadsales';

-- 3) Bersihkan assignment Lead Sales lama
update app_user set lead_id = null where lead_id is not null;

-- 4) Cek: daftar sales & regionalnya (isi regional lewat menu Users → Edit User)
select id, nama, role, aktif, regional, target_bulanan
from app_user
where role = 'sales'
order by regional nulls first, nama;
