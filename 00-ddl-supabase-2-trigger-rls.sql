-- =============================================================================
--  RenusPro — DDL bagian 2: trigger updated_at + RLS  (Fase 2/3)
--  Jalankan SETELAH 00-ddl-supabase.sql dan SETELAH data diimpor.
-- =============================================================================

-- ── 1) Trigger updated_at otomatis ───────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Pasang ke tabel yang punya kolom updated_at:
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema='public' and column_name='updated_at'
  loop
    execute format(
      'drop trigger if exists trg_updated_at on %1$I;
       create trigger trg_updated_at before update on %1$I
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── 2) Helper: role user aktif (dari app_user via auth.uid) ───────────────────
--  Prasyarat: app_user.auth_uid diisi dgn id auth.users saat provisioning Auth.
create or replace function current_app_role() returns text
language sql stable security definer as $$
  select role from app_user where auth_uid = auth.uid() limit 1;
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
  select coalesce(current_app_role() in ('admin','owner'), false);
$$;

-- ── 3) RLS: aktifkan di semua tabel public ───────────────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop execute format('alter table %I enable row level security;', t); end loop;
end $$;

-- ── 4) POLICY STARTER ─────────────────────────────────────────────────────────
--  Titik awal AMAN: semua user terautentikasi boleh baca; tulis untuk sekarang
--  diizinkan (akan diperketat per-role). GANTI dengan policy per-role bertahap.
--
--  Contoh permisif (semua authenticated):
--    create policy p_read  on <tabel> for select using (auth.role() = 'authenticated');
--    create policy p_write on <tabel> for all    using (auth.role() = 'authenticated')
--                                                 with check (auth.role() = 'authenticated');
--
--  Pasang otomatis ke semua tabel (STARTER — perketat nanti):
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format($f$
      drop policy if exists p_auth_read  on %1$I;
      drop policy if exists p_auth_write on %1$I;
      create policy p_auth_read  on %1$I for select
        using (auth.role() = 'authenticated');
      create policy p_auth_write on %1$I for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated');
    $f$, t);
  end loop;
end $$;

-- ── 5) CONTOH policy per-role (template — sesuaikan & pasang bertahap) ────────
--  Finance-only write untuk keuangan:
--    drop policy if exists p_auth_write on pengeluaran;
--    create policy p_fin_write on pengeluaran for all
--      using   (current_app_role() in ('finance','admin','owner'))
--      with check (current_app_role() in ('finance','admin','owner'));
--
--  Site Engineer hanya WO yang di-assign (QC):
--    create policy p_se_qc on qc_item for all
--      using (exists (select 1 from qc_assignment a
--                     join app_user u on u.id = a.id_user
--                     where a.no_wo = qc_item.no_wo and u.auth_uid = auth.uid()));
--
--  Master data hanya admin yang boleh ubah:
--    drop policy if exists p_auth_write on produk;
--    create policy p_admin_write on produk for all
--      using (is_admin()) with check (is_admin());
-- =============================================================================
