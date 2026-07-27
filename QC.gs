/**
 * RenusPro - Modul Quality Control (QC) Pekerjaan Lapangan.
 * Site Engineer upload foto per item checklist (per Work Order); SPV approve/reject.
 *
 * Sheet:
 *  - QC_Checklist_Master : Kode | Section | Section Label | Label | Wajib | Urutan   (di-seed sekali)
 *  - QC_Item             : ID | No WO | Kode | Foto(JSON) | Status | Catatan SPV |
 *                          Diupload Oleh | Diupload Pada | Direview Oleh | Direview Pada
 * File foto: Drive folder "RenusPro - QC Lapangan" / <No WO>.
 * Status item: 'Belum Upload' (tanpa baris) | 'Pending' | 'Approved' | 'Rejected' | 'NA'.
 */

// ── Master checklist (seed) — TANPA item video (E14/E15). B1 & B2 opsional. ──
var _QC_MASTER_SEED = [
  // [kode, section, sectionLabel, label, wajib]
  ['A1','A','Sebelum Instalasi','Foto - Depan bangunan', true],
  ['A2','A','Sebelum Instalasi','Foto - Lokasi Penyimpanan Material', true],
  ['A3','A','Sebelum Instalasi','Foto - Lokasi Sebelum Pemasangan PV Modul', true],
  ['A4','A','Sebelum Instalasi','Foto - Lokasi Sebelum Pemasangan BOS', true],
  ['A6','A','Sebelum Instalasi','Foto - Tim Pembangunan', true],
  ['A7','A','Sebelum Instalasi','Foto - Alat Pelindung Diri (Sesuai Personil)', true],
  ['A8','A','Sebelum Instalasi','Foto - Nameplate PV Modul (Belakang PV)', true],
  ['A9','A','Sebelum Instalasi','Foto - Nameplate Inverter (Body Inverter)', true],
  ['A10','A','Sebelum Instalasi','Foto - Nameplate Baterai (Body Baterai)', true],
  ['A11','A','Sebelum Instalasi','Foto - Mounting System', true],

  ['B1','B','PV Mounting','Foto - Pemasangan Angkur (Jika Ada)', false],
  ['B2','B','PV Mounting','Foto - Pemasangan Pondasi (Jika Ada)', false],
  ['B3','B','PV Mounting','Foto - Pemasangan Support Rail Mounting (L Feet / Roofhook / Rear & Front Leg / Cliplock)', true],
  ['B6','B','PV Mounting','Foto - Keseluruhan Sistem Mounting Finish tanpa Modul', true],

  ['C1','C','PV Module','Foto - Serial Number PV', true],
  ['C2','C','PV Module','Foto - Pemasangan Mid Clamp', true],
  ['C3','C','PV Module','Foto - Pemasangan End Clamp', true],
  ['C4','C','PV Module','Foto - Pemasangan Ground Clamp', true],
  ['C5','C','PV Module','Foto - Pemasangan Jumper Grounding antar array', true],
  ['C6','C','PV Module','Foto - Pemasangan PV Module (Tampak Keseluruhan)', true],
  ['C7','C','PV Module','Foto - Kerapihan Kabel dibawah PV Module', true],
  ['C8','C','PV Module','Foto - Kerapihan kabel menyebrang antar array', true],

  ['D1','D','Jalur Kabel PV','Foto - Jalur Kabel PV dari atap menuju ruang BOS (Dokumentasikan Tiap Jalur dan berikan tanda)', true],
  ['D3','D','Jalur Kabel PV','Foto - Pemasangan Clamp Conduit', true],

  ['E1','E','Balance Of System','Foto - Pemasangan Inverter', true],
  ['E2','E','Balance Of System','Foto - Pemasangan Baterai', true],
  ['E3','E','Balance Of System','Foto - Pemasangan Panel ACDB', true],
  ['E4','E','Balance Of System','Foto - Pemasangan Panel Proteksi Baterai', true],
  ['E5','E','Balance Of System','Foto - Pemasangan Rak Baterai', true],
  ['E6','E','Balance Of System','Foto - Wiring Inverter', true],
  ['E7','E','Balance Of System','Foto - Wiring Baterai', true],
  ['E8','E','Balance Of System','Foto - Wiring Panel ACDB', true],
  ['E9','E','Balance Of System','Foto - Wiring Panel Proteksi Baterai', true],
  ['E10','E','Balance Of System','Foto - Wiring Komunikasi Inverter', true],
  ['E11','E','Balance Of System','Foto - Wiring Komunikasi Baterai', true],
  ['E12','E','Balance Of System','Foto - Pemasangan Komponen BOS dengan Kabel Duct terbuka (Terlihat Jalur Kabel)', true],
  ['E13','E','Balance Of System','Foto - Pemasangan Komponen BOS dengan Kabel Duct tertutup', true],

  ['F1','F','Jalur Kabel AC','Foto - Panel box client sebelum dilakukan interkoneksi', true],
  ['F2','F','Jalur Kabel AC','Foto - Jalur Kabel Load menuju Interkoneksi (Dokumentasikan Tiap Jalur)', true],
  ['F3','F','Jalur Kabel AC','Foto - Jalur Kabel Grid menuju ke Inverter (Dokumentasikan Tiap Jalur)', true],
  ['F5','F','Jalur Kabel AC','Foto - Pemasangan Clamp Conduit', true],
  ['F6','F','Jalur Kabel AC','Foto - Panel box client setelah dilakukan interkoneksi', true],
  ['F7','F','Jalur Kabel AC','Foto - KWH Meter Client', true],

  ['G1','G','Pengukuran','Foto - Tegangan PV Module Tiap String', true],
  ['G2','G','Pengukuran','Foto - Arus PV Module Tiap String', true],
  ['G3','G','Pengukuran','Foto - Tegangan Output Inverter', true],
  ['G4','G','Pengukuran','Foto - Arus Output Inverter', true],
  ['G5','G','Pengukuran','Foto - Tegangan Baterai', true],
  ['G6','G','Pengukuran','Foto - Arus Baterai', true],
  ['G7','G','Pengukuran','Foto - Tegangan Grid / Gen', true],
  ['G8','G','Pengukuran','Foto - Arus Grid / Gen', true],
  ['G9','G','Pengukuran','Foto - Pengukuran Iradiasi Meter', true],

  ['H1','H','Finish Instalasi','Foto - Surat BAST', true],
  ['H2','H','Finish Instalasi','Foto - Surat Garansi', true],
  ['H3','H','Finish Instalasi','Foto - Form Commisioning', true]
];

