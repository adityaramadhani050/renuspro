/**
 * RenusPro - Data Laporan Site Survey untuk export PDF.
 *
 * PDF dibangun di sisi frontend memakai jsPDF (desain konsisten dgn laporan
 * lain: kop gelap + PT. RENUS GLOBAL INDONESIA). Fungsi ini menyediakan data
 * terstruktur + foto sebagai data URL (base64) agar bisa disisipkan jsPDF.
 * Foto diambil resolusi lebih besar (w1000) daripada laporan QC (w320) agar
 * hasil cetak jelas & mudah dilihat.
 */

function _ssPhotoDataUrl(fileId) {
  try {
    var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000',
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

function _ssAttachDataUrls(fotoArr) {
  return (Array.isArray(fotoArr) ? fotoArr : (fotoArr ? [fotoArr] : []))
    .filter(function (f) { return f && f.fileId; })
    .map(function (f) { return { fileId: f.fileId, fileUrl: f.fileUrl || '', caption: f.caption || '', dataUrl: _ssPhotoDataUrl(f.fileId) }; })
    .filter(function (f) { return f.dataUrl; });
}

function getSiteSurveyReportData(id) {
  try {
    var res = getSiteSurveyDetail(id);
    if (!res || res.success === false) return res;
    var d = res.survey;
    var kel = d.kelistrikan || {}, bos = d.bos || {}, atap = d.atap || {}, jk = d.jalurKabel || {};

    d.fotoBangunan = _ssAttachDataUrls(d.fotoBangunan);
    kel.fotoKwh = _ssAttachDataUrls(kel.fotoKwh);
    kel.fotoPHB = _ssAttachDataUrls(kel.fotoPHB);
    bos.foto = _ssAttachDataUrls(bos.foto);
    atap.fotoAtap = _ssAttachDataUrls(atap.fotoAtap);
    atap.fotoRangka = _ssAttachDataUrls(atap.fotoRangka);
    atap.fotoAkses = _ssAttachDataUrls(atap.fotoAkses);
    jk.fotoPV = _ssAttachDataUrls(jk.fotoPV);
    jk.fotoAC = _ssAttachDataUrls(jk.fotoAC);
    d.kelistrikan = kel; d.bos = bos; d.atap = atap; d.jalurKabel = jk;
    d.tglExport = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

    return { success: true, survey: d };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
