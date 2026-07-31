/**
 * Pengiriman Barang — surat jalan dari gudang berdasarkan BoM (Model B).
 * Alur: PC "Request Pengiriman" (pilih material Reserved, bisa parsial) → warehouse proses
 * kirim (stok keluar + HPP via gunakanStok, cetak surat jalan) → warehouse
 * konfirmasi barang diterima di lokasi (+ bukti).
 *
 * Sheet Pengiriman (surat jalan / header):
 *  0 ID Kirim | 1 No Surat Jalan | 2 No WO | 3 Tanggal Kirim | 4 Status
 *  5 Dikirim Oleh | 6 Dikirim Pada | 7 Alamat | 8 Kendaraan | 9 Driver
 *  10 Catatan | 11 Items JSON | 12 Diterima Oleh | 13 Diterima Pada
 *  14 Bukti File Id | 15 Bukti File Url | 16 Bukti File Name
 *
 * Sheet Pengiriman_Request (permintaan per WO):
 *  0 No WO | 1 Status (Diminta|Selesai|Dibatalkan) | 2 Diminta Oleh
 *  3 Diminta Pada | 4 Alamat
 */

function _ensurePengirimanSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pengiriman');
  if (!sheet) {
    sheet = ss.insertSheet('Pengiriman');
    sheet.appendRow(['ID Kirim', 'No Surat Jalan', 'No WO', 'Tanggal Kirim', 'Status',
      'Dikirim Oleh', 'Dikirim Pada', 'Alamat', 'Kendaraan', 'Driver', 'Catatan',
      'Items JSON', 'Diterima Oleh', 'Diterima Pada', 'Bukti File Id', 'Bukti File Url', 'Bukti File Name']);
    sheet.getRange(1, 1, 1, 17).setFontWeight('bold');
  }
  return sheet;
}

function _ensurePengirimanReqSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pengiriman_Request');
  if (!sheet) {
    sheet = ss.insertSheet('Pengiriman_Request');
    sheet.appendRow(['No WO', 'Status', 'Diminta Oleh', 'Diminta Pada', 'Alamat', 'Items JSON']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  } else if (sheet.getLastColumn() < 6) {
    // Migrasi: kolom Items JSON (material terpilih per request parsial).
    sheet.getRange(1, 6).setValue('Items JSON').setFontWeight('bold');
  }
  return sheet;
}

// Alamat pengiriman: WO → nama klien → Master_Klien.alamat.
function _kirimAlamatByWO(noWO) {
  try {
    var nama = '';
    var regs = _bomRegisteredWOs();
    for (var i = 0; i < regs.length; i++) { if (regs[i].noWO === noWO) { nama = regs[i].namaKlien; break; } }
    if (!nama) return '';
    var cust = getCustomerList();
    for (var j = 0; j < cust.length; j++) { if ((cust[j].nama || '') === nama) return cust[j].alamat || ''; }
    return '';
  } catch (e) { return ''; }
}

// Normalkan nilai tanggal → dd/MM/yyyy (Date object, string "…GMT…", atau ISO).
function _sjFmtTgl(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var s = (v || '').toString();
    if (!s) return '';
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    if (s.indexOf('GMT') !== -1) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    }
    return s;
  } catch (e) { return (v || '').toString(); }
}

function _generateNoSuratJalan(sheet) {
  SpreadsheetApp.flush();
  var now = new Date();
  var romanMonth = _toRoman(now.getMonth() + 1);
  var year = now.getFullYear();
  var suffix = '/RGI/SJ/' + romanMonth + '/' + year;
  var maxSeq = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();   // kolom 2 = No Surat Jalan
    var pattern = new RegExp('^(\\d+)\\/RGI\\/SJ\\/' + romanMonth + '\\/' + year + '$');
    for (var i = 0; i < ids.length; i++) {
      var m = (ids[i][0] ? ids[i][0].toString() : '').match(pattern);
      if (m) { var s = parseInt(m[1], 10); if (s > maxSeq) maxSeq = s; }
    }
  }
  return String(maxSeq + 1).padStart(3, '0') + suffix;
}