// ── Sheets: master checklist dua sheet (Section + Item) ─────────────────────
//  QC_Section   : Kode | Label | Urutan
//  QC_Checklist : Kode | Section Kode | Label | Wajib | Urutan
function _ensureQCMaster(ss) {
  ss = ss || getSpreadsheet();
  var sec = ss.getSheetByName('QC_Section');
  if (!sec) { sec = ss.insertSheet('QC_Section'); sec.appendRow(['Kode', 'Label', 'Urutan']); sec.getRange(1, 1, 1, 3).setFontWeight('bold'); }
  var item = ss.getSheetByName('QC_Checklist');
  if (!item) { item = ss.insertSheet('QC_Checklist'); item.appendRow(['Kode', 'Section Kode', 'Label', 'Wajib', 'Urutan', 'Instruksi', 'Contoh Foto', 'Tipe Upload']); item.getRange(1, 1, 1, 8).setFontWeight('bold'); }
  else {
    if (item.getLastColumn() < 7) item.getRange(1, 6, 1, 2).setValues([['Instruksi', 'Contoh Foto']]).setFontWeight('bold');
    if (item.getLastColumn() < 8) item.getRange(1, 8).setValue('Tipe Upload').setFontWeight('bold'); // 'foto'(default) | 'file'
  }

  if (sec.getLastRow() <= 1) {
    // Sumber seed: migrasi dari QC_Checklist_Master lama bila ada, else _QC_MASTER_SEED.
    // srcRows: [kode, sectionCode, sectionLabel, label, wajib(bool), urutan]
    var srcRows = null;
    var oldSheet = ss.getSheetByName('QC_Checklist_Master');
    if (oldSheet && oldSheet.getLastRow() > 1) {
      var od = oldSheet.getDataRange().getValues();
      srcRows = [];
      for (var i = 1; i < od.length; i++) {
        if (!od[i][0]) continue;
        srcRows.push([od[i][0].toString(), (od[i][1] || '').toString(), (od[i][2] || '').toString(), (od[i][3] || '').toString(),
          (od[i][4] != null && od[i][4].toString().trim().toLowerCase() === 'ya'), Number(od[i][5]) || i]);
      }
    } else {
      srcRows = _QC_MASTER_SEED.map(function (r, idx) { return [r[0], r[1], r[2], r[3], !!r[4], idx + 1]; });
    }
    var secMap = {}, secOrder = [], items = [];
    srcRows.forEach(function (r) {
      var sc = r[1];
      if (!secMap[sc]) { secMap[sc] = { label: r[2], urutan: secOrder.length + 1 }; secOrder.push(sc); }
      items.push([r[0], sc, r[3], r[4] ? 'Ya' : 'Tidak', r[5]]);
    });
    var secRows = secOrder.map(function (sc) { return [sc, secMap[sc].label, secMap[sc].urutan]; });
    if (secRows.length) sec.getRange(2, 1, secRows.length, 3).setValues(secRows);
    if (items.length) item.getRange(2, 1, items.length, 5).setValues(items);
  }
  return { sec: sec, item: item };
}

function _ensureQCItemSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('QC_Item');
  if (sheet) {
    // Migrasi ringan: pastikan kolom 11 "Aktivitas" ada utk sheet lama.
    if (sheet.getLastColumn() < 11) sheet.getRange(1, 11).setValue('Aktivitas');
    return sheet;
  }
  sheet = ss.insertSheet('QC_Item');
  sheet.appendRow(['ID', 'No WO', 'Kode', 'Foto', 'Status', 'Catatan SPV',
    'Diupload Oleh', 'Diupload Pada', 'Direview Oleh', 'Direview Pada', 'Aktivitas']);
  sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  return sheet;
}

