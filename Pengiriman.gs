/**
 * Pengiriman Barang — surat jalan dari gudang berdasarkan BoM (Model B).
 * Alur: PC "Request Pengiriman" (semua material Reserved) → warehouse proses
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
    sheet.appendRow(['No WO', 'Status', 'Diminta Oleh', 'Diminta Pada', 'Alamat']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
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

// PC: request pengiriman untuk WO (syarat: semua material Approved sudah tuntas
// diproses procurement & ada minimal 1 porsi Reserved dari gudang untuk dikirim).
function requestPengiriman(noWO, oleh) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var guard = _bomEditGuard(noWO);
    if (!guard.ok) return { success: false, message: guard.message };
    var res = getBOMByWO(noWO);
    if (!res || !res.success) return { success: false, message: 'Gagal memuat BoM.' };
    var items = res.items || [];
    if (!items.length) return { success: false, message: 'BoM belum ada material.' };
    var adaBelum = false, anyReserved = false, adaApproved = false;
    items.forEach(function (it) {
      if (it.status !== 'Approved') { if (it.status !== 'Rejected') adaBelum = true; return; }
      adaApproved = true;
      if ((it.qtyBeli || 0) > 0 || (it.qtyMenungguBL || 0) > 0 || !it.procStatus) adaBelum = true;
      if (((it.qtyReserved || 0) - (it.qtyDikirim || 0)) > 0) anyReserved = true;
    });
    if (!adaApproved) return { success: false, message: 'Belum ada material Approved.' };
    if (adaBelum) return { success: false, message: 'Masih ada material yang belum selesai diproses procurement (perlu diproses / perlu dibeli / tunggu beli).' };
    if (!anyReserved) return { success: false, message: 'Tidak ada material Reserved dari gudang untuk dikirim.' };

    var sheet = _ensurePengirimanReqSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) { if ((data[i][0] || '').toString().trim() === noWO) { rowIdx = i; break; } }
    var alamat = _kirimAlamatByWO(noWO);
    if (rowIdx >= 0) {
      if ((data[rowIdx][1] || '').toString() === 'Diminta') return { success: false, message: 'Request pengiriman untuk WO ini sudah aktif.' };
      sheet.getRange(rowIdx + 1, 1, 1, 5).setValues([[noWO, 'Diminta', (oleh || '').toString(), _bomNow(), alamat]]);
    } else {
      sheet.appendRow([noWO, 'Diminta', (oleh || '').toString(), _bomNow(), alamat]);
    }
    return { success: true, message: 'Request pengiriman WO ' + noWO + ' dikirim ke warehouse.' };
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
    var itemSheet = _ensureBOMItemSheet(ss);
    var iData = itemSheet.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < reqData.length; i++) {
      if ((reqData[i][1] || '').toString() !== 'Diminta') continue;
      var noWO = (reqData[i][0] || '').toString().trim();
      var pj = projMap[noWO] || {};
      var mats = [];
      for (var j = 1; j < iData.length; j++) {
        if ((iData[j][1] || '').toString().trim() !== noWO) continue;
        var reserved = Number(iData[j][18]) || 0;
        var dikirim = Number(iData[j][26]) || 0;
        var sisa = reserved - dikirim;
        if (sisa <= 0) continue;
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
    return { success: true, message: 'Surat Jalan ' + noSJ + ' dibuat. Stok keluar & HPP tercatat.', noSuratJalan: noSJ, idKirim: idKirim };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function _kirimCekRequestSelesai(ss, noWO) {
  try {
    var iData = _ensureBOMItemSheet(ss).getDataRange().getValues();
    var adaSisa = false;
    for (var j = 1; j < iData.length; j++) {
      if ((iData[j][1] || '').toString().trim() !== noWO) continue;
      if (((Number(iData[j][18]) || 0) - (Number(iData[j][26]) || 0)) > 0) { adaSisa = true; break; }
    }
    if (adaSisa) return;
    var reqSheet = _ensurePengirimanReqSheet(ss);
    var rd = reqSheet.getDataRange().getValues();
    for (var i = 1; i < rd.length; i++) {
      if ((rd[i][0] || '').toString().trim() === noWO && (rd[i][1] || '').toString() === 'Diminta') {
        reqSheet.getRange(i + 1, 2).setValue('Selesai');
        break;
      }
    }
  } catch (e) {}
}

// Warehouse: konfirmasi barang diterima di lokasi (+ bukti).
function terimaPengiriman(payload) {
  try {
    payload = payload || {};
    var idKirim = (payload.idKirim || '').toString().trim();
    if (!idKirim) return { success: false, message: 'ID Kirim wajib.' };
    var buktiUrl = (payload.buktiFileUrl || '').toString().trim();
    if (!buktiUrl) return { success: false, message: 'Bukti barang diterima wajib dilampirkan.' };
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
