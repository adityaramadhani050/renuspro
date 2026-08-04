-- ============================================================================
-- RenusPro — 08. Row Level Security
-- ----------------------------------------------------------------------------
-- Memindahkan otorisasi dari frontend ke database. Saat ini pengecekan role
-- tersebar di file JS_*.html, artinya siapa pun yang bisa memanggil backend
-- bisa melewatinya begitu saja (lihat MIGRATION_PLAN.md §3).
--
-- ⚠ KEPUTUSAN PERILAKU YANG PERLU DIKONFIRMASI
-- Kode lama tidak konsisten soal visibilitas penawaran:
--   • getPenawaranList()      (Penawaran.gs:6)   → mengembalikan SEMUA penawaran
--   • getDashboardRawData()   (Dashboard.gs:36)  → memfilter milik user sendiri
--                                                   kalau bukan admin
-- Di sini dipilih yang lebih ketat — sales hanya melihat penawaran miliknya —
-- karena itulah maksud yang tersurat di Dashboard.gs. Kalau ternyata tim sales
-- memang perlu saling melihat, ubah SATU policy: quotations_select di bawah.
-- ============================================================================

-- ── Helper role ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER wajib: policy pada tabel profiles yang membaca profiles
-- akan rekursif tanpa ini.
create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

create or replace function is_admin() returns boolean
language sql stable
as $$ select current_user_role() = 'admin' $$;

create or replace function is_finance() returns boolean
language sql stable
as $$ select current_user_role() = 'finance' $$;

-- Boleh mengelola data master (klien, produk, template paket)
create or replace function can_manage_master() returns boolean
language sql stable
as $$ select current_user_role() in ('admin', 'sales') $$;

-- Boleh mengelola dokumen keuangan (invoice, kwitansi)
create or replace function can_manage_finance() returns boolean
language sql stable
as $$ select current_user_role() in ('admin', 'finance') $$;


-- ── Aktifkan RLS di seluruh tabel ───────────────────────────────────────────
alter table profiles               enable row level security;
alter table customers              enable row level security;
alter table products               enable row level security;
alter table package_templates      enable row level security;
alter table package_template_items enable row level security;
alter table quotations             enable row level security;
alter table quotation_revisions    enable row level security;
alter table quotation_item_groups  enable row level security;
alter table quotation_items        enable row level security;
alter table work_orders            enable row level security;
alter table invoice_requests       enable row level security;
alter table invoices               enable row level security;
alter table receipts               enable row level security;
alter table bank_accounts          enable row level security;
alter table app_settings           enable row level security;
alter table document_counters      enable row level security;
-- document_counters sengaja TIDAK diberi policy apa pun: satu-satunya akses
-- adalah lewat next_document_seq() yang SECURITY DEFINER.


-- ── profiles ────────────────────────────────────────────────────────────────
create policy profiles_select on profiles
  for select to authenticated
  using (true);          -- nama pemilik penawaran & leaderboard perlu dibaca semua

create policy profiles_insert on profiles
  for insert to authenticated
  with check (is_admin());

create policy profiles_update on profiles
  for update to authenticated
  using (is_admin() or id = auth.uid())
  with check (is_admin() or id = auth.uid());

create policy profiles_delete on profiles
  for delete to authenticated
  using (is_admin());

-- Policy di atas mengizinkan user menyunting barisnya sendiri, tapi WITH CHECK
-- tidak bisa menyatakan "kolom X tidak boleh berubah". Trigger inilah yang
-- mencegah user biasa menaikkan role-nya sendiri menjadi admin.
create or replace function guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_admin() then
    return new;
  end if;

  if new.role           is distinct from old.role
     or new.is_active      is distinct from old.is_active
     or new.monthly_target is distinct from old.monthly_target
     or new.legacy_code    is distinct from old.legacy_code then
    raise exception
      'Hanya admin yang boleh mengubah role, status aktif, atau target bulanan.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privilege_columns
  before update on profiles
  for each row execute function guard_profile_privilege_columns();


-- ── Data master: semua boleh baca, admin & sales boleh tulis ───────────────
create policy customers_select on customers
  for select to authenticated using (true);
create policy customers_write on customers
  for all to authenticated
  using (can_manage_master()) with check (can_manage_master());

create policy products_select on products
  for select to authenticated using (true);
create policy products_write on products
  for all to authenticated
  using (can_manage_master()) with check (can_manage_master());

create policy package_templates_select on package_templates
  for select to authenticated using (true);
create policy package_templates_write on package_templates
  for all to authenticated
  using (can_manage_master()) with check (can_manage_master());

create policy package_template_items_select on package_template_items
  for select to authenticated using (true);
create policy package_template_items_write on package_template_items
  for all to authenticated
  using (can_manage_master()) with check (can_manage_master());


-- ── Penawaran ───────────────────────────────────────────────────────────────
-- ⚠ Inilah policy yang dimaksud di catatan kepala berkas.
create policy quotations_select on quotations
  for select to authenticated
  using (is_admin() or is_finance() or owner_id = auth.uid());

