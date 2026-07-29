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
  if (!sheet) {
    sheet = ss.insertSheet('BOM_Item');
    sheet.appendRow(['ID', 'No WO', 'Kategori', 'Pricelist ID', 'Nama Material', 'Merek', 'Supplier', 'Satuan', 'Qty', 'Catatan', 'Dibuat Oleh', 'Dibuat Pada', 'Status', 'Catatan Review', 'Direview Oleh', 'Direview Pada',
      'Proc Status', 'Stok ID', 'Qty Reserved', 'Mutasi Reserved', 'Qty Beli', 'Diproses Oleh', 'Diproses Pada']);
    sheet.getRange(1, 1, 1, 23).setFontWeight('bold');
    return sheet;
  }
  // Migrasi kolom review (approve/reject) untuk sheet lama.
  try {
    if (sheet.getLastColumn() < 16) {
      sheet.getRange(1, 13, 1, 4).setValues([['Status', 'Catatan Review', 'Direview Oleh', 'Direview Pada']]).setFontWeight('bold');
    }
    // Migrasi kolom procurement (Reserved/Need Purchase) untuk sheet lama.
    if (sheet.getLastColumn() < 23) {
      sheet.getRange(1, 17, 1, 7).setValues([['Proc Status', 'Stok ID', 'Qty Reserved', 'Mutasi Reserved', 'Qty Beli', 'Diproses Oleh', 'Diproses Pada']]).setFontWeight('bold');
    }
  } catch (e) {}
  return sheet;
}

// Status BOM diturunkan dari item: Final bila ada item & semua Approved.
function _bomDeriveStatus(approved, total) { return (total > 0 && approved === total) ? 'Final' : 'Draft'; }

// Tulis Status + Difinalkan Oleh/Pada ke BOM_Project. Hanya membaca sheet
// BOM_Project (kecil: 1 baris per WO) — TIDAK memindai BOM_Item, sehingga
// ringan dipanggil tiap approve/reject. olehIfFinal dicatat saat transisi
// Draft→Final; saat kembali Draft, catatan finalisasi dibersihkan.
// Kolom BOM_Project (1-based): 4=Status, 7=Difinalkan Oleh, 8=Difinalkan Pada.
function _bomWriteProjectStatus(noWO, status, olehIfFinal) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return;
    var projSheet = _ensureBOMProjectSheet(getSpreadsheet());
    var pdata = projSheet.getDataRange().getValues();
    for (var r = 1; r < pdata.length; r++) {
      if ((pdata[r][0] || '').toString().trim() !== noWO) continue;
      var prev = (pdata[r][3] || '').toString().trim();
      projSheet.getRange(r + 1, 4).setValue(status);
      if (status === 'Final') {
        if (prev !== 'Final') projSheet.getRange(r + 1, 7, 1, 2).setValues([[(olehIfFinal || '').toString(), _bomNow()]]);
      } else if ((pdata[r][6] || '').toString() || (pdata[r][7] || '').toString()) {
        projSheet.getRange(r + 1, 7, 1, 2).setValues([['', '']]);
      }
      break;
    }
  } catch (e) {}
}

// Hitung komposisi approve dari baris item yang SUDAH ada di memori (mis. dari
// getDataRange di reviewBOMItem), tanpa membaca ulang sheet. overrideRow/
// overrideStatus = paksa status baris ke-N (baris yang baru saja diubah, karena
// tulisan setValues belum tentu terlihat di array lama).
function _bomComposeAndWrite(rows, noWO, olehIfFinal, overrideRow, overrideStatus) {
  var total = 0, appr = 0;
  for (var k = 1; k < rows.length; k++) {
    if ((rows[k][1] || '').toString().trim() !== noWO) continue;
    total++;
    var st = (k === overrideRow) ? overrideStatus : ((rows[k][12] || '').toString().trim() || 'Pending');
    if (st === 'Approved') appr++;
  }
  _bomWriteProjectStatus(noWO, _bomDeriveStatus(appr, total), olehIfFinal);
}

