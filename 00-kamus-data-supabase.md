# Kamus Data: Google Sheets → Tabel Supabase (Postgres)

> Checklist Fase 0 migrasi RenusPro. Memetakan tiap sheet → tabel Postgres,
> tiap kolom → tipe & catatan. Dipakai untuk menulis DDL/migrations Supabase.
> Sumber: ekstraksi langsung dari fungsi `_ensureXSheet`/`buatSheetX` di `.gs`.

## Konvensi

- **Nama tabel/kolom**: `snake_case`. Nama tabel dari nama sheet.
- **Primary key**: pertahankan **ID string alami** yang ada (mis. `no_penawaran`,
  `no_wo`, `id`) sebagai PK/`unique` supaya referensi lama tetap valid. Boleh
  tambah `id uuid default gen_random_uuid()` sebagai surrogate bila perlu.
- **Tipe umum**:
  - Kode/teks ID → `text`
  - Tanggal (dd/MM/yyyy teks) → `date`
  - Timestamp (Dibuat/Diubah Pada) → `timestamptz`
  - Uang (Subtotal, HPP, Total, Jumlah, Harga) → `numeric(15,2)`
  - Qty/Persen/Progress → `numeric`
  - `'Ya'/'Tidak'`, `'TRUE'/'FALSE'` → `boolean`
  - Kolom JSON (Items, Term Conditions, Files, Foto, Aktivitas, Data) → `jsonb`
  - Status/Role/Jenis → `text` (atau `enum` bila ingin ketat)
- **Tambahan wajib tiap tabel**: `created_at timestamptz default now()`,
  `updated_at timestamptz`.
- **Catatan**: kolom "added lazily" di Sheets = tetap satu kolom biasa di Postgres.

Legenda: `→klien` = foreign key. `⟵` = asal sheet.

---

## A. Master Data

### `klien`  ⟵ `Master_Klien`
PK `id`
`id text` · `nama_klien text` · `perusahaan text` · `alamat text` · `kontak text`

### `produk`  ⟵ `Master_Produk`
PK `id` · catatan: `hpp` auto-sync dari harga beli terakhir (Inventory)
`id text` · `nama text` · `unit text` · `harga_satuan numeric(15,2)` · `hpp numeric(15,2)`
> Kolom Tipe (Material/Jasa) & Stok ID/Qty Tersedia ditambahkan runtime di app →
> sertakan: `tipe text` (Material|Jasa|kosong), `stok_id text→stok`, `qty_tersedia numeric`.

### `app_user`  ⟵ `Master_User`
PK `id`. **Auth**: pindah kredensial ke **Supabase Auth** (`auth.users`); tabel ini
jadi profil. **Password WAJIB di-hash** (lama plaintext).
`id text` · `nama text` · `username text unique` · `password text`(→ buang, pakai Auth) · `role text` · `aktif boolean` · `target_bulanan numeric` · `lead_id text→app_user` · `no_whatsapp text` · `email text`
> Role: sales, leadsales, finance, procurement, warehouse, siteengineer,
> leadengineer, projectcoordinator, admin, owner.

### `supplier`  ⟵ `Supplier` (nama fisik sheet = `Supplier`)
PK `id_supplier`
`id_supplier text` · `nama text` · `pic text` · `telepon text` · `email text` · `alamat text` · `catatan text` · `status text` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `diubah_oleh text` · `diubah_pada timestamptz` · `nama_alias text`

### `supplier_produk`  ⟵ `Supplier_Produk`
PK `(id_supplier, id_produk)`
`id_supplier text→supplier` · `id_produk text→produk` · `harga_beli numeric(15,2)` · `dibuat_pada timestamptz` · `lead_time text` · `masa_berlaku_harga text` · `termasuk_ppn boolean` · `ready boolean`

### `pricelist`  ⟵ `Pricelist_Supplier`
PK `id`
`id text` · `id_supplier text→supplier` · `kategori text→pricelist_kategori` · `nama_material text` · `spesifikasi text` · `merek text` · `satuan text` · `harga_beli numeric(15,2)` · `termasuk_ppn boolean` · `lead_time text` · `masa_berlaku_harga text` · `dibuat_pada timestamptz` · `ready boolean`

### `pricelist_kategori`  ⟵ `Pricelist_Kategori`
PK `nama`
`nama text`

