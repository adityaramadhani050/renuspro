-- =============================================================================
--  pg_cron: panggil Edge Function wa-reminder TIAP JAM (WIB dicek di function).
--  Prasyarat: Edge Function 'wa-reminder' sudah di-deploy + WA_CONFIG terisi.
--  Ganti ISI-PROJECT-REF dan ISI-SERVICE-ROLE-KEY (Settings → API) lalu Run.
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Hapus jadwal lama (bila mengulang)
select cron.unschedule('wa-reminder-hourly')
where exists (select 1 from cron.job where jobname = 'wa-reminder-hourly');

-- Jadwalkan tiap jam pada menit 0 (UTC). wa-reminder cek jam WIB == reminderHour.
select cron.schedule(
  'wa-reminder-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://ISI-PROJECT-REF.supabase.co/functions/v1/wa-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ISI-SERVICE-ROLE-KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cek jadwal:  select * from cron.job;
-- Uji manual (abaikan gate jam):  panggil {URL}/functions/v1/wa-reminder?force=1
