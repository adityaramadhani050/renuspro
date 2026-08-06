-- =============================================================================
--  Supabase Storage untuk upload file (ganti Google Drive)
--  Jalankan 1x di Supabase → SQL Editor. Membuat bucket PUBLIK 'uploads'
--  (bukti bayar, foto, dsb) + izin unggah untuk user login & baca publik.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- User login boleh mengunggah ke bucket 'uploads'
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='uploads_insert') then
    create policy uploads_insert on storage.objects
      for insert to authenticated with check (bucket_id = 'uploads');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='uploads_read') then
    create policy uploads_read on storage.objects
      for select using (bucket_id = 'uploads');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='uploads_delete') then
    create policy uploads_delete on storage.objects
      for delete to authenticated using (bucket_id = 'uploads');
  end if;
end $$;
