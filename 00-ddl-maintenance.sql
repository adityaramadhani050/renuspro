-- =============================================================================
--  maintenance — pengajuan & monitoring maintenance site terpasang
--  Jalankan 1x di Supabase → SQL Editor.
--
--  Alur: Sales/Lead Sales mengajukan maintenance untuk site yang instalasinya
--        sudah selesai (WO ber-Hand Over Selesai, atau input manual) → notif WA
--        ke Project Coordinator. PC menjadwalkan + menugaskan Site Engineer,
--        memantau progres, lalu menutup dengan laporan hasil.
--        Status: Diajukan → Dijadwalkan → Dikerjakan → Selesai
--                └────────────────────→ Ditolak / Dibatalkan (final)
-- =============================================================================
create table if not exists maintenance (
  id                text primary key,          -- MTN-YYYYMM-###
  tanggal_pengajuan date,
  no_wo             text,                        -- tautan WO (HO Selesai); null utk input manual
  nama_project      text,
  customer          text,
  lokasi            text,
  kontak            text,
  jenis             text,                        -- Perawatan Rutin | Perbaikan | Keluhan Customer | Inspeksi
  prioritas         text default 'Normal',       -- Rendah | Normal | Tinggi | Urgent
  deskripsi         text,
  status            text default 'Diajukan',     -- Diajukan | Dijadwalkan | Dikerjakan | Selesai | Ditolak | Dibatalkan
  tanggal_jadwal    date,                         -- rencana pengerjaan (diisi PC)
  teknisi_id        text,                         -- app_user.id Site Engineer yang ditugaskan
  teknisi_nama      text,
  tanggal_mulai     date,
  tanggal_selesai   date,
  laporan_hasil     text,                         -- laporan penyelesaian
  catatan_pc        text,                         -- catatan / alasan dari PC
  foto              jsonb,                         -- array {fileId,fileUrl,fileName}
  diajukan_oleh     text,
  diproses_oleh     text,
  dibuat_pada       timestamptz default now(),
  diubah_pada       timestamptz
);

alter table maintenance enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance' and policyname='maintenance_read') then
    create policy maintenance_read on maintenance for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maintenance' and policyname='maintenance_write') then
    create policy maintenance_write on maintenance for all to authenticated using (true) with check (true);
  end if;
end $$;