### `template_paket`  ⟵ `Template_Paket`
PK `id`
`id text` · `nama_paket text` · `daftar_item jsonb`

### `akun_pembayaran`  ⟵ `Akun_Pembayaran`
PK `id` · catatan: baris AP001 = 'Stok' (akun sistem, terkunci)
`id text` · `nama_akun text` · `tipe text` · `keterangan text` · `status text` · `dibuat_oleh text` · `dibuat_pada timestamptz`

---

## B. Penjualan (Penawaran → WO → Invoice → Kwitansi)

### `penawaran`  ⟵ `Penawaran_Main`  **(sumber kebenaran)**
PK `(no_penawaran, rev)`
`no_penawaran text` · `rev int` · `tanggal date` · `valid_hingga date` · `nama_project text` · `klien_id text→klien` · `dibuat_oleh text` · `subtotal numeric(15,2)` · `diskon numeric(15,2)` · `pajak numeric(15,2)` · `grand_total numeric(15,2)` · `total_hpp numeric(15,2)` · `estimasi_keuntungan numeric(15,2)` · `margin_persen numeric` · `term_conditions jsonb` · `items jsonb` · `status text` · `no_wo text` · `tanggal_deal date` · `channel_marketing text` · `catatan_fail text` · `reminder_expired timestamptz` · `kode_win text` · `catatan_win text` · `kode_lost text` · `tanggal_fail date` · `lesson_learned text` · `action text`
> Status: On-Progress|Deal|Fail|Closed. `items` = array kelompok+subItems. `term_conditions` termasuk `hiddenCosts`.

### `work_order`  ⟵ `Work_Order`  **(proyeksi/cache dari penawaran)**
**Rekomendasi**: jadikan **VIEW** atas `penawaran` (rev tertinggi, status Deal/Closed)
alih-alih tabel — hilangkan sinkronisasi manual. Kolom: no_wo, no_penawaran, rev,
tanggal, valid_until, nama_project, klien_id, nama_klien, dibuat_oleh, subtotal,
diskon, pajak, grand_total, hpp, profit, margin_persen, term_conditions(jsonb),
items(jsonb), status, tanggal_deal.

### `work_order_catatan`  ⟵ `WorkOrder_Catatan`
PK `no_wo`
`no_wo text→penawaran.no_wo` · `catatan text` · `diupdate_oleh text` · `diupdate_pada timestamptz`

### `work_order_jenis_override`  ⟵ `WorkOrder_JenisOverride`
PK `no_wo` · catatan: absen = Auto
`no_wo text` · `jenis_manual text` (Jasa|Material) · `diubah_oleh text` · `diubah_pada timestamptz`

### `invoice`  ⟵ `Invoice_Main`
PK `no_invoice`
`no_invoice text` · `no_wo text` · `no_penawaran text` · `tanggal date` · `jenis text` (DP|Termin|Pelunasan|Penuh) · `persen numeric` · `no_po text` · `tgl_po date` · `klien_id text→klien` · `nama_klien text` · `nama_project text` · `dpp numeric(15,2)` · `ppn_persen numeric` · `ppn_nominal numeric(15,2)` · `total numeric(15,2)` · `rincian_item jsonb` · `status_bayar text` · `catatan text` · `dibuat_oleh text` · `bank_account text` · `bukti_file_id text` · `bukti_file_url text` · `bukti_file_nama text`
> + `tanggal_bayar date` (dibaca FinanceReport untuk baris legacy).

### `kwitansi`  ⟵ `Kwitansi_Main`
PK `no_kwitansi`
`no_kwitansi text` · `no_invoice text→invoice` · `no_wo text` · `tanggal date` · `terima_dari text` · `jumlah numeric(15,2)` · `untuk_pembayaran text` · `metode text` · `catatan text` · `dibuat_oleh text`

---

## C. Engineering (BOM / DED / QC / Schedule)

### `bom_item`  ⟵ `BOM_Item`  (29 kolom)
PK `id`
`id text` · `no_wo text` · `kategori text` · `pricelist_id text→pricelist` · `nama_material text` · `merek text` · `supplier text` · `satuan text` · `qty numeric` · `catatan text` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `status text` (Pending|Approved|Rejected) · `catatan_review text` · `direview_oleh text` · `direview_pada timestamptz` · `proc_status text` · `stok_id text→stok` · `qty_reserved numeric` · `mutasi_reserved text`(deprecated) · `qty_beli numeric` · `diproses_oleh text` · `diproses_pada timestamptz` · `qty_menunggu_bl numeric` · `qty_beli_langsung numeric` · `ref_beli_langsung text` · `qty_dikirim numeric` · `qty_diterima numeric` · `kirim_ref text`

