/* =============================================================================
 *  RenusPro — Peta migrasi: kolom sheet (urut) → kolom tabel Supabase + tipe.
 *  Dipakai oleh import-supabase.mjs. Urutan array = urutan kolom di sheet.
 *  Kode tipe: t=text i=int n=number m=money(number) d=date ts=timestamp
 *             b=boolean j=json x=SKIP kolom ini
 * ========================================================================== */
export const TABLES = [
  // ── Master (impor DULUAN — jadi target FK) ──
  { table:'klien', sheet:'Master_Klien', pk:'id', cols:[
    ['id','t'],['nama_klien','t'],['perusahaan','t'],['alamat','t'],['kontak','t'] ]},
  { table:'produk', sheet:'Master_Produk', pk:'id', cols:[
    ['id','t'],['nama','t'],['unit','t'],['harga_satuan','m'],['hpp','m'],
    ['tipe','t'],['stok_id','t'],['qty_tersedia','n'] ]},
  { table:'app_user', sheet:'Master_User', pk:'id', cols:[
    ['id','t'],['nama','t'],['username','t'],['','x'],['role','t'],['aktif','b'],
    ['target_bulanan','n'],['lead_id','t'],['no_whatsapp','t'],['email','t'] ]},
  { table:'supplier', sheet:'Supplier', pk:'id_supplier', cols:[
    ['id_supplier','t'],['nama','t'],['pic','t'],['telepon','t'],['email','t'],['alamat','t'],
    ['catatan','t'],['status','t'],['dibuat_oleh','t'],['dibuat_pada','ts'],
    ['diubah_oleh','t'],['diubah_pada','ts'],['nama_alias','t'] ]},
  { table:'supplier_produk', sheet:'Supplier_Produk', pk:['id_supplier','id_produk'], cols:[
    ['id_supplier','t'],['id_produk','t'],['harga_beli','m'],['dibuat_pada','ts'],
    ['lead_time','t'],['masa_berlaku_harga','t'],['termasuk_ppn','b'],['ready','b'] ]},
  { table:'pricelist_kategori', sheet:'Pricelist_Kategori', pk:'nama', cols:[ ['nama','t'] ]},
  { table:'pricelist', sheet:'Pricelist_Supplier', pk:'id', cols:[
    ['id','t'],['id_supplier','t'],['kategori','t'],['nama_material','t'],['spesifikasi','t'],
    ['merek','t'],['satuan','t'],['harga_beli','m'],['termasuk_ppn','b'],['lead_time','t'],
    ['masa_berlaku_harga','t'],['dibuat_pada','ts'],['ready','b'] ]},
  { table:'template_paket', sheet:'Template_Paket', pk:'id', cols:[
    ['id','t'],['nama_paket','t'],['daftar_item','j'] ]},
  { table:'akun_pembayaran', sheet:'Akun_Pembayaran', pk:'id', cols:[
    ['id','t'],['nama_akun','t'],['tipe','t'],['keterangan','t'],['status','t'],
    ['dibuat_oleh','t'],['dibuat_pada','ts'] ]},

  // ── Penjualan ──
  { table:'penawaran', sheet:'Penawaran_Main', pk:['no_penawaran','rev'], cols:[
    ['no_penawaran','t'],['rev','i'],['tanggal','d'],['valid_hingga','d'],['nama_project','t'],
    ['klien_id','t'],['dibuat_oleh','t'],['subtotal','m'],['diskon','m'],['pajak','m'],
    ['grand_total','m'],['total_hpp','m'],['estimasi_keuntungan','m'],['margin_persen','n'],
    ['term_conditions','j'],['items','j'],['status','t'],['no_wo','t'],['tanggal_deal','d'],
    ['channel_marketing','t'],['catatan_fail','t'],['reminder_expired','ts'],['kode_win','t'],
    ['catatan_win','t'],['kode_lost','t'],['tanggal_fail','d'],['lesson_learned','t'],['action','t'] ]},
  { table:'work_order_catatan', sheet:'WorkOrder_Catatan', pk:'no_wo', cols:[
    ['no_wo','t'],['catatan','t'],['diupdate_oleh','t'],['diupdate_pada','ts'] ]},
  { table:'work_order_jenis_override', sheet:'WorkOrder_JenisOverride', pk:'no_wo', cols:[
    ['no_wo','t'],['jenis_manual','t'],['diubah_oleh','t'],['diubah_pada','ts'] ]},
  { table:'invoice', sheet:'Invoice_Main', pk:'no_invoice', cols:[
    ['no_invoice','t'],['no_wo','t'],['no_penawaran','t'],['tanggal','d'],['jenis','t'],['persen','n'],
    ['no_po','t'],['tgl_po','d'],['klien_id','t'],['nama_klien','t'],['nama_project','t'],['dpp','m'],
    ['ppn_persen','n'],['ppn_nominal','m'],['total','m'],['rincian_item','j'],['status_bayar','t'],
    ['catatan','t'],['dibuat_oleh','t'],['bank_account','t'],['bukti_file_id','t'],['bukti_file_url','t'],
    ['bukti_file_nama','t'],['tanggal_bayar','d'] ]},
  { table:'kwitansi', sheet:'Kwitansi_Main', pk:'no_kwitansi', cols:[
    ['no_kwitansi','t'],['no_invoice','t'],['no_wo','t'],['tanggal','d'],['terima_dari','t'],
    ['jumlah','m'],['untuk_pembayaran','t'],['metode','t'],['catatan','t'],['dibuat_oleh','t'] ]},

  // ── Engineering ──
  { table:'bom_project', sheet:'BOM_Project', pk:'no_wo', cols:[
    ['no_wo','t'],['nama_project','t'],['nama_klien','t'],['status','t'],['ditambahkan_oleh','t'],
    ['ditambahkan_pada','ts'],['difinalkan_oleh','t'],['difinalkan_pada','ts'] ]},
  { table:'bom_item', sheet:'BOM_Item', pk:'id', cols:[
    ['id','t'],['no_wo','t'],['kategori','t'],['pricelist_id','t'],['nama_material','t'],['merek','t'],
    ['supplier','t'],['satuan','t'],['qty','n'],['catatan','t'],['dibuat_oleh','t'],['dibuat_pada','ts'],
    ['status','t'],['catatan_review','t'],['direview_oleh','t'],['direview_pada','ts'],['proc_status','t'],
    ['stok_id','t'],['qty_reserved','n'],['mutasi_reserved','t'],['qty_beli','n'],['diproses_oleh','t'],
    ['diproses_pada','ts'],['qty_menunggu_bl','n'],['qty_beli_langsung','n'],['ref_beli_langsung','t'],
    ['qty_dikirim','n'],['qty_diterima','n'],['kirim_ref','t'] ]},
  { table:'bom_assignment', sheet:'BOM_Assignment', pk:['no_wo','id_user'], cols:[
    ['no_wo','t'],['id_user','t'],['nama_user','t'],['assigned_by','t'],['assigned_at','ts'] ]},
  { table:'ded_checklist', sheet:'DED_Checklist', pk:'kode', cols:[
    ['kode','t'],['label','t'],['wajib','b'],['urutan','i'],['instruksi','t'] ]},
  { table:'ded_project', sheet:'DED_Project', pk:'no_wo', cols:[
    ['no_wo','t'],['nama_project','t'],['nama_klien','t'],['ditambahkan_oleh','t'],['ditambahkan_pada','ts'],
    ['selesai_manual','b'],['ditandai_selesai_oleh','t'],['ditandai_selesai_pada','ts'] ]},
  { table:'ded_item', sheet:'DED_Item', pk:'id', cols:[
    ['id','t'],['no_wo','t'],['kode','t'],['files','j'],['status','t'],['catatan_review','t'],
    ['diupload_oleh','t'],['diupload_pada','ts'],['direview_oleh','t'],['direview_pada','ts'],['aktivitas','j'] ]},
  { table:'ded_assignment', sheet:'DED_Assignment', pk:['no_wo','id_user'], cols:[
    ['no_wo','t'],['id_user','t'],['nama_user','t'],['assigned_by','t'],['assigned_at','ts'] ]},
  { table:'qc_section', sheet:'QC_Section', pk:'kode', cols:[
    ['kode','t'],['label','t'],['urutan','i'] ]},
  { table:'qc_checklist', sheet:'QC_Checklist', pk:'kode', cols:[
    ['kode','t'],['section_kode','t'],['label','t'],['wajib','b'],['urutan','i'],['instruksi','t'],
    ['contoh_foto','t'],['tipe_upload','t'] ]},
  { table:'qc_project', sheet:'QC_Project', pk:'no_wo', cols:[
    ['no_wo','t'],['nama_project','t'],['nama_klien','t'],['ditambahkan_oleh','t'],['ditambahkan_pada','ts'],
    ['selesai_manual','b'],['ditandai_selesai_oleh','t'],['ditandai_selesai_pada','ts'] ]},
  { table:'qc_item', sheet:'QC_Item', pk:'id',
    // id di sheet lama TIDAK unik per item (dipakai bersama untuk banyak kode di
    // satu WO) -> bangun ulang jadi unik per (no_wo, kode) agar tak ada yang hilang.
    post:(o)=>{ if(o.no_wo && o.kode) o.id = o.no_wo + '-' + o.kode; },
    cols:[
    ['id','t'],['no_wo','t'],['kode','t'],['foto','j'],['status','t'],['catatan_spv','t'],
    ['diupload_oleh','t'],['diupload_pada','ts'],['direview_oleh','t'],['direview_pada','ts'],['aktivitas','j'] ]},
  { table:'qc_assignment', sheet:'QC_Assignment', pk:['no_wo','id_user'], cols:[
    ['no_wo','t'],['id_user','t'],['nama_user','t'],['assigned_by','t'],['assigned_at','ts'] ]},
  { table:'schedule_project', sheet:'Schedule_Project', pk:'no_wo', cols:[
    ['no_wo','t'],['nama_project','t'],['nama_klien','t'],['ditambahkan_oleh','t'],['ditambahkan_pada','ts'],
    ['site_engineer','t'] ]},
  { table:'schedule_task', sheet:'Schedule_Task', pk:'id', cols:[
    ['id','t'],['no_wo','t'],['nama_tugas','t'],['fase','t'],['tanggal_mulai','d'],['tanggal_selesai','d'],
    ['progress','n'],['warna','t'],['urutan','i'],['catatan','t'],['dibuat_oleh','t'],['dibuat_pada','ts'] ]},

  // ── Inventory & Pengadaan ──
  { table:'stok', sheet:'Stok', pk:'id_produk', cols:[
    ['id_produk','t'],['nama_produk','t'],['satuan','t'],['qty_tersedia','n'],['harga_beli_terakhir','m'],
    ['nilai_stok','m'],['terakhir_diubah_pada','ts'] ]},
  { table:'mutasi_stok', sheet:'Mutasi_Stok', pk:'id_mutasi', cols:[
    ['id_mutasi','t'],['tanggal','d'],['id_produk','t'],['nama_produk','t'],['jenis_mutasi','t'],['referensi','t'],
    ['qty_masuk','n'],['qty_keluar','n'],['harga_satuan','m'],['saldo_setelah','n'],['keterangan','t'],
    ['dibuat_oleh','t'],['dibuat_pada','ts'] ]},
  { table:'purchase_order', sheet:'Purchase_Order', pk:'no_po', cols:[
    ['no_po','t'],['tanggal','d'],['id_supplier','t'],['nama_supplier','t'],['peruntukan','t'],['no_wo','t'],
    ['status_po','t'],['subtotal','m'],['ppn_persen','n'],['ppn_nominal','m'],['grand_total','m'],['catatan','t'],
    ['status_bayar','t'],['total_dibayar','m'],['dibuat_oleh','t'],['dibuat_pada','ts'],['diubah_oleh','t'],
    ['diubah_pada','ts'],['diskon_persen','n'],['diskon_nominal','m'],['no_quotation','t'],['tanggal_quotation','d'],
    ['term_conditions','j'],['quot_file_id','t'],['quot_file_url','t'],['quot_file_nama','t'] ]},
  { table:'po_item', sheet:'PO_Item', pk:'id_item', cols:[
    ['id_item','t'],['no_po','t'],['nama_item','t'],['qty','n'],['satuan','t'],['harga_beli_satuan','m'],
    ['total','m'],['catatan','t'],['qty_diterima','n'],['id_produk','t'] ]},
  { table:'pembayaran_po', sheet:'Pembayaran_PO', pk:'id_bayar', cols:[
    ['id_bayar','t'],['no_po','t'],['tanggal_bayar','d'],['id_akun','t'],['nama_akun','t'],['jumlah','m'],
    ['catatan','t'],['dibuat_oleh','t'],['dibuat_pada','ts'] ]},
  { table:'po_payment_request', sheet:'PO_PaymentRequest', pk:'id_request', cols:[
    ['id_request','t'],['no_po','t'],['no_wo','t'],['nama_supplier','t'],['grand_total_po','m'],['tanggal_request','d'],
    ['jumlah','m'],['persentase','n'],['catatan','t'],['status','t'],['dibuat_oleh','t'],['dibuat_pada','ts'],
    ['nama_akun','t'],['diapprove_oleh','t'],['tanggal_approve','d'],['invoice_file_id','t'],['invoice_file_url','t'],
    ['invoice_file_nama','t'],['catatan_tolak','t'],['bukti_file_id','t'],['bukti_file_url','t'],
    ['bukti_file_nama','t'],['kategori_non_po','t'] ]},
  { table:'penerimaan_po_log', sheet:'Penerimaan_PO_Log', pk:'id_log', cols:[
    ['id_log','t'],['no_po','t'],['tanggal','d'],['mode','t'],['jumlah_item','n'],['detail_item','j'],
    ['dibuat_oleh','t'],['dibuat_pada','ts'],['bukti_file_id','t'],['bukti_file_url','t'],['bukti_file_nama','t'] ]},
  { table:'penerimaan_tanpa_po', sheet:'Penerimaan_Tanpa_PO', pk:'id', cols:[
    ['id','t'],['tanggal','d'],['id_produk','t'],['nama_produk','t'],['qty','n'],['harga_satuan','m'],
    ['id_akun','t'],['nama_akun','t'],['keterangan','t'],['update_harga','b'],['dibuat_oleh','t'],['dibuat_pada','ts'] ]},
  { table:'pengiriman', sheet:'Pengiriman', pk:'id_kirim', cols:[
    ['id_kirim','t'],['no_surat_jalan','t'],['no_wo','t'],['tanggal_kirim','d'],['status','t'],['dikirim_oleh','t'],
    ['dikirim_pada','ts'],['alamat','t'],['kendaraan','t'],['driver','t'],['catatan','t'],['items','j'],
    ['diterima_oleh','t'],['diterima_pada','ts'],['bukti_file_id','t'],['bukti_file_url','t'],['bukti_file_name','t'] ]},
  { table:'pengiriman_request', sheet:'Pengiriman_Request', pk:'no_wo', cols:[
    ['no_wo','t'],['status','t'],['diminta_oleh','t'],['diminta_pada','ts'],['alamat','t'],['items','j'] ]},

  // ── Keuangan / HO / Survey / Dokumen ──
  { table:'pengeluaran', sheet:'Pengeluaran', pk:'id_pengeluaran', cols:[
    ['id_pengeluaran','t'],['no_wo','t'],['tanggal','d'],['sumber','t'],['no_po','t'],['id_referensi','t'],
    ['id_akun','t'],['nama_akun','t'],['deskripsi','t'],['qty','n'],['satuan','t'],['harga_satuan','m'],['total','m'],
    ['catatan','t'],['dibuat_oleh','t'],['dibuat_pada','ts'],['diubah_oleh','t'],['diubah_pada','ts'],['kategori','t'] ]},
  { table:'pemasukan', sheet:'Pemasukan', pk:'id_pemasukan', cols:[
    ['id_pemasukan','t'],['tanggal','d'],['sumber','t'],['kategori','t'],['id_akun','t'],['nama_akun','t'],
    ['no_invoice_ref','t'],['id_referensi','t'],['deskripsi','t'],['jumlah','m'],['catatan','t'],['dibuat_oleh','t'],
    ['dibuat_pada','ts'],['diubah_oleh','t'],['diubah_pada','ts'] ]},

  { table:'ayat_silang', sheet:'AyatSilang', pk:'id', cols:[
    ['id','t'],['tanggal','d'],['id_akun_asal','t'],['nama_asal','t'],['id_akun_tujuan','t'],['nama_tujuan','t'],
    ['jumlah','m'],['catatan','t'],['dibuat_oleh','t'],['dibuat_pada','ts'] ]},
  { table:'hand_over', sheet:'HandOver', pk:'no_wo', cols:[
    ['no_wo','t'],['status','t'],['diminta_oleh','t'],['diminta_pada','ts'],['tgl_jadwal','d'],['waktu','tm'],
    ['mode','t'],['link_meet','t'],['lokasi','t'],['peserta','t'],['catatan_undangan','t'],['dijadwalkan_oleh','t'],
    ['dijadwalkan_pada','ts'],['mom','t'],['selesai_oleh','t'],['selesai_pada','ts'],['meet_event_id','t'] ]},
  { table:'site_survey', sheet:'SiteSurvey_Main', pk:'id', cols:[
    ['id','t'],['tanggal_survey','d'],['dibuat_oleh','t'],['nama_site','t'],['nama_pic','t'],['no_telepon','t'],
    ['alamat','t'],['latitude','n'],['longitude','n'],['data','j'],['dibuat_pada','ts'] ]},
  { table:'wo_dokumen', sheet:'WO_Dokumen', pk:['no_wo','jenis'], cols:[
    ['no_wo','t'],['jenis','t'],['file_id','t'],['file_url','t'],['nama_file','t'],['diupload_oleh','t'],['diupload_pada','ts'] ]},
];
