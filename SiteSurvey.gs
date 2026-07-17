/**
 * RenusPro - Modul Site Survey.
 * Tim Sales mengisi form survey lokasi (5 bagian) saat kunjungan ke calon
 * klien; data teks masuk ke Sheet, foto (termasuk yang dianotasi) ke Drive.
 * Standalone — tidak ditautkan ke Customer/Penawaran/WO. Submit = final,
 * tanpa draft/approval. Semua Sales/Lead Sales/Admin bisa saling melihat.
 *
 * Sheet SiteSurvey_Main:
 *   ID | Tanggal Survey | Dibuat Oleh | Nama Site | Nama PIC | No Telepon |
 *   Alamat | Latitude | Longitude | Data (JSON) | Dibuat Pada
 *
 * Kolom "Data" (JSON) menampung field per-bagian selain info umum di atas:
 *   { arahBangunan, tinggiBangunan, fotoBangunan:{fileId,fileUrl},
 *     kelistrikan:{idPelangganPLN,dayaPLN,phase,ratingBreaker,
 *                  fotoKwh:{fileId,fileUrl}, fotoPHB:{fileId,fileUrl}},
 *     bos:{lokasi,panjang,lebar,jenisTembok,jarakInterkoneksi,
 *          foto:{fileId,fileUrl,caption}},
 *     atap:{jenis,arah,rangka,luas,mounting,
 *           fotoAtap:{fileId,fileUrl}, fotoRangka:{fileId,fileUrl}, fotoAkses:{fileId,fileUrl}},
 *     jalurKabel:{panjangPV,panjangAC,
 *                 fotoPV:{fileId,fileUrl}, fotoAC:{fileId,fileUrl}} }
 * File foto: Drive folder "RenusPro - Site Survey" / <ID Survey>.
 */

var _SS_HEADERS = ['ID', 'Tanggal Survey', 'Dibuat Oleh', 'Nama Site', 'Nama PIC',
  'No Telepon', 'Alamat', 'Latitude', 'Longitude', 'Data', 'Dibuat Pada'];

function _ensureSiteSurveySheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('SiteSurvey_Main');
  if (sheet) return sheet;
  sheet = ss.insertSheet('SiteSurvey_Main');
  sheet.appendRow(_SS_HEADERS);
  sheet.getRange(1, 1, 1, _SS_HEADERS.length).setFontWeight('bold');
  // Kolom tanggal (2, 11) sbg TEXT agar tak di-auto-parse Sheets jadi Date
  // (mis. "17/07/2026" -> Date -> ISO saat dibaca ulang).
  var maxR = sheet.getMaxRows();
  sheet.getRange(2, 2, maxR - 1, 1).setNumberFormat('@');
  sheet.getRange(2, 11, maxR - 1, 1).setNumberFormat('@');
  return sheet;
}

function _getSiteSurveyFolder(surveyId) {
  var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
  var parents = ssFile.getParents();
  var root = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var baseName = 'RenusPro - Site Survey';
  var baseIt = root.getFoldersByName(baseName);
  var base = baseIt.hasNext() ? baseIt.next() : root.createFolder(baseName);
  surveyId = (surveyId || 'TANPA-ID').toString().trim() || 'TANPA-ID';
  var subIt = base.getFoldersByName(surveyId);
  return subIt.hasNext() ? subIt.next() : base.createFolder(surveyId);
}