### `bom_project`  ⟵ `BOM_Project`
PK `no_wo`
`no_wo text` · `nama_project text` · `nama_klien text` · `status text` (Draft|Final) · `ditambahkan_oleh text` · `ditambahkan_pada timestamptz` · `difinalkan_oleh text` · `difinalkan_pada timestamptz`

### `bom_assignment`  ⟵ `BOM_Assignment`
PK `(no_wo, id_user)`
`no_wo text` · `id_user text→app_user` · `nama_user text` · `assigned_by text` · `assigned_at timestamptz`

### `ded_item`  ⟵ `DED_Item`
PK `id`
`id text` · `no_wo text` · `kode text→ded_checklist` · `files jsonb` · `status text` · `catatan_review text` · `diupload_oleh text` · `diupload_pada timestamptz` · `direview_oleh text` · `direview_pada timestamptz` · `aktivitas jsonb`

### `ded_project`  ⟵ `DED_Project`
PK `no_wo`
`no_wo text` · `nama_project text` · `nama_klien text` · `ditambahkan_oleh text` · `ditambahkan_pada timestamptz` · `selesai_manual boolean` · `ditandai_selesai_oleh text` · `ditandai_selesai_pada timestamptz`

### `ded_assignment`  ⟵ `DED_Assignment`
PK `(no_wo, id_user)` — kolom sama seperti `bom_assignment`.

### `ded_checklist`  ⟵ `DED_Checklist`  (master)
PK `kode`
`kode text` · `label text` · `wajib boolean` · `urutan int` · `instruksi text`

### `qc_item`  ⟵ `QC_Item`
PK `id`
`id text` · `no_wo text` · `kode text→qc_checklist` · `foto jsonb` · `status text` · `catatan_spv text` · `diupload_oleh text` · `diupload_pada timestamptz` · `direview_oleh text` · `direview_pada timestamptz` · `aktivitas jsonb`

### `qc_project`  ⟵ `QC_Project`
PK `no_wo` — kolom sama seperti `ded_project` (No WO, Nama Project, Nama Klien, Ditambahkan Oleh/Pada, Selesai Manual, Ditandai Selesai Oleh/Pada).

### `qc_assignment`  ⟵ `QC_Assignment`
PK `(no_wo, id_user)` — kolom sama seperti `bom_assignment`.

### `qc_section`  ⟵ `QC_Section`
PK `kode`
`kode text` · `label text` · `urutan int`

### `qc_checklist`  ⟵ `QC_Checklist`  (master aktif)
PK `kode`
`kode text` · `section_kode text→qc_section` · `label text` · `wajib boolean` · `urutan int` · `instruksi text` · `contoh_foto text` · `tipe_upload text`

### ~~`QC_Checklist_Master`~~  (LEGACY — TIDAK dimigrasi)
Sheet lama tanpa fungsi pembuat; hanya dibaca sekali untuk migrasi ke
`qc_section` + `qc_checklist`. **Abaikan** di skema baru.

### `schedule_project`  ⟵ `Schedule_Project`
PK `no_wo`
`no_wo text` · `nama_project text` · `nama_klien text` · `ditambahkan_oleh text` · `ditambahkan_pada timestamptz` · `site_engineer text`

### `schedule_task`  ⟵ `Schedule_Task`
PK `id`
`id text` · `no_wo text` · `nama_tugas text` · `fase text` · `tanggal_mulai date` · `tanggal_selesai date` · `progress numeric` · `warna text` · `urutan int` · `catatan text` · `dibuat_oleh text` · `dibuat_pada timestamptz`

---

## D. Inventory & Pengadaan

### `stok`  ⟵ `Stok`
PK `id_produk`
`id_produk text` · `nama_produk text` · `satuan text` · `qty_tersedia numeric` · `harga_beli_terakhir numeric(15,2)` · `nilai_stok numeric(15,2)` · `terakhir_diubah_pada timestamptz`

