-- =============================================================================
--  Satukan Bank Account → Akun Pembayaran (jalankan 1x di Supabase SQL Editor)
--  Menambah kolom detail rekening ke akun_pembayaran + memindahkan isi
--  bank_account sebagai entri baru. Rapikan duplikat manual di Table Editor.
-- =============================================================================

-- 1) Kolom detail rekening (untuk dicetak di invoice)
alter table akun_pembayaran add column if not exists detail text;

-- 2) Pindahkan bank_account → akun_pembayaran sebagai entri baru (id AP###)
--    (bank_account tidak direferensi transaksi, jadi aman jadi entri baru)
insert into akun_pembayaran (id, nama_akun, detail, tipe, status, dibuat_pada)
select
  'AP' || lpad(
    (row_number() over (order by coalesce(b.urutan,0), b.id)
     + coalesce((select max(substring(id from 3)::int)
                 from akun_pembayaran where id ~ '^AP[0-9]+$'), 0)
    )::text, 3, '0'),
  coalesce(nullif(b.label,''), 'Bank'),
  coalesce(b.detail,''),
  'Bank', 'Aktif', now()
from bank_account b;

-- 3) (opsional) setelah dirapikan & yakin, tabel bank_account boleh dipensiunkan:
--    drop table bank_account;   -- JANGAN dijalankan sebelum yakin
