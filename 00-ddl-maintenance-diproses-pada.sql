-- =============================================================================
--  Tambah kolom diproses_pada pada tabel maintenance.
--  Kode (jadwalkan/selesai) membaca & menulis kolom ini untuk mencatat waktu
--  respon pertama, tetapi kolomnya belum ada → SELECT gagal & muncul error
--  "Maintenance tidak ditemukan" saat menjadwalkan.
--
--  Jalankan di Supabase SQL Editor. Aman diulang (idempotent).
-- =============================================================================
alter table maintenance add column if not exists diproses_pada timestamptz;
