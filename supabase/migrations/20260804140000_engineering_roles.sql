-- ============================================================================
-- RenusPro — 14. Peran teknik
-- ----------------------------------------------------------------------------
-- Impor menemukan tiga peran lagi yang belum ada di skema, dan salah satunya
-- adalah kelompok TERBESAR di perusahaan:
--
--   siteengineer         7 user   ← terbanyak dari seluruh peran
--   leadengineer         1 user
--   projectcoordinator   1 user
--
-- Kesembilan orang ini sebelumnya dipaksa menjadi 'sales', yang berarti mereka
-- bisa membuat penawaran dan melihat HPP — sementara pekerjaan mereka justru
-- di sisi pelaksanaan, bukan penjualan.
--
-- Nilai enum dipisah dari pemakaiannya, sama seperti migrasi 11.
-- ============================================================================

alter type user_role add value if not exists 'siteengineer';
alter type user_role add value if not exists 'leadengineer';
alter type user_role add value if not exists 'projectcoordinator';
