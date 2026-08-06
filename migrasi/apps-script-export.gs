/* =============================================================================
 *  RenusPro — Export semua sheet → JSON  (untuk migrasi data ke Supabase)
 *  Tempel ke Apps Script LAMA, jalankan exportSemuaSheetKeJSON() sekali.
 *  Hasil: satu file `renus-export-YYYYMMDD.json` di Google Drive (root),
 *  berisi { namaSheet: [ [baris...], ... ] } untuk semua sheet terdaftar.
 *  Unduh file itu, lalu jalankan migrasi/import-supabase.mjs.
 * ========================================================================== */

function exportSemuaSheetKeJSON() {
  var ss = getSpreadsheet ? getSpreadsheet() : SpreadsheetApp.getActiveSpreadsheet();
  var SHEETS = [
    'Master_Klien','Master_Produk','Master_User','Supplier','Supplier_Produk',
    'Pricelist_Supplier','Pricelist_Kategori','Template_Paket','Akun_Pembayaran',
    'Penawaran_Main','WorkOrder_Catatan','WorkOrder_JenisOverride',
    'Invoice_Main','Kwitansi_Main',
    'BOM_Item','BOM_Project','BOM_Assignment',
    'DED_Item','DED_Project','DED_Assignment','DED_Checklist',
    'QC_Item','QC_Project','QC_Assignment','QC_Section','QC_Checklist',
    'Schedule_Project','Schedule_Task',
    'Stok','Mutasi_Stok',
    'Purchase_Order','PO_Item','Pembayaran_PO','PO_PaymentRequest',
    'Penerimaan_PO_Log','Penerimaan_Tanpa_PO',
    'Pengiriman','Pengiriman_Request',
    'Pengeluaran','Pemasukan','AyatSilang','HandOver','SiteSurvey_Main','WO_Dokumen'
  ];
  var out = {};
  SHEETS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { out[name] = null; return; }        // sheet tak ada → null
    var values = sh.getDataRange().getValues();
    // Serialisasi Date → ISO agar aman di JSON.
    out[name] = values.map(function (row) {
      return row.map(function (c) { return (c instanceof Date) ? c.toISOString() : c; });
    });
  });

  var tz = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmm');
  var blob = Utilities.newBlob(JSON.stringify(out), 'application/json',
    'renus-export-' + stamp + '.json');
  var file = DriveApp.createFile(blob);
  Logger.log('Export selesai: ' + file.getUrl());
  return file.getUrl();
}
