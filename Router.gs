/* =============================================================================
 *  RenusPro — Router doPost untuk proxy Vercel → Apps Script
 *  Satu pintu HTTP JSON: frontend (via /api/gs Vercel) mengirim
 *  { fn: "namaFungsi", args: [ ... ] } → router memanggil fungsi itu &
 *  mengembalikan hasilnya sbg JSON (kontrak sama seperti google.script.run).
 *
 *  PENTING: file ini HARUS ADA di project Apps Script (di ROOT repo, BUKAN di
 *  migrasi/ — karena .claspignore mengecualikan migrasi/). Kalau ditaruh di
 *  migrasi/, `clasp push` akan MENGHAPUS doPost dari project → semua proxy mati
 *  ("Script function not found: doPost"). Jangan pindahkan ke migrasi/.
 *
 *  Tidak mendefinisikan doGet — doGet ada di Main.gs (menyajikan halaman lama).
 *  Hanya fungsi di _GS_ALLOW yang boleh dipanggil (keamanan).
 * ========================================================================== */

function doPost(e) {
  var out = function (o) {
    return ContentService
      .createTextOutput(JSON.stringify(o === undefined ? null : o))
      .setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = String(body.fn || '');
    var args = Array.isArray(body.args) ? body.args : [];
    if (!fn || _GS_ALLOW[fn] !== 1) {
      return out({ success: false, message: 'Fungsi tidak diizinkan/dikenal: ' + fn });
    }
    var f = (typeof globalThis !== 'undefined') ? globalThis[fn] : this[fn];
    if (typeof f !== 'function') {
      return out({ success: false, message: 'Fungsi tidak ditemukan: ' + fn });
    }
    var result = f.apply(null, args);
    return out(result);
  } catch (err) {
    return out({ success: false, message: err.toString() });
  }
}