// ── Log aktivitas per item (kolom 11, JSON array of {type,by,at,note}) ───────
// type: 'upload' | 'reject' | 'approve' | 'na'. Dipakai utk timeline riwayat.
function _qcParseActivity(cell) {
  try { var a = JSON.parse(cell || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function _qcAppendActivity(sheet, rowIdx, ev) {
  var cur = _qcParseActivity(sheet.getRange(rowIdx, 11).getValue());
  cur.push(ev);
  sheet.getRange(rowIdx, 11).setValue(JSON.stringify(cur));
}

function _getQCFolder(noWO) {
  var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
  var parents = ssFile.getParents();
  var root = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var baseName = 'RenusPro - QC Lapangan';
  var baseIt = root.getFoldersByName(baseName);
  var base = baseIt.hasNext() ? baseIt.next() : root.createFolder(baseName);
  noWO = (noWO || 'TANPA-WO').toString().trim() || 'TANPA-WO';
  var subIt = base.getFoldersByName(noWO);
  return subIt.hasNext() ? subIt.next() : base.createFolder(noWO);
}

// ── Master (join Section × Checklist) ───────────────────────────────────────
function _qcInvalidateChecklistCache() {
  try { CacheService.getScriptCache().remove('cache_qc_checklist'); } catch (e) {}
}

function getQCChecklist() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('cache_qc_checklist');
    if (cached) { try { return JSON.parse(cached); } catch (e) {} }
    var m = _ensureQCMaster(getSpreadsheet());
    var secData = m.sec.getDataRange().getValues();
    var secMap = {}, sections = [];
    for (var i = 1; i < secData.length; i++) {
      if (!secData[i][0]) continue;
      var sk = secData[i][0].toString();
      secMap[sk] = { label: secData[i][1] ? secData[i][1].toString() : '', urutan: Number(secData[i][2]) || i };
      sections.push({ kode: sk, label: secMap[sk].label, urutan: secMap[sk].urutan });
    }
    sections.sort(function (a, b) { return a.urutan - b.urutan; });
    var itData = m.item.getDataRange().getValues();
    var list = [];
    for (var j = 1; j < itData.length; j++) {
      if (!itData[j][0]) continue;
      var sc = (itData[j][1] || '').toString();
      var s = secMap[sc] || { label: '', urutan: 999 };
      list.push({
        kode:          itData[j][0].toString(),
        section:       sc,
        sectionLabel:  s.label,
        label:         itData[j][2] ? itData[j][2].toString() : '',
        wajib:         (itData[j][3] != null && itData[j][3].toString().trim().toLowerCase() === 'ya'),
        sectionUrutan: s.urutan,
        urutan:        Number(itData[j][4]) || j,
        instruksi:     itData[j][5] ? itData[j][5].toString() : '',
        contohFoto:    _qcParseFoto(itData[j][6]),
        tipeUpload:    (itData[j][7] && itData[j][7].toString().trim().toLowerCase() === 'file') ? 'file' : 'foto'
      });
    }
    list.sort(function (a, b) { return (a.sectionUrutan - b.sectionUrutan) || (a.urutan - b.urutan); });
    var out = { success: true, list: list, sections: sections };
    try { var j = JSON.stringify(out); if (j.length < 95000) cache.put('cache_qc_checklist', j, CACHE_TTL); } catch (e) {}
    return out;
  } catch (e) {
    return { success: false, list: [], sections: [], message: e.toString() };
  }
}

// ── Kelola master checklist (Lead Engineer / Admin) ─────────────────────────
function _qcNextSectionCode(secSheet) {
  var data = secSheet.getDataRange().getValues();
  var used = {};
  for (var i = 1; i < data.length; i++) { if (data[i][0]) used[data[i][0].toString().trim().toUpperCase()] = true; }
  for (var c = 65; c <= 90; c++) { var L = String.fromCharCode(c); if (!used[L]) return L; }
  return 'S' + data.length;
}

function tambahQCSection(label) {
  var lock = LockService.getScriptLock();
  try {
    label = (label || '').toString().trim();
    if (!label) return { success: false, message: 'Nama item QC wajib diisi.' };
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var kode = _qcNextSectionCode(m.sec);
    var maxU = 0, d = m.sec.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) { maxU = Math.max(maxU, Number(d[i][2]) || 0); }
    m.sec.appendRow([kode, label, maxU + 1]);
    _qcInvalidateChecklistCache();
    return { success: true, message: 'Item QC "' + kode + '. ' + label + '" ditambahkan.', kode: kode };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function updateQCSection(kode, label) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim(); label = (label || '').toString().trim();
    if (!label) return { success: false, message: 'Nama item QC wajib diisi.' };
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var d = m.sec.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if ((d[i][0] || '').toString().trim() === kode) { m.sec.getRange(i + 1, 2).setValue(label); _qcInvalidateChecklistCache(); return { success: true, message: 'Item QC diperbarui.' }; }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function hapusQCSection(kode) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var d = m.sec.getDataRange().getValues();
    for (var i = d.length - 1; i >= 1; i--) { if ((d[i][0] || '').toString().trim() === kode) m.sec.deleteRow(i + 1); }
    var it = m.item.getDataRange().getValues();
    for (var j = it.length - 1; j >= 1; j--) { if ((it[j][1] || '').toString().trim() === kode) m.item.deleteRow(j + 1); }
    _qcInvalidateChecklistCache();
    return { success: true, message: 'Item QC & subitemnya dihapus.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function tambahQCSubItem(sectionKode, label, wajib, instruksi, tipeUpload) {
  var lock = LockService.getScriptLock();
  try {
    sectionKode = (sectionKode || '').toString().trim(); label = (label || '').toString().trim();
    if (!sectionKode) return { success: false, message: 'Item QC induk wajib.' };
    if (!label) return { success: false, message: 'Nama subitem wajib diisi.' };
    var tipe = (tipeUpload === 'file') ? 'file' : 'foto';
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var d = m.item.getDataRange().getValues();
    var maxNum = 0, maxU = 0;
    for (var i = 1; i < d.length; i++) {
      maxU = Math.max(maxU, Number(d[i][4]) || 0);
      if ((d[i][1] || '').toString().trim() === sectionKode) {
        var mm = (d[i][0] || '').toString().match(/(\d+)$/); if (mm) maxNum = Math.max(maxNum, parseInt(mm[1], 10));
      }
    }
    var kode = sectionKode + (maxNum + 1);
    m.item.appendRow([kode, sectionKode, label, wajib ? 'Ya' : 'Tidak', maxU + 1, (instruksi || '').toString(), '', tipe]);
    _qcInvalidateChecklistCache();
    return { success: true, message: 'Subitem "' + kode + '" ditambahkan.', kode: kode };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function updateQCSubItem(kode, label, wajib, instruksi, tipeUpload) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim(); label = (label || '').toString().trim();
    if (!label) return { success: false, message: 'Nama subitem wajib diisi.' };
    var setInstr = (instruksi != null);   // hanya ditulis bila argumen dikirim
    var setTipe = (tipeUpload != null);   // hanya ditulis bila argumen dikirim
    var tipe = (tipeUpload === 'file') ? 'file' : 'foto';
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var d = m.item.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if ((d[i][0] || '').toString().trim() === kode) {
        m.item.getRange(i + 1, 3, 1, 2).setValues([[label, wajib ? 'Ya' : 'Tidak']]);
        if (setInstr) m.item.getRange(i + 1, 6).setValue(instruksi.toString());
        if (setTipe) m.item.getRange(i + 1, 8).setValue(tipe);
        _qcInvalidateChecklistCache();
        return { success: true, message: 'Subitem diperbarui.' };
      }
    }
    return { success: false, message: 'Subitem tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// Cari baris QC_Checklist utk kode subitem. Return {rowIdx, row} | null.
function _qcFindChecklistRow(itemSheet, kode) {
  var d = itemSheet.getDataRange().getValues();
  kode = (kode || '').toString().trim();
  for (var i = 1; i < d.length; i++) {
    if ((d[i][0] || '').toString().trim() === kode) return { rowIdx: i + 1, row: d[i] };
  }
  return null;
}

// Upload foto contoh untuk subitem checklist (base64 → Drive/_Contoh Checklist).
function uploadQCContohFoto(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var kode = (payload.kode || '').toString().trim();
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var mimeType = payload.mimeType ? payload.mimeType.toString() : 'image/jpeg';
    if (!kode) return { success: false, message: 'Kode subitem wajib.' };
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };
    var origName = payload.fileName ? payload.fileName.toString() : '';
    var ext = (origName.indexOf('.') !== -1) ? origName.split('.').pop().toLowerCase() : '';
    if (!ext) ext = (mimeType.split('/')[1] || 'jpg').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';

    lock.waitLock(20000);
    var m = _ensureQCMaster(getSpreadsheet());
    var found = _qcFindChecklistRow(m.item, kode);
    if (!found) return { success: false, message: 'Subitem tidak ditemukan.' };
    var existing = _qcParseFoto(found.row[6]);
    var fileName = kode + '-contoh-' + (existing.length + 1) + '.' + ext;

    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = _getQCFolder('_Contoh Checklist').createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    existing.push({ fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName });
    m.item.getRange(found.rowIdx, 7).setValue(JSON.stringify(existing));
    _qcInvalidateChecklistCache();
    return { success: true, message: 'Foto contoh tersimpan.', contohFoto: existing };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Hapus 1 foto contoh dari subitem.
function hapusQCContohFoto(kode, fileId) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    fileId = (fileId || '').toString().trim();
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var found = _qcFindChecklistRow(m.item, kode);
    if (!found) return { success: false, message: 'Subitem tidak ditemukan.' };
    var arr = _qcParseFoto(found.row[6]).filter(function (f) { return f.fileId !== fileId; });
    m.item.getRange(found.rowIdx, 7).setValue(JSON.stringify(arr));
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    _qcInvalidateChecklistCache();
    return { success: true, message: 'Foto contoh dihapus.', contohFoto: arr };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusQCSubItem(kode) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    lock.waitLock(15000);
    var m = _ensureQCMaster(getSpreadsheet());
    var d = m.item.getDataRange().getValues();
    for (var i = d.length - 1; i >= 1; i--) { if ((d[i][0] || '').toString().trim() === kode) { m.item.deleteRow(i + 1); _qcInvalidateChecklistCache(); return { success: true, message: 'Subitem dihapus.' }; } }
    return { success: false, message: 'Subitem tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Internal helpers ────────────────────────────────────────────────────────
function _qcParseFoto(v) {
  try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function _qcNextId(sheet) {
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var m = (ids[i][0] || '').toString().match(/^QCI(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return 'QCI' + ('000' + (maxNum + 1)).slice(-3);
}

// Cari baris QC_Item utk (noWO, kode). Return {rowIdx(1-based), row(array)} atau null.
function _qcFindItemRow(sheet, noWO, kode) {
  var data = sheet.getDataRange().getValues();
  noWO = (noWO || '').toString().trim();
  kode = (kode || '').toString().trim();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim() === noWO && (data[i][2] || '').toString().trim() === kode) {
      return { rowIdx: i + 1, row: data[i] };
    }
  }
  return null;
}

function _qcMergeItem(master, itemRow) {
  var foto = itemRow ? _qcParseFoto(itemRow[3]) : [];
  var status = itemRow && itemRow[4] ? itemRow[4].toString() : (foto.length ? 'Pending' : 'Belum Upload');
  return {
    kode:         master.kode,
    section:      master.section,
    sectionLabel: master.sectionLabel,
    label:        master.label,
    wajib:        master.wajib,
    urutan:       master.urutan,
    instruksi:    master.instruksi || '',
    contohFoto:   master.contohFoto || [],
    tipeUpload:   master.tipeUpload || 'foto',
    foto:         foto,
    status:       status,
    catatanSPV:   itemRow && itemRow[5] ? itemRow[5].toString() : '',
    uploadedBy:   itemRow && itemRow[6] ? itemRow[6].toString() : '',
    uploadedPada: itemRow && itemRow[7] ? itemRow[7].toString() : '',
    reviewedBy:   itemRow && itemRow[8] ? itemRow[8].toString() : '',
    reviewedPada: itemRow && itemRow[9] ? itemRow[9].toString() : '',
    activity:     itemRow ? _qcParseActivity(itemRow[10]) : []
  };
}

// ── Checklist per WO (master × QC_Item) ─────────────────────────────────────
function getQCByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, list: [], message: 'No WO wajib diisi.' };
    var ss = getSpreadsheet();
    var master = getQCChecklist().list;
    var itemSheet = _ensureQCItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var rowMap = {};
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() === noWO) rowMap[(data[i][2] || '').toString().trim()] = data[i];
    }
    var list = master.map(function (m) { return _qcMergeItem(m, rowMap[m.kode] || null); });
    var proj = _qcRegisteredWOs().filter(function (p) { return p.noWO === noWO; })[0] || {};
    return {
      success: true, list: list, summary: _qcCountSummary(list),
      selesaiManual: !!proj.selesaiManual, ditandaiOleh: proj.ditandaiOleh || '', ditandaiPada: proj.ditandaiPada || ''
    };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

function _qcCountSummary(list) {
  var s = { total: list.length, approved: 0, pending: 0, rejected: 0, belum: 0, na: 0, wajibTotal: 0, wajibSelesai: 0 };
  list.forEach(function (it) {
    if (it.status === 'Approved') s.approved++;
    else if (it.status === 'Pending') s.pending++;
    else if (it.status === 'Rejected') s.rejected++;
    else if (it.status === 'NA') s.na++;
    else s.belum++;
    if (it.wajib) { s.wajibTotal++; if (it.status === 'Approved') s.wajibSelesai++; }
  });
  s.pct = s.wajibTotal ? Math.round((s.wajibSelesai / s.wajibTotal) * 100) : 0;
  return s;
}

// ── Upload foto (base64 → Drive) + set Pending ──────────────────────────────
function uploadQCFoto(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var kode = (payload.kode || '').toString().trim();
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var mimeType = payload.mimeType ? payload.mimeType.toString() : 'image/jpeg';
    if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    // Ekstensi file dari nama asli / mime type
    var origName = payload.fileName ? payload.fileName.toString() : '';
    var ext = (origName.indexOf('.') !== -1) ? origName.split('.').pop().toLowerCase() : '';
    if (!ext) ext = (mimeType.split('/')[1] || 'jpg').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var found = _qcFindItemRow(sheet, noWO, kode);
    var existing = found ? _qcParseFoto(found.row[3]) : [];

    // Nama file berdasarkan kode subitem QC (mis. A1-1.jpg, A1-2.jpg)
    var fileName = kode + '-' + (existing.length + 1) + '.' + ext;

    // Upload ke Drive
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = _getQCFolder(noWO).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var foto = { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName,
                 by: (payload.oleh || '').toString(), at: when };

    var uploadEv = { type: 'upload', by: foto.by, at: when, note: fileName };
    var arr;
    if (found) {
      arr = existing; arr.push(foto);
      sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(arr));      // Foto
      sheet.getRange(found.rowIdx, 5).setValue('Pending');                // Status
      sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[foto.by, when]]); // Diupload Oleh/Pada
      _qcAppendActivity(sheet, found.rowIdx, uploadEv);                   // Aktivitas
    } else {
      arr = [foto];
      sheet.appendRow([_qcNextId(sheet), noWO, kode, JSON.stringify(arr), 'Pending', '', foto.by, when, '', '', JSON.stringify([uploadEv])]);
    }
    return { success: true, message: 'Foto tersimpan.', foto: foto, status: 'Pending', foto_list: arr };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Upload BANYAK foto/dokumen sekaligus (1 klik) → 1x set Pending + 1 notif ──
// payload: { noWO, kode, oleh, files: [{ base64Data, fileName, mimeType }] }
function uploadQCFotoBatch(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var kode = (payload.kode || '').toString().trim();
    var oleh = (payload.oleh || '').toString();
    var files = (payload.files && payload.files.length) ? payload.files : [];
    if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
    if (!files.length) return { success: false, message: 'Tidak ada file untuk diupload.' };

    lock.waitLock(30000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var found = _qcFindItemRow(sheet, noWO, kode);
    var arr = found ? _qcParseFoto(found.row[3]) : [];
    var wasStatus = found ? (found.row[4] || '').toString() : 'Belum Upload';
    var folder = _getQCFolder(noWO);
    var added = [], evts = [];

    files.forEach(function (fobj) {
      var base64 = fobj.base64Data ? fobj.base64Data.toString() : '';
      if (!base64) return;
      var mimeType = fobj.mimeType ? fobj.mimeType.toString() : 'image/jpeg';
      var origName = fobj.fileName ? fobj.fileName.toString() : '';
      var ext = (origName.indexOf('.') !== -1) ? origName.split('.').pop().toLowerCase() : '';
      if (!ext) ext = (mimeType.split('/')[1] || 'jpg').toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      var fileName = kode + '-' + (arr.length + added.length + 1) + '.' + ext;
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var foto = { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName, by: oleh, at: when };
      added.push(foto);
      evts.push({ type: 'upload', by: oleh, at: when, note: fileName });
    });

    if (!added.length) return { success: false, message: 'Semua file gagal diproses.' };

    var all = arr.concat(added);
    if (found) {
      sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(all));
      sheet.getRange(found.rowIdx, 5).setValue('Pending');
      sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[oleh, when]]);
      evts.forEach(function (ev) { _qcAppendActivity(sheet, found.rowIdx, ev); });
    } else {
      sheet.appendRow([_qcNextId(sheet), noWO, kode, JSON.stringify(all), 'Pending', '', oleh, when, '', '', JSON.stringify(evts)]);
    }

    // Notifikasi WA ke Lead Engineer (item baru perlu direview). Aman bila WA off.
    try { if (typeof _qcNotifLeadReview === 'function') _qcNotifLeadReview(noWO, kode, oleh, added.length, wasStatus); } catch (e) {}

    return { success: true, message: added.length + ' file terupload.', count: added.length, status: 'Pending', foto_list: all };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Hapus 1 foto dari item ──────────────────────────────────────────────────
