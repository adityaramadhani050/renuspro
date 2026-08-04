-- ============================================================================
-- RenusPro — 11. Perluasan role pengguna
-- ----------------------------------------------------------------------------
-- Impor data produksi menunjukkan organisasi ini memakai lebih dari tiga peran:
-- selain admin/sales/finance ada owner, leadsales, warehouse, dan procurement.
-- Memaksa semuanya menjadi 'sales' punya dua akibat yang berlawanan dan
-- keduanya salah — owner KEHILANGAN hak admin, sementara warehouse dan
-- procurement JUSTRU MENDAPAT akses membuat penawaran serta melihat HPP.
--
-- Berkas ini sengaja HANYA menambah nilai enum, tanpa memakainya.
-- Postgres melarang pemakaian nilai enum baru pada transaksi yang sama dengan
-- penambahannya; kebijakan yang menggunakannya ada di migrasi 12.
-- ============================================================================

alter type user_role add value if not exists 'owner';
alter type user_role add value if not exists 'leadsales';
alter type user_role add value if not exists 'warehouse';
alter type user_role add value if not exists 'procurement';

comment on type user_role is
  'Peran pengguna. Hak akses tiap peran didefinisikan lewat fungsi kapabilitas '
  'di migrasi 12 (can_write_quotations, can_manage_finance, dst.), bukan '
  'disebar sebagai perbandingan nama peran di dalam kebijakan.';
