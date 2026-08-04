-- ============================================================================
-- Stub HANYA untuk verifikasi migrasi di Postgres lokal.
-- JANGAN dijalankan di Supabase — di sana schema auth sudah disediakan platform.
--
-- Dipakai oleh tools/verify-schema.sh
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase menyediakan auth.uid() dari JWT. Lokal: dibaca dari GUC supaya
-- kebijakan RLS bisa diuji dengan  set local request.jwt.claim.sub = '<uuid>'.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

-- Supabase punya role bawaan ini; dibuat lokal agar GRANT di migrasi tidak gagal.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Meniru grant bawaan Supabase atas helper auth.
--
-- Ini penting untuk kesetiaan tes: ekspresi kebijakan RLS dievaluasi Postgres
-- dengan hak PEMILIK TABEL, sehingga auth.uid() di dalam policy tetap jalan
-- tanpa grant apa pun. Tapi fungsi SECURITY INVOKER seperti save_quotation()
-- memanggilnya sebagai pemanggil biasa — dan di situlah grant ini dibutuhkan.
-- Tanpa baris ini, tes lokal gagal pada kasus yang di produksi justru berhasil.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid()  to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
