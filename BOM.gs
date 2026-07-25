/**
 * BOM.gs — Bill of Material per Work Order.
 *
 * Tim engineer menyusun daftar material yang akan dipakai di sebuah project
 * (Work Order). Item diambil dari pricelist supplier (getPricelistAll) —
 * nama material, merek, supplier, satuan — plus qty. Tanpa harga. Item
 * dikelompokkan per Kategori (dari pricelist). Pola mengikuti modul QC:
 * Lead Engineer mendaftarkan WO + assign Site Engineer; yang boleh edit =
 * Site Engineer yg di-assign + Lead + Admin. Lead bisa "Finalkan" (Draft→
 * Final) mengunci BOM, dan membukanya kembali.
 *
 * Sheet:
 *  - BOM_Project    : No WO | Nama Project | Nama Klien | Status(Draft/Final) |
 *                     Ditambahkan Oleh | Ditambahkan Pada | Difinalkan Oleh | Difinalkan Pada
 *  - BOM_Assignment : No WO | ID User | Nama User | Assigned By | Assigned At
 *  - BOM_Item       : ID(BOM###) | No WO | Kategori | Pricelist ID | Nama Material |
 *                     Merek | Supplier | Satuan | Qty | Catatan | Dibuat Oleh | Dibuat Pada
 */

// ── Sheet helpers ───────────────────────────────────────────────────────────
function _ensureBOMProjectSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('BOM_Project');
  if (sheet) return sheet;
  sheet = ss.insertSheet('BOM_Project');
  sheet.appendRow(['No WO', 'Nama Project', 'Nama Klien', 'Status', 'Ditambahkan Oleh', 'Ditambahkan Pada', 'Difinalkan Oleh', 'Difinalkan Pada']);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  return sheet;
}

function _bomAssignmentSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('BOM_Assignment');
  if (sheet) return sheet;
  sheet = ss.insertSheet('BOM_Assignment');
  sheet.appendRow(['No WO', 'ID User', 'Nama User', 'Assigned By', 'Assigned At']);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  return sheet;
}

function _ensureBOMItemSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('BOM_Item');
  if (sheet) return sheet;
  sheet = ss.insertSheet('BOM_Item');
  sheet.appendRow(['ID', 'No WO', 'Kategori', 'Pricelist ID', 'Nama Material', 'Merek', 'Supplier', 'Satuan', 'Qty', 'Catatan', 'Dibuat Oleh', 'Dibuat Pada']);
  sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  return sheet;
}

function _bomNextId(sheet) {
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var m = (ids[i][0] || '').toString().match(/^BOM(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return 'BOM' + ('000' + (maxNum + 1)).slice(-3);
}

function _bomNow() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

// ── Registry (WO yang masuk BOM + status Draft/Final) ───────────────────────
function _bomRegisteredWOs() {
  var out = [];
  try {
    var sheet = _ensureBOMProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][0] || '').toString().trim();
      if (!w) continue;
      out.push({
        noWO: w, namaProject: (data[i][1] || '').toString(), namaKlien: (data[i][2] || '').toString(),
        status: (data[i][3] || 'Draft').toString()
      });
    }
  } catch (e) {}
  return out;
}

// Status BOM 1 WO: 'Draft' | 'Final' | '' (belum terdaftar).
function _bomStatusOf(noWO) {
  noWO = (noWO || '').toString().trim();
  var regs = _bomRegisteredWOs();
  for (var i = 0; i < regs.length; i++) if (regs[i].noWO === noWO) return regs[i].status || 'Draft';
  return '';
}

// Guard mutasi item: WO ada & belum Closed, BOM belum Final.
function _bomEditGuard(noWO) {
  noWO = (noWO || '').toString().trim();
  if (!noWO) return { ok: false, message: 'No WO wajib.' };
  var stWO = '';
  try { stWO = _getStatusWO(noWO); } catch (e) {}
  if (!stWO) return { ok: false, message: 'Work Order tidak ditemukan.' };
  if (stWO === 'Closed') return { ok: false, message: 'Work Order sudah Closed — BOM terkunci.' };
  if (_bomStatusOf(noWO) === 'Final') return { ok: false, message: 'BOM sudah Final — buka kembali dulu untuk mengedit.' };
  return { ok: true };
}

