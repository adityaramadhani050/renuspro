-- ============================================================================
-- RenusPro — 12. Kapabilitas per peran
-- ----------------------------------------------------------------------------
-- Kebijakan tidak lagi menyebut nama peran satu per satu, melainkan bertanya
-- pada fungsi KAPABILITAS. Bedanya terasa saat peran bertambah lagi nanti:
-- yang perlu diubah cukup satu fungsi, bukan belasan kebijakan yang tersebar —
-- dan tidak ada kebijakan yang tertinggal tanpa disadari.
--
-- ⚠ ASUMSI YANG PERLU DIKONFIRMASI
-- Pembagian di bawah disusun dari nama perannya saja, karena wewenang
-- sebenarnya hanya diketahui pihak yang menjalankan bisnisnya:
--
--   admin, owner   penuh, termasuk mengelola pengguna
--   finance        melihat semua; menerbitkan invoice & kwitansi
--   leadsales      melihat SEMUA penawaran; menulis penawarannya sendiri
--   sales          melihat & menulis penawarannya sendiri saja
--   procurement    melihat semua penawaran; mengelola data produk
--   warehouse      melihat semua penawaran & Work Order; tidak menulis apa pun
--
-- Yang paling mungkin perlu disesuaikan: apakah leadsales boleh menyunting
-- penawaran anak buahnya, dan apakah procurement memang perlu melihat HPP.
-- ============================================================================

-- Wewenang tertinggi: mengelola pengguna, rekening bank, dan pengaturan.
create or replace function is_superuser()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner') $$;

-- Melihat SELURUH penawaran, bukan hanya milik sendiri.
create or replace function can_see_all_quotations()
returns boolean language sql stable
as $$
  select current_user_role() in
    ('admin', 'owner', 'finance', 'leadsales', 'warehouse', 'procurement')
$$;

-- Membuat dan merevisi penawaran.
create or replace function can_write_quotations()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'sales', 'leadsales') $$;

-- Mengelola data master (klien, produk, template paket).
create or replace function can_manage_master()
returns boolean language sql stable
as $$
  select current_user_role() in
    ('admin', 'owner', 'sales', 'leadsales', 'procurement')
$$;

-- Menerbitkan invoice & kwitansi.
create or replace function can_manage_finance()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'finance') $$;


-- ── Kebijakan yang perlu menyesuaikan ───────────────────────────────────────
-- Hanya yang berubah maknanya yang ditulis ulang. Kebijakan yang memakai
-- can_manage_master() atau can_manage_finance() otomatis ikut menyesuaikan,
-- karena definisi fungsinya yang berubah — itulah gunanya lapisan ini.

drop policy if exists quotations_select on quotations;
create policy quotations_select on quotations
  for select to authenticated
  using (can_see_all_quotations() or owner_id = auth.uid());

drop policy if exists quotations_insert on quotations;
create policy quotations_insert on quotations
  for insert to authenticated
  with check (
    can_write_quotations()
    and (is_superuser() or owner_id = auth.uid())
  );

drop policy if exists quotations_update on quotations;
create policy quotations_update on quotations
  for update to authenticated
  using      (is_superuser() or (can_write_quotations() and owner_id = auth.uid()))
  with check (is_superuser() or (can_write_quotations() and owner_id = auth.uid()));

drop policy if exists quotations_delete on quotations;
create policy quotations_delete on quotations
  for delete to authenticated
  using (is_superuser());

-- Revisi dan item mengikuti wewenang penawaran induknya.
drop policy if exists quotation_revisions_write on quotation_revisions;
create policy quotation_revisions_write on quotation_revisions
  for all to authenticated
  using      (exists (select 1 from quotations q
                       where q.id = quotation_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))))
  with check (exists (select 1 from quotations q
                       where q.id = quotation_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))));

drop policy if exists quotation_item_groups_write on quotation_item_groups;
create policy quotation_item_groups_write on quotation_item_groups
  for all to authenticated
  using      (exists (select 1 from quotation_revisions r
                        join quotations q on q.id = r.quotation_id
                       where r.id = revision_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))))
  with check (exists (select 1 from quotation_revisions r
                        join quotations q on q.id = r.quotation_id
                       where r.id = revision_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))));

drop policy if exists quotation_items_write on quotation_items;
create policy quotation_items_write on quotation_items
  for all to authenticated
  using      (exists (select 1 from quotation_item_groups g
                        join quotation_revisions r on r.id = g.revision_id
                        join quotations q on q.id = r.quotation_id
                       where g.id = group_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))))
  with check (exists (select 1 from quotation_item_groups g
                        join quotation_revisions r on r.id = g.revision_id
                        join quotations q on q.id = r.quotation_id
                       where g.id = group_id
                         and (is_superuser()
                              or (can_write_quotations() and q.owner_id = auth.uid()))));

-- Pengelolaan pengguna & pengaturan: admin dan owner.
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert to authenticated with check (is_superuser());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update to authenticated
  using      (is_superuser() or id = auth.uid())
  with check (is_superuser() or id = auth.uid());

drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles
  for delete to authenticated using (is_superuser());

drop policy if exists bank_accounts_write on bank_accounts;
create policy bank_accounts_write on bank_accounts
  for all to authenticated
  using (is_superuser()) with check (is_superuser());

drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings
  for all to authenticated
  using (is_superuser()) with check (is_superuser());

-- Catatan Work Order: pemilik penawaran, finance, atau superuser.
drop policy if exists work_orders_update on work_orders;
create policy work_orders_update on work_orders
  for update to authenticated
  using (
    is_superuser() or can_manage_finance()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  )
  with check (
    is_superuser() or can_manage_finance()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  );


-- Trigger penjaga kolom istimewa ikut memakai wewenang tertinggi, bukan
-- hanya 'admin' — kalau tidak, owner tak bisa mengubah role siapa pun.
create or replace function guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_superuser() then
    return new;
  end if;

  if new.role           is distinct from old.role
     or new.is_active      is distinct from old.is_active
     or new.monthly_target is distinct from old.monthly_target
     or new.legacy_code    is distinct from old.legacy_code then
    raise exception
      'Hanya admin atau owner yang boleh mengubah role, status aktif, atau target bulanan.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

grant execute on function
  is_superuser(), can_see_all_quotations(), can_write_quotations()
to authenticated;
