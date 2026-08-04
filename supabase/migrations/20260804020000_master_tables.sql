-- ============================================================================
-- RenusPro — 02. Tabel master
--   Master_User   → profiles   (password TIDAK dimigrasi, lihat catatan)
--   Master_Klien  → customers
--   Master_Produk → products
--   Template_Paket→ package_templates + package_template_items
-- ============================================================================

-- ── profiles ────────────────────────────────────────────────────────────────
-- Sheet Master_User: ID | Nama Lengkap | Username | Password | Role | Aktif | Target Bulanan
--
-- PENTING: kolom Password (plaintext di Auth.gs:60) TIDAK diimpor.
-- Autentikasi ditangani Supabase Auth; semua user melakukan reset password
-- saat cutover. Lihat MIGRATION_PLAN.md §3.
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  legacy_code    text unique,                        -- 'U001'
  full_name      text not null,
  username       text not null,
  role           user_role not null default 'sales',
  is_active      boolean not null default true,
  monthly_target numeric(15,2) not null default 0 check (monthly_target >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Auth.gs membandingkan username case-insensitive (di-lowercase saat simpan)
create unique index profiles_username_lower_key on profiles (lower(username));
create index profiles_role_idx on profiles (role) where is_active;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on column profiles.legacy_code is
  'ID lama dari sheet Master_User (U001, ...). Dipertahankan untuk telusur audit.';


-- ── customers ───────────────────────────────────────────────────────────────
-- Sheet Master_Klien: ID | Nama Klien | Perusahaan | Alamat | Kontak
create table customers (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                            -- 'K001'
  name        text not null,                          -- Nama Klien
  company     text,                                   -- Perusahaan
  address     text,                                   -- Alamat
  phone       text,                                   -- Kontak
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Menggantikan filterTabel() di klien: pencarian dilakukan di database.
create index customers_search_idx on customers
  using gin ((lower(name || ' ' || coalesce(company, ''))) gin_trgm_ops);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();


-- ── products ────────────────────────────────────────────────────────────────
-- Sheet Master_Produk: ID | Nama Jasa/Produk | Unit | Harga Satuan | HPP
create table products (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                            -- 'P001'
  name        text not null,
  unit        text not null default 'unit',
  price       numeric(15,2) not null default 0 check (price >= 0),  -- Harga Satuan
  cost        numeric(15,2) not null default 0 check (cost  >= 0),  -- HPP
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index products_search_idx on products
  using gin (lower(name) gin_trgm_ops);
create index products_active_idx on products (lower(name)) where is_active;

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

comment on column products.cost is
  'HPP — harga pokok penjualan. Tetap terlihat oleh sales, sama seperti '
  'perilaku sekarang (form penawaran menampilkan HPP & margin, '
  'JS_Form_Penawaran.html:268). Kalau kelak ingin disembunyikan dari sales, '
  'gunakan column-level GRANT — bukan RLS, karena ini soal kolom bukan baris.';


-- ── package_templates ───────────────────────────────────────────────────────
-- Sheet Template_Paket: ID | Nama Paket | Daftar Item (JSON)
-- JSON-nya array DATAR (beda dengan Penawaran_Main yang berkelompok):
--   [{"produkId","deskripsi","qty","unit","harga","hpp"}, ...]
create table package_templates (
  id          uuid primary key default gen_random_uuid(),
  legacy_code text unique,                            -- 'PKT001'
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger package_templates_set_updated_at
  before update on package_templates
  for each row execute function set_updated_at();

create table package_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references package_templates(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  description text not null,
  qty         numeric(15,3) not null default 1 check (qty >= 0),
  unit        text not null default 'unit',
  price       numeric(15,2) not null default 0,
  cost        numeric(15,2) not null default 0,
  sort_order  int not null default 0
);

create index package_template_items_template_idx on package_template_items (template_id, sort_order);
