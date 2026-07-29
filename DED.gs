/**
 * DED.gs — RenusPro
 * Modul Detail Engineering Design: upload dokumen (PDF) per Work Order dari
 * Site Engineer, review approve/reject oleh Lead Engineer, dengan master
 * "Kelola Checklist" jenis dokumen (datar, tanpa section).
 *
 * Mirror pola modul QC (QC.gs) — file disimpan di Google Drive, sheet hanya
 * menyimpan metadata JSON {fileId, fileUrl, fileName, by, at}.
 *
 * Sheet:
 *   DED_Checklist  : Kode | Label | Wajib | Urutan | Instruksi
 *   DED_Item       : ID | No WO | Kode | Files | Status | Catatan Review |
 *                    Diupload Oleh | Diupload Pada | Direview Oleh | Direview Pada | Aktivitas
 *   DED_Project    : No WO | Nama Project | Nama Klien | Ditambahkan Oleh |
 *                    Ditambahkan Pada | Selesai Manual | Ditandai Oleh | Ditandai Pada
 *   DED_Assignment : No WO | ID User | Nama User | Assigned By | Assigned At
 *
 * Status item ∈ Belum Upload | Pending | Approved | Rejected | NA
 * Role gating di frontend (JS_DED.html): Site Engineer upload; Lead/Admin review+assign+kelola.
 */

// ── Drive folder ──────────────────────────────────────────────────────────────
function _getDEDFolder(noWO) {
  var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
  var parents = ssFile.getParents();
  var root = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var baseName = 'RenusPro - DED';
  var baseIt = root.getFoldersByName(baseName);
  var base = baseIt.hasNext() ? baseIt.next() : root.createFolder(baseName);
  noWO = (noWO || 'TANPA-WO').toString().trim() || 'TANPA-WO';
  var subIt = base.getFoldersByName(noWO);
  return subIt.hasNext() ? subIt.next() : base.createFolder(noWO);
}

