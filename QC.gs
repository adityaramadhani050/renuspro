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

// ── Sheets ────────────────────────────────────────────────────────────────
function _ensureQCChecklistMaster(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('QC_Checklist_Master');
  if (!sheet) {
    sheet = ss.insertSheet('QC_Checklist_Master');
    sheet.appendRow(['Kode', 'Section', 'Section Label', 'Label', 'Wajib', 'Urutan']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  if (sheet.getLastRow() <= 1) {
    var rows = _QC_MASTER_SEED.map(function (r, idx) {
      return [r[0], r[1], r[2], r[3], r[4] ? 'Ya' : 'Tidak', idx + 1];
    });
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  return sheet;
}

function _ensureQCItemSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('QC_Item');
  if (sheet) return sheet;
  sheet = ss.insertSheet('QC_Item');
  sheet.appendRow(['ID', 'No WO', 'Kode', 'Foto', 'Status', 'Catatan SPV',
    'Diupload Oleh', 'Diupload Pada', 'Direview Oleh', 'Direview Pada']);
  sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  return sheet;
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

// ── Master ────────────────────────────────────────────────────────────────
function getQCChecklist() {
  try {
    var ss = getSpreadsheet();
    var sheet = _ensureQCChecklistMaster(ss);
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      list.push({
        kode:         data[i][0].toString(),
        section:      data[i][1] ? data[i][1].toString() : '',
        sectionLabel: data[i][2] ? data[i][2].toString() : '',
        label:        data[i][3] ? data[i][3].toString() : '',
        wajib:        (data[i][4] != null && data[i][4].toString().trim().toLowerCase() === 'ya'),
        urutan:       Number(data[i][5]) || (i)
      });
    }
    list.sort(function (a, b) { return a.urutan - b.urutan; });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
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
    foto:         foto,
    status:       status,
    catatanSPV:   itemRow && itemRow[5] ? itemRow[5].toString() : '',
    uploadedBy:   itemRow && itemRow[6] ? itemRow[6].toString() : '',
    uploadedPada: itemRow && itemRow[7] ? itemRow[7].toString() : '',
    reviewedBy:   itemRow && itemRow[8] ? itemRow[8].toString() : '',
    reviewedPada: itemRow && itemRow[9] ? itemRow[9].toString() : ''
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
    return { success: true, list: list, summary: _qcCountSummary(list) };
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
    var fileName = payload.fileName ? payload.fileName.toString() : ('qc-' + kode + '.jpg');
    var mimeType = payload.mimeType ? payload.mimeType.toString() : 'image/jpeg';
    if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    // Upload ke Drive
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = _getQCFolder(noWO).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var foto = { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName,
                 by: (payload.oleh || '').toString(), at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') };

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureQCItemSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var found = _qcFindItemRow(sheet, noWO, kode);
    var arr;
    if (found) {
      arr = _qcParseFoto(found.row[3]); arr.push(foto);
      sheet.getRange(found.rowIdx, 4).setValue(JSON.stringify(arr));      // Foto
      sheet.getRange(found.rowIdx, 5).setValue('Pending');                // Status
      sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[foto.by, when]]); // Diupload Oleh/Pada
    } else {
      arr = [foto];
      sheet.appendRow([_qcNextId(sheet), noWO, kode, JSON.stringify(arr), 'Pending', '', foto.by, when, '', '']);
    }
    return { success: true, message: 'Foto tersimpan.', foto: foto, status: 'Pending', foto_list: arr };
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
    return { success: true, message: 'Item ' + kode + ' ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
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
      if (found) {
        sheet.getRange(found.rowIdx, 5).setValue('NA');
        sheet.getRange(found.rowIdx, 7, 1, 2).setValues([[(oleh || '').toString(), when]]);
      } else {
        sheet.appendRow([_qcNextId(sheet), noWO, kode, '[]', 'NA', '', (oleh || '').toString(), when, '', '']);
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

// ── Dashboard: ringkasan WO (opsional filter utk site engineer) ─────────────
// opts.siteUserId → hanya WO yang di-assign ke user itu.
function getQCDashboard(opts) {
  try {
    var ss = getSpreadsheet();
    var masterCount = getQCChecklist().list.length;
    var itemSheet = _ensureQCItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var byWO = {};
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][1] || '').toString().trim();
      if (!w) continue;
      if (!byWO[w]) byWO[w] = { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0 };
      var st = (data[i][4] || '').toString();
      byWO[w].touched++;
      if (st === 'Approved') byWO[w].approved++;
      else if (st === 'Pending') byWO[w].pending++;
      else if (st === 'Rejected') byWO[w].rejected++;
      else if (st === 'NA') byWO[w].na++;
    }
    var assignedMap = _qcAssignedMap();
    var siteUserId = (opts && opts.siteUserId) ? opts.siteUserId.toString().trim() : '';
    var woList = [];
    try { woList = getWorkOrderList() || []; } catch (e) {}
    if (siteUserId) {
      woList = woList.filter(function (wo) {
        return (assignedMap[wo.noWO] || []).some(function (a) { return a.id === siteUserId; });
      });
    }
    var global = { totalWO: 0, approved: 0, pending: 0, rejected: 0, belum: 0 };
    var perWO = woList.map(function (wo) {
      var g = byWO[wo.noWO] || { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0 };
      var belum = Math.max(0, masterCount - g.touched);
      var pct = masterCount ? Math.round((g.approved / masterCount) * 100) : 0;
      global.totalWO++; global.approved += g.approved; global.pending += g.pending;
      global.rejected += g.rejected; global.belum += belum;
      return {
        noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status,
        total: masterCount, approved: g.approved, pending: g.pending, rejected: g.rejected, na: g.na, belum: belum, pct: pct,
        assigned: assignedMap[wo.noWO] || []
      };
    });
    perWO.sort(function (a, b) { return (b.pending + b.rejected) - (a.pending + a.rejected); });
    return { success: true, global: global, perWO: perWO };
  } catch (e) {
    return { success: false, message: e.toString(), global: {}, perWO: [] };
  }
}