// WO yang BELUM terdaftar di BOM (untuk dropdown "Tambah Project").
function getAvailableWOForBOM() {
  try {
    var reg = {};
    _bomRegisteredWOs().forEach(function (w) { reg[w.noWO] = true; });
    var woList = [];
    try { woList = getWorkOrderList() || []; } catch (e) {}
    var list = woList.filter(function (wo) { return !reg[wo.noWO]; })
      .map(function (wo) { return { noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status }; });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Daftarkan 1 WO ke BOM (opsional sekaligus assign site engineer).
function addBOMProject(noWO, userIds, addedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMProjectSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) return { success: false, message: 'Work Order sudah ada di daftar BOM.' };
    }
    var proj = '', klien = '';
    try {
      var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
      if (wo) { proj = wo.namaProject || ''; klien = wo.namaKlien || ''; }
    } catch (e) {}
    sheet.appendRow([noWO, proj, klien, 'Draft', (addedBy || '').toString(), _bomNow(), '', '']);
    try { lock.releaseLock(); } catch (e) {}
    if (userIds && userIds.length) setBOMAssignment(noWO, userIds, addedBy);
    return { success: true, message: 'Work Order ditambahkan ke BOM.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Keluarkan 1 WO dari daftar BOM (item & penugasan tidak dihapus).
function removeBOMProject(noWO) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _ensureBOMProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var removed = false;
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) { sheet.deleteRow(i + 1); removed = true; }
    }
    return { success: removed, message: removed ? 'Work Order dikeluarkan dari BOM.' : 'Work Order tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Penugasan (mirror QC) ───────────────────────────────────────────────────
function _bomAssignedMap() {
  var map = {};
  try {
    var sheet = _bomAssignmentSheet(getSpreadsheet());
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

function getBOMAssignment(noWO) {
  try {
    var m = _bomAssignedMap();
    return { success: true, list: m[(noWO || '').toString().trim()] || [] };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

function setBOMAssignment(noWO, userIds, assignedBy) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    userIds = userIds || [];
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _bomAssignmentSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) sheet.deleteRow(i + 1);
    }
    var userMap = {};
    try { (getUserList() || []).forEach(function (u) { userMap[u.id] = u.nama; }); } catch (e) {}
    var when = _bomNow();
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

// ── Dashboard: daftar WO ber-BOM (opsional filter site engineer) ────────────
function getBOMDashboard(opts) {
  try {
    var ss = getSpreadsheet();
    var assignedMap = _bomAssignedMap();
    var siteUserId = (opts && opts.siteUserId) ? opts.siteUserId.toString().trim() : '';
    var regs = _bomRegisteredWOs();
    if (siteUserId) {
      regs = regs.filter(function (r) {
        return (assignedMap[r.noWO] || []).some(function (a) { return a.id === siteUserId; });
      });
    }
    var visible = {};
    regs.forEach(function (r) { visible[r.noWO] = true; });

    // Hitung jumlah item & kategori per WO dari BOM_Item.
    var itemSheet = _ensureBOMItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var cnt = {}, katSet = {};
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][1] || '').toString().trim();
      if (!w || !visible[w]) continue;
      cnt[w] = (cnt[w] || 0) + 1;
      var kat = (data[i][2] || 'Lainnya').toString().trim() || 'Lainnya';
      if (!katSet[w]) katSet[w] = {};
      katSet[w][kat] = true;
    }

    var perWO = regs.map(function (r) {
      return {
        noWO: r.noWO, namaProject: r.namaProject, namaKlien: r.namaKlien, status: r.status,
        jumlahItem: cnt[r.noWO] || 0,
        jumlahKategori: katSet[r.noWO] ? Object.keys(katSet[r.noWO]).length : 0,
        assigned: assignedMap[r.noWO] || []
      };
    });

    var totalItem = 0, totalFinal = 0;
    perWO.forEach(function (w) { totalItem += w.jumlahItem; if (w.status === 'Final') totalFinal++; });

    return {
      success: true,
      perWO: perWO,
      global: { jumlahWO: perWO.length, jumlahItem: totalItem, jumlahFinal: totalFinal, jumlahDraft: perWO.length - totalFinal }
    };
  } catch (e) {
    return { success: false, perWO: [], global: {}, message: e.toString() };
  }
}

