-- =============================================================================
--  RenusPro — Draf DDL Supabase (Postgres)  |  Fase 2 migrasi
--  Diturunkan dari 00-kamus-data-supabase.md
--
--  CATATAN PENTING SEBELUM DIJALANKAN:
--   1) Ini DRAF referensi — review & sesuaikan sebelum produksi.
--   2) FK memakai kolom nullable. Saat impor data, ubah string kosong ''
--      menjadi NULL (mis. pricelist_id/stok_id/id_produk/klien_id kosong),
--      agar FK tidak gagal. Alternatif: buat tabel dulu tanpa FK, impor,
--      baru ALTER TABLE ADD CONSTRAINT.
--   3) Tanggal di Sheets banyak berupa teks 'dd/MM/yyyy' → parse ke date saat impor.
--   4) Boolean di Sheets: 'Ya'/'Tidak', 'TRUE'/'FALSE', 'ya' → true/false.
--   5) RLS sengaja BELUM diaktifkan di sini (ditambah per-modul di Fase 2/3).
--   6) work_order = VIEW (bukan tabel) — lihat bagian paling bawah.
--   7) Auth: password TIDAK disimpan di sini; pakai Supabase Auth + hash.
-- =============================================================================

-- gen_random_uuid() tersedia bawaan (pgcrypto) di Supabase.

-- ── A. MASTER DATA ───────────────────────────────────────────────────────────

create table klien (
  id            text primary key,
  nama_klien    text not null,
  perusahaan    text,
  alamat        text,
  kontak        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz
);

create table stok (
  id_produk               text primary key,
  nama_produk             text,
  satuan                  text,
  qty_tersedia            numeric      default 0,
  harga_beli_terakhir     numeric(15,2) default 0,
  nilai_stok              numeric(15,2) default 0,
  terakhir_diubah_pada    timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz
);