// Sinkron dari sheet BOM_Item (baca ulang) — untuk aksi bulk (saveBOMItems)
// di mana komposisi akhir sulit dihitung di memori. flush dulu agar append
// terbaru terbaca.
function _bomSyncProjectStatus(noWO, olehIfFinal) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return;
    var ss = getSpreadsheet();
    SpreadsheetApp.flush();
    var idata = _ensureBOMItemSheet(ss).getDataRange().getValues();
    var total = 0, appr = 0;
    for (var i = 1; i < idata.length; i++) {
      if ((idata[i][1] || '').toString().trim() !== noWO) continue;
      total++;
      if ((idata[i][12] || '').toString().trim() === 'Approved') appr++;
    }
    _bomWriteProjectStatus(noWO, _bomDeriveStatus(appr, total), olehIfFinal);
  } catch (e) {}
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

// Normalkan nilai tanggal/waktu dari sheet agar tampil rapi.
// Data lama bisa berupa objek Date (toString-nya "Wed Jul 29 2026 ... GMT+0700");
// data baru sudah string "dd/MM/yyyy HH:mm". Keduanya diseragamkan ke dd/MM/yyyy HH:mm.
function _bomFmtWhen(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var s = (v || '').toString();
  // Data lama tersimpan sebagai string hasil Date.toString() (mengandung "GMT") → parse ulang.
  if (s && s.indexOf('GMT') !== -1) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return s;
}

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

    // Hitung jumlah item, kategori, & approved per WO dari BOM_Item.
    var itemSheet = _ensureBOMItemSheet(ss);
    var data = itemSheet.getDataRange().getValues();
    var cnt = {}, katSet = {}, appr = {}, pend = {}, rej = {}, procPend = {}, procDone = {};
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][1] || '').toString().trim();
      if (!w || !visible[w]) continue;
      cnt[w] = (cnt[w] || 0) + 1;
      var kat = (data[i][2] || 'Lainnya').toString().trim() || 'Lainnya';
      if (!katSet[w]) katSet[w] = {};
      katSet[w][kat] = true;
      var st = (data[i][12] || '').toString().trim() || 'Pending';
      if (st === 'Approved') {
        appr[w] = (appr[w] || 0) + 1;
        // Ringkasan procurement: material Approved yang belum/telah diproses.
        if ((data[i][16] || '').toString().trim()) procDone[w] = (procDone[w] || 0) + 1;
        else procPend[w] = (procPend[w] || 0) + 1;
      }
      else if (st === 'Rejected') rej[w] = (rej[w] || 0) + 1;
      else pend[w] = (pend[w] || 0) + 1;
    }

    var perWO = regs.map(function (r) {
      var total = cnt[r.noWO] || 0, a = appr[r.noWO] || 0;
      return {
        noWO: r.noWO, namaProject: r.namaProject, namaKlien: r.namaKlien,
        status: _bomDeriveStatus(a, total),
        jumlahItem: total,
        jumlahKategori: katSet[r.noWO] ? Object.keys(katSet[r.noWO]).length : 0,
        approved: a, pending: pend[r.noWO] || 0, rejected: rej[r.noWO] || 0,
        procPending: procPend[r.noWO] || 0, procDone: procDone[r.noWO] || 0,
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
    var sum = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() !== noWO) continue;
      var st = (data[i][12] || '').toString().trim() || 'Pending';
      sum.total++;
      if (st === 'Approved') sum.approved++; else if (st === 'Rejected') sum.rejected++; else sum.pending++;
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
        dibuatPada:   (data[i][11] || '').toString(),
        status:       st,
        catatanReview:(data[i][13] || '').toString(),
        reviewedBy:   (data[i][14] || '').toString(),
        reviewedAt:   (data[i][15] || '').toString(),
        procStatus:   (data[i][16] || '').toString(),
        idStok:       (data[i][17] || '').toString(),
        qtyReserved:  Number(data[i][18]) || 0,
        mutasiReserved:(data[i][19] || '').toString(),
        qtyBeli:      Number(data[i][20]) || 0,
        diprosesOleh: (data[i][21] || '').toString(),
        diprosesPada: (data[i][22] || '').toString()
      });
    }
    var woStatus = '';
    try { woStatus = _getStatusWO(noWO) || ''; } catch (e) {}
    // Info finalisasi dari BOM_Project (col 7=Difinalkan Oleh, 8=Difinalkan Pada).
    var finalizedBy = '', finalizedAt = '';
    try {
      var pd = _ensureBOMProjectSheet(ss).getDataRange().getValues();
      for (var p = 1; p < pd.length; p++) {
        if ((pd[p][0] || '').toString().trim() === noWO) { finalizedBy = (pd[p][6] || '').toString(); finalizedAt = _bomFmtWhen(pd[p][7]); break; }
      }
    } catch (e) {}
    return {
      success: true,
      status: _bomDeriveStatus(sum.approved, sum.total),
      summary: sum,
      woStatus: woStatus,
      assigned: _bomAssignedMap()[noWO] || [],
      finalizedBy: finalizedBy,
      finalizedAt: finalizedAt,
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
      (payload.oleh || '').toString(), _bomNow(), 'Pending', '', '', ''
    ]);
    return { success: true, message: 'Material ' + id + ' ditambahkan.', id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Tambah banyak material sekaligus (input inline seperti penawaran/PO).
// payload: { noWO, oleh, items: [{ pricelistId, namaMaterial, merek, supplier, satuan, kategori, qty, catatan }] }
function addBOMItemsBatch(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var items = (payload.items && payload.items.length) ? payload.items : [];
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (!items.length) return { success: false, message: 'Tidak ada material untuk ditambahkan.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    SpreadsheetApp.flush();
    var oleh = (payload.oleh || '').toString(), when = _bomNow(), added = 0;
    items.forEach(function (it) {
      var nama = (it.namaMaterial || '').toString().trim();
      var qty = Number(it.qty) || 0;
      if (!nama || qty <= 0) return;
      var id = _bomNextId(sheet);
      sheet.appendRow([
        id, noWO, (it.kategori || 'Lainnya').toString().trim() || 'Lainnya',
        (it.pricelistId || '').toString(), nama,
        (it.merek || '').toString(), (it.supplier || '').toString(),
        (it.satuan || '').toString(), qty, (it.catatan || '').toString(),
        oleh, when, 'Pending', '', '', ''
      ]);
      added++;
    });
    if (!added) return { success: false, message: 'Tidak ada baris valid (nama material & qty wajib).' };
    return { success: true, message: added + ' material ditambahkan.', count: added };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Sync material 1 WO (diff by ID) — pola submit inline tabel editable.
// Baris ber-ID diperbarui (dan direset Pending bila berubah); baris tanpa ID
// ditambahkan (Pending); baris existing yang tak ada di payload dihapus.
// Material Approved dilindungi: tak boleh diedit-ubah maupun dihapus di sini
// (UI mengunci baris tsb, tapi backend ikut menjaga).
// payload: { noWO, oleh, items: [{ id?, kategori, pricelistId, namaMaterial, merek, supplier, satuan, qty, catatan }] }
function saveBOMItems(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var items = payload.items || [];
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var norm = function (x) { return (x == null ? '' : String(x)).trim(); };

    // Index baris existing WO ini berdasarkan ID.
    var byId = {};
    for (var i = 1; i < data.length; i++) {
      if (norm(data[i][1]) !== noWO) continue;
      byId[norm(data[i][0])] = { row: i + 1, v: data[i] };
    }
    // Set ID yang dikirim dari UI.
    var seen = {};
    items.forEach(function (it) { if (it && it.id) seen[norm(it.id)] = true; });
    // Lindungi material Approved dari penghapusan (omitted dari payload).
    for (var id0 in byId) {
      if (!seen[id0] && norm(byId[id0].v[12]) === 'Approved') {
        return { success: false, message: 'Material yang sudah Approved tidak bisa dihapus. Minta Lead batalkan approve dulu.' };
      }
    }

    var oleh = (payload.oleh || '').toString(), when = _bomNow();
    var updated = 0, added = 0, toAppend = [];

    items.forEach(function (it) {
      var nama = norm(it.namaMaterial);
      var qty = Number(it.qty) || 0;
      if (!nama || qty <= 0) return;
      var core = [
        norm(it.kategori) || 'Lainnya', norm(it.pricelistId), nama,
        norm(it.merek), norm(it.supplier), norm(it.satuan), qty, norm(it.catatan)
      ];
      var id = it.id ? norm(it.id) : '';
      if (id && byId[id]) {
        var ex = byId[id];
        var st = norm(ex.v[12]) || 'Pending';
        if (st === 'Approved') return;   // terkunci — abaikan perubahan
        // Tulis kolom 3–10 (Kategori s.d. Catatan).
        sheet.getRange(ex.row, 3, 1, 8).setValues([core]);
        // Bila konten berubah → reset ke Pending (perlu review ulang).
        var exCore = [norm(ex.v[2]), norm(ex.v[3]), norm(ex.v[4]), norm(ex.v[5]), norm(ex.v[6]), norm(ex.v[7]), Number(ex.v[8]) || 0, norm(ex.v[9])];
        var changed = false;
        for (var c = 0; c < 8; c++) { if (String(core[c]) !== String(exCore[c])) { changed = true; break; } }
        if (changed) sheet.getRange(ex.row, 13, 1, 4).setValues([['Pending', '', '', '']]);
        updated++;
      } else {
        toAppend.push(core);
      }
    });

    // Hapus baris existing yang tak ada di payload (Approved sudah dilindungi di atas).
    var delRows = [];
    for (var id2 in byId) { if (!seen[id2]) delRows.push(byId[id2].row); }
    delRows.sort(function (a, b) { return b - a; });
    delRows.forEach(function (r) { sheet.deleteRow(r); });

    // Tambah baris baru.
    SpreadsheetApp.flush();
    toAppend.forEach(function (core) {
      var newId = _bomNextId(sheet);
      sheet.appendRow([newId, noWO, core[0], core[1], core[2], core[3], core[4], core[5], core[6], core[7], oleh, when, 'Pending', '', '', '']);
      added++;
    });

    _bomSyncProjectStatus(noWO, oleh);   // komposisi berubah → sinkronkan Status BOM

    var msg = 'BOM disimpan (' + updated + ' diperbarui, ' + added + ' baru' + (delRows.length ? ', ' + delRows.length + ' dihapus' : '') + ').';
    return { success: true, message: msg, updated: updated, added: added, deleted: delRows.length };
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
        if ((data[i][12] || '').toString().trim() === 'Approved') return { success: false, message: 'Material sudah di-Approve — minta Lead batalkan approve dulu.' };
        // Kolom 3–10 (Kategori s.d. Catatan)
        sheet.getRange(i + 1, 3, 1, 8).setValues([[
          (payload.kategori || 'Lainnya').toString().trim() || 'Lainnya',
          (payload.pricelistId || '').toString(), nama,
          (payload.merek || '').toString(), (payload.supplier || '').toString(),
          (payload.satuan || '').toString(), qty, (payload.catatan || '').toString()
        ]]);
        // Diedit → kembali Pending, catatan review dibersihkan (perlu review ulang).
        sheet.getRange(i + 1, 13, 1, 4).setValues([['Pending', '', '', '']]);
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
        if ((data[i][12] || '').toString().trim() === 'Approved') return { success: false, message: 'Material sudah di-Approve — minta Lead batalkan approve dulu.' };
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

// ── Review material (Lead/Admin): Approve / Reject / Batalkan Approve ────────
// keputusan: 'Approved' | 'Rejected'. Reject wajib catatan revisi.
function reviewBOMItem(id, keputusan, catatan, reviewer) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    keputusan = (keputusan || '').toString().trim();
    catatan = (catatan || '').toString().trim();
    if (!id) return { success: false, message: 'ID item wajib.' };
    if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
    if (keputusan === 'Rejected' && !catatan) return { success: false, message: 'Catatan revisi wajib diisi untuk menolak.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var noWO = (data[i][1] || '').toString().trim();
        var stWO = ''; try { stWO = _getStatusWO(noWO); } catch (e) {}
        if (stWO === 'Closed') return { success: false, message: 'Work Order sudah Closed.' };
        sheet.getRange(i + 1, 13, 1, 4).setValues([[keputusan, (keputusan === 'Rejected' ? catatan : ''), (reviewer || '').toString(), _bomNow()]]);
        _bomComposeAndWrite(data, noWO, reviewer, i, keputusan);   // pakai data di memori, tanpa baca ulang
        return { success: true, message: 'Material ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Batalkan approve (Lead/Admin): Approved → Pending.
function cancelBOMApproval(id, oleh) {
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
        if ((data[i][12] || '').toString().trim() !== 'Approved') return { success: false, message: 'Material belum di-Approve.' };
        if ((Number(data[i][18]) || 0) > 0 || (data[i][16] || '').toString().trim()) {
          return { success: false, message: 'Material sudah diproses procurement — batalkan proses procurement dulu.' };
        }
        sheet.getRange(i + 1, 13, 1, 4).setValues([['Pending', '', '', '']]);
        _bomComposeAndWrite(data, (data[i][1] || '').toString().trim(), oleh, i, 'Pending');   // pakai data di memori
        return { success: true, message: 'Approve dibatalkan (Pending).' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PROCUREMENT — tandai material Reserved (dari stok) / Need Purchase (dibeli).
//  Kolom BOM_Item (1-based): 17 Proc Status | 18 Stok ID | 19 Qty Reserved |
//  20 Mutasi Reserved | 21 Qty Beli | 22 Diproses Oleh | 23 Diproses Pada.
//  Reserve memakai ulang gunakanStok/batalkanPenggunaanStok (Inventory.gs).
// ════════════════════════════════════════════════════════════════════════════
function _bomWriteProcRow(sheet, rowIdx, procStatus, idStok, qtyReserved, mutasi, qtyBeli, oleh, when) {
  sheet.getRange(rowIdx + 1, 17, 1, 7).setValues([[procStatus, idStok, qtyReserved, mutasi, qtyBeli, oleh, when]]);
}

// payload: { idStok, qtyReserved, oleh }. qtyReserved = qty diambil dari stok
// (0..qty material); sisa (qty - reserved) otomatis jadi "perlu dibeli".
// Tidak memegang LockService sendiri agar tak bentrok dgn lock internal
// gunakanStok/batalkanPenggunaanStok.
function prosesBOMProcurement(id, payload) {
  try {
    id = (id || '').toString().trim();
    payload = payload || {};
    if (!id) return { success: false, message: 'ID material wajib.' };
    var oleh = (payload.oleh || '').toString();
    var idStok = (payload.idStok || '').toString().trim();

    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1, row = null;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) { rowIdx = i; row = data[i]; break; }
    }
    if (rowIdx < 0) return { success: false, message: 'Material tidak ditemukan.' };

    var noWO = (row[1] || '').toString().trim();
    if ((row[12] || '').toString().trim() !== 'Approved') {
      return { success: false, message: 'Hanya material yang sudah di-Approve Lead yang bisa diproses procurement.' };
    }
    var guard = _bomEditGuard(noWO);   // WO ada & belum Closed
    if (!guard.ok) return { success: false, message: guard.message };

    var Q = Number(row[8]) || 0;
    var qtyReserved = Number(payload.qtyReserved) || 0;
    if (qtyReserved < 0) qtyReserved = 0;
    if (qtyReserved > Q) qtyReserved = Q;

    // Bila material sudah pernah reserve, kembalikan stok lama dulu (proses ulang bersih).
    var oldMutasi = (row[19] || '').toString().trim();
    if (oldMutasi) {
      var bat = batalkanPenggunaanStok(oldMutasi, oleh);
      if (bat && bat.success) { _hapusPengeluaranByReferensi(oldMutasi); }
      // Bila reversal lama gagal (mis. sudah dibatalkan di tempat lain) — lanjut saja;
      // status baru akan menimpa referensi lama.
    }

    var newMutasi = '';
    if (qtyReserved > 0) {
      if (!idStok) return { success: false, message: 'Pilih item stok untuk qty yang di-reserve.' };
      var res = gunakanStok(noWO, idStok, qtyReserved, '', 'Reserve BOM ' + id + ' — ' + (row[4] || ''), oleh);
      if (!res || res.success === false) {
        // Reserve gagal (mis. stok kurang). Reset field procurement material ini.
        _bomWriteProcRow(sheet, rowIdx, '', '', 0, '', 0, '', '');
        return { success: false, message: (res && res.message) || 'Gagal reserve stok.' };
      }
      newMutasi = (res.idMutasi || '').toString();
    }

    var qtyBeli = Math.max(0, Q - qtyReserved);
    var procStatus = (qtyReserved > 0 && qtyBeli > 0) ? 'Sebagian' : (qtyReserved > 0 ? 'Reserved' : 'Need Purchase');
    _bomWriteProcRow(sheet, rowIdx, procStatus, (qtyReserved > 0 ? idStok : ''), qtyReserved, newMutasi, qtyBeli, oleh, _bomNow());
    return {
      success: true,
      message: 'Diproses: ' + procStatus + (qtyReserved ? (' · reserve ' + qtyReserved) : '') + (qtyBeli ? (' · perlu beli ' + qtyBeli) : '') + '.',
      procStatus: procStatus, qtyReserved: qtyReserved, qtyBeli: qtyBeli, idStok: (qtyReserved > 0 ? idStok : '')
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Batalkan proses procurement: kembalikan stok (bila ada reserve) + hapus
// pengeluaran otomatis, lalu kosongkan field procurement material.
function batalkanBOMProcurement(id, oleh) {
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID material wajib.' };
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        if (!(data[i][16] || '').toString().trim() && !(Number(data[i][18]) || 0)) {
          return { success: false, message: 'Material belum diproses procurement.' };
        }
        var mutasi = (data[i][19] || '').toString().trim();
        if (mutasi) {
          var bat = batalkanPenggunaanStok(mutasi, (oleh || '').toString());
          if (bat && bat.success) { _hapusPengeluaranByReferensi(mutasi); }
          else return { success: false, message: 'Gagal mengembalikan stok: ' + ((bat && bat.message) || '') + '. Batal dibatalkan.' };
        }
        _bomWriteProcRow(sheet, i, '', '', 0, '', 0, '', '');
        return { success: true, message: 'Proses procurement dibatalkan' + (mutasi ? ' & stok dikembalikan' : '') + '.' };
      }
    }
    return { success: false, message: 'Material tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Daftar material "perlu dibelanjakan" lintas WO (qty beli > 0). Frontend
// mengelompokkan per supplier.
function getBOMNeedPurchase() {
  try {
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var projMap = {};
    _bomRegisteredWOs().forEach(function (r) { projMap[r.noWO] = { namaProject: r.namaProject, namaKlien: r.namaKlien }; });
    // Peta pricelistId → { idSupplier, hargaBeli } untuk prefill "Buat PO".
    var priceMap = {};
    try {
      var pr = getPricelistAll();
      if (pr && pr.success) pr.list.forEach(function (p) { priceMap[(p.id || '').toString()] = { idSupplier: (p.idSupplier || '').toString(), hargaBeli: Number(p.hargaBeli) || 0 }; });
    } catch (ePr) {}
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var qtyBeli = Number(data[i][20]) || 0;
      if (qtyBeli <= 0) continue;
      var noWO = (data[i][1] || '').toString().trim();
      var pj = projMap[noWO] || {};
      var plId = (data[i][3] || '').toString();
      var pmatch = priceMap[plId] || {};
      list.push({
        id:           (data[i][0] || '').toString(),
        noWO:         noWO,
        namaProject:  pj.namaProject || '',
        namaKlien:    pj.namaKlien || '',
        kategori:     (data[i][2] || 'Lainnya').toString(),
        namaMaterial: (data[i][4] || '').toString(),
        merek:        (data[i][5] || '').toString(),
        supplier:     (data[i][6] || '').toString() || '(tanpa supplier)',
        satuan:       (data[i][7] || '').toString(),
        qtyBeli:      qtyBeli,
        pricelistId:  plId,
        idSupplier:   pmatch.idSupplier || '',
        hargaBeli:    pmatch.hargaBeli || 0
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}
