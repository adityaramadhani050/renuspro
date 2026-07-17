/**
 * RenusPro - Export PDF Laporan Quality Control per Work Order.
 *
 * Dibuat lewat SHEET sementara (foto disisipkan sebagai in-cell image dari URL
 * thumbnail Drive), lalu sheet diexport ke PDF via URL export bawaan Google
 * Sheets. Hanya butuh scope spreadsheets + drive (sudah diizinkan) — TIDAK
 * memakai DocumentApp, jadi tak perlu otorisasi ulang.
 */

function _qcStatusLabelText(st) {
  var m = { 'Approved': 'APPROVED', 'Pending': 'PENDING', 'Rejected': 'REJECTED', 'NA': 'N/A', 'Belum Upload': 'BELUM UPLOAD' };
  return m[st] || (st || 'BELUM UPLOAD');
}
function _qcStatusColorHex(st) {
  var m = { 'Approved': '#059669', 'Pending': '#d97706', 'Rejected': '#e11d48', 'NA': '#64748b', 'Belum Upload': '#94a3b8' };
  return m[st] || '#94a3b8';
}

function exportQCReportPDF(noWO) {
  var lock = LockService.getScriptLock();
  var ss = getSpreadsheet();
  var tempSheet = null;
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };

    var byWO = getQCByWO(noWO);
    if (!byWO || byWO.success === false) return { success: false, message: (byWO && byWO.message) || 'Gagal memuat data QC.' };
    var list = byWO.list || [];
    var summary = byWO.summary || {};

    var namaProject = '', namaKlien = '';
    try {
      var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
      if (wo) { namaProject = wo.namaProject || ''; namaKlien = wo.namaKlien || ''; }
    } catch (e) {}
    if (!namaProject) {
      try {
        var reg = _qcRegisteredWOs().filter(function (r) { return r.noWO === noWO; })[0];
        if (reg) { namaProject = reg.namaProject; namaKlien = reg.namaKlien; }
      } catch (e) {}
    }
    var assigned = [];
    try { assigned = (_qcAssignedMap()[noWO] || []).map(function (a) { return a.nama; }); } catch (e) {}
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

    lock.waitLock(30000);

    var COLS = 6;                       // 6 foto per baris
    var PHOTO_W = 96, PHOTO_H = 90;
    tempSheet = ss.insertSheet('_QC_PDF_' + noWO + '_' + Date.now());
    for (var c = 1; c <= COLS; c++) tempSheet.setColumnWidth(c, PHOTO_W);

    var row = 1;
    tempSheet.getRange(row, 1, 1, COLS).merge().setValue('LAPORAN QUALITY CONTROL')
      .setFontSize(16).setFontWeight('bold').setFontColor('#0f172a'); row++;
    tempSheet.getRange(row, 1, 1, COLS).merge().setValue(noWO + '  —  ' + (namaProject || '-'))
      .setFontSize(12).setFontWeight('bold').setFontColor('#334155'); row += 2;

    [
      'Klien: ' + (namaKlien || '-'),
      'Tanggal Export: ' + now,
      'Site Engineer: ' + (assigned.length ? assigned.join(', ') : '-'),
      'Progress Wajib Selesai: ' + (summary.pct || 0) + '%',
      'Ringkasan: Approved ' + (summary.approved || 0) + '  |  Pending ' + (summary.pending || 0)
        + '  |  Rejected ' + (summary.rejected || 0) + '  |  Belum ' + (summary.belum || 0) + '  |  N/A ' + (summary.na || 0)
    ].forEach(function (t) {
      tempSheet.getRange(row, 1, 1, COLS).merge().setValue(t).setFontSize(9).setFontColor('#334155'); row++;
    });
    row++;

    if (!list.length) {
      tempSheet.getRange(row, 1, 1, COLS).merge().setValue('Belum ada item checklist QC.').setFontColor('#94a3b8'); row++;
    }

    var curSection = null;
    list.forEach(function (it) {
      if (it.section !== curSection) {
        curSection = it.section;
        tempSheet.getRange(row, 1, 1, COLS).merge().setValue((it.section || '') + '. ' + (it.sectionLabel || ''))
          .setFontSize(12).setFontWeight('bold').setFontColor('#0f172a').setBackground('#f1f5f9'); row++;
      }
      tempSheet.getRange(row, 1, 1, COLS).merge().setValue(it.kode + ' — ' + it.label + (it.wajib ? '' : ' (opsional)'))
        .setFontSize(10).setFontWeight('bold').setFontColor('#1f2937'); row++;
      tempSheet.getRange(row, 1, 1, COLS).merge().setValue('Status: ' + _qcStatusLabelText(it.status))
        .setFontSize(9).setFontWeight('bold').setFontColor(_qcStatusColorHex(it.status)); row++;
      if (it.catatanSPV) {
        tempSheet.getRange(row, 1, 1, COLS).merge().setValue('Catatan Lead: ' + it.catatanSPV)
          .setFontSize(9).setFontStyle('italic').setFontColor('#475569').setWrap(true); row++;
      }
      var foto = it.foto || [];
      if (foto.length) {
        var col = 1;
        tempSheet.setRowHeight(row, PHOTO_H);
        foto.forEach(function (f) {
          if (col > COLS) { col = 1; row++; tempSheet.setRowHeight(row, PHOTO_H); }
          try {
            var img = SpreadsheetApp.newCellImage()
              .setSourceUrl('https://drive.google.com/thumbnail?id=' + f.fileId + '&sz=w400').build();
            tempSheet.getRange(row, col).setValue(img);
          } catch (e) {}
          col++;
        });
        row++;
      } else if (it.status !== 'NA') {
        tempSheet.getRange(row, 1, 1, COLS).merge().setValue('(Belum ada foto)').setFontSize(9).setFontColor('#94a3b8'); row++;
      }
      row++; // spacer
    });

    // Rapikan: buang kolom & baris kosong agar PDF tidak ada halaman/whitespace berlebih.
    var maxCols = tempSheet.getMaxColumns();
    if (maxCols > COLS) tempSheet.deleteColumns(COLS + 1, maxCols - COLS);
    var maxRows = tempSheet.getMaxRows();
    if (row <= maxRows) tempSheet.deleteRows(row, maxRows - row + 1);

    SpreadsheetApp.flush();
    Utilities.sleep(2000);   // beri waktu in-cell image dimuat sebelum export

    var base64 = _exportSheetToPdfBase64(ss, tempSheet);

    ss.deleteSheet(tempSheet); tempSheet = null;
    return { success: true, pdfBase64: base64, fileName: 'Laporan-QC-' + noWO + '.pdf' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { if (tempSheet) ss.deleteSheet(tempSheet); } catch (e2) {}
    try { lock.releaseLock(); } catch (e3) {}
  }
}
