/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Export PDF Kwitansi dari sheet Template_Kwitansi (isi named range, export).
 *
 * Kwitansi bersifat statis (tanpa baris dinamis), jadi cukup mengisi named
 * range lalu export sheet.
 *
 * NAMED RANGE yang HARUS ada di sheet Template_Kwitansi:
 *   kw_no, kw_tanggal, kw_terima_dari, kw_jumlah,
 *   kw_terbilang, kw_untuk, kw_ref_invoice
 */

function exportKwitansiDariTemplate(idKwitansi) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Kwitansi');
    if (!sheet) return { success: false, message: 'Sheet "Template_Kwitansi" tidak ditemukan.' };

    const kw = _getKwitansiById(ss, idKwitansi);
    if (!kw) return { success: false, message: 'Kwitansi tidak ditemukan.' };

    const cache = _buildNamedRangeCache(ss);
    const set = function(name, val) {
      const range = cache.get(name);
      if (range) range.setValue(val);
      else Logger.log('Named range tidak ditemukan: ' + name);
    };

    set('kw_no',          kw.id);
    set('kw_tanggal',     kw.tanggal);
    set('kw_terima_dari', kw.terimaDari);
    set('kw_jumlah',      kw.jumlah);
    set('kw_terbilang',   _capitalize(terbilangIndo(kw.jumlah)) + ' Rupiah');
    set('kw_untuk',       kw.untuk);
    set('kw_ref_invoice', kw.noInvoice);

    SpreadsheetApp.flush();
    const pdfBase64 = _exportSheetToPdfBase64(ss, sheet);

    const safe = (s) => (s || '').toString().replace(/[\\/]/g, '-');
    return { success: true, pdfBase64: pdfBase64, fileName: 'Kwitansi_' + safe(kw.id) + '_' + safe(kw.terimaDari) + '.pdf' };
  } catch (e) {
    Logger.log('exportKwitansiDariTemplate error: ' + e);
    return { success: false, message: 'Gagal export kwitansi: ' + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function _getKwitansiById(ss, idKwitansi) {
  const sheet = ss.getSheetByName('Kwitansi_Main');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === idKwitansi) {
      const tglStr = data[i][3] instanceof Date
        ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][3];
      return {
        id:         data[i][0].toString(),
        noInvoice:  data[i][1] ? data[i][1].toString() : '',
        noWO:       data[i][2] ? data[i][2].toString() : '',
        tanggal:    tglStr,
        terimaDari: data[i][4] ? data[i][4].toString() : '',
        jumlah:     parseFloat(data[i][5]) || 0,
        untuk:      data[i][6] ? data[i][6].toString() : '',
        metode:     data[i][7] ? data[i][7].toString() : ''
      };
    }
  }
  return null;
}
