-- ============================================================================
-- RenusPro — 16. Batasi akses ke modul yang memang sudah dimigrasi
-- ----------------------------------------------------------------------------
-- KOREKSI atas migrasi 12 & 15.
--
-- Di sana saya memberi warehouse, procurement, dan ketiga peran teknik akses
-- baca ke seluruh penawaran, dengan asumsi mereka perlu melihat pekerjaan yang
-- harus dikerjakan. Asumsi itu salah: kelima peran tersebut punya MODUL
-- SENDIRI yang belum ikut dimigrasi. Modul yang ada sekarang — penawaran,
-- Work Order, invoice, kwitansi — seluruhnya sisi penjualan dan keuangan.
--
-- Akibat dari asumsi itu bukan sekadar kelebihan menu: tujuh site engineer
-- bisa melihat seluruh harga DAN HPP, artinya struktur margin perusahaan,
-- tanpa keperluan apa pun.
--
-- Prinsip yang dipakai sekarang: peran hanya mendapat akses ke modul yang
-- memang miliknya. Akun mereka tetap ada dan tetap bisa masuk — supaya siap
-- ketika modulnya menyusul — tapi belum melihat apa pun.
-- ============================================================================

-- Peran yang modulnya SUDAH ada di sistem ini.
create or replace function has_sales_module_access()
returns boolean language sql stable
as $$
  select current_user_role() in ('admin', 'owner', 'finance', 'sales', 'leadsales')
$$;

comment on function has_sales_module_access() is
  'Modul yang sudah dimigrasi seluruhnya sisi penjualan & keuangan. Peran '
  'operasional (warehouse, procurement, siteengineer, leadengineer, '
  'projectcoordinator) menunggu modulnya sendiri; sampai saat itu mereka bisa '
  'masuk tapi belum melihat data apa pun.';

-- ── Kapabilitas dipersempit kembali ─────────────────────────────────────────
create or replace function can_see_all_quotations()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'finance', 'leadsales') $$;

create or replace function can_manage_master()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'sales', 'leadsales') $$;

create or replace function can_write_wo_notes()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'finance') $$;

create or replace function can_request_invoice()
returns boolean language sql stable
as $$ select current_user_role() in ('admin', 'owner', 'sales', 'leadsales') $$;


-- ── Tabel yang tadinya terbuka untuk semua yang login ───────────────────────
-- Ini bagian yang paling mudah terlewat: kebijakan `using (true)` memang
-- membaca "semua pengguna terautentikasi", dan itu benar SELAMA setiap
-- pengguna memang berkepentingan. Begitu ada peran yang tidak, ia jadi
-- kebocoran diam-diam.

drop policy if exists work_orders_select on work_orders;
create policy work_orders_select on work_orders
  for select to authenticated
  using (
    has_sales_module_access()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  );

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists receipts_select on receipts;
create policy receipts_select on receipts
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists invoice_requests_select on invoice_requests;
create policy invoice_requests_select on invoice_requests
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists bank_accounts_select on bank_accounts;
create policy bank_accounts_select on bank_accounts
  for select to authenticated
  using (has_sales_module_access());

-- Data master menyimpan HPP, jadi tidak boleh ikut terbuka.
drop policy if exists products_select on products;
create policy products_select on products
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists customers_select on customers;
create policy customers_select on customers
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists package_templates_select on package_templates;
create policy package_templates_select on package_templates
  for select to authenticated
  using (has_sales_module_access());

drop policy if exists package_template_items_select on package_template_items;
create policy package_template_items_select on package_template_items
  for select to authenticated
  using (has_sales_module_access());

-- profiles tetap terbuka: nama pemilik penawaran perlu terbaca, dan isinya
-- tidak sensitif. Password tidak pernah ada di tabel ini.

grant execute on function has_sales_module_access() to authenticated;