create policy quotations_insert on quotations
  for insert to authenticated
  with check (is_admin() or owner_id = auth.uid());

create policy quotations_update on quotations
  for update to authenticated
  using  (is_admin() or owner_id = auth.uid())
  with check (is_admin() or owner_id = auth.uid());

create policy quotations_delete on quotations
  for delete to authenticated
  using (is_admin());


-- Tabel anak mewarisi izin dari penawaran induknya.
create policy quotation_revisions_select on quotation_revisions
  for select to authenticated
  using (exists (select 1 from quotations q where q.id = quotation_id));

create policy quotation_revisions_write on quotation_revisions
  for all to authenticated
  using      (exists (select 1 from quotations q
                       where q.id = quotation_id
                         and (is_admin() or q.owner_id = auth.uid())))
  with check (exists (select 1 from quotations q
                       where q.id = quotation_id
                         and (is_admin() or q.owner_id = auth.uid())));

create policy quotation_item_groups_select on quotation_item_groups
  for select to authenticated
  using (exists (select 1 from quotation_revisions r where r.id = revision_id));

create policy quotation_item_groups_write on quotation_item_groups
  for all to authenticated
  using      (exists (select 1 from quotation_revisions r
                        join quotations q on q.id = r.quotation_id
                       where r.id = revision_id
                         and (is_admin() or q.owner_id = auth.uid())))
  with check (exists (select 1 from quotation_revisions r
                        join quotations q on q.id = r.quotation_id
                       where r.id = revision_id
                         and (is_admin() or q.owner_id = auth.uid())));

create policy quotation_items_select on quotation_items
  for select to authenticated
  using (exists (select 1 from quotation_item_groups g where g.id = group_id));

create policy quotation_items_write on quotation_items
  for all to authenticated
  using      (exists (select 1 from quotation_item_groups g
                        join quotation_revisions r on r.id = g.revision_id
                        join quotations q on q.id = r.quotation_id
                       where g.id = group_id
                         and (is_admin() or q.owner_id = auth.uid())))
  with check (exists (select 1 from quotation_item_groups g
                        join quotation_revisions r on r.id = g.revision_id
                        join quotations q on q.id = r.quotation_id
                       where g.id = group_id
                         and (is_admin() or q.owner_id = auth.uid())));


-- ── Work Order ──────────────────────────────────────────────────────────────
-- Dibaca semua role: finance perlu melihatnya untuk menerbitkan invoice,
-- termasuk WO milik sales lain.
create policy work_orders_select on work_orders
  for select to authenticated using (true);

-- Hanya catatan yang boleh disunting; penerbitan WO adalah kerja trigger.
create policy work_orders_update on work_orders
  for update to authenticated
  using (
    is_admin() or is_finance()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  )
  with check (
    is_admin() or is_finance()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  );


-- ── Permintaan invoice ──────────────────────────────────────────────────────
create policy invoice_requests_select on invoice_requests
  for select to authenticated using (true);

create policy invoice_requests_insert on invoice_requests
  for insert to authenticated
  with check (requested_by = auth.uid() or is_admin());

create policy invoice_requests_update on invoice_requests
  for update to authenticated
  using (can_manage_finance()) with check (can_manage_finance());


-- ── Invoice & kwitansi: dibaca semua, ditulis admin & finance ──────────────
create policy invoices_select on invoices
  for select to authenticated using (true);
create policy invoices_write on invoices
  for all to authenticated
  using (can_manage_finance()) with check (can_manage_finance());

create policy receipts_select on receipts
  for select to authenticated using (true);
create policy receipts_write on receipts
  for all to authenticated
  using (can_manage_finance()) with check (can_manage_finance());


-- ── Pengaturan ──────────────────────────────────────────────────────────────
create policy bank_accounts_select on bank_accounts
  for select to authenticated using (true);
create policy bank_accounts_write on bank_accounts
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy app_settings_select on app_settings
  for select to authenticated using (true);
create policy app_settings_write on app_settings
  for all to authenticated
  using (is_admin()) with check (is_admin());


-- ── GRANT ───────────────────────────────────────────────────────────────────
-- RLS baru berlaku setelah GRANT diberikan; tanpa ini semua query ditolak.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  profiles, customers, products,
  package_templates, package_template_items,
  quotations, quotation_revisions, quotation_item_groups, quotation_items,
  work_orders, invoice_requests, invoices, receipts,
  bank_accounts, app_settings
to authenticated;

grant select on
  v_quotations, v_wo_billing, v_predeal_billing, v_work_orders,
  v_invoices, v_finance_summary, v_sales_monthly, v_sales_leaderboard,
  v_product_sales
to authenticated;

grant execute on function
  dashboard_summary(date, date, uuid),
  next_quotation_number(date),
  next_invoice_number(date),
  next_receipt_number(date),
  next_wo_number(date),
  current_user_role(), is_admin(), is_finance(),
  can_manage_master(), can_manage_finance()
to authenticated;

-- document_counters TIDAK di-grant: hanya dapat diubah lewat next_document_seq().
revoke all on document_counters from authenticated;
