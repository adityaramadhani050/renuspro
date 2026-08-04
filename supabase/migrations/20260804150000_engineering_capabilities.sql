-- ============================================================================
-- RenusPro — 15. Kapabilitas peran teknik
-- ----------------------------------------------------------------------------
-- ⚠ ASUMSI YANG PERLU DIKONFIRMASI
--
-- Disusun dari nama perannya, dengan satu prinsip: orang pelaksanaan perlu
-- MEMBACA apa yang harus dikerjakan dan MENCATAT progresnya, tapi tidak perlu
-- membuat penawaran maupun menerbitkan tagihan.
--
--   siteengineer         lihat penawaran & Work Order; tulis catatan WO
--   leadengineer         sama + kelola data produk (spesifikasi teknis)
--   projectcoordinator   sama + boleh meminta penerbitan invoice
--
-- Kalau ada yang meleset, yang perlu diubah hanya fungsi di bawah — bukan
-- kebijakan yang tersebar. Itulah gunanya lapisan kapabilitas.
-- ============================================================================

-- Menulis catatan progres pada Work Order.
--
-- Kapabilitas baru, karena sebelumnya catatan WO hanya bisa ditulis
-- superuser, finance, atau pemilik penawarannya — padahal justru orang
-- lapanganlah yang tahu progresnya.
create or replace function can_write_wo_notes()
returns boolean language sql stable
as $$
  select current_user_role() in (
    'admin', 'owner', 'finance',
    'siteengineer', 'leadengineer', 'projectcoordinator'
  )
$$;

create or replace function can_see_all_quotations()
returns boolean language sql stable
as $$
  select current_user_role() in (
    'admin', 'owner', 'finance', 'leadsales', 'warehouse', 'procurement',
    'siteengineer', 'leadengineer', 'projectcoordinator'
  )
$$;

create or replace function can_manage_master()
returns boolean language sql stable
as $$
  select current_user_role() in (
    'admin', 'owner', 'sales', 'leadsales', 'procurement', 'leadengineer'
  )
$$;

-- can_write_quotations() dan can_manage_finance() sengaja TIDAK berubah:
-- tidak ada peran teknik yang membuat penawaran atau menerbitkan tagihan.

-- Meminta penerbitan invoice: sales pemilik WO, ditambah koordinator proyek.
create or replace function can_request_invoice()
returns boolean language sql stable
as $$
  select current_user_role() in
    ('admin', 'owner', 'sales', 'leadsales', 'projectcoordinator')
$$;


-- ── Catatan Work Order kini mengikuti kapabilitasnya sendiri ────────────────
drop policy if exists work_orders_update on work_orders;
create policy work_orders_update on work_orders
  for update to authenticated
  using (
    can_write_wo_notes()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  )
  with check (
    can_write_wo_notes()
    or exists (select 1 from quotations q
                where q.id = quotation_id and q.owner_id = auth.uid())
  );

drop policy if exists invoice_requests_insert on invoice_requests;
create policy invoice_requests_insert on invoice_requests
  for insert to authenticated
  with check (can_request_invoice() and (requested_by = auth.uid() or is_superuser()));

grant execute on function can_write_wo_notes(), can_request_invoice() to authenticated;
