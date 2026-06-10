/**
 * DocSign.gs — RenusPro
 * Helper tanda tangan digital & QR verifikasi untuk Invoice dan Kwitansi.
 *
 * Cara kerja:
 *  1. QR Code dibuat via Google Charts API (tidak butuh key)
 *     URL QR = VERIFY_URL + "?ref=" + noDoc
 *     Ketika di-scan, customer diarahkan ke website resmi.
 *  2. Gambar tanda tangan disimpan sebagai base64 PNG di Script Properties
 *     (kunci: SIGNATURE_BASE64). Upload melalui menu Pengaturan.
 *
 * Fungsi utama yang dipanggil dari InvoicePdf.gs / KwitansiPdf.gs:
 *   _insertDocSign(sheet, anchorRow, anchorCol, noDoc, spanCols)
 */

// ── Ambil konfigurasi sign dari Script Properties ────────────────────────────
function getDocSignConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    verifyUrl:   props.getProperty('VERIFY_URL')      || '',
    sigBase64:   props.getProperty('SIGNATURE_BASE64') || '',
    sigEnabled:  props.getProperty('SIGN_ENABLED')    !== 'false'
  };
}

function saveDocSignConfig(payload) {
  var props = PropertiesService.getScriptProperties();
  if (payload.verifyUrl  !== undefined) props.setProperty('VERIFY_URL',      payload.verifyUrl);
  if (payload.sigEnabled !== undefined) props.setProperty('SIGN_ENABLED',    String(payload.sigEnabled));
  // sigBase64 disimpan terpisah via saveSignatureImage
  return { success: true };
}

function saveSignatureImage(base64Data) {
  // base64Data boleh mengandung prefix "data:image/png;base64,"
  var clean = base64Data.replace(/^data:[^;]+;base64,/, '');
  PropertiesService.getScriptProperties().setProperty('SIGNATURE_BASE64', clean);
  return { success: true };
}

function clearSignatureImage() {
  PropertiesService.getScriptProperties().deleteProperty('SIGNATURE_BASE64');
  return { success: true };
}

// ── Generate QR blob via Google Charts API ───────────────────────────────────
function _makeQRBlob(text, sizePx) {
  sizePx = sizePx || 120;
  var url = 'https://chart.googleapis.com/chart'
          + '?chs=' + sizePx + 'x' + sizePx
          + '&cht=qr'
          + '&choe=UTF-8'
          + '&chl=' + encodeURIComponent(text);
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getBlob().setName('qr_verify.png').setContentType('image/png');
  } catch (e) {
    Logger.log('_makeQRBlob error: ' + e);
    return null;
  }
}

// ── Sisipkan area tanda tangan + QR ke sheet ─────────────────────────────────
// anchorRow  : baris pertama area ttd (sudah di-insert dari luar)
// anchorCol  : kolom paling kiri area ttd (1-based)
// noDoc      : nomor invoice / kwitansi (untuk URL QR)
// totalCols  : total lebar kolom yang tersedia untuk area ttd
// Returns baris setelah area ttd.
function _insertDocSign(sheet, anchorRow, anchorCol, noDoc, totalCols) {
  var cfg = getDocSignConfig();
  if (!cfg.sigEnabled) return anchorRow;

  // Layout: QR di kiri (2 kolom), TTD di kanan (sisa kolom)
  var qrCols  = Math.min(2, totalCols - 1);
  var ttdCols = totalCols - qrCols;
  var ttdCol  = anchorCol + qrCols;

  // ── 4 baris area ttd ──────────────────────────────────────────────────────
  sheet.insertRowsAfter(anchorRow - 1, 4);

  // Baris 1: "Scan untuk verifikasi" (kiri) | "Hormat kami," (kanan)
  if (qrCols > 0) {
    sheet.getRange(anchorRow, anchorCol, 1, qrCols).merge()
      .setValue('Scan untuk verifikasi')
      .setFontSize(7).setFontColor('#888888').setFontStyle('italic')
      .setHorizontalAlignment('center').setVerticalAlignment('bottom');
  }
  sheet.getRange(anchorRow, ttdCol, 1, ttdCols).merge()
    .setValue('Hormat kami,')
    .setFontColor('#000000').setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.setRowHeight(anchorRow, 18);

  // Baris 2–3: area QR (kiri) | ruang tanda tangan (kanan)
  sheet.getRange(anchorRow + 1, anchorCol, 2, qrCols).merge()
    .setBackground('#ffffff');
  sheet.setRowHeight(anchorRow + 1, 40);
  sheet.setRowHeight(anchorRow + 2, 40);

  // Baris 4: nama & jabatan (kanan)
  sheet.getRange(anchorRow + 3, ttdCol, 1, ttdCols).merge()
    .setValue('Nur Ashri Kurnia F')
    .setFontWeight('bold').setFontLine('underline')
    .setHorizontalAlignment('right').setFontColor('#000000');
  sheet.setRowHeight(anchorRow + 3, 18);
  sheet.getRange(anchorRow + 3, anchorCol, 1, qrCols).merge()
    .setValue('').setBackground('#ffffff');

  // Baris 5: jabatan
  sheet.insertRowsAfter(anchorRow + 3, 1);
  sheet.getRange(anchorRow + 4, ttdCol, 1, ttdCols).merge()
    .setValue('Direktur')
    .setFontStyle('italic').setHorizontalAlignment('right').setFontColor('#000000');
  sheet.getRange(anchorRow + 4, anchorCol, 1, qrCols).merge()
    .setValue('').setBackground('#ffffff');
  sheet.setRowHeight(anchorRow + 4, 18);

  // ── Sisipkan gambar tanda tangan (jika ada) ───────────────────────────────
  if (cfg.sigBase64) {
    try {
      var sigBytes = Utilities.base64Decode(cfg.sigBase64);
      var sigBlob  = Utilities.newBlob(sigBytes, 'image/png', 'signature.png');
      // Tempatkan di baris 2-3, sisi kanan (ttdCol)
      var sigColPx = _colToPx(sheet, ttdCol);
      var sigRowPx = _rowToPx(sheet, anchorRow + 1);
      sheet.insertImage(sigBlob, ttdCol, anchorRow + 1, 0, 0);
    } catch (e) {
      Logger.log('Insert signature error: ' + e);
    }
  }

  // ── Sisipkan QR Code ──────────────────────────────────────────────────────
  if (cfg.verifyUrl) {
    var qrText = cfg.verifyUrl.replace(/\/$/, '') + '?ref=' + encodeURIComponent(noDoc);
    var qrBlob = _makeQRBlob(qrText, 120);
    if (qrBlob && qrCols > 0) {
      try {
        sheet.insertImage(qrBlob, anchorCol, anchorRow + 1, 2, 2);
      } catch (e) {
        Logger.log('Insert QR error: ' + e);
      }
    }
  }

  SpreadsheetApp.flush();
  return anchorRow + 5;
}

// pixel helper (estimasi)
function _colToPx(sheet, col) {
  var px = 0;
  for (var c = 1; c < col; c++) px += sheet.getColumnWidth(c);
  return px;
}
function _rowToPx(sheet, row) {
  var px = 0;
  for (var r = 1; r < row; r++) px += sheet.getRowHeight(r);
  return px;
}