// Status request pengiriman untuk sebuah WO ('' bila tak ada / selesai).
function _kirimReqStatus(noWO) {
  try {
    var sheet = _ensurePengirimanReqSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) return (data[i][1] || '').toString();
    }
    return '';
  } catch (e) { return ''; }
}

// Peta bomItemId → target (batas dikirim absolut) di request AKTIF ('Diminta').
function _kirimReqActiveMap(noWO) {
  try {
    var sheet = _ensurePengirimanReqSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO && (data[i][1] || '').toString() === 'Diminta') {
        var arr = []; try { arr = JSON.parse((data[i][5] || '[]')); } catch (e) { arr = []; }
        var map = {};
        arr.forEach(function (x) { map[(x.bomItemId || '').toString()] = Number(x.target) || 0; });
        return map;
      }
    }
    return {};
  } catch (e) { return {}; }
}

// Info project WO untuk pesan notifikasi.
function _kirimWOProject(noWO) {
  try {
    var regs = _bomRegisteredWOs();
    for (var i = 0; i < regs.length; i++) { if (regs[i].noWO === noWO) return { namaProject: regs[i].namaProject || '', namaKlien: regs[i].namaKlien || '' }; }
  } catch (e) {}
  return { namaProject: '', namaKlien: '' };
}

// WA ke warehouse saat PC request pengiriman material.
function _kirimNotifWarehouse(noWO, oleh, count) {
  try {
    if (typeof _waSendTo !== 'function' || typeof _qcPhonesByRole !== 'function') return;
    var proj = _kirimWOProject(noWO);
    var msg = '🚚 *Request Pengiriman Material*\nWO: ' + noWO + (proj.namaProject ? ' — ' + proj.namaProject : '') +
      '\nDiminta oleh: ' + (oleh || '-') + '\n' + (count || 0) + ' material siap dikirim dari gudang.\nMohon diproses di menu Inventory → Pengiriman Barang.';
    (_qcPhonesByRole('warehouse') || []).forEach(function (w) { _waSendTo(w.phone, msg); });
  } catch (e) {}
}

