-- =============================================================================
--  Project Schedule — Deviasi (Plan vs Aktual), Baseline & Kurva S
--  Jalankan SEKALI di Supabase → SQL Editor. Idempotent (aman diulang).
--  Fase 1: fondasi data (kolom baseline/aktual, tabel log progres, bobot fase).
-- =============================================================================

-- 1) Baseline (rencana beku) + tanggal aktual per tugas -----------------------
alter table schedule_task add column if not exists baseline_mulai   date;
alter table schedule_task add column if not exists baseline_selesai date;
alter table schedule_task add column if not exists aktual_mulai     date;
alter table schedule_task add column if not exists aktual_selesai   date;

-- 2) Metadata baseline di level proyek ----------------------------------------
alter table schedule_project add column if not exists baseline_set_at timestamptz;
alter table schedule_project add column if not exists baseline_oleh   text;

-- 3) Riwayat progres (untuk garis Aktual pada Kurva S) ------------------------
--    Satu titik per (no_wo, tanggal): % proyek keseluruhan pada tanggal itu.
create table if not exists schedule_progress_log (
  id            text primary key,
  no_wo         text not null,
  tanggal       date not null,
  persen_aktual numeric default 0,
  dicatat_oleh  text,
  dicatat_pada  timestamptz default now(),
  unique (no_wo, tanggal)
);
create index if not exists idx_sch_prog_log_no_wo on schedule_progress_log(no_wo);

-- 4) Bobot per fase (default Standar EPC PLTS, bisa diedit di app_config) ------
--    Total 100. Dinormalkan ke fase yang benar-benar ada di tiap WO.
insert into app_config (key, value, updated_at)
values (
  'SCHEDULE_FASE_BOBOT',
  '{"Hand Over":2,"Engineering":10,"Pengadaan":20,"Pengiriman":8,"Kontruksi":50,"Finishing":10}'::jsonb,
  now()
)
on conflict (key) do nothing;

-- Muat ulang skema PostgREST agar kolom/tabel baru langsung dikenali.
notify pgrst, 'reload schema';
