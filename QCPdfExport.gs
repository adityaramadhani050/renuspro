/**
 * RenusPro - Data Laporan Quality Control untuk export PDF.
 *
 * PDF dibangun di sisi frontend memakai jsPDF (desain konsisten dgn laporan
 * lain: kop gelap + PT. RENUS GLOBAL INDONESIA). Fungsi ini menyediakan data
 * terstruktur + foto sebagai data URL (base64) agar bisa disisipkan jsPDF.
 * Hanya butuh scope spreadsheets + drive + external_request (sudah diizinkan).
 */

function _qcStatusLabelText(st) {
  var m = { 'Approved': 'APPROVED', 'Pending': 'PENDING', 'Rejected': 'REJECTED', 'NA': 'N/A', 'Belum Upload': 'BELUM UPLOAD' };
  return m[st] || (st || 'BELUM UPLOAD');
}

// Ambil foto sebagai data URL kecil (thumbnail) agar payload ringan.
function _qcPhotoDataUrl(fileId) {
  try {
    var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w320',
      { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    if (resp.getResponseCode() === 200) {
      var blob = resp.getBlob();
      if (blob && blob.getBytes().length > 200) {
        var ct = blob.getContentType() || 'image/jpeg';
        return 'data:' + ct + ';base64,' + Utilities.base64Encode(blob.getBytes());
      }
    }
  } catch (e) {}
  return '';
}

function getQCReportData(noWO) {
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

    var sections = [], idx = {};
    list.forEach(function (it) {
      if (idx[it.section] == null) { idx[it.section] = sections.length; sections.push({ kode: it.section, label: it.sectionLabel, items: [] }); }
      var foto = (it.foto || []).map(function (f) { return { dataUrl: _qcPhotoDataUrl(f.fileId) }; })
        .filter(function (x) { return x.dataUrl; });
      sections[idx[it.section]].items.push({
        kode: it.kode, label: it.label, wajib: it.wajib, status: it.status,
        statusLabel: _qcStatusLabelText(it.status), catatanSPV: it.catatanSPV || '', foto: foto
      });
    });

    return {
      success: true, noWO: noWO, namaProject: namaProject, namaKlien: namaKlien,
      tglExport: now, assigned: assigned, summary: summary, sections: sections
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