create table produk (
  id             text primary key,
  nama           text not null,
  unit           text,
  harga_satuan   numeric(15,2) default 0,
  hpp            numeric(15,2) default 0,   -- auto-sync dari harga beli terakhir
  tipe           text,                      -- 'Material' | 'Jasa' | null
  stok_id        text,                      -- logical link → stok.id_produk
  qty_tersedia   numeric default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

create table app_user (
  id             text primary key,
  nama           text not null,
  username       text unique,
  role           text not null,             -- sales|leadsales|finance|procurement|warehouse|siteengineer|leadengineer|projectcoordinator|admin|owner
  aktif          boolean default true,
  target_bulanan numeric default 0,
  lead_id        text references app_user(id),
  no_whatsapp    text,
  email          text,
  auth_uid       uuid,                       -- kaitkan ke auth.users (Supabase Auth)
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

create table supplier (
  id_supplier    text primary key,
  nama           text not null,
  pic            text,
  telepon        text,
  email          text,
  alamat         text,
  catatan        text,
  status         text,
  dibuat_oleh    text,
  dibuat_pada    timestamptz,
  diubah_oleh    text,
  diubah_pada    timestamptz,
  nama_alias     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

create table supplier_produk (
  id_supplier          text references supplier(id_supplier),
  id_produk            text references produk(id),
  harga_beli           numeric(15,2) default 0,
  dibuat_pada          timestamptz,
  lead_time            text,
  masa_berlaku_harga   text,
  termasuk_ppn         boolean default false,
  ready                boolean default true,
  primary key (id_supplier, id_produk)
);

create table pricelist_kategori (
  nama  text primary key
);

create table pricelist (
  id                   text primary key,
  id_supplier          text references supplier(id_supplier),
  kategori             text references pricelist_kategori(nama),
  nama_material        text,
  spesifikasi          text,
  merek                text,
  satuan               text,
  harga_beli           numeric(15,2) default 0,
  termasuk_ppn         boolean default false,
  lead_time            text,
  masa_berlaku_harga   text,
  dibuat_pada          timestamptz,
  ready                boolean default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz
);

create table template_paket (
  id           text primary key,
  nama_paket   text,
  daftar_item  jsonb
);

create table akun_pembayaran (
  id           text primary key,
  nama_akun    text not null,
  tipe         text,
  keterangan   text,
  status       text default 'Aktif',
  dibuat_oleh  text,
  dibuat_pada  timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz
);

-- ── B. PENJUALAN ─────────────────────────────────────────────────────────────

create table penawaran (
  no_penawaran        text not null,
  rev                 int  not null default 0,
  tanggal             date,
  valid_hingga        date,
  nama_project        text,
  klien_id            text references klien(id),
  dibuat_oleh         text,
  subtotal            numeric(15,2) default 0,
  diskon              numeric(15,2) default 0,
  pajak               numeric(15,2) default 0,
  grand_total         numeric(15,2) default 0,
  total_hpp           numeric(15,2) default 0,   -- SUDAH termasuk hidden cost
  estimasi_keuntungan numeric(15,2) default 0,
  margin_persen       numeric default 0,
  term_conditions     jsonb,                     -- termasuk hiddenCosts
  items               jsonb,                     -- array kelompok + subItems
  status              text,                      -- On-Progress|Deal|Fail|Closed
  no_wo               text,
  tanggal_deal        date,
  channel_marketing   text,
  catatan_fail        text,
  reminder_expired    timestamptz,
  kode_win            text,
  catatan_win         text,
  kode_lost           text,
  tanggal_fail        date,
  lesson_learned      text,
  action              text,
  created_at          timestamptz default now(),
  updated_at          timestamptz,
  primary key (no_penawaran, rev)
);
create index idx_penawaran_no_wo  on penawaran(no_wo);
create index idx_penawaran_status on penawaran(status);

create table work_order_catatan (
  no_wo         text primary key,
  catatan       text,
  diupdate_oleh text,
  diupdate_pada timestamptz
);

create table work_order_jenis_override (
  no_wo        text primary key,
  jenis_manual text,                 -- 'Jasa' | 'Material'
  diubah_oleh  text,
  diubah_pada  timestamptz
);

create table invoice (
  no_invoice      text primary key,
  no_wo           text,
  no_penawaran    text,
  tanggal         date,
  jenis           text,              -- DP|Termin|Pelunasan|Penuh
  persen          numeric,
  no_po           text,
  tgl_po          date,
  klien_id        text references klien(id),
  nama_klien      text,
  nama_project    text,
  dpp             numeric(15,2) default 0,
  ppn_persen      numeric,
  ppn_nominal     numeric(15,2) default 0,
  total           numeric(15,2) default 0,
  rincian_item    jsonb,
  status_bayar    text,
  catatan         text,
  dibuat_oleh     text,
  bank_account    text,
  bukti_file_id   text,
  bukti_file_url  text,
  bukti_file_nama text,
  tanggal_bayar   date,
  created_at      timestamptz default now(),
  updated_at      timestamptz
);
create index idx_invoice_no_wo on invoice(no_wo);

create table kwitansi (
  no_kwitansi      text primary key,
  no_invoice       text references invoice(no_invoice),
  no_wo            text,
  tanggal          date,
  terima_dari      text,
  jumlah           numeric(15,2) default 0,
  untuk_pembayaran text,
  metode           text,
  catatan          text,
  dibuat_oleh      text,
  created_at       timestamptz default now()
);

-- ── C. ENGINEERING (BOM / DED / QC / SCHEDULE) ───────────────────────────────

create table bom_project (
  no_wo            text primary key,
  nama_project     text,
  nama_klien       text,
  status           text,             -- Draft | Final
  ditambahkan_oleh text,
  ditambahkan_pada timestamptz,
  difinalkan_oleh  text,
  difinalkan_pada  timestamptz
);

create table bom_item (
  id                text primary key,
  no_wo             text,
  kategori          text,
  pricelist_id      text references pricelist(id),
  nama_material     text,
  merek             text,
  supplier          text,
  satuan            text,
  qty               numeric default 0,
  catatan           text,
  dibuat_oleh       text,
  dibuat_pada       timestamptz,
  status            text,            -- Pending | Approved | Rejected
  catatan_review    text,
  direview_oleh     text,
  direview_pada     timestamptz,
  proc_status       text,
  stok_id           text references stok(id_produk),
  qty_reserved      numeric default 0,
  mutasi_reserved   text,            -- deprecated
  qty_beli          numeric default 0,
  diproses_oleh     text,
  diproses_pada     timestamptz,
  qty_menunggu_bl   numeric default 0,
  qty_beli_langsung numeric default 0,
  ref_beli_langsung text,
  qty_dikirim       numeric default 0,
  qty_diterima      numeric default 0,
  kirim_ref         text,
  created_at        timestamptz default now(),
  updated_at        timestamptz
);
create index idx_bom_item_no_wo on bom_item(no_wo);

create table bom_assignment (
  no_wo       text,
  id_user     text references app_user(id),
  nama_user   text,
  assigned_by text,
  assigned_at timestamptz,
  primary key (no_wo, id_user)
);

create table ded_checklist (
  kode      text primary key,
  label     text,
  wajib     boolean default false,
  urutan    int,
  instruksi text
);

create table ded_project (
  no_wo                 text primary key,
  nama_project          text,
  nama_klien            text,
  ditambahkan_oleh      text,
  ditambahkan_pada      timestamptz,
  selesai_manual        boolean default false,
  ditandai_selesai_oleh text,
  ditandai_selesai_pada timestamptz
);

create table ded_item (
  id             text primary key,
  no_wo          text,
  kode           text references ded_checklist(kode),
  files          jsonb,
  status         text,
  catatan_review text,
  diupload_oleh  text,
  diupload_pada  timestamptz,
  direview_oleh  text,
  direview_pada  timestamptz,
  aktivitas      jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);
create index idx_ded_item_no_wo on ded_item(no_wo);

create table ded_assignment (
  no_wo       text,
  id_user     text references app_user(id),
  nama_user   text,
  assigned_by text,
  assigned_at timestamptz,
  primary key (no_wo, id_user)
);

create table qc_section (
  kode   text primary key,
  label  text,
  urutan int
);

create table qc_checklist (
  kode         text primary key,
  section_kode text references qc_section(kode),
  label        text,
  wajib        boolean default false,
  urutan       int,
  instruksi    text,
  contoh_foto  text,
  tipe_upload  text
);

create table qc_project (
  no_wo                 text primary key,
  nama_project          text,
  nama_klien            text,
  ditambahkan_oleh      text,
  ditambahkan_pada      timestamptz,
  selesai_manual        boolean default false,
  ditandai_selesai_oleh text,
  ditandai_selesai_pada timestamptz
);

create table qc_item (
  id             text primary key,
  no_wo          text,
  kode           text references qc_checklist(kode),
  foto           jsonb,
  status         text,
  catatan_spv    text,
  diupload_oleh  text,
  diupload_pada  timestamptz,
  direview_oleh  text,
  direview_pada  timestamptz,
  aktivitas      jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);
create index idx_qc_item_no_wo on qc_item(no_wo);

create table qc_assignment (
  no_wo       text,
  id_user     text references app_user(id),
  nama_user   text,
  assigned_by text,
  assigned_at timestamptz,
  primary key (no_wo, id_user)
);

create table schedule_project (
  no_wo            text primary key,
  nama_project     text,
  nama_klien       text,
  ditambahkan_oleh text,
  ditambahkan_pada timestamptz,
  site_engineer    text
);

create table schedule_task (
  id             text primary key,
  no_wo          text,
  nama_tugas     text,
  fase           text,
  tanggal_mulai  date,
  tanggal_selesai date,
  progress       numeric default 0,
  warna          text,
  urutan         int,
  catatan        text,
  dibuat_oleh    text,
  dibuat_pada    timestamptz
);
create index idx_schedule_task_no_wo on schedule_task(no_wo);

-- ── D. INVENTORY & PENGADAAN ─────────────────────────────────────────────────

create table mutasi_stok (
  id_mutasi     text primary key,
  tanggal       date,
  id_produk     text references stok(id_produk),
  nama_produk   text,
  jenis_mutasi  text,
  referensi     text,
  qty_masuk     numeric default 0,
  qty_keluar    numeric default 0,
  harga_satuan  numeric(15,2) default 0,
  saldo_setelah numeric default 0,
  keterangan    text,
  dibuat_oleh   text,
  dibuat_pada   timestamptz
);

create table purchase_order (
  no_po             text primary key,
  tanggal           date,
  id_supplier       text references supplier(id_supplier),
  nama_supplier     text,
  peruntukan        text,             -- Stok | Work Order
  no_wo             text,
  status_po         text,             -- Aktif|Menunggu Gudang|Diterima Sebagian|Diterima|Selesai|Batal
  subtotal          numeric(15,2) default 0,
  ppn_persen        numeric,
  ppn_nominal       numeric(15,2) default 0,
  grand_total       numeric(15,2) default 0,
  catatan           text,
  status_bayar      text,             -- Belum Dibayar|Dibayar Sebagian|Lunas
  total_dibayar     numeric(15,2) default 0,
  dibuat_oleh       text,
  dibuat_pada       timestamptz,
  diubah_oleh       text,
  diubah_pada       timestamptz,
  diskon_persen     numeric,
  diskon_nominal    numeric(15,2) default 0,
  no_quotation      text,
  tanggal_quotation date,
  term_conditions   jsonb,
  quot_file_id      text,
  quot_file_url     text,
  quot_file_nama    text,
  created_at        timestamptz default now(),
  updated_at        timestamptz
);
create index idx_po_no_wo on purchase_order(no_wo);

create table po_item (
  id_item           text primary key,
  no_po             text references purchase_order(no_po),
  nama_item         text,
  qty               numeric default 0,
  satuan            text,
  harga_beli_satuan numeric(15,2) default 0,
  total             numeric(15,2) default 0,
  catatan           text,
  qty_diterima      numeric default 0,
  id_produk         text references produk(id)
);

create table pembayaran_po (
  id_bayar     text primary key,
  no_po        text references purchase_order(no_po),
  tanggal_bayar date,
  id_akun      text references akun_pembayaran(id),
  nama_akun    text,
  jumlah       numeric(15,2) default 0,
  catatan      text,
  dibuat_oleh  text,
  dibuat_pada  timestamptz
);

create table po_payment_request (
  id_request        text primary key,
  no_po             text,
  no_wo             text,
  nama_supplier     text,
  grand_total_po    numeric(15,2) default 0,
  tanggal_request   date,
  jumlah            numeric(15,2) default 0,
  persentase        numeric,
  catatan           text,
  status            text,            -- Menunggu | Disetujui | Ditolak
  dibuat_oleh       text,
  dibuat_pada       timestamptz,
  nama_akun         text,
  diapprove_oleh    text,
  tanggal_approve   date,
  invoice_file_id   text,
  invoice_file_url  text,
  invoice_file_nama text,
  catatan_tolak     text,
  bukti_file_id     text,
  bukti_file_url    text,
  bukti_file_nama   text,
  kategori_non_po   text,
  created_at        timestamptz default now()
);

create table penerimaan_po_log (
  id_log          text primary key,
  no_po           text references purchase_order(no_po),
  tanggal         date,
  mode            text,
  jumlah_item     numeric default 0,
  detail_item     jsonb,
  dibuat_oleh     text,
  dibuat_pada     timestamptz,
  bukti_file_id   text,
  bukti_file_url  text,
  bukti_file_nama text
);

create table penerimaan_tanpa_po (
  id           text primary key,
  tanggal      date,
  id_produk    text references produk(id),
  nama_produk  text,
  qty          numeric default 0,
  harga_satuan numeric(15,2) default 0,
  id_akun      text references akun_pembayaran(id),
  nama_akun    text,
  keterangan   text,
  update_harga boolean default true,
  dibuat_oleh  text,
  dibuat_pada  timestamptz
);

create table pengiriman (
  id_kirim        text primary key,
  no_surat_jalan  text,
  no_wo           text,
  tanggal_kirim   date,
  status          text,
  dikirim_oleh    text,
  dikirim_pada    timestamptz,
  alamat          text,
  kendaraan       text,
  driver          text,
  catatan         text,
  items           jsonb,
  diterima_oleh   text,
  diterima_pada   timestamptz,
  bukti_file_id   text,
  bukti_file_url  text,
  bukti_file_name text
);
create index idx_pengiriman_no_wo on pengiriman(no_wo);

create table pengiriman_request (
  no_wo        text primary key,
  status       text,               -- Diminta
  diminta_oleh text,
  diminta_pada timestamptz,
  alamat       text,
  items        jsonb
);

-- ── E. KEUANGAN / HAND OVER / SURVEY / DOKUMEN ───────────────────────────────

create table pengeluaran (
  id_pengeluaran text primary key,
  no_wo          text,
  tanggal        date,
  sumber         text,             -- Pembayaran PO | Penggunaan Stok | Langsung
  no_po          text,
  id_referensi   text,
  id_akun        text references akun_pembayaran(id),
  nama_akun      text,
  deskripsi      text,
  qty            numeric default 0,
  satuan         text,
  harga_satuan   numeric(15,2) default 0,
  total          numeric(15,2) default 0,
  catatan        text,
  dibuat_oleh    text,
  dibuat_pada    timestamptz,
  diubah_oleh    text,
  diubah_pada    timestamptz,
  kategori       text,
  created_at     timestamptz default now()
);
create index idx_pengeluaran_no_wo on pengeluaran(no_wo);

create table pemasukan (
  id_pemasukan   text primary key,
  tanggal        date,
  sumber         text,             -- Invoice | Langsung
  kategori       text,
  id_akun        text references akun_pembayaran(id),
  nama_akun      text,
  no_invoice_ref text,
  id_referensi   text,
  deskripsi      text,
  jumlah         numeric(15,2) default 0,
  catatan        text,
  dibuat_oleh    text,
  dibuat_pada    timestamptz,
  diubah_oleh    text,
  diubah_pada    timestamptz,
  created_at     timestamptz default now()
);

create table hand_over (
  no_wo            text primary key,
  status           text,
  diminta_oleh     text,
  diminta_pada     timestamptz,
  tgl_jadwal       date,
  waktu            time,
  mode             text,           -- Online | Offline
  link_meet        text,
  lokasi           text,
  peserta          text,
  catatan_undangan text,
  dijadwalkan_oleh text,
  dijadwalkan_pada timestamptz,
  mom              text,
  selesai_oleh     text,
  selesai_pada     timestamptz,
  meet_event_id    text
);

create table site_survey (
  id           text primary key,
  no_wo        text,               -- dipromosikan dari JSON data.noWO
  tanggal_survey date,
  dibuat_oleh  text,
  nama_site    text,
  nama_pic     text,
  no_telepon   text,
  alamat       text,
  latitude     numeric,
  longitude    numeric,
  data         jsonb,
  dibuat_pada  timestamptz,
  created_at   timestamptz default now()
);
create index idx_site_survey_no_wo on site_survey(no_wo);

create table wo_dokumen (
  no_wo         text,
  jenis         text,
  file_id       text,
  file_url      text,
  nama_file     text,
  diupload_oleh text,
  diupload_pada timestamptz,
  primary key (no_wo, jenis)
);

-- ── WORK ORDER = VIEW (proyeksi penawaran rev tertinggi, status Deal/Closed) ──
--  Menggantikan sheet Work_Order + fungsi _syncWorkOrder. total_hpp sudah
--  termasuk hidden cost (dari penawaran).
create or replace view work_order as
select distinct on (p.no_penawaran)
  p.no_wo,
  p.no_penawaran,
  p.rev,
  p.tanggal,
  p.valid_hingga        as valid_until,
  p.nama_project,
  p.klien_id,
  k.nama_klien,
  p.dibuat_oleh,
  p.subtotal,
  p.diskon,
  p.pajak,
  p.grand_total,
  p.total_hpp           as hpp,
  p.estimasi_keuntungan as profit,
  p.margin_persen,
  p.term_conditions,
  p.items,
  p.status,
  p.tanggal_deal
from penawaran p
left join klien k on k.id = p.klien_id
where coalesce(p.no_wo, '') <> ''
  and p.status in ('Deal', 'Closed')
order by p.no_penawaran, p.rev desc;

-- =============================================================================
--  TODO Fase 2/3 (belum di file ini):
--   • RLS: alter table ... enable row level security + policy per role.
--   • Trigger updated_at (moddatetime) tiap tabel.
--   • Enum (opsional) untuk role & status bila ingin ketat.
--   • Normalisasi opsional: penawaran.items → tabel penawaran_item, dst.
--   • Sequence generator untuk ID (No WO, EXP-…, IN-…) — replikasi logika .gs.
-- =============================================================================