### `mutasi_stok`  ⟵ `Mutasi_Stok`
PK `id_mutasi`
`id_mutasi text` · `tanggal date` · `id_produk text→stok` · `nama_produk text` · `jenis_mutasi text` · `referensi text` · `qty_masuk numeric` · `qty_keluar numeric` · `harga_satuan numeric(15,2)` · `saldo_setelah numeric` · `keterangan text` · `dibuat_oleh text` · `dibuat_pada timestamptz`

### `purchase_order`  ⟵ `Purchase_Order`
PK `no_po`
`no_po text` · `tanggal date` · `id_supplier text→supplier` · `nama_supplier text` · `peruntukan text` (Stok|Work Order) · `no_wo text` · `status_po text` · `subtotal numeric(15,2)` · `ppn_persen numeric` · `ppn_nominal numeric(15,2)` · `grand_total numeric(15,2)` · `catatan text` · `status_bayar text` · `total_dibayar numeric(15,2)` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `diubah_oleh text` · `diubah_pada timestamptz` · `diskon_persen numeric` · `diskon_nominal numeric(15,2)` · `no_quotation text` · `tanggal_quotation date` · `term_conditions jsonb` · `quot_file_id text` · `quot_file_url text` · `quot_file_nama text`
> Status PO: Aktif|Menunggu Gudang|Diterima Sebagian|Diterima|Selesai|Batal.

### `po_item`  ⟵ `PO_Item`
PK `id_item`
`id_item text` · `no_po text→purchase_order` · `nama_item text` · `qty numeric` · `satuan text` · `harga_beli_satuan numeric(15,2)` · `total numeric(15,2)` · `catatan text` · `qty_diterima numeric` · `id_produk text→produk`

### `pembayaran_po`  ⟵ `Pembayaran_PO`
PK `id_bayar`
`id_bayar text` · `no_po text→purchase_order` · `tanggal_bayar date` · `id_akun text→akun_pembayaran` · `nama_akun text` · `jumlah numeric(15,2)` · `catatan text` · `dibuat_oleh text` · `dibuat_pada timestamptz`

### `po_payment_request`  ⟵ `PO_PaymentRequest`
PK `id_request`
`id_request text` · `no_po text` · `no_wo text` · `nama_supplier text` · `grand_total_po numeric(15,2)` · `tanggal_request date` · `jumlah numeric(15,2)` · `persentase numeric` · `catatan text` · `status text` (Menunggu|Disetujui|Ditolak) · `dibuat_oleh text` · `dibuat_pada timestamptz` · `nama_akun text` · `diapprove_oleh text` · `tanggal_approve date` · `invoice_file_id text` · `invoice_file_url text` · `invoice_file_nama text` · `catatan_tolak text` · `bukti_file_id text` · `bukti_file_url text` · `bukti_file_nama text` · `kategori_non_po text`

### `penerimaan_po_log`  ⟵ `Penerimaan_PO_Log`
PK `id_log`
`id_log text` · `no_po text→purchase_order` · `tanggal date` · `mode text` · `jumlah_item numeric` · `detail_item jsonb` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `bukti_file_id text` · `bukti_file_url text` · `bukti_file_nama text`

### `penerimaan_tanpa_po`  ⟵ `Penerimaan_Tanpa_PO`
PK `id`
`id text` · `tanggal date` · `id_produk text→produk` · `nama_produk text` · `qty numeric` · `harga_satuan numeric(15,2)` · `id_akun text→akun_pembayaran` · `nama_akun text` · `keterangan text` · `update_harga boolean` · `dibuat_oleh text` · `dibuat_pada timestamptz`

### `pengiriman`  ⟵ `Pengiriman`
PK `id_kirim`
`id_kirim text` · `no_surat_jalan text` · `no_wo text` · `tanggal_kirim date` · `status text` · `dikirim_oleh text` · `dikirim_pada timestamptz` · `alamat text` · `kendaraan text` · `driver text` · `catatan text` · `items jsonb` · `diterima_oleh text` · `diterima_pada timestamptz` · `bukti_file_id text` · `bukti_file_url text` · `bukti_file_name text`

### `pengiriman_request`  ⟵ `Pengiriman_Request`
PK `no_wo`
`no_wo text` · `status text` (Diminta) · `diminta_oleh text` · `diminta_pada timestamptz` · `alamat text` · `items jsonb`

---

## E. Keuangan, Hand Over, Survey, Dokumen

