/**
 * DocSign.gs — RenusPro
 * Helper tanda tangan digital untuk Invoice dan Kwitansi.
 * Gambar tanda tangan disimpan sebagai base64 PNG di Script Properties (SIGNATURE_BASE64).
 * Upload melalui menu Pengaturan.
 */

function getDocSignConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    sigBase64:  props.getProperty('SIGNATURE_BASE64') || '',
    sigEnabled: props.getProperty('SIGN_ENABLED') !== 'false'
  };
}

function saveDocSignConfig(payload) {
  var props = PropertiesService.getScriptProperties();
  if (payload.sigEnabled !== undefined) props.setProperty('SIGN_ENABLED', String(payload.sigEnabled));
  return { success: true };
}

function saveSignatureImage(base64Data) {
  var clean = base64Data.replace(/^data:[^;]+;base64,/, '');
  PropertiesService.getScriptProperties().setProperty('SIGNATURE_BASE64', clean);
  return { success: true };
}

function clearSignatureImage() {
  PropertiesService.getScriptProperties().deleteProperty('SIGNATURE_BASE64');
  return { success: true };
}

// ── Sisipkan area tanda tangan ke sheet ──────────────────────────────────────
// anchorRow : baris pertama area ttd (1-based)
// anchorCol : kolom paling kiri (1-based)
// totalCols : total lebar kolom tersedia
// Returns baris setelah area ttd.
function _insertDocSign(sheet, anchorRow, anchorCol, noDoc, totalCols) {
  var cfg = getDocSignConfig();
  if (!cfg.sigEnabled) return anchorRow;

  // 5 baris: label | ruang ttd (x3) | nama | jabatan
  sheet.insertRowsAfter(anchorRow - 1, 5);

  // Baris 1: "Hormat kami,"
  sheet.getRange(anchorRow, anchorCol, 1, totalCols).merge()
    .setValue('Hormat kami,')
    .setFontColor('#000000').setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.setRowHeight(anchorRow, 18);

  // Baris 2–4: ruang tanda tangan
  sheet.setRowHeight(anchorRow + 1, 40);
  sheet.setRowHeight(anchorRow + 2, 40);
  sheet.setRowHeight(anchorRow + 3, 40);

  // Baris 5: nama
  sheet.getRange(anchorRow + 4, anchorCol, 1, totalCols).merge()
    .setValue('Nur Ashri Kurnia F')
    .setFontWeight('bold').setFontLine('underline')
    .setHorizontalAlignment('right').setFontColor('#000000');
  sheet.setRowHeight(anchorRow + 4, 18);

  // Baris 6: jabatan
  sheet.insertRowsAfter(anchorRow + 4, 1);
  sheet.getRange(anchorRow + 5, anchorCol, 1, totalCols).merge()
    .setValue('Direktur')
    .setFontStyle('italic').setHorizontalAlignment('right').setFontColor('#000000');
  sheet.setRowHeight(anchorRow + 5, 18);

  // ── Hapus gambar lama di area footer (agar tidak dobel) ──────────────────
  try {
    var existingImgs = sheet.getImages();
    for (var i = 0; i < existingImgs.length; i++) {
      var ac = existingImgs[i].getAnchorCell();
      if (ac && ac.getRow() >= anchorRow - 6) existingImgs[i].remove();
    }
  } catch (e) { Logger.log('Remove old images error: ' + e); }

  // ── Sisipkan gambar tanda tangan (jika ada) ───────────────────────────────
  if (cfg.sigBase64) {
    try {
      var sigBytes = Utilities.base64Decode(cfg.sigBase64);
      var sigBlob  = Utilities.newBlob(sigBytes, 'image/png', 'signature.png');
      var SIG_W = 150;
      // Hitung total lebar area agar gambar rata kanan
      var totalWidthPx = 0;
      for (var c = anchorCol; c < anchorCol + totalCols; c++) {
        totalWidthPx += sheet.getColumnWidth(c);
      }
      var offsetX = Math.max(0, totalWidthPx - SIG_W);
      var img = sheet.insertImage(sigBlob, anchorCol, anchorRow + 1, offsetX, 4);
      img.setWidth(SIG_W); // hanya set lebar, tinggi menyesuaikan proporsi asli
    } catch (e) {
      Logger.log('Insert signature error: ' + e);
    }
  }

  SpreadsheetApp.flush();
  return anchorRow + 6;
}