// ── Helper JSON (files & aktivitas) ──────────────────────────────────────────
function _dedParseFiles(v) {
  try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function _dedParseActivity(cell) {
  try { var a = JSON.parse(cell || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function _dedAppendActivity(sheet, rowIdx, ev) {
  var cur = _dedParseActivity(sheet.getRange(rowIdx, 11).getValue());
  cur.push(ev);
  sheet.getRange(rowIdx, 11).setValue(JSON.stringify(cur));
}
function _dedNow() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

// ── Sheet: DED_Item ──────────────────────────────────────────────────────────
function _ensureDEDItemSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('DED_Item');
  if (sheet) return sheet;
  sheet = ss.insertSheet('DED_Item');
  sheet.appendRow(['ID', 'No WO', 'Kode', 'Files', 'Status', 'Catatan Review',
    'Diupload Oleh', 'Diupload Pada', 'Direview Oleh', 'Direview Pada', 'Aktivitas']);
  sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  return sheet;
}
function _dedNextId(sheet) {
  var lastRow = sheet.getLastRow(), maxNum = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var m = (ids[i][0] || '').toString().match(/^DEDI(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return 'DEDI' + ('000' + (maxNum + 1)).slice(-3);
}
function _dedFindItemRow(sheet, noWO, kode) {
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

// ── Master checklist (datar) ─────────────────────────────────────────────────
function _ensureDEDChecklistSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('DED_Checklist');
  if (sheet) return sheet;
  sheet = ss.insertSheet('DED_Checklist');
  sheet.appendRow(['Kode', 'Label', 'Wajib', 'Urutan', 'Instruksi']);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  // Seed jenis dokumen DED umum.
  var seed = [
    ['Single Line Diagram (SLD)', 'Ya'],
    ['Layout / Denah Panel', 'Ya'],
    ['Wiring Diagram', 'Ya'],
    ['Perhitungan / Load Schedule', 'Ya'],
    ['Layout Pemasangan PLTS', 'Ya'],
    ['Datasheet Komponen', 'Tidak'],
    ['BoQ / RAB Teknis', 'Tidak']
  ];
  var rows = seed.map(function (s, i) { return ['D' + ('00' + (i + 1)).slice(-3), s[0], s[1], i + 1, '']; });
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  return sheet;
}
function _dedInvalidateChecklistCache() {
  try { CacheService.getScriptCache().remove('cache_ded_checklist'); } catch (e) {}
}
function getDEDChecklist() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('cache_ded_checklist');
    if (cached) { try { return JSON.parse(cached); } catch (e) {} }
    var sheet = _ensureDEDChecklistSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      list.push({
        kode:      data[i][0].toString(),
        label:     data[i][1] ? data[i][1].toString() : '',
        wajib:     (data[i][2] != null && data[i][2].toString().trim().toLowerCase() === 'ya'),
        urutan:    Number(data[i][3]) || i,
        instruksi: data[i][4] ? data[i][4].toString() : ''
      });
    }
    list.sort(function (a, b) { return a.urutan - b.urutan; });
    var out = { success: true, list: list };
    try { var j = JSON.stringify(out); if (j.length < 95000) cache.put('cache_ded_checklist', j, CACHE_TTL); } catch (e) {}
    return out;
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}
function _dedNextItemCode(sheet) {
  var lastRow = sheet.getLastRow(), maxNum = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var m = (ids[i][0] || '').toString().match(/^D(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return 'D' + ('00' + (maxNum + 1)).slice(-3);
}
function tambahDEDItem(label, wajib, instruksi) {
  var lock = LockService.getScriptLock();
  try {
    label = (label || '').toString().trim();
    if (!label) return { success: false, message: 'Nama dokumen wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _ensureDEDChecklistSheet(getSpreadsheet());
    var kode = _dedNextItemCode(sheet);
    var urut = Math.max(0, sheet.getLastRow() - 1) + 1;
    sheet.appendRow([kode, label, wajib ? 'Ya' : 'Tidak', urut, (instruksi || '').toString()]);
    _dedInvalidateChecklistCache();
    return { success: true, message: 'Dokumen "' + label + '" ditambahkan.', kode: kode };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
function updateDEDItem(kode, label, wajib, instruksi) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    label = (label || '').toString().trim();
    if (!kode) return { success: false, message: 'Kode wajib.' };
    if (!label) return { success: false, message: 'Nama dokumen wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _ensureDEDChecklistSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === kode) {
        sheet.getRange(i + 1, 2).setValue(label);
        sheet.getRange(i + 1, 3).setValue(wajib ? 'Ya' : 'Tidak');
        sheet.getRange(i + 1, 5).setValue((instruksi || '').toString());
        _dedInvalidateChecklistCache();
        return { success: true, message: 'Dokumen diperbarui.' };
      }
    }
    return { success: false, message: 'Dokumen tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
function setDEDWajib(kode, wajib) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    if (!kode) return { success: false, message: 'Kode wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureDEDChecklistSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === kode) {
        sheet.getRange(i + 1, 3).setValue(wajib ? 'Ya' : 'Tidak');
        _dedInvalidateChecklistCache();
        return { success: true, message: 'Diperbarui.' };
      }
    }
    return { success: false, message: 'Dokumen tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
function hapusDEDItem(kode) {
  var lock = LockService.getScriptLock();
  try {
    kode = (kode || '').toString().trim();
    if (!kode) return { success: false, message: 'Kode wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureDEDChecklistSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === kode) {
        sheet.deleteRow(i + 1);
        _dedInvalidateChecklistCache();
        return { success: true, message: 'Dokumen dihapus.' };
      }
    }
    return { success: false, message: 'Dokumen tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Detail per WO (master × DED_Item) ────────────────────────────────────────
function _dedMergeItem(master, itemRow) {
  var files = itemRow ? _dedParseFiles(itemRow[3]) : [];
  var status = itemRow && itemRow[4] ? itemRow[4].toString() : (files.length ? 'Pending' : 'Belum Upload');
  return {
    kode:          master.kode,
    label:         master.label,
    wajib:         master.wajib,
    urutan:        master.urutan,
    instruksi:     master.instruksi || '',
    files:         files,
    status:        status,
    catatanReview: itemRow && itemRow[5] ? itemRow[5].toString() : '',
    uploadedBy:    itemRow && itemRow[6] ? itemRow[6].toString() : '',
    uploadedPada:  itemRow && itemRow[7] ? itemRow[7].toString() : '',
    reviewedBy:    itemRow && itemRow[8] ? itemRow[8].toString() : '',
    reviewedPada:  itemRow && itemRow[9] ? itemRow[9].toString() : '',
    activity:      itemRow ? _dedParseActivity(itemRow[10]) : []
  };
}
function _dedCountSummary(list) {
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
function getDEDByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, list: [], message: 'No WO wajib diisi.' };
    var ss = getSpreadsheet();
    var master = getDEDChecklist().list;
    var itemSheet = _ensureDEDItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var rowMap = {};
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() === noWO) rowMap[(data[i][2] || '').toString().trim()] = data[i];
    }
    var list = master.map(function (m) { return _dedMergeItem(m, rowMap[m.kode] || null); });
    var proj = _dedRegisteredWOs().filter(function (p) { return p.noWO === noWO; })[0] || {};
    return {
      success: true, list: list, summary: _dedCountSummary(list),
      selesaiManual: !!proj.selesaiManual, ditandaiOleh: proj.ditandaiOleh || '', ditandaiPada: proj.ditandaiPada || ''
    };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// ── Upload dokumen PDF (batch, banyak file) ──────────────────────────────────
// payload: { noWO, kode, oleh, files:[{base64Data, fileName, mimeType}] }
function uploadDEDBatch(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var kode = (payload.kode || '').toString().trim();
    var oleh = (payload.oleh || '').toString();
    var files = (payload.files && payload.files.length) ? payload.files : [];
    if (!noWO || !kode) return { success: false, message: 'No WO & kode dokumen wajib.' };
    if (!files.length) return { success: false, message: 'Tidak ada file untuk diupload.' };

    // Validasi SEMUA file sebagai PDF (magic number %PDF dari isi, bukan mimeType
    // klien) sebelum membuat file apa pun — hindari upload parsial.
    var decoded = [];
    for (var f = 0; f < files.length; f++) {
      var b64 = files[f].base64Data ? files[f].base64Data.toString() : '';
      if (!b64) continue;
      var bytes = Utilities.base64Decode(b64);
      if (!(bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        return { success: false, message: 'Hanya file PDF yang diperbolehkan (' + (files[f].fileName || 'file') + ').' };
      }
      decoded.push({ bytes: bytes, fileName: (files[f].fileName || '').toString() });
    }
    if (!decoded.length) return { success: false, message: 'Tidak ada file valid.' };

    lock.waitLock(30000);
    var ss = getSpreadsheet();
    var sheet = _ensureDEDItemSheet(ss);
    var when = _dedNow();
    var found = _dedFindItemRow(sheet, noWO, kode);
    var arr = found ? _dedParseFiles(found.row[3]) : [];
    var wasStatus = found ? (found.row[4] || '').toString() : 'Belum Upload';
    var folder = _getDEDFolder(noWO);
    var added = [], evts = [];

    decoded.forEach(function (d) {
      var baseName = (d.fileName.replace(/\.[a-zA-Z0-9]+$/, '') || kode);
      var fileName = kode + '-' + (arr.length + added.length + 1) + '-' + baseName + '.pdf';
      var blob = Utilities.newBlob(d.bytes, 'application/pdf', fileName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      added.push({ fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName, by: oleh, at: when });
      evts.push({ type: 'upload', by: oleh, at: when, note: fileName });
    });

    var all = arr.concat(added);
    if (found) {
      sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(all));
      sheet.getRange(found.rowIdx, 5).setValue('Pending');
      sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[oleh, when]]);
      evts.forEach(function (ev) { _dedAppendActivity(sheet, found.rowIdx, ev); });
    } else {
      sheet.appendRow([_dedNextId(sheet), noWO, kode, JSON.stringify(all), 'Pending', '', oleh, when, '', '', JSON.stringify(evts)]);
    }

    // Notifikasi WA ke Lead (dokumen baru perlu direview). Aman bila WA off/belum ada.
    try { if (typeof _dedNotifLeadReview === 'function') _dedNotifLeadReview(noWO, kode, oleh, added.length, wasStatus); } catch (e) {}

    return { success: true, message: added.length + ' dokumen terupload.', count: added.length, status: 'Pending', file_list: all };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusDEDFile(noWO, kode, fileId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureDEDItemSheet(ss);
    var found = _dedFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Item tidak ditemukan.' };
    var arr = _dedParseFiles(found.row[3]).filter(function (f) { return f.fileId !== fileId; });
    sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(arr));
    if (!arr.length) sheet.getRange(found.rowIdx, 5).setValue('Belum Upload');
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    return { success: true, message: 'Dokumen dihapus.', file_list: arr };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Review (approve/reject) ──────────────────────────────────────────────────
function reviewDEDItem(noWO, kode, keputusan, catatan, reviewer) {
  var lock = LockService.getScriptLock();
  try {
    keputusan = (keputusan || '').toString();
    if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
    catatan = (catatan || '').toString();
    if (keputusan === 'Rejected' && !catatan.trim()) return { success: false, message: 'Catatan revisi wajib diisi untuk menolak.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureDEDItemSheet(ss);
    var found = _dedFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Belum ada dokumen untuk item ini.' };
    var when = _dedNow();
    sheet.getRange(found.rowIdx, 5).setValue(keputusan);
    sheet.getRange(found.rowIdx, 6).setValue(catatan);
    sheet.getRange(found.rowIdx, 9, 1, 2).setValues([[(reviewer || '').toString(), when]]);
    _dedAppendActivity(sheet, found.rowIdx, {
      type: keputusan === 'Approved' ? 'approve' : 'reject',
      by: (reviewer || '').toString(), at: when, note: catatan
    });
    try { if (typeof _dedNotifSiteReview === 'function') _dedNotifSiteReview(noWO, kode, keputusan, catatan); } catch (e) {}
    return { success: true, message: 'Dokumen ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
function cancelDEDApproval(noWO, kode, oleh) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureDEDItemSheet(ss);
    var found = _dedFindItemRow(sheet, noWO, kode);
    if (!found) return { success: false, message: 'Item tidak ditemukan.' };
    if ((found.row[4] || '').toString() !== 'Approved') return { success: false, message: 'Hanya dokumen berstatus Approved yang bisa dibatalkan.' };
    var arr = _dedParseFiles(found.row[3]);
    sheet.getRange(found.rowIdx, 5).setValue(arr.length ? 'Pending' : 'Belum Upload');
    sheet.getRange(found.rowIdx, 6).setValue('');
    sheet.getRange(found.rowIdx, 9, 1, 2).setValues([['', '']]);
    _dedAppendActivity(sheet, found.rowIdx, { type: 'cancel', by: (oleh || '').toString(), at: _dedNow(), note: '' });
    return { success: true, message: 'Persetujuan dibatalkan — kembali ke Pending.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
function setDEDItemNA(noWO, kode, isNA, oleh) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureDEDItemSheet(ss);
    var when = _dedNow();
    var found = _dedFindItemRow(sheet, noWO, kode);
    if (isNA) {
      var naEv = { type: 'na', by: (oleh || '').toString(), at: when, note: '' };
      if (found) {
        sheet.getRange(found.rowIdx, 5).setValue('NA');
        sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[(oleh || '').toString(), when]]);
        _dedAppendActivity(sheet, found.rowIdx, naEv);
      } else {
        sheet.appendRow([_dedNextId(sheet), noWO, kode, '[]', 'NA', '', (oleh || '').toString(), when, '', '', JSON.stringify([naEv])]);
      }
    } else if (found) {
      var arr = _dedParseFiles(found.row[3]);
      sheet.getRange(found.rowIdx, 5).setValue(arr.length ? 'Pending' : 'Belum Upload');
    }
    return { success: true, message: 'Status dokumen diperbarui.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Penugasan (Lead assign Site Engineer) ────────────────────────────────────
function _dedAssignmentSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('DED_Assignment');
  if (sheet) return sheet;
  sheet = ss.insertSheet('DED_Assignment');
  sheet.appendRow(['No WO', 'ID User', 'Nama User', 'Assigned By', 'Assigned At']);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  return sheet;
}
function _dedAssignedMap() {
  var map = {};
  try {
    var sheet = _dedAssignmentSheet(getSpreadsheet());
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
function getDEDAssignment(noWO) {
  try {
    var m = _dedAssignedMap();
    return { success: true, list: m[(noWO || '').toString().trim()] || [] };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}
function setDEDAssignment(noWO, userIds, assignedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    userIds = userIds || [];
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _dedAssignmentSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) sheet.deleteRow(i + 1);
    }
    var userMap = {};
    try { (getUserList() || []).forEach(function (u) { userMap[u.id] = u.nama; }); } catch (e) {}
    var when = _dedNow();
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

// ── Registry Project DED ─────────────────────────────────────────────────────
function _dedProjectSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('DED_Project');
  if (!sheet) {
    sheet = ss.insertSheet('DED_Project');
    sheet.appendRow(['No WO', 'Nama Project', 'Nama Klien', 'Ditambahkan Oleh', 'Ditambahkan Pada', 'Selesai Manual', 'Ditandai Selesai Oleh', 'Ditandai Selesai Pada']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    return sheet;
  }
  if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 6, 1, 3).setValues([['Selesai Manual', 'Ditandai Selesai Oleh', 'Ditandai Selesai Pada']]).setFontWeight('bold');
  }
  return sheet;
}
function _dedRegisteredWOs() {
  var out = [];
  try {
    var sheet = _dedProjectSheet(getSpreadsheet());
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
function getAvailableWOForDED() {
  try {
    var reg = {};
    _dedRegisteredWOs().forEach(function (w) { reg[w.noWO] = true; });
    var woList = [];
    try { woList = getWorkOrderList() || []; } catch (e) {}
    var list = woList.filter(function (wo) { return !reg[wo.noWO]; })
      .map(function (wo) { return { noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status }; });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}
function addDEDProject(noWO, userIds, addedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _dedProjectSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) return { success: false, message: 'Work Order sudah ada di daftar DED.' };
    }
    var proj = '', klien = '';
    try {
      var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
      if (wo) { proj = wo.namaProject || ''; klien = wo.namaKlien || ''; }
    } catch (e) {}
    sheet.appendRow([noWO, proj, klien, (addedBy || '').toString(), _dedNow(), '', '', '']);
    try { lock.releaseLock(); } catch (e) {}
    if (userIds && userIds.length) setDEDAssignment(noWO, userIds, addedBy);
    return { success: true, message: 'Work Order ditambahkan ke DED.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
function removeDEDProject(noWO) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _dedProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var removed = false;
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) { sheet.deleteRow(i + 1); removed = true; }
    }
    return { success: removed, message: removed ? 'Work Order dikeluarkan dari DED.' : 'Work Order tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
// Tandai / batalkan DED selesai manual (Lead/Admin) — independen dari pct.
function tandaiDEDSelesai(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _dedProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var when = _dedNow();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 6, 1, 3).setValues([['Ya', (oleh || '').toString(), when]]);
        return { success: true, message: 'DED ' + noWO + ' ditandai Approved.' };
      }
    }
    return { success: false, message: 'WO tidak terdaftar di DED.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
function batalkanDEDSelesai(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _dedProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 6, 1, 3).setValues([['', '', '']]);
        return { success: true, message: 'Status Approved DED dibatalkan.' };
      }
    }
    return { success: false, message: 'WO tidak terdaftar di DED.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function getDEDDashboard(opts) {
  try {
    var ss = getSpreadsheet();
    var master = getDEDChecklist().list;
    var masterCount = master.length;
    var wajibTotal = 0, wajibKode = {}, labelMap = {};
    master.forEach(function (m) { labelMap[m.kode] = m.label; if (m.wajib) { wajibTotal++; wajibKode[m.kode] = true; } });

    var assignedMap = _dedAssignedMap();
    var siteUserId = (opts && opts.siteUserId) ? opts.siteUserId.toString().trim() : '';
    var woList = _dedRegisteredWOs().map(function (r) {
      return { noWO: r.noWO, namaProject: r.namaProject, namaKlien: r.namaKlien, status: '', selesaiManual: !!r.selesaiManual };
    });
    if (siteUserId) {
      woList = woList.filter(function (wo) {
        return (assignedMap[wo.noWO] || []).some(function (a) { return a.id === siteUserId; });
      });
    }
    var visible = {}, woName = {};
    woList.forEach(function (wo) { visible[wo.noWO] = true; woName[wo.noWO] = wo.namaProject; });

    var itemSheet = _ensureDEDItemSheet(ss);
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
      var acts = _dedParseActivity(data[i][10]);

      if (st === 'Pending') {
        var ts = _dedParseTs(upPada);
        reviewQueue.push({
          noWO: w, namaProject: woName[w] || '', kode: kd, label: labelMap[kd] || kd,
          uploadedBy: upBy, uploadedPada: upPada,
          ageDays: ts ? Math.floor((now - ts) / 86400000) : null
        });
      }

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
        if (st === 'Approved' && !hasReject) t.ftr++;
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

// Parse timestamp "dd/MM/yyyy HH:mm" → Date|null.
function _dedParseTs(s) {
  s = (s || '').toString().trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), 0);
}
