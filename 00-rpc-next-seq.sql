-- =============================================================================
--  RenusPro — Penomoran ATOMIK (anti-balapan & anti-wrap) — Prioritas 1
--  Mengganti pola "scan tabel → cari max → +1" di sisi klien dengan penghitung
--  atomik di server (tidak bisa menghasilkan nomor kembar walau banyak user
--  menyimpan bersamaan).
--
--  AMAN DIJALANKAN SAAT APLIKASI SEDANG DIPAKAI (LIVE):
--   • Murni ADITIF — hanya membuat 1 tabel kecil + 2 fungsi + grant.
--   • TIDAK meng-ALTER / meng-UPDATE / menghapus data bisnis.
--   • TIDAK mengunci tabel bisnis (seed hanya operasi BACA, sekali per prefix).
--   • Frontend/edge dibuat FALLBACK ke cara lama bila fungsi ini belum ada,
--     jadi urutan deploy tidak akan memutus operasional.
--
--  Idempotent: aman diulang. Jalankan di Supabase → SQL Editor.
-- =============================================================================

-- 1) Tabel penghitung. SANGAT kecil: 1 baris per 'scope' (prefix id / jenis
--    dokumen). Tidak tumbuh seiring banyaknya nomor yang dibuat.
create table if not exists app_seq (
  scope text primary key,
  val   bigint not null default 0
);
-- RLS aktif tanpa policy → tabel TIDAK bisa diakses langsung oleh klien;
-- hanya lewat fungsi SECURITY DEFINER di bawah (yang berjalan sebagai owner).
alter table app_seq enable row level security;

-- 2) next_seq(): id internal berprefix (IN-/EXP-/MUT-/STK-/BOM/PR-/MTN-/…).
--    Mengembalikan prefix + nomor 3 digit (lpad; TIDAK pernah wrap).
--    "Lazy-seed": saat sebuah prefix pertama kali dipakai, nilai awal diambil
--    dari MAX data yang sudah ada untuk prefix tsb → nomor LANJUT, bukan mulai
--    dari 1. Prefix yang mengandung bulan (YYYYMM) otomatis mulai dari 1 tiap
--    bulan baru (karena belum ada datanya) — perilaku sama persis dgn versi lama.
create or replace function next_seq(p_table text, p_field text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare cur bigint; n bigint;
begin
  -- Allowlist tabel+kolom (WAJIB: SECURITY DEFINER → cegah akses tabel sembarang).
  if (p_table, p_field) not in (
      ('pemasukan','id_pemasukan'), ('pengeluaran','id_pengeluaran'),
      ('mutasi_stok','id_mutasi'),  ('stok_request','id'),
      ('stok','id_produk'),         ('penerimaan_tanpa_po','id'),
      ('po_payment_request','id_request'), ('bom_item','id'),
      ('maintenance','id'),         ('site_survey','id')
  ) then
    raise exception 'next_seq: scope tidak diizinkan (% / %)', p_table, p_field;
  end if;

  insert into app_seq(scope, val) values (p_prefix, 0)
    on conflict (scope) do nothing;
  select val into cur from app_seq where scope = p_prefix for update;  -- kunci baris

  if cur = 0 then
    -- Seed sekali dari data existing untuk prefix ini (ambil digit di akhir id).
    execute format(
      'select coalesce(max(substring(%I from ''\d+$'')::bigint), 0) from %I where %I like %L',
      p_field, p_table, p_field, p_prefix || '%'
    ) into cur;
  end if;

  n := cur + 1;
  update app_seq set val = n where scope = p_prefix;
  return p_prefix || lpad(n::text, 3, '0');
end $$;

-- 3) next_quotation_seq(): nomor urut penawaran GLOBAL.
--    Basis MAX+1 (baca nomor tertinggi di tabel) → bila penawaran TERAKHIR
--    dihapus, nomornya DIPAKAI ULANG (tanpa gap). Aman dari duplikat karena
--    simpanPenawaran memakai retry anti-duplikat. Mengembalikan INTEGER;
--    frontend tetap memformat 'NNN/QUOT/<Romawi bulan>/<Tahun>'.
create or replace function next_quotation_seq()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare mx bigint;
begin
  select coalesce(max((substring(no_penawaran from '^(\d+)/QUOT'))::bigint), 0)
    into mx from penawaran where no_penawaran ~ '^\d+/QUOT';
  return mx + 1;
end $$;