### `pengeluaran`  ⟵ `Pengeluaran`
PK `id_pengeluaran`
`id_pengeluaran text` · `no_wo text` · `tanggal date` · `sumber text` (Pembayaran PO|Penggunaan Stok|Langsung) · `no_po text` · `id_referensi text` · `id_akun text→akun_pembayaran` · `nama_akun text` · `deskripsi text` · `qty numeric` · `satuan text` · `harga_satuan numeric(15,2)` · `total numeric(15,2)` · `catatan text` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `diubah_oleh text` · `diubah_pada timestamptz` · `kategori text`

### `pemasukan`  ⟵ `Pemasukan`
PK `id_pemasukan`
`id_pemasukan text` · `tanggal date` · `sumber text` (Invoice|Langsung) · `kategori text` · `id_akun text→akun_pembayaran` · `nama_akun text` · `no_invoice_ref text` · `id_referensi text` · `deskripsi text` · `jumlah numeric(15,2)` · `catatan text` · `dibuat_oleh text` · `dibuat_pada timestamptz` · `diubah_oleh text` · `diubah_pada timestamptz`

### `hand_over`  ⟵ `HandOver`
PK `no_wo`
`no_wo text` · `status text` · `diminta_oleh text` · `diminta_pada timestamptz` · `tgl_jadwal date` · `waktu time` · `mode text` (Online|Offline) · `link_meet text` · `lokasi text` · `peserta text` · `catatan_undangan text` · `dijadwalkan_oleh text` · `dijadwalkan_pada timestamptz` · `mom text` · `selesai_oleh text` · `selesai_pada timestamptz` · `meet_event_id text`

### `site_survey`  ⟵ `SiteSurvey_Main`
PK `id`
`id text` · `tanggal_survey date` · `dibuat_oleh text` · `nama_site text` · `nama_pic text` · `no_telepon text` · `alamat text` · `latitude numeric` · `longitude numeric` · `data jsonb` · `dibuat_pada timestamptz`
> Tautan ke WO disimpan di dalam `data` (JSON: `noWO`) — pertimbangkan promosikan
> jadi kolom `no_wo text` saat migrasi agar bisa di-index & di-FK-kan.

### `wo_dokumen`  ⟵ `WO_Dokumen`
PK `(no_wo, jenis)`
`no_wo text` · `jenis text` · `file_id text` · `file_url text` · `nama_file text` · `diupload_oleh text` · `diupload_pada timestamptz`

---

## F. Catatan Migrasi Penting

1. **`Work_Order` → VIEW**, bukan tabel — buang mekanisme sinkron `_syncWorkOrder`.
2. **`Master_Supplier`** = sheet fisik bernama `Supplier`.
3. **`QC_Checklist_Master`** legacy → tidak dibuat; migrasi sekali ke
   `qc_section` + `qc_checklist`.
4. **Auth**: `Master_User.password` plaintext → pindah ke Supabase Auth + hash;
   simpan profil (role, no_whatsapp, email, target) di `app_user`.
5. **File Drive → Storage**: semua kolom `*_file_url` (Drive) di-migrasi ke
   Supabase Storage; simpan `path` bucket, bukan URL Drive.
6. **Kolom JSON → `jsonb`**: `items`, `term_conditions` (penawaran/WO/PO),
   `files`/`foto`/`aktivitas` (DED/QC), `data` (survey), `detail_item`
   (penerimaan), `items` (pengiriman), `daftar_item` (template), `rincian_item`
   (invoice). Bisa dinormalisasi ke tabel anak bila mau relasional penuh
   (mis. `penawaran_item`), tapi `jsonb` = migrasi tercepat & UI tetap.
7. **Tanggal**: banyak disimpan sebagai **teks `dd/MM/yyyy`** di Sheets → parse ke
   `date`/`timestamptz` saat impor.
8. **Boolean**: `'Ya'/'Tidak'`, `'TRUE'/'FALSE'`, `'ya'` → `boolean`.
9. **ID alami** (No WO, No Penawaran, EXP-…, IN-…, dll) sebaiknya tetap jadi
   PK/`unique` agar semua referensi lama & UI tidak berubah.
10. **RLS per role** menggantikan gating role yang sekarang di frontend.

---

*Diekstrak dari kode `.gs` per skema aktif. Verifikasi ulang kolom "added lazily"
dan sheet legacy terhadap data live sebelum menulis DDL final.*
