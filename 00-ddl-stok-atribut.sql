-- =============================================================================
--  Tambah atribut merek/spesifikasi + jejak pricelist pada tabel stok.
--  Tujuan: saat "Terima Tanpa PO → Item Baru" dari pricelist supplier, merek &
--  spesifikasi item disimpan PERSIS sesuai item pricelist yang dipilih (pakai
--  id pricelist), bukan ditebak dari kecocokan nama. Tabel Inventory lalu
--  menampilkan merek/spesifikasi dari kolom ini.
--
--  Jalankan di Supabase SQL Editor. Aman diulang (idempotent).
-- =============================================================================
alter table stok add column if not exists merek        text;
alter table stok add column if not exists spesifikasi  text;
alter table stok add column if not exists pricelist_id text;