// Allowlist fungsi yang boleh dipanggil frontend. Dihasilkan dari pemindaian
// pemanggilan google.script.run di seluruh JS_*.html.
var _GS_ALLOW = {
  addBOMProject:1, addDEDProject:1, addQCProject:1, addScheduleProject:1, ajukanReviewBOM:1,
  approvePembayaranPO:1, batalHandOver:1, batalRequestPengiriman:1, batalTandaiBeliLangsung:1,
  batalkanBOMProcurement:1, batalkanDEDSelesai:1, batalkanQCSelesai:1, cancelBOMApproval:1,
  cancelDEDApproval:1, cancelQCApproval:1, clearSignatureImage:1, completeHandOver:1,
  dedRemindLeadEngineer:1, dedRemindSiteEngineer:1, editCustomer:1, editInvoice:1, editItemStok:1,
  editKwitansi:1, editMutasiStok:1, editPemasukanLangsung:1, editPengeluaranLangsung:1,
  editSupplier:1, exportInvoiceDariTemplate:1, exportKwitansiDariTemplate:1, exportPODariTemplate:1,
  exportQuotationDariTemplate:1, gantiPassword:1, getAkunPembayaranList:1, getAvailableWOForBOM:1,
  getAvailableWOForDED:1, getAvailableWOForQC:1, getBASTData:1, getBOMByWO:1, getBOMDashboard:1,
  getBOMMenungguBL:1, getBOMNeedPurchase:1, getBOMSummaryByWO:1, getBankAccounts:1,
  getCashManagerBootstrap:1, getCustomerList:1, getDEDByWO:1, getDEDChecklist:1, getDEDDashboard:1,
  getDEDSummaryByWO:1, getDashboardData:1, getDetailKasProjectWO:1, getDocSignConfig:1,
  getExportPengeluaranWO:1, getFinanceReportData:1, getGaransiData:1, getHOUserOptions:1,
  getHandOverByWO:1, getInitialData:1, getInvoiceInitialData:1, getInvoiceList:1, getKategoriList:1,
  getKategoriPengeluaran:1, getKontrakData:1, getKwitansiInitialData:1, getKwitansiList:1,
  getLaporanKeuntunganBulanan:1, getLaporanProfitabilitas:1, getMutasiBundle:1, getMutasiStokList:1,
  getNextSiteSurveyId:1, getPODetail:1, getPOItemsUntukPenerimaan:1, getPOList:1, getPOTCOptions:1,
  getPaymentRequestList:1, getPenawaranList:1, getPenerimaanBundle:1, getPengirimanList:1,
  getPengirimanRequests:1, getPricelistAll:1, getProdukBySupplier:1, getProdukList:1, getQCByWO:1,
  getQCChecklist:1, getQCDashboard:1, getQCFotoBesar:1, getQCReportData:1, getQCSummaryByWO:1,
  getRealisasiHPP:1, getReserveDetailByStok:1, getRincianLotProduk:1, getRiwayatRevisi:1,
  getSaldoAkun:1, getSalesReportData:1, getScheduleByWO:1, getScheduleWOList:1, getSiteEngineerList:1,
  getSiteSurveyDetail:1, getSiteSurveyList:1, getSiteSurveyReportData:1, getSiteSurveysByWO:1,
  getStokList:1, getSupplierList:1, getTCOptions:1, getTcPdfJasaB64:1, getTcPdfMaterialB64:1,
  getUserList:1, getWAConfig:1, getWAReminderScheduleConfig:1, getWOContextByWO:1, getWODokumen:1,
  getWorkOrderDashboard:1, getWorkOrderList:1, gunakanStok:1, hapusAkunPembayaran:1, hapusAyatSilang:1,
  hapusDEDFile:1, hapusDEDItem:1, hapusInvoice:1, hapusKategori:1, hapusKwitansi:1, hapusMutasiStok:1,
  hapusPO:1, hapusPemasukan:1, hapusPenawaran:1, hapusPengeluaran:1, hapusPricelistItem:1,
  hapusQCContohFoto:1, hapusQCFoto:1, hapusScheduleTask:1, hapusSiteSurvey:1, hapusSiteSurveyFoto:1,
  hapusSupplier:1, hapusTemplatePaket:1, hapusUser:1, hapusWODokumen:1, hoGenerateMeet:1,
  kirimHasilReviewBOM:1, kirimReminderExpiredManual:1, linkBeliLangsung:1, linkSiteSurveyToWO:1,
  loginUser:1, prosesBOMProcurement:1, prosesKirim:1, qcRemindLeadEngineer:1, qcRemindSiteEngineer:1,
  removeBOMProject:1, removeDEDProject:1, removeQCProject:1, removeScheduleProject:1, requestHandOver:1,
  requestPembayaranNonPO:1, requestPembayaranPO:1, requestPengiriman:1, restoreRevisiPenawaran:1,
  reviewBOMItem:1, reviewDEDItem:1, reviewQCItem:1, saveBOMItems:1, saveBankAccounts:1,
  saveDocSignConfig:1, saveKategoriPengeluaran:1, saveScheduleTask:1, saveScheduleTasksBatch:1,
  saveSignatureImage:1, saveTCOptions:1, saveWAConfig:1, saveWAReminderScheduleConfig:1,
  scheduleHandOver:1, setBOMAssignment:1, setDEDAssignment:1, setDEDItemNA:1, setDEDWajib:1,
  setPricelistReady:1, setQCAssignment:1, setQCItemNA:1, setWorkOrderJenis:1, simpanAyatSilang:1,
  simpanCatatanWO:1, simpanCustomer:1, simpanInvoice:1, simpanKwitansi:1, simpanPemasukanLangsung:1,
  simpanPenerimaanTanpaPO:1, simpanPengeluaranLangsung:1, simpanPenyesuaianStok:1, simpanProduk:1,
  simpanQCFotoAnotasi:1, simpanSupplier:1, simpanTemplatePaket:1, submitPOKeGudang:1,
  submitSiteSurvey:1, tambahDEDItem:1, tambahKategori:1, tambahPricelistItem:1, tandaiBeliLangsung:1,
  tandaiDEDSelesai:1, tandaiQCSelesai:1, terimaPOItems:1, terimaPOKirimLangsung:1, terimaPengiriman:1,
  testWANotif:1, tolakRequestPembayaranPO:1, ubahStatusPO:1, unlinkSiteSurveyFromWO:1, updateDEDItem:1,
  updateKategori:1, updatePricelistItem:1, updateProdukKatalog:1, updateScheduleSiteEngineer:1,
  updateScheduleTask:1, updateSiteSurvey:1, updateStatusBayarInvoice:1, updateStatusPenawaran:1,
  uploadDEDBatch:1, uploadQCContohFoto:1, uploadQCFotoBatch:1, uploadSiteSurveyFoto:1, uploadWODokumen:1
};