function hapusQCFoto(noWO, kode, fileId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var found = _qcFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Item tidak ditemukan.' };
    var arr = _qcParseFoto(found.row[3]).filter(function (f) { return f.fileId !== fileId; });
    sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(arr));
    if (!arr.length) sheet.getRange(found.rowIdx, 5).setValue('Belum Upload'); // tak ada foto → reset
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    return { success: true, message: 'Foto dihapus.', foto_list: arr };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Anotasi foto (coret-coret oleh Lead Engineer) ───────────────────────────
// Kirim gambar resolusi tinggi sbg data URL utk diedit di kanvas (hindari taint
// canvas oleh Drive cross-origin).
function getQCFotoBesar(fileId) {
  try {
    fileId = (fileId || '').toString().trim();
    if (!fileId) return { success: false, message: 'fileId wajib.' };
    var dataUrl = '';
    try {
      var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600',
        { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
      if (resp.getResponseCode() === 200) {
        var b = resp.getBlob();
        if (b && b.getBytes().length > 200) dataUrl = 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
      }
    } catch (e) {}
    if (!dataUrl) {
      var blob = DriveApp.getFileById(fileId).getBlob();
      dataUrl = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
    return { success: true, dataUrl: dataUrl };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Simpan gambar hasil coretan → menimpa slot foto (file baru, file lama di-trash).
function simpanQCFotoAnotasi(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var kode = (payload.kode || '').toString().trim();
    var oldFileId = (payload.fileId || '').toString().trim();
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var mimeType = payload.mimeType ? payload.mimeType.toString() : 'image/jpeg';
    if (!noWO || !kode || !oldFileId) return { success: false, message: 'Data tidak lengkap.' };
    if (!base64Data) return { success: false, message: 'Gambar kosong.' };
    var ext = (mimeType.split('/')[1] || 'jpg').toLowerCase(); if (ext === 'jpeg') ext = 'jpg';

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var found = _qcFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Item tidak ditemukan.' };
    if ((found.row[4] || '').toString() === 'Approved') return { success: false, message: 'Item sudah Approved — foto tidak bisa ditandai.' };
    var arr = _qcParseFoto(found.row[3]);
    var idx = -1;
    for (var i = 0; i < arr.length; i++) { if (arr[i].fileId === oldFileId) { idx = i; break; } }
    if (idx === -1) return { success: false, message: 'Foto tidak ditemukan.' };

    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var fileName = kode + '-edit-' + (idx + 1) + '.' + ext;
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = _getQCFolder(noWO).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) {}

    var old = arr[idx] || {};
    arr[idx] = { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName,
                 by: old.by || '', at: old.at || when,
                 editedBy: (payload.oleh || '').toString(), editedAt: when };
    sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(arr));
    return { success: true, message: 'Gambar tersimpan dengan coretan.', foto_list: arr };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Review SPV (Approved/Rejected + catatan) ────────────────────────────────
function reviewQCItem(noWO, kode, keputusan, catatan, reviewer) {
  var lock = LockService.getScriptLock();
  try {
    keputusan = (keputusan || '').toString();
    if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var found = _qcFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Belum ada foto untuk item ini.' };
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.getRange(found.rowIdx, 5).setValue(keputusan);
    sheet.getRange(found.rowIdx, 6).setValue((catatan || '').toString());
    sheet.getRange(found.rowIdx, 9, 1, 2).setValues([[(reviewer || '').toString(), when]]);
    _qcAppendActivity(sheet, found.rowIdx, {
      type: keputusan === 'Approved' ? 'approve' : 'reject',
      by: (reviewer || '').toString(), at: when, note: (catatan || '').toString()
    });
    // Notifikasi WA ke site engineer WO ini (approve/reject). Aman bila WA off.
    try { if (typeof _qcNotifSiteReview === 'function') _qcNotifSiteReview(noWO, kode, keputusan, (catatan || '').toString()); } catch (e) {}
    return { success: true, message: 'Item ' + kode + ' ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Batalkan persetujuan (Approved → Pending untuk direview ulang) ──────────
function cancelQCApproval(noWO, kode, oleh) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var found = _qcFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Item tidak ditemukan.' };
    if ((found.row[4] || '').toString() !== 'Approved') return { success: false, message: 'Hanya item berstatus Approved yang bisa dibatalkan.' };
    var arr = _qcParseFoto(found.row[3]);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.getRange(found.rowIdx, 5).setValue(arr.length ? 'Pending' : 'Belum Upload');  // Status
    sheet.getRange(found.rowIdx, 6).setValue('');                                        // Catatan SPV
    sheet.getRange(found.rowIdx, 9, 1, 2).setValues([['', '']]);                          // Direview Oleh/Pada
    _qcAppendActivity(sheet, found.rowIdx, { type: 'cancel', by: (oleh || '').toString(), at: when, note: '' });
    return { success: true, message: 'Persetujuan item ' + kode + ' dibatalkan — kembali ke Pending.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Tandai item opsional Tidak Ada (N/A) atau batalkan ──────────────────────
function setQCItemNA(noWO, kode, isNA, oleh) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var found = _qcFindItemRow(sheet, noWO, kode);
    if (isNA) {
      var naEv = { type: 'na', by: (oleh || '').toString(), at: when, note: '' };
      if (found) {
        sheet.getRange(found.rowIdx, 5).setValue('NA');
        sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[(oleh || '').toString(), when]]);
        _qcAppendActivity(sheet, found.rowIdx, naEv);
      } else {
        sheet.appendRow([_qcNextId(sheet), noWO, kode, '[]', 'NA', '', (oleh || '').toString(), when, '', '', JSON.stringify([naEv])]);
      }
    } else if (found) {
      var arr = _qcParseFoto(found.row[3]);
      sheet.getRange(found.rowIdx, 5).setValue(arr.length ? 'Pending' : 'Belum Upload');
    }
    return { success: true, message: 'Status item diperbarui.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Penugasan WO → Site Engineer (Lead Engineer yang assign) ────────────────
function _qcAssignmentSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('QC_Assignment');
  if (sheet) return sheet;
  sheet = ss.insertSheet('QC_Assignment');
  sheet.appendRow(['No WO', 'ID User', 'Nama User', 'Assigned By', 'Assigned At']);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  return sheet;
}

// Daftar user role Site Engineer (aktif) untuk dropdown penugasan.
function getSiteEngineerList() {
  try {
    var list = (getUserList() || [])
      .filter(function (u) { return u.role === 'siteengineer' && u.aktif; })
      .map(function (u) { return { id: u.id, nama: u.nama, username: u.username }; });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Map noWO -> [{id, nama}] site engineer yang ditugaskan.
function _qcAssignedMap() {
  var map = {};
  try {
    var sheet = _qcAssignmentSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][0] || '').toString().trim();
      if (!w) continue;
      if (!map[w]) map[w] = [];
      map[w].push({ id: (data[i][1] || '').toString(), nama: (data[i][2] || '').toString() });
    }
  } catch (e) {}
  return map;
}

function getQCAssignment(noWO) {
  try {
    var m = _qcAssignedMap();
    return { success: true, list: m[(noWO || '').toString().trim()] || [] };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

// Ringkasan QC + engineer yg ditugaskan, utk ditampilkan di detail Work Order
// (read-only, lintas divisi). Payload ringan: hanya summary + assigned, TANPA
// list 55 item checklist.
function getQCSummaryByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: true, summary: null, assigned: [] };
    var byWO = getQCByWO(noWO);
    return {
      success: true,
      summary: (byWO && byWO.success) ? byWO.summary : null,
      assigned: _qcAssignedMap()[noWO] || []
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Tulis ulang penugasan 1 WO. userIds = ['U001', ...].
function setQCAssignment(noWO, userIds, assignedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    userIds = userIds || [];
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _qcAssignmentSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) sheet.deleteRow(i + 1);
    }
    var userMap = {};
    try { (getUserList() || []).forEach(function (u) { userMap[u.id] = u.nama; }); } catch (e) {}
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var seen = {};
    for (var j = 0; j < userIds.length; j++) {
      var uid = (userIds[j] || '').toString().trim();
      if (!uid || seen[uid]) continue;
      seen[uid] = true;
      sheet.appendRow([noWO, uid, userMap[uid] || uid, (assignedBy || '').toString(), when]);
    }
    return { success: true, message: 'Penugasan diperbarui (' + Object.keys(seen).length + ' engineer).' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Daftar Project QC ───────────────────────────────────────────────────────
// Tidak semua WO perlu QC lapangan. Lead Engineer mendaftarkan WO ke QC lewat
// sheet QC_Project; hanya WO terdaftar yang muncul di modul QC.
function _qcProjectSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('QC_Project');
  if (!sheet) {
    sheet = ss.insertSheet('QC_Project');
    sheet.appendRow(['No WO', 'Nama Project', 'Nama Klien', 'Ditambahkan Oleh', 'Ditambahkan Pada', 'Selesai Manual', 'Ditandai Selesai Oleh', 'Ditandai Selesai Pada']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    return sheet;
  }
  // Migrasi kolom "selesai manual" untuk sheet lama.
  if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 6, 1, 3).setValues([['Selesai Manual', 'Ditandai Selesai Oleh', 'Ditandai Selesai Pada']]).setFontWeight('bold');
  }
  return sheet;
}

// Array WO yang terdaftar di QC: [{noWO, namaProject, namaKlien}] (snapshot).
function _qcRegisteredWOs() {
  var out = [];
  try {
    var sheet = _qcProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][0] || '').toString().trim();
      if (!w) continue;
      out.push({
        noWO: w, namaProject: (data[i][1] || '').toString(), namaKlien: (data[i][2] || '').toString(),
        selesaiManual: ((data[i][5] || '').toString().trim().toLowerCase() === 'ya'),
        ditandaiOleh: (data[i][6] || '').toString(), ditandaiPada: (data[i][7] || '').toString()
      });
    }
  } catch (e) {}
  return out;
}

// Tandai / batalkan QC selesai secara MANUAL (Lead/Admin) — independen dari pct.
// Kolom QC_Project (1-based): 6=Selesai Manual, 7=Ditandai Oleh, 8=Ditandai Pada.
function tandaiQCSelesai(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _qcProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 6, 1, 3).setValues([['Ya', (oleh || '').toString(), when]]);
        return { success: true, message: 'QC ' + noWO + ' ditandai selesai.' };
      }
    }
    return { success: false, message: 'WO tidak terdaftar di QC.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
function batalkanQCSelesai(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _qcProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 6, 1, 3).setValues([['', '', '']]);
        return { success: true, message: 'Tanda selesai QC dibatalkan.' };
      }
    }
    return { success: false, message: 'WO tidak terdaftar di QC.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// WO yang BELUM terdaftar di QC (untuk dropdown "Tambah Project").
function getAvailableWOForQC() {
  try {
    var reg = {};
    _qcRegisteredWOs().forEach(function (w) { reg[w.noWO] = true; });
    var woList = [];
    try { woList = getWorkOrderList() || []; } catch (e) {}
    var list = woList.filter(function (wo) { return !reg[wo.noWO]; })
      .map(function (wo) { return { noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status }; });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Daftarkan 1 WO ke QC (opsional sekaligus assign site engineer).
function addQCProject(noWO, userIds, addedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _qcProjectSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) return { success: false, message: 'Work Order sudah ada di daftar QC.' };
    }
    var proj = '', klien = '';
    try {
      var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
      if (wo) { proj = wo.namaProject || ''; klien = wo.namaKlien || ''; }
    } catch (e) {}
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.appendRow([noWO, proj, klien, (addedBy || '').toString(), when]);
    try { lock.releaseLock(); } catch (e) {}
    if (userIds && userIds.length) setQCAssignment(noWO, userIds, addedBy);
    return { success: true, message: 'Work Order ditambahkan ke QC.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Keluarkan 1 WO dari daftar QC (foto & penugasan tidak dihapus).
function removeQCProject(noWO) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _qcProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var removed = false;
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) { sheet.deleteRow(i + 1); removed = true; }
    }
    return { success: removed, message: removed ? 'Work Order dikeluarkan dari QC.' : 'Work Order tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Dashboard: ringkasan WO (opsional filter utk site engineer) ─────────────
// opts.siteUserId → hanya WO yang di-assign ke user itu.
// Parse timestamp "dd/MM/yyyy HH:mm" (format yg disimpan di sheet) → Date|null.
function _qcParseTs(s) {
  s = (s || '').toString().trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), 0);
}

