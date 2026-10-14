-- =============================================================================
--  RenusPro — Hapus role "Lead Engineer" → gabung ke "Project Coordinator".
--  Semua fungsi Lead Engineer (review/approve QC-BOM-DED, assign Site Engineer,
--  penerima notifikasi WA review) dipindahkan ke Project Coordinator.
--
--  Jalankan SEKALI di Supabase → SQL Editor. Aman diulang (idempotent).
--  WAJIB dijalankan agar: (a) user lama tetap punya akses, dan (b) notifikasi
--  WA review (yang query DB berdasarkan role) sampai ke orang yang tepat.
--  Catatan: frontend juga punya alias login (leadengineer→projectcoordinator)
--  sebagai pengaman, tapi WA tetap butuh data di DB ini diperbarui.
-- =============================================================================
update app_user
set role = 'projectcoordinator'
where lower(replace(role, ' ', '')) = 'leadengineer';

-- Verifikasi (harus 0 baris):
-- select id, nama, username, role from app_user
-- where lower(replace(role,' ','')) = 'leadengineer';
