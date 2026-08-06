-- =============================================================================
--  RenusPro — Gap skema Cash Manager (dijalankan SETELAH 00-ddl-supabase.sql)
--  Menambah 3 tabel yang belum ada supaya Saldo Akun, Ayat Silang, Kategori
--  Pengeluaran, dan Bank Account bisa dibaca dari Supabase.
--  Jalankan 1x di Supabase → SQL Editor.
-- =============================================================================

-- 1) Ayat Silang (mutasi antar-akun) — sumber: sheet 'AyatSilang'
create table if not exists ayat_silang (
  id             text primary key,
  tanggal        date,
  id_akun_asal   text,
  nama_asal      text,
  id_akun_tujuan text,
  nama_tujuan    text,
  jumlah         numeric(15,2) default 0,
  catatan        text,
  dibuat_oleh    text,
  dibuat_pada    timestamptz
);

-- 2) Bank Account (dulu di ScriptProperties BANK_ACCOUNTS) — dipakai Saldo Akun
create table if not exists bank_account (
  id     text primary key,
  label  text,
  detail text,
  urutan int default 0
);

-- 3) Kategori Pengeluaran (dulu di ScriptProperties KATEGORI_PENGELUARAN)
create table if not exists kategori_pengeluaran (
  nama   text primary key,
  urutan int default 0
);

-- ── Seed default (EDIT bank_account sesuai rekening asli Anda) ───────────────
insert into bank_account (id, label, detail, urutan) values
  ('1', 'Bank BSI', E'Bank BSI 7336418717\nA/N. PT. Renus Global Indonesia', 1)
on conflict (id) do nothing;

insert into kategori_pengeluaran (nama, urutan) values
  ('Operasional Kantor', 1), ('Gaji & Tunjangan', 2), ('Sewa', 3),
  ('Utilitas (listrik/internet/air)', 4), ('Marketing & Promosi', 5), ('Lainnya', 6)
on conflict (nama) do nothing;

-- ── RLS (samakan dengan tabel lain: user login boleh baca/tulis) ─────────────
alter table ayat_silang         enable row level security;
alter table bank_account        enable row level security;
alter table kategori_pengeluaran enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='ayat_silang' and policyname='ayat_silang_rw') then
    create policy ayat_silang_rw on ayat_silang for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='bank_account' and policyname='bank_account_rw') then
    create policy bank_account_rw on bank_account for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='kategori_pengeluaran' and policyname='kategori_pengeluaran_rw') then
    create policy kategori_pengeluaran_rw on kategori_pengeluaran for all to authenticated using (true) with check (true);
  end if;
end $$;
