-- =============================================================================
--  app_config — key/value config aplikasi (pengganti sebagian ScriptProperties)
--  Jalankan 1x di Supabase → SQL Editor.
--  Dipakai untuk: TC_OPTIONS (Syarat & Ketentuan default form penawaran).
--  Menyusul (setelah subsistemnya migrasi): WA_CONFIG, WA_REMINDER, DOCSIGN.
-- =============================================================================
create table if not exists app_config (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

alter table app_config enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_config' and policyname='app_config_read') then
    create policy app_config_read on app_config for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_config' and policyname='app_config_write') then
    create policy app_config_write on app_config for all to authenticated using (true) with check (true);
  end if;
end $$;
