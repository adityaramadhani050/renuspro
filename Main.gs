/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Entry point web app + helper umum.
 *
 * Catatan: Google Apps Script menggabungkan SEMUA file .gs saat runtime,
 * sehingga pemecahan per-fitur ini tidak mengubah perilaku—hanya kerapian.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('RenusPro - PT. Renus Global Indonesia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Helper untuk menyisipkan file HTML lain via <?!= include('NamaFile'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Mendapatkan instance spreadsheet aktif.
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getActiveUserName() {
  return "Sales Executive";
}