// ── ID berikutnya (preview, dipanggil sekali saat form dibuka) ─────────────
function getNextSiteSurveyId() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = _ensureSiteSurveySheet(getSpreadsheet());
    var last = sheet.getLastRow();
    var maxNum = 0;
    if (last > 1) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var m = (ids[i][0] || '').toString().match(/^SVY(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    var id = 'SVY' + ('000' + (maxNum + 1)).slice(-3);
    return { success: true, id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Upload 1 foto (base64 → Drive), dipakai selama pengisian form ──────────
function uploadSiteSurveyFoto(payload) {
  try {
    payload = payload || {};
    var surveyId = (payload.surveyId || '').toString().trim();
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var mimeType = payload.mimeType ? payload.mimeType.toString() : 'image/jpeg';
    var fieldKey = (payload.fieldKey || 'foto').toString().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!surveyId) return { success: false, message: 'ID survey wajib.' };
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    var origName = payload.fileName ? payload.fileName.toString() : '';
    var ext = (origName.indexOf('.') !== -1) ? origName.split('.').pop().toLowerCase() : '';
    if (!ext) ext = (mimeType.split('/')[1] || 'jpg').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    var fileName = fieldKey + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss') + '.' + ext;

    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = _getSiteSurveyFolder(surveyId).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, foto: { fileId: file.getId(), fileUrl: file.getUrl() } };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Hapus 1 foto yang sudah terupload (mis. user mengganti/retake sebelum submit).
function hapusSiteSurveyFoto(fileId) {
  try {
    fileId = (fileId || '').toString().trim();
    if (!fileId) return { success: false, message: 'fileId wajib.' };
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Submit final survey (teks + referensi foto yg sudah terupload) ─────────
function submitSiteSurvey(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var id = (payload.id || '').toString().trim();
    var namaSite = (payload.namaSite || '').toString().trim();
    if (!id) return { success: false, message: 'ID survey wajib (buka ulang form).' };
    if (!namaSite) return { success: false, message: 'Nama Site wajib diisi.' };

    lock.waitLock(20000);
    var sheet = _ensureSiteSurveySheet(getSpreadsheet());

    // Cegah submit ganda dgn ID yang sama.
    var last = sheet.getLastRow();
    if (last > 1) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if ((ids[i][0] || '').toString().trim() === id) return { success: false, message: 'Survey ini sudah pernah disubmit.' };
      }
    }

    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var tglSurvey = payload.tanggalSurvey ? payload.tanggalSurvey.toString() : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var data = {
      arahBangunan: payload.arahBangunan || '',
      tinggiBangunan: Number(payload.tinggiBangunan) || 0,
      fotoBangunan: payload.fotoBangunan || null,
      kelistrikan: payload.kelistrikan || {},
      bos: payload.bos || {},
      atap: payload.atap || {},
      jalurKabel: payload.jalurKabel || {}
    };

    sheet.appendRow([
      id, tglSurvey, (payload.dibuatOleh || '').toString(),
      namaSite, (payload.namaPIC || '').toString(), (payload.telepon || '').toString(),
      (payload.alamat || '').toString(),
      payload.latitude != null ? Number(payload.latitude) : '',
      payload.longitude != null ? Number(payload.longitude) : '',
      JSON.stringify(data), when
    ]);
    return { success: true, message: 'Site Survey ' + id + ' berhasil disimpan.', id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Daftar survey (ringkas, utk list) ───────────────────────────────────────
function getSiteSurveyList() {
  try {
    var sheet = _ensureSiteSurveySheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;
      list.push({
        id: r[0].toString(),
        tanggalSurvey: _fmtTgl(r[1]),
        dibuatOleh: r[2] ? r[2].toString() : '',
        namaSite: r[3] ? r[3].toString() : '',
        namaPIC: r[4] ? r[4].toString() : '',
        telepon: r[5] ? r[5].toString() : '',
        alamat: r[6] ? r[6].toString() : '',
        latitude: r[7] !== '' ? Number(r[7]) : null,
        longitude: r[8] !== '' ? Number(r[8]) : null,
        dibuatPada: r[10] ? r[10].toString() : ''
      });
    }
    list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// ── Detail 1 survey (lengkap, termasuk parsing Data) ────────────────────────
function getSiteSurveyDetail(id) {
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID wajib.' };
    var sheet = _ensureSiteSurveySheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if ((r[0] || '').toString().trim() !== id) continue;
      var parsed = {};
      try { parsed = JSON.parse(r[9] || '{}'); } catch (e) {}
      return {
        success: true,
        survey: {
          id: r[0].toString(),
          tanggalSurvey: _fmtTgl(r[1]),
          dibuatOleh: r[2] ? r[2].toString() : '',
          namaSite: r[3] ? r[3].toString() : '',
          namaPIC: r[4] ? r[4].toString() : '',
          telepon: r[5] ? r[5].toString() : '',
          alamat: r[6] ? r[6].toString() : '',
          latitude: r[7] !== '' ? Number(r[7]) : null,
          longitude: r[8] !== '' ? Number(r[8]) : null,
          dibuatPada: r[10] ? r[10].toString() : '',
          arahBangunan: parsed.arahBangunan || '',
          tinggiBangunan: parsed.tinggiBangunan || 0,
          fotoBangunan: parsed.fotoBangunan || null,
          kelistrikan: parsed.kelistrikan || {},
          bos: parsed.bos || {},
          atap: parsed.atap || {},
          jalurKabel: parsed.jalurKabel || {}
        }
      };
    }
    return { success: false, message: 'Survey tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Hapus survey (Admin/Lead Sales) — trash folder Drive-nya juga ──────────
function hapusSiteSurvey(id) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureSiteSurveySheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === id) {
        sheet.deleteRow(i + 1);
        try {
          var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
          var root = ssFile.getParents().hasNext() ? ssFile.getParents().next() : DriveApp.getRootFolder();
          var baseIt = root.getFoldersByName('RenusPro - Site Survey');
          if (baseIt.hasNext()) {
            var subIt = baseIt.next().getFoldersByName(id);
            if (subIt.hasNext()) subIt.next().setTrashed(true);
          }
        } catch (e) {}
        return { success: true, message: 'Site Survey ' + id + ' dihapus.' };
      }
    }
    return { success: false, message: 'Survey tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
