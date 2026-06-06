/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Export PDF Kwitansi dari sheet Template_Kwitansi (isi named range, export).
 *
 * Kwitansi bersifat statis (tanpa baris dinamis), jadi cukup mengisi named
 * range lalu export sheet.
 *
 * NAMED RANGE yang HARUS ada di sheet Template_Kwitansi:
 *   kw_no, kw_tanggal, kw_terima_dari, kw_jumlah,
 *   kw_terbilang, kw_untuk, kw_ref_invoice, kw_bank_account
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
    set('kw_tanggal',     _formatTanggalKwitansi(kw.tanggal));
    set('kw_metode',      kw.metode || 'Transfer');
    set('kw_terima_dari', kw.terimaDari);
    set('kw_jumlah',      kw.jumlah);
    set('kw_terbilang',   _titleCase(terbilangIndo(kw.jumlah)) + ' Rupiah');
    set('kw_untuk',       kw.untuk);
    set('kw_ref_invoice', kw.noInvoice);

    // Isi bank account dari data invoice terkait
    if (kw.noInvoice) {
      const bankAccount = _getBankAccountFromInvoice(ss, kw.noInvoice);
      set('kw_bank_account', bankAccount);
    }

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

// "Tujuh Juta Empat Ratus ..." (huruf awal tiap kata kapital)
function _titleCase(s) {
  return (s || '').toString().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

// "24/12/2025" → "Surabaya, 24 Desember 2025"
function _formatTanggalKwitansi(tgl) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                 'Agustus','September','Oktober','November','Desember'];
  let d, m, y;
  if (tgl instanceof Date) {
    d = tgl.getDate(); m = tgl.getMonth(); y = tgl.getFullYear();
  } else {
    const p = (tgl || '').toString().split('/'); // dd/MM/yyyy
    if (p.length !== 3) return 'Surabaya, ' + (tgl || '');
    d = parseInt(p[0], 10); m = parseInt(p[1], 10) - 1; y = parseInt(p[2], 10);
  }
  if (isNaN(d) || isNaN(m) || isNaN(y) || m < 0 || m > 11) return 'Surabaya, ' + (tgl || '');
  return 'Surabaya, ' + d + ' ' + bulan[m] + ' ' + y;
}

function _getBankAccountFromInvoice(ss, noInvoice) {
  try {
    const sheet = ss.getSheetByName('Invoice_Main');
    if (!sheet) return '';
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === noInvoice) {
        return data[i][19] ? data[i][19].toString() : ''; // kolom 20 = Bank Account
      }
    }
    return '';
  } catch (e) { return ''; }
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
