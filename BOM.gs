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
      'Proc Status', 'Stok ID', 'Qty Reserved', 'Mutasi Reserved', 'Qty Beli', 'Diproses Oleh', 'Diproses Pada',
      'Qty Menunggu BL', 'Qty Beli Langsung', 'Ref Beli Langsung',
      'Qty Dikirim', 'Qty Diterima', 'Kirim Ref']);
    sheet.getRange(1, 1, 1, 29).setFontWeight('bold');
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
    // Migrasi kolom "Beli Langsung" (drop-ship ke lokasi) untuk sheet lama.
    if (sheet.getLastColumn() < 26) {
      sheet.getRange(1, 24, 1, 3).setValues([['Qty Menunggu BL', 'Qty Beli Langsung', 'Ref Beli Langsung']]).setFontWeight('bold');
    }
    // Migrasi kolom pengiriman (soft-hold → kirim → diterima) untuk sheet lama.
    if (sheet.getLastColumn() < 29) {
      sheet.getRange(1, 27, 1, 3).setValues([['Qty Dikirim', 'Qty Diterima', 'Kirim Ref']]).setFontWeight('bold');
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
    try { invalidateBOMCache(); } catch (e2) {}
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
    _ensureBOMProjectSheet(getSpreadsheet());
    var data = _cachedBOMProject();
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
    var list = woList.filter(function (wo) { return !reg[wo.noWO] && wo.hoStatus === 'Selesai'; })
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
    var _hoG = (typeof _hoRequireSelesai === 'function') ? _hoRequireSelesai(noWO) : { ok: true };
    if (!_hoG.ok) return { success: false, message: _hoG.message };
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
    try { invalidateBOMCache(); } catch (e) {}
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
    if (removed) { try { invalidateBOMCache(); } catch (e) {} }
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
        diprosesPada: (data[i][22] || '').toString(),
        qtyMenungguBL:  Number(data[i][23]) || 0,
        qtyBeliLangsung:Number(data[i][24]) || 0,
        refBeliLangsung:(data[i][25] || '').toString(),
        qtyDikirim:     Number(data[i][26]) || 0,
        qtyDiterima:    Number(data[i][27]) || 0,
        kirimRef:       (data[i][28] || '').toString()
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
      kirimRequest: (function () { try { return _kirimReqStatus(noWO); } catch (e) { return ''; } })(),
      kirimReqMap: (function () { try { return _kirimReqActiveMap(noWO); } catch (e) { return {}; } })(),
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
    try { invalidateBOMCache(); } catch (e) {}
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
        try { invalidateBOMCache(); } catch (e) {}
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
//  Model B: Reserve = soft-hold (alokasi, tidak keluar stok). Stok keluar +
//  HPP terbentuk saat pengiriman (warehouse). Kolom 27-29: Qty Dikirim |
//  Qty Diterima | Kirim Ref.
// ════════════════════════════════════════════════════════════════════════════
function _bomWriteProcRow(sheet, rowIdx, procStatus, idStok, qtyReserved, mutasi, qtyBeli, oleh, when) {
  sheet.getRange(rowIdx + 1, 17, 1, 7).setValues([[procStatus, idStok, qtyReserved, mutasi, qtyBeli, oleh, when]]);
  try { invalidateBOMCache(); } catch (e) {}
}
// Tulis kolom "Beli Langsung" (24-26): Qty Menunggu BL, Qty Beli Langsung, Ref.
function _bomWriteBLRow(sheet, rowIdx, qtyMenunggu, qtyBeliLangsung, ref) {
  sheet.getRange(rowIdx + 1, 24, 1, 3).setValues([[qtyMenunggu, qtyBeliLangsung, ref]]);
  try { invalidateBOMCache(); } catch (e) {}
}
// Peta stok yang di-hold (dialokasikan reserve tapi belum dikirim) per item stok.
// hold = Qty Reserved − Qty Dikirim. Dipakai Inventory untuk hitung ketersediaan.
function getBOMHoldMap() {
  try {
    _ensureBOMItemSheet(getSpreadsheet());
    var data = _cachedBOMItem();
    var map = {};
    for (var i = 1; i < data.length; i++) {
      var sid = (data[i][17] || '').toString();
      if (!sid) continue;
      var held = (Number(data[i][18]) || 0) - (Number(data[i][26]) || 0);
      if (held > 0) map[sid] = (map[sid] || 0) + held;
    }
    return map;
  } catch (e) { return {}; }
}

// Ringkasan BoM 1 WO untuk panel di detail Work Order (null bila belum terdaftar).
function getBOMSummaryByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: true, summary: null };
    var reg = _bomRegisteredWOs().filter(function (w) { return w.noWO === noWO; })[0];
    if (!reg) return { success: true, summary: null };
    var res = getBOMByWO(noWO);
    var items = (res && res.success) ? (res.items || []) : [];
    var total = items.length, approved = 0, rejected = 0, pending = 0;
    // Progress procurement (dari material Approved).
    var proc = { base: 0, reserved: 0, direct: 0, perluBeli: 0, tunggu: 0, dikirim: 0, tuntas: 0, pct: 0 };
    items.forEach(function (it) {
      if (it.status === 'Approved') approved++;
      else if (it.status === 'Rejected') rejected++;
      else pending++;
      if (it.status !== 'Approved') return;
      proc.base++;
      var qr = Number(it.qtyReserved) || 0, qb = Number(it.qtyBeli) || 0, qm = Number(it.qtyMenungguBL) || 0, qbl = Number(it.qtyBeliLangsung) || 0, qd = Number(it.qtyDikirim) || 0;
      if (qr > 0) proc.reserved++;
      if (qbl > 0) proc.direct++;
      if (qb > 0) proc.perluBeli++;
      if (qm > 0) proc.tunggu++;
      if (qd > 0) proc.dikirim++;
      if (qb === 0 && qm === 0 && (qr > 0 || qbl > 0)) proc.tuntas++;   // sudah dialokasi, tak ada sisa beli
    });
    proc.pct = proc.base ? Math.round(proc.tuntas / proc.base * 100) : 0;
    var pct = total ? Math.round(approved / total * 100) : 0;
    return { success: true, summary: {
      total: total, approved: approved, pending: pending, rejected: rejected,
      pct: pct, bomStatus: (res && res.finalizedBy) ? 'Final' : 'Draft', proc: proc
    } };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Rincian reserve stok per WO/proyek untuk sebuah idStok (hold = Qty Reserved −
// Qty Dikirim > 0). Dipakai modal "Detail Reserve" di Inventory → Daftar Stok.
function getReserveDetailByStok(idStok) {
  try {
    idStok = (idStok || '').toString().trim();
    if (!idStok) return { success: false, list: [], total: 0, message: 'ID Stok wajib.' };
    _ensureBOMItemSheet(getSpreadsheet());
    var data = _cachedBOMItem();
    var projMap = {};
    try { _bomRegisteredWOs().forEach(function (r) { projMap[r.noWO] = r; }); } catch (e) {}
    var byWO = {};
    for (var i = 1; i < data.length; i++) {
      if ((data[i][17] || '').toString() !== idStok) continue;
      var held = (Number(data[i][18]) || 0) - (Number(data[i][26]) || 0);
      if (held <= 0) continue;
      var noWO = (data[i][1] || '').toString().trim();
      if (!byWO[noWO]) byWO[noWO] = { qty: 0, items: [] };
      byWO[noWO].qty += held;
      byWO[noWO].items.push({ namaMaterial: (data[i][4] || '').toString(), satuan: (data[i][7] || '').toString(), qty: held });
    }
    var list = [], total = 0;
    Object.keys(byWO).forEach(function (w) {
      var pj = projMap[w] || {};
      list.push({ noWO: w, namaProject: pj.namaProject || '', namaKlien: pj.namaKlien || '', qty: byWO[w].qty, items: byWO[w].items });
      total += byWO[w].qty;
    });
    list.sort(function (a, b) { return b.qty - a.qty; });
    return { success: true, list: list, total: total };
  } catch (e) { return { success: false, list: [], total: 0, message: e.toString() }; }
}

// Status procurement ringkas dari 4 bucket qty; 'Sebagian' bila >1 bucket aktif.
function _bomDeriveProcStatus(qR, qBeli, qMenunggu, qBL) {
  var active = 0;
  if (qR > 0) active++;
  if (qBeli > 0) active++;
  if (qMenunggu > 0) active++;
  if (qBL > 0) active++;
  if (active === 0) return '';
  if (active > 1) return 'Sebagian';
  if (qR > 0) return 'Reserved';
  if (qBeli > 0) return 'Need Purchase';
  if (qMenunggu > 0) return 'Tunggu Beli';
  return 'Beli Langsung';
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

    // Reserve = SOFT-HOLD (alokasi). Bila sudah ada pengiriman, tak boleh diubah.
    if ((Number(row[26]) || 0) > 0 || (row[28] || '').toString().trim()) {
      return { success: false, message: 'Material sudah dalam proses pengiriman — tidak bisa mengubah reserve.' };
    }

    var Q = Number(row[8]) || 0;
    // Porsi yang sudah/akan dipenuhi via beli langsung tidak boleh diklaim reserve.
    var qMenunggu = Number(row[23]) || 0;
    var qBL = Number(row[24]) || 0;
    var effQ = Math.max(0, Q - qMenunggu - qBL);
    var qtyReserved = Number(payload.qtyReserved) || 0;
    if (qtyReserved < 0) qtyReserved = 0;
    if (qtyReserved > effQ) qtyReserved = effQ;

    if (qtyReserved > 0) {
      if (!idStok) return { success: false, message: 'Pilih item stok untuk qty yang di-reserve.' };
      // Model B: reserve tidak mengeluarkan stok — hanya mengalokasikan (soft-hold).
      // Validasi ketersediaan = (saldo − hold material lain). Hold material ini
      // sendiri dilepas dulu (reserve ulang menimpa alokasi lama).
      var sl = getStokList();
      var av = 0, found = false;
      for (var s = 0; s < sl.length; s++) { if (sl[s].idStok === idStok) { av = Number(sl[s].qtyAvailable) || 0; found = true; break; } }
      if (!found) return { success: false, message: 'Item stok "' + idStok + '" tidak ditemukan.' };
      var ownHold = ((row[17] || '').toString() === idStok) ? Math.max(0, (Number(row[18]) || 0) - (Number(row[26]) || 0)) : 0;
      var availForThis = av + ownHold;
      if (qtyReserved > availForThis) {
        return { success: false, message: 'Stok "' + idStok + '" tidak cukup untuk dialokasikan. Tersedia: ' + availForThis + '.' };
      }
    }

    var qtyBeli = Math.max(0, effQ - qtyReserved);
    var procStatus = _bomDeriveProcStatus(qtyReserved, qtyBeli, qMenunggu, qBL);
    // Kolom 20 (Mutasi Reserved) tak dipakai lagi di Model B (stok keluar saat kirim).
    _bomWriteProcRow(sheet, rowIdx, procStatus, (qtyReserved > 0 ? idStok : ''), qtyReserved, '', qtyBeli, oleh, _bomNow());
    return {
      success: true,
      message: 'Dialokasikan: ' + procStatus + (qtyReserved ? (' · reserve ' + qtyReserved) : '') + (qtyBeli ? (' · perlu beli ' + qtyBeli) : '') + '.',
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
        // Model B: reserve = soft-hold (belum keluar stok). Tak bisa dibatalkan
        // bila sudah dalam proses pengiriman.
        if ((Number(data[i][26]) || 0) > 0 || (data[i][28] || '').toString().trim()) {
          return { success: false, message: 'Material sudah dalam proses pengiriman — tidak bisa membatalkan reserve.' };
        }
        // Lepas hold porsi reserve; porsi beli langsung (menunggu/diterima) dipertahankan.
        var Qb = Number(data[i][8]) || 0;
        var qMen = Number(data[i][23]) || 0;
        var qBLg = Number(data[i][24]) || 0;
        var sisaBeli = Math.max(0, Qb - qMen - qBLg);
        var st = _bomDeriveProcStatus(0, sisaBeli, qMen, qBLg);
        _bomWriteProcRow(sheet, i, st, '', 0, '', sisaBeli, (oleh || '').toString(), _bomNow());
        try { invalidateBOMCache(); } catch (e) {}
        return { success: true, message: 'Reserve (alokasi) dibatalkan.' };
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
      var qtyMenunggu = Number(data[i][23]) || 0;
      // Tampil di daftar belanja bila masih perlu dibeli (belum diputus) ATAU
      // sudah ditandai beli langsung tapi belum diterima ("Tunggu Beli").
      if (qtyBeli <= 0 && qtyMenunggu <= 0) continue;
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
        qty:          Number(data[i][8]) || 0,
        qtyReserved:  Number(data[i][18]) || 0,
        idStok:       (data[i][17] || '').toString(),
        qtyBeli:      qtyBeli,
        qtyMenunggu:  qtyMenunggu,
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

// ── Jalur "Beli Langsung" (drop-ship ke lokasi, tanpa gudang) ──────────────
// Cari baris material di sheet by id → {rowIdx, row} atau null.
function _bomFindItemRow(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === id) return { rowIdx: i, row: data[i] };
  }
  return null;
}

// Tandai sisa "perlu dibeli" jadi "menunggu pembelian langsung" (belum masuk gudang).
function tandaiBeliLangsung(id, oleh) {
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID material wajib.' };
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var f = _bomFindItemRow(sheet, id);
    if (!f) return { success: false, message: 'Material tidak ditemukan.' };
    var row = f.row;
    if ((row[12] || '').toString().trim() !== 'Approved') return { success: false, message: 'Hanya material Approved yang bisa diproses.' };
    var guard = _bomEditGuard((row[1] || '').toString().trim());
    if (!guard.ok) return { success: false, message: guard.message };
    var qtyBeli = Number(row[20]) || 0;
    if (qtyBeli <= 0) return { success: false, message: 'Tidak ada sisa yang perlu dibeli.' };
    var qR = Number(row[18]) || 0;
    var qMenunggu = (Number(row[23]) || 0) + qtyBeli;
    var qBL = Number(row[24]) || 0;
    var st = _bomDeriveProcStatus(qR, 0, qMenunggu, qBL);
    _bomWriteProcRow(sheet, f.rowIdx, st, (row[17] || '').toString(), qR, (row[19] || '').toString(), 0, (oleh || '').toString(), _bomNow());
    _bomWriteBLRow(sheet, f.rowIdx, qMenunggu, qBL, (row[25] || '').toString());
    return { success: true, message: 'Ditandai beli langsung: ' + qtyBeli + '. Menunggu penerimaan PO.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Batalkan tanda beli langsung yang BELUM diterima → kembali ke "perlu dibeli".
function batalTandaiBeliLangsung(id, oleh) {
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID material wajib.' };
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var f = _bomFindItemRow(sheet, id);
    if (!f) return { success: false, message: 'Material tidak ditemukan.' };
    var row = f.row;
    var guard = _bomEditGuard((row[1] || '').toString().trim());
    if (!guard.ok) return { success: false, message: guard.message };
    var qMenunggu = Number(row[23]) || 0;
    if (qMenunggu <= 0) return { success: false, message: 'Tidak ada qty menunggu pembelian langsung.' };
    var qR = Number(row[18]) || 0;
    var qBL = Number(row[24]) || 0;
    var qtyBeli = (Number(row[20]) || 0) + qMenunggu;
    var st = _bomDeriveProcStatus(qR, qtyBeli, 0, qBL);
    _bomWriteProcRow(sheet, f.rowIdx, st, (row[17] || '').toString(), qR, (row[19] || '').toString(), qtyBeli, (oleh || '').toString(), _bomNow());
    _bomWriteBLRow(sheet, f.rowIdx, 0, qBL, (row[25] || '').toString());
    return { success: true, message: 'Tanda beli langsung dibatalkan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Daftar material "Tunggu Beli" (qtyMenungguBL > 0) untuk di-link di penerimaan PO.
// opts.idSupplier opsional untuk penyaringan per supplier.
function getBOMMenungguBL(opts) {
  try {
    opts = opts || {};
    var fSup = (opts.idSupplier || '').toString().trim();
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var projMap = {};
    _bomRegisteredWOs().forEach(function (r) { projMap[r.noWO] = r.namaProject; });
    var priceMap = {};
    try {
      var pr = getPricelistAll();
      if (pr && pr.success) pr.list.forEach(function (p) { priceMap[(p.id || '').toString()] = { idSupplier: (p.idSupplier || '').toString(), hargaBeli: Number(p.hargaBeli) || 0 }; });
    } catch (ePr) {}
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var qMen = Number(data[i][23]) || 0;
      if (qMen <= 0) continue;
      var plId = (data[i][3] || '').toString();
      var pm = priceMap[plId] || {};
      if (fSup && (pm.idSupplier || '') !== fSup) continue;
      var noWO = (data[i][1] || '').toString().trim();
      list.push({
        id:           (data[i][0] || '').toString(),
        noWO:         noWO,
        namaProject:  projMap[noWO] || '',
        kategori:     (data[i][2] || 'Lainnya').toString(),
        namaMaterial: (data[i][4] || '').toString(),
        merek:        (data[i][5] || '').toString(),
        supplier:     (data[i][6] || '').toString(),
        satuan:       (data[i][7] || '').toString(),
        qtyMenunggu:  qMen,
        pricelistId:  plId,
        idSupplier:   pm.idSupplier || '',
        hargaBeli:    pm.hargaBeli || 0
      });
    }
    return { success: true, list: list };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

// Link penerimaan PO langsung ke material BOM (drop-ship): kurangi qtyMenungguBL,
// tambah qtyBeliLangsung, dan BUKUKAN pengeluaran project WO (HPP) per material.
// links = [{ bomItemId, qty, hargaSatuan }]; noPO untuk jejak & referensi.
// Mendukung penerimaan parsial (qty < menunggu). Return ringkasan.
function linkBeliLangsung(links, noPO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    links = links || [];
    noPO = (noPO || '').toString().trim();
    oleh = (oleh || '').toString();
    if (!links.length) return { success: false, message: 'Tidak ada material yang di-link.' };
    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var ts = new Date().getTime();
    var hasil = [];
    for (var k = 0; k < links.length; k++) {
      var lk = links[k] || {};
      var bid = (lk.bomItemId || '').toString().trim();
      var qty = Number(lk.qty) || 0;
      if (!bid || qty <= 0) continue;
      var f = _bomFindItemRow(sheet, bid);
      if (!f) { hasil.push({ bomItemId: bid, success: false, message: 'Material tidak ditemukan.' }); continue; }
      var row = f.row;
      var noWO = (row[1] || '').toString().trim();
      var qMen = Number(row[23]) || 0;
      if (qMen <= 0) { hasil.push({ bomItemId: bid, success: false, message: 'Material tidak berstatus Tunggu Beli.' }); continue; }
      if (qty > qMen) qty = qMen;   // parsial: tidak melebihi yang menunggu
      var harga = Number(lk.hargaSatuan) || 0;
      var total = qty * harga;
      var idRef = 'BL-' + bid + '-' + ts + '-' + k;
      // Bukukan pengeluaran project WO (realisasi HPP) — bukan lewat stok.
      try {
        _buatPengeluaranOtomatis({
          noWO:        noWO,
          sumber:      'Pembelian Langsung',
          noPO:        noPO,
          idReferensi: idRef,
          idAkun:      'AP001',
          namaAkun:    'Stok',
          deskripsi:   'Beli langsung ' + (row[4] || '') + (noPO ? ' (PO ' + noPO + ')' : ''),
          qty:         qty,
          satuan:      (row[7] || '').toString(),
          hargaSatuan: harga,
          total:       total,
          dibuatOleh:  oleh,
          kategori:    (row[2] || '').toString()
        });
      } catch (eP) { hasil.push({ bomItemId: bid, success: false, message: 'Gagal catat pengeluaran: ' + eP }); continue; }
      // Update bucket & status.
      var qR = Number(row[18]) || 0;
      var qBLnew = (Number(row[24]) || 0) + qty;
      var qMenNew = qMen - qty;
      var qtyBeli = Number(row[20]) || 0;
      var refOld = (row[25] || '').toString();
      var refNew = refOld ? (refOld + ';' + idRef) : idRef;
      var st = _bomDeriveProcStatus(qR, qtyBeli, qMenNew, qBLnew);
      _bomWriteProcRow(sheet, f.rowIdx, st, (row[17] || '').toString(), qR, (row[19] || '').toString(), qtyBeli, oleh, _bomNow());
      _bomWriteBLRow(sheet, f.rowIdx, qMenNew, qBLnew, refNew);
      hasil.push({ bomItemId: bid, success: true, qty: qty, idReferensi: idRef, sisaMenunggu: qMenNew });
    }
    return { success: true, hasil: hasil };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Batalkan link beli langsung (mis. penerimaan PO diedit/dihapus): hapus
// pengeluaran & kembalikan qty ke "menunggu". refs = daftar idReferensi.
function batalLinkBeliLangsung(refs, oleh) {
  try {
    refs = refs || [];
    if (!refs.length) return { success: true, dibatalkan: 0 };
    oleh = (oleh || '').toString();
    var ss = getSpreadsheet();
    var sheet = _ensureBOMItemSheet(ss);
    var data = sheet.getDataRange().getValues();
    var refSet = {}; refs.forEach(function (r) { refSet[(r || '').toString()] = true; });
    var dibatalkan = 0;
    for (var i = 1; i < data.length; i++) {
      var refStr = (data[i][25] || '').toString();
      if (!refStr) continue;
      var parts = refStr.split(';').filter(function (x) { return x; });
      var keep = [], removedQty = 0, hitAny = false;
      parts.forEach(function (ref) {
        if (refSet[ref]) {
          hitAny = true;
          try { removedQty += _bomQtyPengeluaranByRef(ref); } catch (eq) {}
          try { _hapusPengeluaranByReferensi(ref); } catch (eh) {}
        } else keep.push(ref);
      });
      if (!hitAny) continue;
      var qBL = Number(data[i][24]) || 0;
      var qMen = Number(data[i][23]) || 0;
      var backQty = Math.min(removedQty, qBL);
      var qBLnew = qBL - backQty;
      var qMenNew = qMen + backQty;
      var qR = Number(data[i][18]) || 0;
      var qtyBeli = Number(data[i][20]) || 0;
      var st = _bomDeriveProcStatus(qR, qtyBeli, qMenNew, qBLnew);
      _bomWriteProcRow(sheet, i, st, (data[i][17] || '').toString(), qR, (data[i][19] || '').toString(), qtyBeli, oleh, _bomNow());
      _bomWriteBLRow(sheet, i, qMenNew, qBLnew, keep.join(';'));
      dibatalkan++;
    }
    return { success: true, dibatalkan: dibatalkan };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Ambil qty dari entri Pengeluaran ber-idReferensi tertentu (untuk reversal BL).
function _bomQtyPengeluaranByRef(idRef) {
  try {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName('Pengeluaran');
    if (!sh) return 0;
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if ((d[i][5] || '').toString() === idRef) return Number(d[i][9]) || 0;  // kol 10 = Qty
    }
    return 0;
  } catch (e) { return 0; }
}
