-- =============================================================================
--  Tanda tangan per akun (untuk TTD pembuat PO di export PDF Purchase Order).
--  Jalankan SEKALI di Supabase → SQL Editor. Idempotent.
--  Menyimpan PNG tanda tangan sebagai base64 (tanpa prefix data:).
-- =============================================================================
alter table app_user add column if not exists tanda_tangan text;

notify pgrst, 'reload schema';
