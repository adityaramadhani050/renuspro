-- =============================================================================
--  Kolom edit_unlocked pada tabel penawaran.
--  Admin dapat "membuka kunci" penawaran Deal yang normalnya terkunci untuk
--  revisi (deal bulan lalu / Hand Over WO sudah Selesai) — dan menguncinya lagi.
--  Bila TRUE, guard revisi (bulan lalu & HO Selesai) di-bypass.
--
--  Jalankan di Supabase SQL Editor. Aman diulang (idempotent).
-- =============================================================================
alter table penawaran add column if not exists edit_unlocked boolean default false;