function getQCDashboard(opts) {
  try {
    var ss = getSpreadsheet();
    // % memakai rumus yang SAMA dgn detail (_qcCountSummary): approved di antara
    // item WAJIB dibagi total item wajib — item opsional/N-A tak masuk hitungan.
    var master = getQCChecklist().list;
    var masterCount = master.length;
    var wajibTotal = 0, wajibKode = {}, labelMap = {};
    master.forEach(function (m) { labelMap[m.kode] = m.label; if (m.wajib) { wajibTotal++; wajibKode[m.kode] = true; } });

    var assignedMap = _qcAssignedMap();
    var siteUserId = (opts && opts.siteUserId) ? opts.siteUserId.toString().trim() : '';
    // Hanya WO yang terdaftar di QC (bukan seluruh WO). Nama project/klien pakai
    // snapshot registry — hindari getWorkOrderList() yang berat di jalur panas.
    var woList = _qcRegisteredWOs().map(function (r) {
      return { noWO: r.noWO, namaProject: r.namaProject, namaKlien: r.namaKlien, status: '', selesaiManual: !!r.selesaiManual };
    });
    if (siteUserId) {
      woList = woList.filter(function (wo) {
        return (assignedMap[wo.noWO] || []).some(function (a) { return a.id === siteUserId; });
      });
    }
    var visible = {}, woName = {};
    woList.forEach(function (wo) { visible[wo.noWO] = true; woName[wo.noWO] = wo.namaProject; });

    var itemSheet = _ensureQCItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var now = new Date();
    var byWO = {}, reviewQueue = [], teamAgg = {};
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][1] || '').toString().trim();
      if (!w || !visible[w]) continue;
      if (!byWO[w]) byWO[w] = { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0, wajibApproved: 0 };
      var st = (data[i][4] || '').toString();
      var kd = (data[i][2] || '').toString().trim();
      byWO[w].touched++;
      if (st === 'Approved') { byWO[w].approved++; if (wajibKode[kd]) byWO[w].wajibApproved++; }
      else if (st === 'Pending') byWO[w].pending++;
      else if (st === 'Rejected') byWO[w].rejected++;
      else if (st === 'NA') byWO[w].na++;

      var upBy = (data[i][6] || '').toString().trim();
      var upPada = (data[i][7] || '').toString().trim();
      var acts = _qcParseActivity(data[i][10]);

      // Antrean review: item Pending (menunggu keputusan Lead) + umur menunggu.
      if (st === 'Pending') {
        var ts = _qcParseTs(upPada);
        reviewQueue.push({
          noWO: w, namaProject: woName[w] || '', kode: kd, label: labelMap[kd] || kd,
          uploadedBy: upBy, uploadedPada: upPada,
          ageDays: ts ? Math.floor((now - ts) / 86400000) : null
        });
      }

      // Statistik tim: diatribusikan ke pengupload terakhir (Diupload Oleh).
      if (upBy) {
        var t = teamAgg[upBy] || (teamAgg[upBy] = { nama: upBy, items: 0, approved: 0, pending: 0, rejected: 0, ftr: 0, reviewed: 0, everRejected: 0, wos: {} });
        t.items++; t.wos[w] = true;
        if (st === 'Approved') t.approved++;
        else if (st === 'Pending') t.pending++;
        else if (st === 'Rejected') t.rejected++;
        var hasReject = acts.some(function (e) { return e.type === 'reject'; });
        var hasReview = acts.some(function (e) { return e.type === 'reject' || e.type === 'approve'; });
        if (hasReview) t.reviewed++;
        if (hasReject) t.everRejected++;
        if (st === 'Approved' && !hasReject) t.ftr++;   // lolos sekali review (tanpa revisi)
      }
    }

    var global = { totalWO: 0, approved: 0, pending: 0, rejected: 0, belum: 0 };
    var perWO = woList.map(function (wo) {
      var g = byWO[wo.noWO] || { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0, wajibApproved: 0 };
      var belum = Math.max(0, masterCount - g.touched);
      var pct = wajibTotal ? Math.round((g.wajibApproved / wajibTotal) * 100) : 0;
      global.totalWO++; global.approved += g.approved; global.pending += g.pending;
      global.rejected += g.rejected; global.belum += belum;
      return {
        noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status,
        total: masterCount, approved: g.approved, pending: g.pending, rejected: g.rejected, na: g.na, belum: belum, pct: pct,
        selesaiManual: !!wo.selesaiManual,
        assigned: assignedMap[wo.noWO] || []
      };
    });
    perWO.sort(function (a, b) { return (b.noWO || '').localeCompare((a.noWO || ''), undefined, { numeric: true }); });

    reviewQueue.sort(function (a, b) { return (b.ageDays == null ? -1 : b.ageDays) - (a.ageDays == null ? -1 : a.ageDays); });
    var teamStats = Object.keys(teamAgg).map(function (name) {
      var t = teamAgg[name];
      return {
        nama: t.nama, items: t.items, approved: t.approved, pending: t.pending, rejected: t.rejected,
        woCount: Object.keys(t.wos).length,
        ftrPct: t.approved ? Math.round(t.ftr / t.approved * 100) : null,
        rejectRatePct: t.reviewed ? Math.round(t.everRejected / t.reviewed * 100) : null
      };
    }).sort(function (a, b) { return b.items - a.items; });

    return { success: true, global: global, perWO: perWO, reviewQueue: reviewQueue, teamStats: teamStats };
  } catch (e) {
    return { success: false, message: e.toString(), global: {}, perWO: [] };
  }
}