-- 3b) next_doc_seq(): nomor dokumen finansial GLOBAL & berkelanjutan (gapless) —
--     invoice / kwitansi / purchase_order. Masing-masing deret TERPISAH (sesuai
--     perilaku lama). Mengembalikan INTEGER; pemanggil memformat
--     'NNN/RGI/<INV|KWT|PO>/<Romawi>/<Tahun>' seperti biasa (format tak berubah).
--     Seed memakai angka DEPAN sebelum '/RGI' (mendukung varian lama RGI-INV &
--     baru RGI/INV).
create or replace function next_doc_seq(p_scope text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare cur bigint; n bigint;
begin
  if p_scope not in ('invoice', 'kwitansi', 'purchase_order') then
    raise exception 'next_doc_seq: scope tidak diizinkan (%)', p_scope;
  end if;

  insert into app_seq(scope, val) values ('doc:' || p_scope, 0)
    on conflict (scope) do nothing;
  select val into cur from app_seq where scope = 'doc:' || p_scope for update;

  if cur = 0 then
    if p_scope = 'invoice' then
      select coalesce(max((substring(no_invoice from '^(\d+)/RGI'))::bigint), 0)
        into cur from invoice where no_invoice ~ '^\d+/RGI';
    elsif p_scope = 'kwitansi' then
      select coalesce(max((substring(no_kwitansi from '^(\d+)/RGI'))::bigint), 0)
        into cur from kwitansi where no_kwitansi ~ '^\d+/RGI';
    elsif p_scope = 'purchase_order' then
      select coalesce(max((substring(no_po from '^(\d+)/RGI'))::bigint), 0)
        into cur from purchase_order where no_po ~ '^\d+/RGI';
    end if;
  end if;

  n := cur + 1;
  update app_seq set val = n where scope = 'doc:' || p_scope;
  return n;
end $$;

-- 3c) next_wo_seq(): nomor Work Order 'YYNNN' (YY=2 digit tahun WIB, reset per
--     tahun). Mengembalikan STRING siap pakai. Lazy-seed dari MAX no_wo tahun ini.
create or replace function next_wo_seq()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare yy text; cur bigint; n bigint; v_scope text;
begin
  yy := to_char((now() at time zone 'Asia/Jakarta'), 'YY');
  v_scope := 'wo:' || yy;
  insert into app_seq(scope, val) values (v_scope, 0) on conflict (scope) do nothing;
  select val into cur from app_seq where scope = v_scope for update;
  if cur = 0 then
    select coalesce(max(substring(no_wo from 3)::bigint), 0) into cur
      from penawaran
      where no_wo ~ ('^' || yy || '\d+$');
  end if;
  n := cur + 1;
  update app_seq set val = n where scope = v_scope;
  return yy || lpad(n::text, 3, '0');
end $$;

-- 3d) next_roman_seq(): nomor dokumen RESET PER BULAN 'NNN/<mid>/<Romawi>/<Tahun>'
--     — pembayaran PO (RGI/POP) & surat jalan (RGI/SJ). Mengembalikan INTEGER;
--     pemanggil memformat seperti biasa. Scope per (mid + bulan + tahun).
create or replace function next_roman_seq(p_table text, p_field text, p_mid text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare rmn text; yr text; cur bigint; n bigint; v_scope text;
begin
  if (p_table, p_field, p_mid) not in (
      ('pembayaran_po','id_bayar','RGI/POP'),
      ('pengiriman','no_surat_jalan','RGI/SJ')
  ) then
    raise exception 'next_roman_seq: scope tidak diizinkan (% / % / %)', p_table, p_field, p_mid;
  end if;
  rmn := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])
         [extract(month from (now() at time zone 'Asia/Jakarta'))::int];
  yr  := to_char((now() at time zone 'Asia/Jakarta'), 'YYYY');
  v_scope := 'roman:' || p_mid || ':' || rmn || ':' || yr;
  insert into app_seq(scope, val) values (v_scope, 0) on conflict (scope) do nothing;
  select val into cur from app_seq where scope = v_scope for update;
  if cur = 0 then
    execute format(
      'select coalesce(max((substring(%I from ''^(\d+)/''))::bigint), 0) from %I where %I like %L',
      p_field, p_table, p_field, '%/' || p_mid || '/' || rmn || '/' || yr
    ) into cur;
  end if;
  n := cur + 1;
  update app_seq set val = n where scope = v_scope;
  return n;
end $$;

-- 4) Izin eksekusi (user login = role 'authenticated'; edge function = service_role).
grant execute on function next_seq(text, text, text) to authenticated, service_role;
grant execute on function next_quotation_seq()        to authenticated, service_role;
grant execute on function next_doc_seq(text)          to authenticated, service_role;
grant execute on function next_wo_seq()               to authenticated, service_role;
grant execute on function next_roman_seq(text, text, text) to authenticated, service_role;

-- =============================================================================
--  Verifikasi (opsional, read-only):
--    select next_quotation_seq();                              -- lihat nomor berikut
--    select * from app_seq order by scope;                     -- isi penghitung
--  Catatan: memanggil next_* akan MENAIKKAN penghitung. Untuk sekadar cek nomor
--  tertinggi tanpa menaikkan, query langsung tabel sumber seperti biasa.
-- =============================================================================