// PC: request pengiriman untuk WO. Parsial (pilih material) & bisa ditambah
// selama request masih aktif ('Diminta') → digabung jadi satu request.
// requestPengiriman(noWO, oleh, reqItems)
//   reqItems (opsional) = [{bomItemId, qty}] material terpilih PC untuk dikirim
//   lebih dulu (parsial). Bila kosong → semua material Reserved yang tersisa.
//   Disimpan sbg [{bomItemId, qty, target}] (target = dikirim absolut yg dituju),
//   sehingga warehouse hanya melihat material terpilih & request auto-Selesai
//   saat seluruh material terpilih terkirim penuh.
function requestPengiriman(noWO, oleh, reqItems) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };
    var res = getBOMByWO(noWO);
    if (!res || !res.success) return { success: false, message: 'Gagal memuat BoM.' };
    var items = res.items || [];
    if (!items.length) return { success: false, message: 'BoM belum ada material.' };

    // Peta material Approved dengan sisa Reserved (reserved − dikirim > 0).
    var sisaMap = {}, adaApproved = false;
    items.forEach(function (it) {
      if (it.status !== 'Approved') return;
      adaApproved = true;
      var reserved = Number(it.qtyReserved) || 0;
      var dikirim = Number(it.qtyDikirim) || 0;
      var sisa = reserved - dikirim;
      if (sisa > 0) sisaMap[(it.id || '').toString()] = { sisa: sisa, dikirim: dikirim, reserved: reserved };
    });
    if (!adaApproved) return { success: false, message: 'Belum ada material Approved.' };
    var ids = Object.keys(sisaMap);
    if (!ids.length) return { success: false, message: 'Belum ada material Reserved dari gudang untuk dikirim.' };

    // Susun material yang di-request. PC memilih sebagian → hanya itu; kosong → semua sisa.
    var chosen = [];
    if (reqItems && reqItems.length) {
      reqItems.forEach(function (r) {
        var bid = (r.bomItemId || '').toString();
        var m = sisaMap[bid];
        if (!m) return;
        var qty = Number(r.qty) || 0;
        if (qty <= 0 || qty > m.sisa) qty = m.sisa;
        chosen.push({ bomItemId: bid, qty: qty, dikirim: m.dikirim, reserved: m.reserved });
      });
    } else {
      ids.forEach(function (bid) { var m = sisaMap[bid]; chosen.push({ bomItemId: bid, qty: m.sisa, dikirim: m.dikirim, reserved: m.reserved }); });
    }
    if (!chosen.length) return { success: false, message: 'Pilih minimal 1 material Reserved untuk dikirim.' };

    var sheet = _ensurePengirimanReqSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) { if ((data[i][0] || '').toString().trim() === noWO) { rowIdx = i; break; } }
    var alamat = _kirimAlamatByWO(noWO);
    // target = batas dikirim absolut untuk material ini (di-cap pada reserved).
    var freshJson = JSON.stringify(chosen.map(function (c) { return { bomItemId: c.bomItemId, qty: c.qty, target: c.dikirim + c.qty }; }));
    if (rowIdx >= 0 && (data[rowIdx][1] || '').toString() === 'Diminta') {
      // Request masih aktif → GABUNG material ke request yang sama (satu request).
      // Material yang menyusul akan dikirim warehouse dalam surat jalan berikutnya.
      var existing = []; try { existing = JSON.parse((data[rowIdx][5] || '[]')); } catch (e) { existing = []; }
      var byId = {}; existing.forEach(function (x) { byId[(x.bomItemId || '').toString()] = x; });
      var ditambah = 0;
      chosen.forEach(function (c) {
        var e = byId[c.bomItemId];
        if (e) {
          // Tambah qty ke target lama (naikkan jumlah yang diminta), di-cap pada reserved.
          e.target = Math.min(c.reserved, (Number(e.target) || 0) + c.qty);
          e.qty = e.target - c.dikirim;
        } else {
          existing.push({ bomItemId: c.bomItemId, qty: c.qty, target: c.dikirim + c.qty });
          ditambah++;
        }
      });
      sheet.getRange(rowIdx + 1, 6).setValue(JSON.stringify(existing));
      try { _kirimNotifWarehouse(noWO, oleh, chosen.length); } catch (eN) {}
      return { success: true, message: ditambah ? (ditambah + ' material ditambahkan ke request pengiriman aktif WO ' + noWO + '.') : ('Request pengiriman WO ' + noWO + ' diperbarui.') };
    } else if (rowIdx >= 0) {
      // Request lama sudah Selesai/Dibatalkan → request BARU (overwrite baris).
      sheet.getRange(rowIdx + 1, 1, 1, 6).setValues([[noWO, 'Diminta', (oleh || '').toString(), _bomNow(), alamat, freshJson]]);
    } else {
      sheet.appendRow([noWO, 'Diminta', (oleh || '').toString(), _bomNow(), alamat, freshJson]);
    }
    try { _kirimNotifWarehouse(noWO, oleh, chosen.length); } catch (eN) {}
    return { success: true, message: 'Request pengiriman WO ' + noWO + ' (' + chosen.length + ' material) dikirim ke warehouse.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// PC: batalkan request (hanya bila belum ada pengiriman untuk WO).
function batalRequestPengiriman(noWO, oleh) {
  try {
    noWO = (noWO || '').toString().trim();
    var pSheet = _ensurePengirimanSheet(getSpreadsheet());
    var pd = pSheet.getDataRange().getValues();
    for (var i = 1; i < pd.length; i++) {
      if ((pd[i][2] || '').toString().trim() === noWO) {
        return { success: false, message: 'Sudah ada surat jalan untuk WO ini — request tidak bisa dibatalkan.' };
      }
    }
    var sheet = _ensurePengirimanReqSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var j = 1; j < data.length; j++) {
      if ((data[j][0] || '').toString().trim() === noWO) {
        sheet.getRange(j + 1, 2).setValue('Dibatalkan');
        return { success: true, message: 'Request pengiriman dibatalkan.' };
      }
    }
    return { success: false, message: 'Request tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Warehouse: daftar request aktif + material Reserved yang belum dikirim penuh.
function getPengirimanRequests() {
  try {
    var ss = getSpreadsheet();
    var reqSheet = _ensurePengirimanReqSheet(ss);
    var reqData = reqSheet.getDataRange().getValues();
    var projMap = {};
    _bomRegisteredWOs().forEach(function (r) { projMap[r.noWO] = r; });
    _ensureBOMItemSheet(ss);
    var iData = _cachedBOMItem();
    var out = [];
    for (var i = 1; i < reqData.length; i++) {
      if ((reqData[i][1] || '').toString() !== 'Diminta') continue;
      var noWO = (reqData[i][0] || '').toString().trim();
      var pj = projMap[noWO] || {};
      // Material terpilih PC (parsial). Legacy tanpa Items JSON → semua reserved.
      var reqMap = null;
      var reqRaw = (reqData[i][5] || '').toString();
      if (reqRaw) { try { var arr = JSON.parse(reqRaw); reqMap = {}; arr.forEach(function (x) { reqMap[(x.bomItemId || '').toString()] = Number(x.target) || 0; }); } catch (e) { reqMap = null; } }
      var mats = [];
      for (var j = 1; j < iData.length; j++) {
        if ((iData[j][1] || '').toString().trim() !== noWO) continue;
        var bid = (iData[j][0] || '').toString();
        var reserved = Number(iData[j][18]) || 0;
        var dikirim = Number(iData[j][26]) || 0;
        var sisa = reserved - dikirim;
        if (sisa <= 0) continue;
        if (reqMap) {
          if (!(bid in reqMap)) continue;               // material tak diminta di request ini
          var byTarget = reqMap[bid] - dikirim;          // dibatasi qty yang diminta
          if (byTarget <= 0) continue;
          if (byTarget < sisa) sisa = byTarget;
        }
        mats.push({
          id: (iData[j][0] || '').toString(),
          kategori: (iData[j][2] || '').toString(),
          namaMaterial: (iData[j][4] || '').toString(),
          merek: (iData[j][5] || '').toString(),
          satuan: (iData[j][7] || '').toString(),
          idStok: (iData[j][17] || '').toString(),
          qtyReserved: reserved,
          qtyDikirim: dikirim,
          qtySisa: sisa
        });
      }
      out.push({
        noWO: noWO,
        namaProject: pj.namaProject || '',
        namaKlien: pj.namaKlien || '',
        alamat: (reqData[i][4] || '').toString(),
        dimintaOleh: (reqData[i][2] || '').toString(),
        dimintaPada: (reqData[i][3] || '').toString(),
        items: mats
      });
    }
    return { success: true, list: out };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

// Warehouse: proses kirim (buat surat jalan). Stok keluar + HPP via gunakanStok.
// Tidak memegang LockService sendiri (hindari nested lock dgn gunakanStok).
// payload: { noWO, items:[{bomItemId, qty}], tanggal, kendaraan, driver, catatan, alamat, oleh }
function prosesKirim(payload) {
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var oleh = (payload.oleh || '').toString();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (_kirimReqStatus(noWO) !== 'Diminta') return { success: false, message: 'Tidak ada request pengiriman aktif untuk WO ini.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };
    var reqItems = payload.items || [];
    if (!reqItems.length) return { success: false, message: 'Pilih item & qty yang dikirim.' };

    var ss = getSpreadsheet();
    var pSheet = _ensurePengirimanSheet(ss);
    var itemSheet = _ensureBOMItemSheet(ss);
    var noSJ = _generateNoSuratJalan(pSheet);
    var tanggal = _sjFmtTgl((payload.tanggal || '').toString() || _fmtTgl(new Date()));

    var lines = [];
    for (var k = 0; k < reqItems.length; k++) {
      var ri = reqItems[k] || {};
      var bid = (ri.bomItemId || '').toString().trim();
      var qty = Number(ri.qty) || 0;
      if (!bid || qty <= 0) continue;
      var f = _bomFindItemRow(itemSheet, bid);
      if (!f) continue;
      var row = f.row;
      var reserved = Number(row[18]) || 0;
      var dikirim = Number(row[26]) || 0;
      var sisa = reserved - dikirim;
      if (sisa <= 0) continue;
      if (qty > sisa) qty = sisa;
      var idStok = (row[17] || '').toString();
      if (!idStok) continue;
      var res = gunakanStok(noWO, idStok, qty, tanggal, 'Pengiriman ' + noSJ + ' — ' + (row[4] || ''), oleh);
      if (!res || res.success === false) {
        return { success: false, message: 'Gagal keluarkan stok "' + idStok + '": ' + ((res && res.message) || '') };
      }
      // Update Qty Dikirim (kol 27) + Kirim Ref (kol 29).
      var refOld = (row[28] || '').toString();
      itemSheet.getRange(f.rowIdx + 1, 27).setValue(dikirim + qty);
      itemSheet.getRange(f.rowIdx + 1, 29).setValue(refOld ? (refOld + ';' + noSJ) : noSJ);
      lines.push({
        bomItemId: bid, namaMaterial: (row[4] || '').toString(), merek: (row[5] || '').toString(),
        satuan: (row[7] || '').toString(), qty: qty, idStok: idStok,
        hargaSatuan: Number(res.hargaSatuan) || 0, total: Number(res.total) || 0, mutasiId: (res.idMutasi || '').toString()
      });
    }
    if (!lines.length) return { success: false, message: 'Tidak ada item valid untuk dikirim.' };

    var idKirim = 'SJ-' + new Date().getTime();
    pSheet.appendRow([
      idKirim, noSJ, noWO, tanggal, 'Dikirim',
      oleh, _bomNow(), (payload.alamat || _kirimAlamatByWO(noWO)).toString(),
      (payload.kendaraan || '').toString(), (payload.driver || '').toString(), (payload.catatan || '').toString(),
      JSON.stringify(lines), '', '', '', '', ''
    ]);

    // Bila semua material Reserved WO sudah dikirim penuh → request Selesai.
    _kirimCekRequestSelesai(ss, noWO);
    invalidateStokCache();
    try { invalidateBOMCache(); } catch (e) {}
    return { success: true, message: 'Surat Jalan ' + noSJ + ' dibuat. Stok keluar & HPP tercatat.', noSuratJalan: noSJ, idKirim: idKirim };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function _kirimCekRequestSelesai(ss, noWO) {
  try {
    var reqSheet = _ensurePengirimanReqSheet(ss);
    var rd = reqSheet.getDataRange().getValues();
    var rowIdx = -1, reqRaw = '';
    for (var i = 1; i < rd.length; i++) {
      if ((rd[i][0] || '').toString().trim() === noWO && (rd[i][1] || '').toString() === 'Diminta') { rowIdx = i; reqRaw = (rd[i][5] || '').toString(); break; }
    }
    if (rowIdx < 0) return;

    var iData = _ensureBOMItemSheet(ss).getDataRange().getValues();
    var mp = {};
    for (var j = 1; j < iData.length; j++) {
      if ((iData[j][1] || '').toString().trim() !== noWO) continue;
      mp[(iData[j][0] || '').toString()] = { reserved: Number(iData[j][18]) || 0, dikirim: Number(iData[j][26]) || 0 };
    }

    var selesai = true, reqArr = null;
    if (reqRaw) { try { reqArr = JSON.parse(reqRaw); } catch (e) { reqArr = null; } }
    if (reqArr && reqArr.length) {
      // Selesai bila tiap material terpilih sudah terpenuhi (dikirim ≥ target)
      // atau tak ada lagi sisa reserved untuk material itu.
      for (var k = 0; k < reqArr.length; k++) {
        var m = mp[(reqArr[k].bomItemId || '').toString()] || { reserved: 0, dikirim: 0 };
        var remain = Math.min((Number(reqArr[k].target) || 0) - m.dikirim, m.reserved - m.dikirim);
        if (remain > 0) { selesai = false; break; }
      }
    } else {
      // Legacy: seluruh reserved-unshipped WO sudah habis.
      for (var bidk in mp) { if ((mp[bidk].reserved - mp[bidk].dikirim) > 0) { selesai = false; break; } }
    }
    if (selesai) reqSheet.getRange(rowIdx + 1, 2).setValue('Selesai');
  } catch (e) {}
}

// Warehouse: konfirmasi barang diterima di lokasi (+ bukti).
function terimaPengiriman(payload) {
  try {
    payload = payload || {};
    var idKirim = (payload.idKirim || '').toString().trim();
    if (!idKirim) return { success: false, message: 'ID Kirim wajib.' };
    var buktiUrl = (payload.buktiFileUrl || '').toString().trim();  // opsional
    var ss = getSpreadsheet();
    var pSheet = _ensurePengirimanSheet(ss);
    var data = pSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idKirim) {
        if ((data[i][4] || '').toString() !== 'Dikirim') return { success: false, message: 'Surat jalan tidak berstatus Dikirim.' };
        pSheet.getRange(i + 1, 5).setValue('Diterima');
        pSheet.getRange(i + 1, 13, 1, 4).setValues([[(payload.oleh || '').toString(), _bomNow(), (payload.buktiFileId || '').toString(), buktiUrl]]);
        pSheet.getRange(i + 1, 17).setValue((payload.buktiFileName || '').toString());
        // Update Qty Diterima (kol 28) tiap material.
        var lines = [];
        try { lines = JSON.parse(data[i][11] || '[]'); } catch (eJ) { lines = []; }
        var itemSheet = _ensureBOMItemSheet(ss);
        lines.forEach(function (ln) {
          var f = _bomFindItemRow(itemSheet, (ln.bomItemId || '').toString());
          if (!f) return;
          var diterima = Number(f.row[27]) || 0;
          itemSheet.getRange(f.rowIdx + 1, 28).setValue(diterima + (Number(ln.qty) || 0));
        });
        try { invalidateBOMCache(); } catch (e) {}
        return { success: true, message: 'Surat Jalan ' + (data[i][1] || '') + ' ditandai Diterima di lokasi.' };
      }
    }
    return { success: false, message: 'Surat jalan tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Daftar surat jalan (untuk tab warehouse & riwayat). params.status opsional.
function getPengirimanList(params) {
  try {
    params = params || {};
    var fStatus = (params.status || '').toString();
    var ss = getSpreadsheet();
    var sheet = _ensurePengirimanSheet(ss);
    var data = sheet.getDataRange().getValues();
    var projMap = {};
    _bomRegisteredWOs().forEach(function (r) { projMap[r.noWO] = r; });
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var st = (data[i][4] || '').toString();
      if (fStatus && st !== fStatus) continue;
      var noWO = (data[i][2] || '').toString();
      var pj = projMap[noWO] || {};
      var lines = [];
      try { lines = JSON.parse(data[i][11] || '[]'); } catch (eJ) { lines = []; }
      list.push({
        idKirim: (data[i][0] || '').toString(),
        noSuratJalan: (data[i][1] || '').toString(),
        noWO: noWO,
        namaProject: pj.namaProject || '',
        namaKlien: pj.namaKlien || '',
        tanggalKirim: _sjFmtTgl(data[i][3]),
        status: st,
        dikirimOleh: (data[i][5] || '').toString(),
        alamat: (data[i][7] || '').toString(),
        kendaraan: (data[i][8] || '').toString(),
        driver: (data[i][9] || '').toString(),
        catatan: (data[i][10] || '').toString(),
        items: lines,
        diterimaOleh: (data[i][12] || '').toString(),
        diterimaPada: (data[i][13] || '').toString(),
        buktiFileUrl: (data[i][15] || '').toString(),
        buktiFileName: (data[i][16] || '').toString()
      });
    }
    list.reverse();   // terbaru dulu
    return { success: true, list: list };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}
