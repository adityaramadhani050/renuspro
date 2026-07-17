/**
 * RenusPro - Export PDF Laporan Quality Control per Work Order.
 *
 * Laporan QC banyak foto, sehingga dibuat lewat Google Doc sementara (agar foto
 * bisa disisipkan langsung), lalu diexport ke PDF dan Doc-nya dibuang.
 */

function _qcStatusLabelText(st) {
  var m = { 'Approved': 'APPROVED', 'Pending': 'PENDING', 'Rejected': 'REJECTED', 'NA': 'N/A', 'Belum Upload': 'BELUM UPLOAD' };
  return m[st] || (st || 'BELUM UPLOAD');
}
function _qcStatusColorHex(st) {
  var m = { 'Approved': '#059669', 'Pending': '#d97706', 'Rejected': '#e11d48', 'NA': '#64748b', 'Belum Upload': '#94a3b8' };
  return m[st] || '#94a3b8';
}

// Ambil blob gambar (pakai thumbnail agar PDF ringan; fallback file asli).
function _qcFetchImageBlob(fileId) {
  try {
    var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800',
      { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    if (resp.getResponseCode() === 200) {
      var b = resp.getBlob();
      if (b && b.getBytes().length > 200) return b;
    }
  } catch (e) {}
  try { return DriveApp.getFileById(fileId).getBlob(); } catch (e) {}
  return null;
}

function exportQCReportPDF(noWO) {
  var docId = null;
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };

    var byWO = getQCByWO(noWO);
    if (!byWO || byWO.success === false) return { success: false, message: (byWO && byWO.message) || 'Gagal memuat data QC.' };
    var list = byWO.list || [];
    var summary = byWO.summary || {};

    // Info WO (refresh dari master, fallback snapshot registry).
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

    var doc = DocumentApp.create('Laporan QC ' + noWO + ' - ' + now);
    docId = doc.getId();
    var body = doc.getBody();
    body.setMarginTop(28).setMarginBottom(28).setMarginLeft(36).setMarginRight(36);

    var title = body.appendParagraph('LAPORAN QUALITY CONTROL');
    title.setHeading(DocumentApp.ParagraphHeading.TITLE);
    title.editAsText().setForegroundColor('#0f172a');

    var sub = body.appendParagraph(noWO + '  —  ' + (namaProject || '-'));
    sub.setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

    var info = body.appendParagraph('');
    var it0 = info.editAsText();
    it0.appendText('Klien: ' + (namaKlien || '-') + '\n');
    it0.appendText('Tanggal Export: ' + now + '\n');
    it0.appendText('Site Engineer: ' + (assigned.length ? assigned.join(', ') : '-') + '\n');
    it0.appendText('Progress Wajib Selesai: ' + (summary.pct || 0) + '%\n');
    it0.appendText('Ringkasan: Approved ' + (summary.approved || 0) + '  |  Pending ' + (summary.pending || 0)
      + '  |  Rejected ' + (summary.rejected || 0) + '  |  Belum ' + (summary.belum || 0) + '  |  N/A ' + (summary.na || 0));
    it0.setFontSize(9).setForegroundColor('#334155');

    body.appendHorizontalRule();

    if (!list.length) {
      body.appendParagraph('Belum ada item checklist QC.').editAsText().setForegroundColor('#94a3b8');
    }

    var curSection = null;
    list.forEach(function (it) {
      if (it.section !== curSection) {
        curSection = it.section;
        var h = body.appendParagraph((it.section || '') + '. ' + (it.sectionLabel || ''));
        h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
        h.editAsText().setForegroundColor('#0f172a');
      }
      var pl = body.appendParagraph(it.kode + ' — ' + it.label + (it.wajib ? '' : ' (opsional)'));
      pl.editAsText().setBold(true).setFontSize(10);
      pl.setSpacingBefore(6).setSpacingAfter(0);

      var ps = body.appendParagraph('Status: ' + _qcStatusLabelText(it.status));
      ps.editAsText().setBold(true).setFontSize(9).setForegroundColor(_qcStatusColorHex(it.status));
      ps.setSpacingBefore(0).setSpacingAfter(2);

      if (it.catatanSPV) {
        var pc = body.appendParagraph('Catatan Lead: ' + it.catatanSPV);
        pc.editAsText().setItalic(true).setFontSize(9).setForegroundColor('#475569');
        pc.setSpacingBefore(0).setSpacingAfter(2);
      }

      var foto = it.foto || [];
      if (foto.length) {
        var pf = body.appendParagraph('');
        pf.setSpacingBefore(0).setSpacingAfter(6);
        foto.forEach(function (f) {
          var blob = _qcFetchImageBlob(f.fileId);
          if (!blob) return;
          try {
            var img = pf.appendInlineImage(blob);
            var w = img.getWidth(), hgt = img.getHeight();
            var targetW = 130;
            if (w > 0) { img.setWidth(targetW); img.setHeight(Math.round(hgt * targetW / w)); }
            pf.appendText('  ');
          } catch (e) {}
        });
      } else if (it.status !== 'NA') {
        var pnf = body.appendParagraph('(Belum ada foto)');
        pnf.editAsText().setFontSize(9).setForegroundColor('#94a3b8');
        pnf.setSpacingBefore(0).setSpacingAfter(4);
      }
    });

    doc.saveAndClose();
    var pdfBlob = DriveApp.getFileById(docId).getAs('application/pdf');
    var base64 = Utilities.base64Encode(pdfBlob.getBytes());
    DriveApp.getFileById(docId).setTrashed(true);

    return { success: true, pdfBase64: base64, fileName: 'Laporan-QC-' + noWO + '.pdf' };
  } catch (e) {
    try { if (docId) DriveApp.getFileById(docId).setTrashed(true); } catch (e2) {}
    return { success: false, message: e.toString() };
  }
}