// ── Detail per WO ───────────────────────────────────────────────────────────
function getBOMByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var items = [];
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() !== noWO) continue;
      items.push({
        id:           (data[i][0] || '').toString(),
        kategori:     (data[i][2] || 'Lainnya').toString().trim() || 'Lainnya',
        pricelistId:  (data[i][3] || '').toString(),
        namaMaterial: (data[i][4] || '').toString(),
        merek:        (data[i][5] || '').toString(),
        supplier:     (data[i][6] || '').toString(),
        satuan:       (data[i][7] || '').toString(),
        qty:          Number(data[i][8]) || 0,
        catatan:      (data[i][9] || '').toString(),
        dibuatOleh:   (data[i][10] || '').toString(),
        dibuatPada:   (data[i][11] || '').toString()
      });
    }
    var woStatus = '';
    try { woStatus = _getStatusWO(noWO) || ''; } catch (e) {}
    return {
      success: true,
      status: _bomStatusOf(noWO) || 'Draft',
      woStatus: woStatus,
      assigned: _bomAssignedMap()[noWO] || [],
      items: items
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Item CRUD ───────────────────────────────────────────────────────────────
// payload: { noWO, kategori, pricelistId, namaMaterial, merek, supplier, satuan, qty, catatan, oleh }
function addBOMItem(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var nama = (payload.namaMaterial || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (!nama) return { success: false, message: 'Nama material wajib diisi.' };
    var qty = Number(payload.qty) || 0;
    if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };

    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    SpreadsheetApp.flush();
    var id = _bomNextId(sheet);
    sheet.appendRow([
      id, noWO, (payload.kategori || 'Lainnya').toString().trim() || 'Lainnya',
      (payload.pricelistId || '').toString(), nama,
      (payload.merek || '').toString(), (payload.supplier || '').toString(),
      (payload.satuan || '').toString(), qty, (payload.catatan || '').toString(),
      (payload.oleh || '').toString(), _bomNow()
    ]);
    return { success: true, message: 'Material ' + id + ' ditambahkan.', id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function updateBOMItem(id, payload) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    payload = payload || {};
    if (!id) return { success: false, message: 'ID item wajib.' };
    var nama = (payload.namaMaterial || '').toString().trim();
    if (!nama) return { success: false, message: 'Nama material wajib diisi.' };
    var qty = Number(payload.qty) || 0;
    if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };

    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var noWO = (data[i][1] || '').toString().trim();
        var guard = _bomEditGuard(noWO);
        if (!guard.ok) return { success: false, message: guard.message };
        // Kolom 3–10 (Kategori s.d. Catatan)
        sheet.getRange(i + 1, 3, 1, 8).setValues([[
          (payload.kategori || 'Lainnya').toString().trim() || 'Lainnya',
          (payload.pricelistId || '').toString(), nama,
          (payload.merek || '').toString(), (payload.supplier || '').toString(),
          (payload.satuan || '').toString(), qty, (payload.catatan || '').toString()
        ]]);
        return { success: true, message: 'Material ' + id + ' diperbarui.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusBOMItem(id) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID item wajib.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var noWO = (data[i][1] || '').toString().trim();
        var guard = _bomEditGuard(noWO);
        if (!guard.ok) return { success: false, message: guard.message };
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Material dihapus.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Finalisasi (Lead/Admin) ─────────────────────────────────────────────────
function _bomSetStatus(noWO, status, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureBOMProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 4).setValue(status);
        if (status === 'Final') sheet.getRange(i + 1, 7, 1, 2).setValues([[(oleh || '').toString(), _bomNow()]]);
        else sheet.getRange(i + 1, 7, 1, 2).setValues([['', '']]);
        return { success: true, message: status === 'Final' ? 'BOM difinalkan.' : 'BOM dibuka kembali (Draft).' };
      }
    }
    return { success: false, message: 'Work Order belum terdaftar di BOM.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function finalizeBOM(noWO, oleh) {
  var stWO = '';
  try { stWO = _getStatusWO(noWO); } catch (e) {}
  if (stWO === 'Closed') return { success: false, message: 'Work Order sudah Closed.' };
  return _bomSetStatus(noWO, 'Final', oleh);
}

function reopenBOM(noWO, oleh) {
  return _bomSetStatus(noWO, 'Draft', oleh);
}
