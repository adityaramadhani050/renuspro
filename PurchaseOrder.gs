/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Purchase Order (PO): penomoran, simpan, edit, daftar, pembayaran.
 *
 * Sheet Purchase_Order — kolom (0-based):
 *  0  No PO           (mis. 001/RGI/PO/VI/2026)
 *  1  Tanggal
 *  2  ID Supplier
 *  3  Nama Supplier
 *  4  Peruntukan
 *  5  No WO
 *  6  Status PO       Aktif | Diterima Sebagian | Diterima | Selesai | Batal
 *  7  Subtotal
 *  8  PPN Persen
 *  9  PPN Nominal
 * 10  Grand Total
 * 11  Catatan
 * 12  Status Bayar    Belum Dibayar | Dibayar Sebagian | Lunas
 * 13  Total Dibayar
 * 14  Dibuat Oleh
 * 15  Dibuat Pada
 * 16  Diubah Oleh
 * 17  Diubah Pada
 * 18  Diskon Persen
 * 19  Diskon Nominal
 * 20  No Quotation
 * 21  Tanggal Quotation
 * 22  Term Conditions (JSON)
 *
 * Sheet PO_Item — kolom (0-based):
 *  0  ID Item
 *  1  No PO
 *  2  Nama Item
 *  3  Qty
 *  4  Satuan
 *  5  Harga Beli Satuan
 *  6  Total
 *  7  Catatan
 *  8  Qty Diterima  (ditambah Modul Inventory)
 *
 * Sheet Pembayaran_PO — kolom (0-based):
 *  0  ID Bayar
 *  1  No PO
 *  2  Tanggal Bayar
 *  3  ID Akun
 *  4  Nama Akun
 *  5  Jumlah
 *  6  Catatan
 *  7  Dibuat Oleh
 *  8  Dibuat Pada
 */

// ── Cache helpers ─────────────────────────────────────────────────────────────

function _cachedPO() {
  return _cacheGetSheet('cache_po', 'Purchase_Order');
}

function invalidatePOCache() {
  invalidateCache(['cache_po', 'cache_po_item']);
}

function _cachedPembayaranPO() {
  return _cacheGetSheet('cache_pem_po', 'Pembayaran_PO');
}

function invalidatePembayaranPOCache() {
  invalidateCache(['cache_pem_po']);
}

// ── Sheet bootstrapping ───────────────────────────────────────────────────────

function _ensurePOSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Purchase_Order');
  if (!sheet) {
    sheet = ss.insertSheet('Purchase_Order');
    sheet.appendRow([
      'No PO', 'Tanggal', 'ID Supplier', 'Nama Supplier', 'Peruntukan',
      'No WO', 'Status PO', 'Subtotal', 'PPN Persen', 'PPN Nominal',
      'Grand Total', 'Catatan', 'Status Bayar', 'Total Dibayar',
      'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada'
    ]);
  }
  return sheet;
}

function _ensurePOItemSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('PO_Item');
  if (!sheet) {
    sheet = ss.insertSheet('PO_Item');
    sheet.appendRow([
      'ID Item', 'No PO', 'Nama Item', 'Qty', 'Satuan',
      'Harga Beli Satuan', 'Total', 'Catatan', 'Qty Diterima'
    ]);
  }
  return sheet;
}

function _ensurePOItemCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('PO_Item');
  if (!sheet) return _ensurePOItemSheet(ss);
  if (sheet.getLastColumn() < 9) sheet.getRange(1, 9).setValue('Qty Diterima');
  return sheet;
}

function _ensurePODiskonCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Purchase_Order');
  if (!sheet) return _ensurePOSheet(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 19) sheet.getRange(1, 19).setValue('Diskon Persen');
  if (lastCol < 20) sheet.getRange(1, 20).setValue('Diskon Nominal');
  return sheet;
}

function _ensurePOQuotCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Purchase_Order');
  if (!sheet) return _ensurePOSheet(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 21) sheet.getRange(1, 21).setValue('No Quotation');
  if (lastCol < 22) sheet.getRange(1, 22).setValue('Tanggal Quotation');
  if (lastCol < 23) sheet.getRange(1, 23).setValue('Term Conditions');
  return sheet;
}

function _ensurePOFileCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Purchase_Order');
  if (!sheet) return _ensurePOSheet(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 24) sheet.getRange(1, 24).setValue('Quot File Id');
  if (lastCol < 25) sheet.getRange(1, 25).setValue('Quot File Url');
  if (lastCol < 26) sheet.getRange(1, 26).setValue('Quot File Nama');
  return sheet;
}

function _getPOQuotationFolder() {
  var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
  var parents = ssFile.getParents();
  var rootFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var folderName = 'RenusPro - File Penawaran Supplier (PO)';
  var existing = rootFolder.getFoldersByName(folderName);
  if (existing.hasNext()) return existing.next();
  return rootFolder.createFolder(folderName);
}

function uploadFilePOQuotationSupplier(payload) {
  try {
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var fileName   = payload.fileName   ? payload.fileName.toString()   : 'penawaran-supplier';
    var mimeType   = payload.mimeType   ? payload.mimeType.toString()   : 'application/octet-stream';
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    var bytes = Utilities.base64Decode(base64Data);
    var blob  = Utilities.newBlob(bytes, mimeType, fileName);
    var folder = _getPOQuotationFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      fileId:   file.getId(),
      fileUrl:  file.getUrl(),
      fileName: fileName
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function _ensurePembayaranPOSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pembayaran_PO');
  if (!sheet) {
    sheet = ss.insertSheet('Pembayaran_PO');
    sheet.appendRow([
      'ID Bayar', 'No PO', 'Tanggal Bayar', 'ID Akun', 'Nama Akun',
      'Jumlah', 'Catatan', 'Dibuat Oleh', 'Dibuat Pada'
    ]);
  }
  return sheet;
}

// ── Roman numeral helper ──────────────────────────────────────────────────────
var _ROMAN_MONTHS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function _toRoman(month) { return _ROMAN_MONTHS[(month - 1)] || String(month); }

// ── ID generation ─────────────────────────────────────────────────────────────

function _generateNoPO(sheet) {
  SpreadsheetApp.flush();
  var now = new Date();
  var month = now.getMonth() + 1; // 1-based
  var year = now.getFullYear();
  var romanMonth = _toRoman(month);
  var prefix = '/RGI/PO/' + romanMonth + '/' + year;
  var maxSeq = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var val = ids[i][0] ? ids[i][0].toString() : '';
      // Match NNN/RGI/PO/ROMAN/YYYY where ROMAN and YYYY match current month/year
      var pattern = new RegExp('^(\\d+)\\/RGI\\/PO\\/' + romanMonth + '\\/' + year + '$');
      var m = val.match(pattern);
      if (m) {
        var seq = parseInt(m[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  }
  var next = String(maxSeq + 1).padStart(3, '0');
  return next + prefix;
}

function _generateIdPembayaranPO(sheet) {
  SpreadsheetApp.flush();
  var now = new Date();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();
  var romanMonth = _toRoman(month);
  var prefix = '/RGI/POP/' + romanMonth + '/' + year;
  var maxSeq = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var val = ids[i][0] ? ids[i][0].toString() : '';
      var pattern = new RegExp('^(\\d+)\\/RGI\\/POP\\/' + romanMonth + '\\/' + year + '$');
      var m = val.match(pattern);
      if (m) {
        var seq = parseInt(m[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  }
  var next = String(maxSeq + 1).padStart(3, '0');
  return next + prefix;
}

// ── Private helper ────────────────────────────────────────────────────────────

function _hitungStatusBayarPO(grandTotal, totalDibayar) {
  grandTotal = parseFloat(grandTotal) || 0;
  totalDibayar = parseFloat(totalDibayar) || 0;
  if (totalDibayar <= 0) return 'Belum Dibayar';
  if (totalDibayar >= grandTotal) return 'Lunas';
  return 'Dibayar Sebagian';
}

// ── Read operations ───────────────────────────────────────────────────────────

function getPOList() {
  try {
    var data = _cachedPO();

    // Build noWO → namaProject map from Penawaran_Main (col[17]=noWO, col[4]=namaProject)
    var woNamaMap = {};
    try {
      var penData = _cachedPenawaran();
      for (var p = 1; p < penData.length; p++) {
        var wNo = penData[p][17] != null ? penData[p][17].toString().trim() : '';
        var wNm = penData[p][4]  ? penData[p][4].toString().trim()  : '';
        if (wNo && wNm) woNamaMap[wNo] = wNm;
      }
    } catch(e2) { /* ignore — nama project not critical */ }

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;
      var noWO2 = r[5] ? r[5].toString() : '';
      var subtotal2     = parseFloat(r[7])  || 0;
      var diskonNominal2 = parseFloat(r[19]) || 0;
      list.push({
        noPO:         r[0]  ? r[0].toString()  : '',
        tanggal:      _fmtTgl(r[1]),
        idSupplier:   r[2]  ? r[2].toString()  : '',
        namaSupplier: r[3]  ? r[3].toString()  : '',
        peruntukan:   r[4]  ? r[4].toString()  : '',
        noWO:         noWO2,
        namaProject:  noWO2 ? (woNamaMap[noWO2] || '') : '',
        statusPO:     r[6]  ? r[6].toString()  : '',
        subtotal:     subtotal2,
        nilaiDPP:     Math.max(0, subtotal2 - diskonNominal2),
        ppnPersen:    parseFloat(r[8])  || 0,
        ppnNominal:   parseFloat(r[9])  || 0,
        grandTotal:   parseFloat(r[10]) || 0,
        catatan:      r[11] ? r[11].toString() : '',
        statusBayar:  r[12] ? r[12].toString() : '',
        totalDibayar: parseFloat(r[13]) || 0,
        dibuatOleh:    r[14] ? r[14].toString() : '',
        dibuatPada:    _fmtTgl(r[15]),
        diskonPersen:  parseFloat(r[18]) || 0,
        diskonNominal: parseFloat(r[19]) || 0,
        quotNo:        r[20] ? r[20].toString() : '',
        quotTanggal:   _fmtTgl(r[21]),
        termConditions: r[22] ? r[22].toString() : '',
        quotFileId:    r[23] ? r[23].toString() : '',
        quotFileUrl:   r[24] ? r[24].toString() : '',
        quotFileName:  r[25] ? r[25].toString() : ''
      });
    }
    return list;
  } catch (e) {
    return [];
  }
}

function getPODetail(noPO) {
  try {
    var ss = getSpreadsheet();
    SpreadsheetApp.flush();

    // Header
    var poSheet = _ensurePOSheet(ss);
    var poData = poSheet.getDataRange().getValues();
    var header = null;
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        var r = poData[i];
        header = {
          noPO:         r[0]  ? r[0].toString()  : '',
          tanggal:      _fmtTgl(r[1]),
          idSupplier:   r[2]  ? r[2].toString()  : '',
          namaSupplier: r[3]  ? r[3].toString()  : '',
          peruntukan:   r[4]  ? r[4].toString()  : '',
          noWO:         r[5]  ? r[5].toString()  : '',
          statusPO:     r[6]  ? r[6].toString()  : '',
          subtotal:     parseFloat(r[7])  || 0,
          ppnPersen:    parseFloat(r[8])  || 0,
          ppnNominal:   parseFloat(r[9])  || 0,
          grandTotal:   parseFloat(r[10]) || 0,
          catatan:      r[11] ? r[11].toString() : '',
          statusBayar:  r[12] ? r[12].toString() : '',
          totalDibayar: parseFloat(r[13]) || 0,
          dibuatOleh:   r[14] ? r[14].toString() : '',
          dibuatPada:   _fmtTgl(r[15]),
          diubahOleh:    r[16] ? r[16].toString() : '',
          diubahPada:    _fmtTgl(r[17]),
          diskonPersen:  parseFloat(r[18]) || 0,
          diskonNominal: parseFloat(r[19]) || 0,
          quotNo:        r[20] ? r[20].toString() : '',
          quotTanggal:   _fmtTgl(r[21]),
          termConditions: r[22] ? r[22].toString() : '',
          quotFileId:    r[23] ? r[23].toString() : '',
          quotFileUrl:   r[24] ? r[24].toString() : '',
          quotFileName:  r[25] ? r[25].toString() : ''
        };
        break;
      }
    }
    if (!header) return { success: false, message: 'No PO tidak ditemukan.' };

    // Items
    var itemSheet = _ensurePOItemSheet(ss);
    var itemData = itemSheet.getDataRange().getValues();
    var items = [];
    for (var j = 1; j < itemData.length; j++) {
      var ir = itemData[j];
      if (ir[1] && ir[1].toString() === noPO) {
        items.push({
          idItem:      ir[0] ? ir[0].toString() : '',
          noPO:        ir[1] ? ir[1].toString() : '',
          namaItem:    ir[2] ? ir[2].toString() : '',
          qty:         parseFloat(ir[3]) || 0,
          satuan:      ir[4] ? ir[4].toString() : '',
          hargaBeli:   parseFloat(ir[5]) || 0,
          total:       parseFloat(ir[6]) || 0,
          catatan:     ir[7] ? ir[7].toString() : '',
          qtyDiterima: parseFloat(ir[8]) || 0
        });
      }
    }

    // Pembayaran
    var bayarSheet = _ensurePembayaranPOSheet(ss);
    var bayarData = bayarSheet.getDataRange().getValues();
    var pembayaran = [];
    for (var k = 1; k < bayarData.length; k++) {
      var br = bayarData[k];
      if (br[1] && br[1].toString() === noPO) {
        pembayaran.push({
          idBayar:     br[0] ? br[0].toString() : '',
          noPO:        br[1] ? br[1].toString() : '',
          tanggalBayar: _fmtTgl(br[2]),
          idAkun:      br[3] ? br[3].toString() : '',
          namaAkun:    br[4] ? br[4].toString() : '',
          jumlah:      parseFloat(br[5]) || 0,
          catatan:     br[6] ? br[6].toString() : '',
          dibuatOleh:  br[7] ? br[7].toString() : '',
          dibuatPada:  _fmtTgl(br[8])
        });
      }
    }

    // Payment Requests
    var prSheet = _ensurePOPaymentRequestInvoiceCols(ss);
    SpreadsheetApp.flush();
    var prData  = prSheet.getDataRange().getValues();
    var paymentRequests = [];
    for (var pr = 1; pr < prData.length; pr++) {
      if ((prData[pr][1] || '').toString() !== noPO) continue;
      paymentRequests.push({
        idReq:          prData[pr][0]  ? prData[pr][0].toString()  : '',
        tanggalRequest: prData[pr][5]  ? _fmtTgl(prData[pr][5]) : '',
        jumlah:         parseFloat(prData[pr][6]) || 0,
        persentase:     parseFloat(prData[pr][7]) || 0,
        catatan:        prData[pr][8]  ? prData[pr][8].toString()  : '',
        status:         prData[pr][9]  ? prData[pr][9].toString()  : '',
        dibuatOleh:     prData[pr][10] ? prData[pr][10].toString() : '',
        namaAkun:       prData[pr][12] ? prData[pr][12].toString() : '',
        tanggalApprove: prData[pr][14] ? _fmtTgl(prData[pr][14]) : '',
        invoiceFileUrl:  prData[pr][16] ? prData[pr][16].toString() : '',
        invoiceFileName: prData[pr][17] ? prData[pr][17].toString() : '',
        catatanTolak:   prData[pr][18] ? prData[pr][18].toString() : '',
        buktiFileUrl:   prData[pr][20] ? prData[pr][20].toString() : '',
        buktiFileName:  prData[pr][21] ? prData[pr][21].toString() : ''
      });
    }

    // Riwayat Penerimaan Barang
    var riwayatPenerimaan = getRiwayatPenerimaanPO(noPO);

    return { success: true, po: header, items: items, pembayaran: pembayaran, paymentRequests: paymentRequests, riwayatPenerimaan: riwayatPenerimaan };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getRiwayatPenerimaanPO(noPO) {
  try {
    var ss = getSpreadsheet();
    var logSheet = _ensurePenerimaanPOLogSheet(ss);
    var logData  = logSheet.getDataRange().getValues();
    var riwayat = [];
    for (var i = 1; i < logData.length; i++) {
      var lr = logData[i];
      if ((lr[1] || '').toString().trim() !== noPO) continue;
      var detailItem = [];
      try { detailItem = JSON.parse(lr[5] || '[]'); } catch (eParse) { detailItem = []; }
      riwayat.push({
        idLog:      lr[0] ? lr[0].toString() : '',
        noPO:       lr[1] ? lr[1].toString() : '',
        tanggal:    _fmtTgl(lr[2]),
        mode:       lr[3] ? lr[3].toString() : '',
        jumlahItem: parseFloat(lr[4]) || 0,
        items:      detailItem,
        dibuatOleh: lr[6] ? lr[6].toString() : '',
        dibuatPada: _fmtTgl(lr[7]),
        buktiFileId:   lr[8] ? lr[8].toString() : '',
        buktiFileUrl:  lr[9] ? lr[9].toString() : '',
        buktiFileName: lr[10] ? lr[10].toString() : ''
      });
    }
    return riwayat;
  } catch (e) {
    return [];
  }
}

// ── Write operations ──────────────────────────────────────────────────────────

function simpanPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var idSupplier = payload.idSupplier ? payload.idSupplier.toString().trim() : '';
    if (!idSupplier) return { success: false, message: 'ID Supplier tidak boleh kosong.' };
    if (!payload.items || payload.items.length === 0) {
      return { success: false, message: 'PO harus memiliki minimal 1 item.' };
    }

    var ss = getSpreadsheet();
    var poSheet    = _ensurePOSheet(ss);
    var itemSheet  = _ensurePOItemSheet(ss);

    var noPO = _generateNoPO(poSheet);
    var now  = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    // Hitung nilai
    _ensurePODiskonCols(ss);
    _ensurePOQuotCols(ss);
    _ensurePOFileCols(ss);
    var subtotal = 0;
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
      subtotal += (parseFloat(it.qty) || 0) * (parseFloat(it.hargaBeli) || 0);
    }
    var diskonPersen  = parseFloat(payload.diskonPersen)  || 0;
    var diskonNominal = parseFloat(payload.diskonNominal) || Math.round(subtotal * diskonPersen / 100);
    if (diskonNominal > subtotal) diskonNominal = subtotal;
    var setelahDiskon = subtotal - diskonNominal;
    var ppnPersen  = parseFloat(payload.ppnPersen) || 0;
    var ppnNominal = Math.round(setelahDiskon * ppnPersen / 100);
    var grandTotal = setelahDiskon + ppnNominal;

    var tanggalStr = payload.tanggal ? payload.tanggal.toString() : _fmtTgl(now);

    // Tulis header PO
    poSheet.appendRow([
      noPO,
      tanggalStr,
      idSupplier,
      payload.namaSupplier   ? payload.namaSupplier.toString()   : '',
      payload.peruntukan     ? payload.peruntukan.toString()     : '',
      payload.noWO           ? payload.noWO.toString()           : '',
      'Aktif',
      subtotal,
      ppnPersen,
      ppnNominal,
      grandTotal,
      payload.catatan        ? payload.catatan.toString()        : '',
      'Belum Dibayar',
      0,
      payload.dibuatOleh     ? payload.dibuatOleh.toString()     : '',
      nowStr,
      '',
      '',
      diskonPersen,
      diskonNominal,
      payload.quotNo         ? payload.quotNo.toString()         : '',
      payload.quotTanggal    ? payload.quotTanggal.toString()    : '',
      payload.termConditions ? payload.termConditions.toString() : '',
      payload.quotFileId     ? payload.quotFileId.toString()     : '',
      payload.quotFileUrl    ? payload.quotFileUrl.toString()    : '',
      payload.quotFileName   ? payload.quotFileName.toString()   : ''
    ]);

    // Tulis item
    var ts = now.getTime();
    for (var idx = 0; idx < payload.items.length; idx++) {
      var item = payload.items[idx];
      var qty       = parseFloat(item.qty)       || 0;
      var hargaBeli = parseFloat(item.hargaBeli) || 0;
      var totalItem = qty * hargaBeli;
      itemSheet.appendRow([
        'POI-' + ts + '-' + idx,
        noPO,
        item.namaItem  ? item.namaItem.toString()  : '',
        qty,
        item.satuan    ? item.satuan.toString()    : '',
        hargaBeli,
        totalItem,
        item.catatan   ? item.catatan.toString()   : ''
      ]);
    }

    invalidatePOCache();
    return { success: true, message: 'Purchase Order ' + noPO + ' berhasil dibuat.', noPO: noPO };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function editPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var noPO = payload.noPO ? payload.noPO.toString().trim() : '';
    if (!noPO) return { success: false, message: 'No PO tidak boleh kosong.' };
    if (!payload.items || payload.items.length === 0) {
      return { success: false, message: 'PO harus memiliki minimal 1 item.' };
    }

    var ss       = getSpreadsheet();
    var poSheet  = _ensurePOSheet(ss);
    SpreadsheetApp.flush();

    var poData = poSheet.getDataRange().getValues();
    var poRowIdx = -1;
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx = i + 1; // 1-based sheet row
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };
    if (poData[poRowIdx - 1][6] !== 'Aktif') {
      return { success: false, message: 'Hanya PO berstatus Aktif yang dapat diedit.' };
    }

    var itemSheet = _ensurePOItemSheet(ss);
    var itemData  = itemSheet.getDataRange().getValues();

    // Hapus item lama (loop dari bawah agar index tidak bergeser)
    for (var j = itemData.length - 1; j >= 1; j--) {
      if (itemData[j][1] && itemData[j][1].toString() === noPO) {
        itemSheet.deleteRow(j + 1);
      }
    }

    // Hitung ulang nilai
    _ensurePODiskonCols(ss);
    _ensurePOQuotCols(ss);
    _ensurePOFileCols(ss);
    var subtotal = 0;
    for (var k = 0; k < payload.items.length; k++) {
      var it = payload.items[k];
      subtotal += (parseFloat(it.qty) || 0) * (parseFloat(it.hargaBeli) || 0);
    }
    var diskonPersen  = parseFloat(payload.diskonPersen)  || 0;
    var diskonNominal = parseFloat(payload.diskonNominal) || Math.round(subtotal * diskonPersen / 100);
    if (diskonNominal > subtotal) diskonNominal = subtotal;
    var setelahDiskon = subtotal - diskonNominal;
    var ppnPersen  = parseFloat(payload.ppnPersen) || 0;
    var ppnNominal = Math.round(setelahDiskon * ppnPersen / 100);
    var grandTotal = setelahDiskon + ppnNominal;

    var now    = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var tanggalStr = payload.tanggal ? payload.tanggal.toString() : _fmtTgl(now);

    // Update header row
    var updateRange = poSheet.getRange(poRowIdx, 1, 1, 26);
    var existingRow = updateRange.getValues()[0];
    updateRange.setValues([[
      noPO,
      tanggalStr,
      payload.idSupplier   ? payload.idSupplier.toString()   : existingRow[2],
      payload.namaSupplier ? payload.namaSupplier.toString() : existingRow[3],
      payload.peruntukan   ? payload.peruntukan.toString()   : existingRow[4],
      payload.noWO         !== undefined ? payload.noWO.toString() : existingRow[5],
      existingRow[6], // status tidak berubah
      subtotal,
      ppnPersen,
      ppnNominal,
      grandTotal,
      payload.catatan !== undefined ? payload.catatan.toString() : existingRow[11],
      existingRow[12], // statusBayar
      existingRow[13], // totalDibayar
      existingRow[14], // dibuatOleh
      existingRow[15], // dibuatPada
      payload.diubahOleh ? payload.diubahOleh.toString() : '',
      nowStr,
      diskonPersen,
      diskonNominal,
      payload.quotNo         !== undefined ? payload.quotNo.toString()         : (existingRow[20] || ''),
      payload.quotTanggal    !== undefined ? payload.quotTanggal.toString()    : (existingRow[21] || ''),
      payload.termConditions !== undefined ? payload.termConditions.toString() : (existingRow[22] || ''),
      payload.quotFileId     !== undefined ? payload.quotFileId.toString()     : (existingRow[23] || ''),
      payload.quotFileUrl    !== undefined ? payload.quotFileUrl.toString()    : (existingRow[24] || ''),
      payload.quotFileName   !== undefined ? payload.quotFileName.toString()   : (existingRow[25] || '')
    ]]);

    // Tulis item baru
    var ts = now.getTime();
    for (var idx = 0; idx < payload.items.length; idx++) {
      var item      = payload.items[idx];
      var qty       = parseFloat(item.qty)       || 0;
      var hargaBeli = parseFloat(item.hargaBeli) || 0;
      var totalItem = qty * hargaBeli;
      itemSheet.appendRow([
        'POI-' + ts + '-' + idx,
        noPO,
        item.namaItem ? item.namaItem.toString() : '',
        qty,
        item.satuan   ? item.satuan.toString()   : '',
        hargaBeli,
        totalItem,
        item.catatan  ? item.catatan.toString()  : ''
      ]);
    }

    invalidatePOCache();
    return { success: true, message: 'Purchase Order ' + noPO + ' berhasil diperbarui.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function ubahStatusPO(noPO, statusBaru, namaUser) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss      = getSpreadsheet();
    var poSheet = _ensurePOSheet(ss);
    SpreadsheetApp.flush();

    var poData = poSheet.getDataRange().getValues();
    var poRowIdx = -1;
    var statusLama = '', statusBayar = '', totalDibayar = 0;
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx     = i + 1;
        statusLama   = poData[i][6]  ? poData[i][6].toString()  : '';
        statusBayar  = poData[i][12] ? poData[i][12].toString() : '';
        totalDibayar = parseFloat(poData[i][13]) || 0;
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };

    // Status terminal tidak bisa berubah
    if (statusLama === 'Selesai' || statusLama === 'Batal') {
      return { success: false, message: 'PO berstatus "' + statusLama + '" tidak bisa diubah lagi.' };
    }

    // Selesai: hanya dari Diterima dan harus Lunas
    if (statusBaru === 'Selesai') {
      if (statusLama !== 'Diterima') {
        return { success: false, message: 'PO harus berstatus "Diterima" untuk diselesaikan (saat ini: "' + statusLama + '").' };
      }
      if (statusBayar !== 'Lunas') {
        return { success: false, message: 'PO tidak bisa diselesaikan — status pembayaran belum Lunas (saat ini: "' + statusBayar + '").' };
      }
    } else if (statusBaru === 'Batal') {
      // Batal hanya untuk PO yang belum dikirim ke gudang/diterima dan belum ada pembayaran
      if (statusLama !== 'Aktif') {
        return { success: false, message: 'PO berstatus "' + statusLama + '" tidak bisa dibatalkan — barang sudah dalam proses penerimaan.' };
      }
      if (totalDibayar > 0) {
        return { success: false, message: 'PO tidak bisa dibatalkan — sudah ada pembayaran sebesar Rp ' + totalDibayar.toLocaleString('id-ID') + '.' };
      }
    } else {
      return { success: false, message: 'Status yang bisa diubah secara manual hanya "Selesai" atau "Batal".' };
    }

    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    poSheet.getRange(poRowIdx, 7).setValue(statusBaru);           // col 6 (0-based) = col 7 (1-based)
    poSheet.getRange(poRowIdx, 17).setValue(namaUser || '');      // col 16 = col 17
    poSheet.getRange(poRowIdx, 18).setValue(nowStr);              // col 17 = col 18

    invalidatePOCache();
    return { success: true, message: 'Status PO ' + noPO + ' berhasil diubah ke "' + statusBaru + '".' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Kirim PO ke gudang untuk diterima oleh warehouse
function submitPOKeGudang(noPO, namaUser) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss      = getSpreadsheet();
    var poSheet = _ensurePOSheet(ss);
    SpreadsheetApp.flush();
    var poData = poSheet.getDataRange().getValues();
    var poRowIdx = -1, statusPO = '';
    for (var i = 1; i < poData.length; i++) {
      if ((poData[i][0] || '').toString() === noPO) { poRowIdx = i + 1; statusPO = (poData[i][6] || '').toString(); break; }
    }
    if (poRowIdx === -1) return { success: false, message: 'PO tidak ditemukan.' };
    if (statusPO !== 'Aktif' && statusPO !== 'Diterima Sebagian') {
      return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa dikirim ke gudang.' };
    }
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    poSheet.getRange(poRowIdx, 7).setValue('Menunggu Penerimaan Gudang');
    poSheet.getRange(poRowIdx, 17).setValue(namaUser || '');
    poSheet.getRange(poRowIdx, 18).setValue(nowStr);
    invalidatePOCache();
    return { success: true, message: 'PO ' + noPO + ' berhasil dikirim ke gudang.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Terima barang langsung ke klien (tidak masuk inventory)
function terimaPOKirimLangsung(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var noPO  = (payload.noPO || '').toString().trim();
    var items = payload.items || [];
    if (!noPO) return { success: false, message: 'No PO tidak boleh kosong.' };

    var ss      = getSpreadsheet();
    var poSheet = _ensurePOSheet(ss);
    var itSheet = _ensurePOItemSheet(ss);
    _ensurePOItemCols(ss);
    SpreadsheetApp.flush();

    var poData = poSheet.getDataRange().getValues();
    var poRowIdx = -1, statusPO = '';
    for (var i = 1; i < poData.length; i++) {
      if ((poData[i][0] || '').toString() === noPO) {
        poRowIdx = i + 1; statusPO = (poData[i][6] || '').toString();
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'PO tidak ditemukan.' };
    if (statusPO !== 'Aktif' && statusPO !== 'Diterima Sebagian') {
      return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
    }

    var buktiFileUrl = (payload.buktiFileUrl || '').toString().trim();
    if (!buktiFileUrl) {
      return { success: false, message: 'Bukti barang diterima klien wajib dilampirkan.' };
    }

    var itData = itSheet.getDataRange().getValues();
    var itRowMap = {};
    for (var j = 1; j < itData.length; j++) {
      itRowMap[(itData[j][0] || '').toString()] = j;
    }

    // Validasi semua item sebelum tulis
    for (var ii = 0; ii < items.length; ii++) {
      var it = items[ii];
      var qtyTerima = Number(it.qty) || 0;
      if (qtyTerima <= 0) continue;
      var itRowIdx = itRowMap[it.idItem];
      if (itRowIdx === undefined) return { success: false, message: 'Item ' + it.idItem + ' tidak ditemukan.' };
      var qtyPesan = Number(itData[itRowIdx][3]) || 0;
      var qtyDiterima = Number(itData[itRowIdx][8]) || 0;
      var qtySisa = qtyPesan - qtyDiterima;
      if (qtyTerima > qtySisa) {
        return { success: false, message: 'Qty melebihi sisa untuk item "' + it.namaItem + '" (sisa: ' + qtySisa + ').' };
      }
    }

    // Tulis qty diterima
    var allDiterima = true;
    for (var kk = 0; kk < items.length; kk++) {
      var it2 = items[kk];
      var qtyTerima2 = Number(it2.qty) || 0;
      if (qtyTerima2 <= 0) continue;
      var itRowIdx2 = itRowMap[it2.idItem];
      var qtyDiterima2 = Number(itData[itRowIdx2][8]) || 0;
      itSheet.getRange(itRowIdx2 + 1, 9).setValue(qtyDiterima2 + qtyTerima2);
    }
    // Hitung status baru
    SpreadsheetApp.flush();
    itData = itSheet.getDataRange().getValues();
    for (var mm = 1; mm < itData.length; mm++) {
      if ((itData[mm][1] || '').toString() !== noPO) continue;
      var qtyP = Number(itData[mm][3]) || 0;
      var qtyD = Number(itData[mm][8]) || 0;
      if (qtyD < qtyP) { allDiterima = false; break; }
    }
    var nowStr2 = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var statusBaru = allDiterima ? 'Diterima' : 'Diterima Sebagian';
    poSheet.getRange(poRowIdx, 7).setValue(statusBaru);
    poSheet.getRange(poRowIdx, 17).setValue((payload.namaUser || '').toString());
    poSheet.getRange(poRowIdx, 18).setValue(nowStr2);

    var itemsDiterimaLog2 = items.filter(function(it) {
      return (Number(it.qty) || 0) > 0 || (it.catatan && it.catatan.toString().trim());
    });
    if (itemsDiterimaLog2.length) {
      _catatPenerimaanPOLog(ss, noPO, 'Langsung', itemsDiterimaLog2, payload.namaUser, {
        fileId:   payload.buktiFileId   ? payload.buktiFileId.toString()   : '',
        fileUrl:  buktiFileUrl,
        fileName: payload.buktiFileName ? payload.buktiFileName.toString() : ''
      });
    }

    invalidatePOCache();
    return { success: true, message: 'Penerimaan langsung berhasil. Status PO: ' + statusBaru + '.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusPO(noPO) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss      = getSpreadsheet();
    var poSheet = _ensurePOSheet(ss);
    SpreadsheetApp.flush();

    var poData = poSheet.getDataRange().getValues();
    var poRowIdx = -1;
    var statusPO = '';
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx = i + 1;
        statusPO = poData[i][6] ? poData[i][6].toString() : '';
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };
    if (statusPO !== 'Aktif') {
      return { success: false, message: 'Hanya PO berstatus Aktif yang dapat dihapus.' };
    }

    // Blokir jika ada pembayaran
    var bayarSheet = _ensurePembayaranPOSheet(ss);
    var bayarData  = bayarSheet.getDataRange().getValues();
    for (var b = 1; b < bayarData.length; b++) {
      if (bayarData[b][1] && bayarData[b][1].toString() === noPO) {
        return { success: false, message: 'PO tidak dapat dihapus karena sudah memiliki data pembayaran.' };
      }
    }

    // Hapus item
    var itemSheet = _ensurePOItemSheet(ss);
    var itemData  = itemSheet.getDataRange().getValues();
    for (var j = itemData.length - 1; j >= 1; j--) {
      if (itemData[j][1] && itemData[j][1].toString() === noPO) {
        itemSheet.deleteRow(j + 1);
      }
    }

    // Hapus header
    poSheet.deleteRow(poRowIdx);

    invalidatePOCache();
    return { success: true, message: 'Purchase Order ' + noPO + ' berhasil dihapus.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Pembayaran PO ─────────────────────────────────────────────────────────────

function simpanPembayaranPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var noPO = payload.noPO ? payload.noPO.toString().trim() : '';
    if (!noPO) return { success: false, message: 'No PO tidak boleh kosong.' };

    var ss         = getSpreadsheet();
    var bayarSheet = _ensurePembayaranPOSheet(ss);
    var poSheet    = _ensurePOSheet(ss);
    SpreadsheetApp.flush();

    // Cari PO header
    var poData = poSheet.getDataRange().getValues();
    var poRowIdx    = -1;
    var grandTotal  = 0;
    var ppnNominalPO = 0;
    var noWOPO      = '';
    var namaSupplier = '';
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx     = i + 1;
        grandTotal   = parseFloat(poData[i][10]) || 0;
        ppnNominalPO = parseFloat(poData[i][9])  || 0;
        noWOPO       = (poData[i][5] || '').toString().trim();
        namaSupplier = (poData[i][3] || '').toString();
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };

    // Blokir pembayaran jika PO terikat Work Order dan WO sudah Closed
    if (noWOPO) {
      try {
        var statusWOCek = _getStatusWO(noWOPO);
        if (statusWOCek === 'Closed') {
          return { success: false, message: 'Work Order ' + noWOPO + ' sudah Closed — pembayaran PO untuk WO ini tidak bisa ditambahkan.' };
        }
      } catch(eWO) { /* lanjut jika WO tidak ditemukan — biarkan PO bayar tetap jalan */ }
    }

    var idBayar  = _generateIdPembayaranPO(bayarSheet);
    var now      = new Date();
    var nowStr   = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var tanggalBayarStr = payload.tanggalBayar ? payload.tanggalBayar.toString() : _fmtTgl(now);
    var jumlah   = parseFloat(payload.jumlah) || 0;

    bayarSheet.appendRow([
      idBayar,
      noPO,
      tanggalBayarStr,
      payload.idAkun   ? payload.idAkun.toString()   : '',
      payload.namaAkun ? payload.namaAkun.toString() : '',
      jumlah,
      payload.catatan  ? payload.catatan.toString()  : '',
      payload.dibuatOleh ? payload.dibuatOleh.toString() : '',
      nowStr
    ]);

    // Hitung ulang totalDibayar
    SpreadsheetApp.flush();
    var bayarData    = bayarSheet.getDataRange().getValues();
    var totalDibayar = 0;
    for (var b = 1; b < bayarData.length; b++) {
      if (bayarData[b][1] && bayarData[b][1].toString() === noPO) {
        totalDibayar += parseFloat(bayarData[b][5]) || 0;
      }
    }

    var statusBayar = _hitungStatusBayarPO(grandTotal, totalDibayar);
    poSheet.getRange(poRowIdx, 13).setValue(statusBayar);   // col 12 = col 13
    poSheet.getRange(poRowIdx, 14).setValue(totalDibayar);  // col 13 = col 14

    // Hook Pengeluaran: jika PO terikat Work Order, buat entry pengeluaran otomatis.
    // Jumlah dipecah proporsional menjadi porsi DPP (pengeluaran project, masuk HPP)
    // dan porsi PPN (pengeluaran non-project kategori "Pajak", tidak masuk HPP project).
    if (noWOPO) {
      try {
        var ppnRatio   = grandTotal > 0 ? (ppnNominalPO / grandTotal) : 0;
        var ppnPortion = Math.round(jumlah * ppnRatio);
        var dppPortion = jumlah - ppnPortion;

        _buatPengeluaranOtomatis({
          noWO:        noWOPO,
          tanggal:     tanggalBayarStr,
          sumber:      'Pembayaran PO',
          noPO:        noPO,
          idReferensi: idBayar,
          idAkun:      payload.idAkun   ? payload.idAkun.toString()   : '',
          namaAkun:    payload.namaAkun ? payload.namaAkun.toString() : '',
          deskripsi:   'Pembayaran PO ' + noPO + ' — ' + namaSupplier + ' (DPP)',
          qty:         1,
          satuan:      '',
          hargaSatuan: dppPortion,
          total:       dppPortion,
          catatan:     payload.catatan  ? payload.catatan.toString()  : '',
          dibuatOleh:  payload.dibuatOleh ? payload.dibuatOleh.toString() : ''
        });

        if (ppnPortion > 0) {
          _buatPengeluaranOtomatis({
            noWO:        '',
            tanggal:     tanggalBayarStr,
            sumber:      'Pembayaran PO',
            noPO:        noPO,
            idReferensi: idBayar,
            idAkun:      payload.idAkun   ? payload.idAkun.toString()   : '',
            namaAkun:    payload.namaAkun ? payload.namaAkun.toString() : '',
            deskripsi:   'PPN Pembayaran PO ' + noPO + ' — ' + namaSupplier,
            kategori:    'Pajak',
            qty:         1,
            satuan:      '',
            hargaSatuan: ppnPortion,
            total:       ppnPortion,
            catatan:     payload.catatan  ? payload.catatan.toString()  : '',
            dibuatOleh:  payload.dibuatOleh ? payload.dibuatOleh.toString() : ''
          });
        }
      } catch(eHook) {
        Logger.log('Hook pengeluaran PO gagal: ' + eHook.toString());
      }
    }

    invalidatePOCache();
    invalidatePembayaranPOCache();
    return { success: true, message: 'Pembayaran PO ' + idBayar + ' berhasil disimpan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusPembayaranPO(idBayar) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss         = getSpreadsheet();
    var bayarSheet = _ensurePembayaranPOSheet(ss);
    SpreadsheetApp.flush();

    var bayarData = bayarSheet.getDataRange().getValues();
    var bayarRowIdx = -1;
    var noPO = '';
    for (var i = 1; i < bayarData.length; i++) {
      if (bayarData[i][0] && bayarData[i][0].toString() === idBayar) {
        bayarRowIdx = i + 1;
        noPO        = bayarData[i][1] ? bayarData[i][1].toString() : '';
        break;
      }
    }
    if (bayarRowIdx === -1) return { success: false, message: 'ID Pembayaran tidak ditemukan.' };

    // Cek apakah PO ini terikat Work Order (untuk hook pengeluaran)
    var noWOHapus = '';
    try {
      var poSheetHapus = _ensurePOSheet(ss);
      var poDataHapus  = poSheetHapus.getDataRange().getValues();
      for (var ph = 1; ph < poDataHapus.length; ph++) {
        if ((poDataHapus[ph][0] || '').toString() === noPO) {
          noWOHapus = (poDataHapus[ph][5] || '').toString().trim();
          break;
        }
      }
    } catch(ePH) {}

    bayarSheet.deleteRow(bayarRowIdx);

    // Hitung ulang totalDibayar
    SpreadsheetApp.flush();
    var bayarData2   = bayarSheet.getDataRange().getValues();
    var totalDibayar = 0;
    for (var b = 1; b < bayarData2.length; b++) {
      if (bayarData2[b][1] && bayarData2[b][1].toString() === noPO) {
        totalDibayar += parseFloat(bayarData2[b][5]) || 0;
      }
    }

    // Update PO header
    var poSheet = _ensurePOSheet(ss);
    SpreadsheetApp.flush();
    var poData = poSheet.getDataRange().getValues();
    for (var p = 1; p < poData.length; p++) {
      if (poData[p][0] && poData[p][0].toString() === noPO) {
        var grandTotal  = parseFloat(poData[p][10]) || 0;
        var statusBayar = _hitungStatusBayarPO(grandTotal, totalDibayar);
        poSheet.getRange(p + 1, 13).setValue(statusBayar);
        poSheet.getRange(p + 1, 14).setValue(totalDibayar);
        break;
      }
    }

    // Hook Pengeluaran: hapus entry pengeluaran otomatis jika PO terikat Work Order
    if (noWOHapus) {
      try {
        _hapusPengeluaranByReferensi(idBayar);
      } catch(eHook2) {
        Logger.log('Hook hapus pengeluaran PO gagal: ' + eHook2.toString());
      }
    }

    invalidatePOCache();
    invalidatePembayaranPOCache();
    return { success: true, message: 'Pembayaran ' + idBayar + ' berhasil dihapus.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── PO Payment Request ────────────────────────────────────────────────────────
/*
 * Sheet PO_PaymentRequest — kolom (0-based):
 *  0  ID Request
 *  1  No PO
 *  2  No WO
 *  3  Nama Supplier
 *  4  Grand Total PO
 *  5  Tanggal Request
 *  6  Jumlah
 *  7  Persentase
 *  8  Catatan
 *  9  Status          Menunggu | Disetujui | Ditolak
 * 10  Dibuat Oleh
 * 11  Dibuat Pada
 * 12  Nama Akun       (diisi saat approve)
 * 13  Diapprove Oleh
 * 14  Tanggal Approve
 */

function _ensurePOPaymentRequestSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('PO_PaymentRequest');
  if (!sheet) {
    sheet = ss.insertSheet('PO_PaymentRequest');
    sheet.appendRow([
      'ID Request', 'No PO', 'No WO', 'Nama Supplier', 'Grand Total PO',
      'Tanggal Request', 'Jumlah', 'Persentase', 'Catatan',
      'Status', 'Dibuat Oleh', 'Dibuat Pada',
      'Nama Akun', 'Diapprove Oleh', 'Tanggal Approve'
    ]);
  }
  return sheet;
}

function _ensurePOPaymentRequestInvoiceCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = _ensurePOPaymentRequestSheet(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 16) sheet.getRange(1, 16).setValue('Invoice File Id');
  if (lastCol < 17) sheet.getRange(1, 17).setValue('Invoice File Url');
  if (lastCol < 18) sheet.getRange(1, 18).setValue('Invoice File Nama');
  if (lastCol < 19) sheet.getRange(1, 19).setValue('Catatan Tolak');
  if (lastCol < 20) sheet.getRange(1, 20).setValue('Bukti Bayar File Id');
  if (lastCol < 21) sheet.getRange(1, 21).setValue('Bukti Bayar File Url');
  if (lastCol < 22) sheet.getRange(1, 22).setValue('Bukti Bayar File Nama');
  return sheet;
}

function uploadFileInvoiceSupplierPO(payload) {
  try {
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var fileName   = payload.fileName   ? payload.fileName.toString()   : 'invoice-supplier';
    var mimeType   = payload.mimeType   ? payload.mimeType.toString()   : 'application/octet-stream';
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    var bytes = Utilities.base64Decode(base64Data);
    var blob  = Utilities.newBlob(bytes, mimeType, fileName);
    var folder = _getPOQuotationFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      fileId:   file.getId(),
      fileUrl:  file.getUrl(),
      fileName: fileName
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function uploadFileBuktiBayarPO(payload) {
  try {
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    var fileName   = payload.fileName   ? payload.fileName.toString()   : 'bukti-bayar';
    var mimeType   = payload.mimeType   ? payload.mimeType.toString()   : 'application/octet-stream';
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    var bytes = Utilities.base64Decode(base64Data);
    var blob  = Utilities.newBlob(bytes, mimeType, fileName);
    var folder = _getPOQuotationFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      fileId:   file.getId(),
      fileUrl:  file.getUrl(),
      fileName: fileName
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function _generateIdPayReq(sheet) {
  SpreadsheetApp.flush();
  var now = new Date();
  var month = now.getMonth() + 1;
  var year  = now.getFullYear();
  var romanMonth = _toRoman(month);
  var prefix = '/RGI/PR/' + romanMonth + '/' + year;
  var maxSeq = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var val = ids[i][0] ? ids[i][0].toString() : '';
      var pattern = new RegExp('^(\\d+)\\/RGI\\/PR\\/' + romanMonth + '\\/' + year + '$');
      var m = val.match(pattern);
      if (m) { var seq = parseInt(m[1], 10); if (seq > maxSeq) maxSeq = seq; }
    }
  }
  return String(maxSeq + 1).padStart(3, '0') + prefix;
}

function requestPembayaranPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var noPO       = (payload.noPO || '').toString().trim();
    var jumlah     = parseFloat(payload.jumlah) || 0;
    var invFileUrl = (payload.invoiceFileUrl  || '').toString().trim();
    var invFileId  = (payload.invoiceFileId   || '').toString().trim();
    var invFileName = (payload.invoiceFileName || '').toString().trim();
    if (!noPO)      return { success: false, message: 'No PO tidak boleh kosong.' };
    if (jumlah <= 0) return { success: false, message: 'Jumlah request harus lebih dari 0.' };
    if (!invFileUrl) return { success: false, message: 'Invoice dari supplier wajib dilampirkan.' };

    var ss = getSpreadsheet();
    var poSheet = _ensurePOSheet(ss);
    SpreadsheetApp.flush();

    var poData = poSheet.getDataRange().getValues();
    var statusPO = '', grandTotal = 0, noWO = '', namaSupplier = '';
    for (var i = 1; i < poData.length; i++) {
      if ((poData[i][0] || '').toString() === noPO) {
        statusPO     = (poData[i][6]  || '').toString();
        grandTotal   = parseFloat(poData[i][10]) || 0;
        noWO         = (poData[i][5]  || '').toString().trim();
        namaSupplier = (poData[i][3]  || '').toString();
        break;
      }
    }
    if (!statusPO) return { success: false, message: 'No PO tidak ditemukan.' };
    if (statusPO === 'Selesai' || statusPO === 'Batal') {
      return { success: false, message: 'Request pembayaran tidak bisa dibuat untuk PO berstatus "' + statusPO + '".' };
    }

    var prSheet = _ensurePOPaymentRequestInvoiceCols(ss);
    var idReq   = _generateIdPayReq(prSheet);
    var now     = new Date();
    var nowStr  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var tanggalReq = payload.tanggalRequest ? payload.tanggalRequest.toString() : _fmtTgl(now);
    var persentase = grandTotal > 0 ? Math.round(jumlah / grandTotal * 10000) / 100 : 0;

    prSheet.appendRow([
      idReq, noPO, noWO, namaSupplier, grandTotal,
      tanggalReq, jumlah, persentase,
      payload.catatan    ? payload.catatan.toString()    : '',
      'Menunggu',
      payload.dibuatOleh ? payload.dibuatOleh.toString() : '',
      nowStr, '', '', '',
      invFileId, invFileUrl, invFileName
    ]);

    return { success: true, message: 'Request ' + idReq + ' berhasil dikirim ke Finance.', idReq: idReq };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getPaymentRequestList(params) {
  try {
    params = params || {};
    var ss      = getSpreadsheet();
    var prSheet = _ensurePOPaymentRequestInvoiceCols(ss);
    SpreadsheetApp.flush();
    var data = prSheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;
      var rowStatus = (r[9] || '').toString();
      if (params.status && rowStatus !== params.status) continue;
      list.push({
        idReq:          r[0]  ? r[0].toString()  : '',
        noPO:           r[1]  ? r[1].toString()  : '',
        noWO:           r[2]  ? r[2].toString()  : '',
        namaSupplier:   r[3]  ? r[3].toString()  : '',
        grandTotalPO:   parseFloat(r[4]) || 0,
        tanggalRequest: r[5]  ? _fmtTgl(r[5]) : '',
        jumlah:         parseFloat(r[6]) || 0,
        persentase:     parseFloat(r[7]) || 0,
        catatan:        r[8]  ? r[8].toString()  : '',
        status:         rowStatus,
        dibuatOleh:     r[10] ? r[10].toString() : '',
        dibuatPada:     r[11] ? r[11].toString() : '',
        namaAkun:       r[12] ? r[12].toString() : '',
        diapproveOleh:  r[13] ? r[13].toString() : '',
        tanggalApprove: r[14] ? _fmtTgl(r[14]) : '',
        invoiceFileId:   r[15] ? r[15].toString() : '',
        invoiceFileUrl:  r[16] ? r[16].toString() : '',
        invoiceFileName: r[17] ? r[17].toString() : '',
        catatanTolak:    r[18] ? r[18].toString() : '',
        buktiFileId:     r[19] ? r[19].toString() : '',
        buktiFileUrl:    r[20] ? r[20].toString() : '',
        buktiFileName:   r[21] ? r[21].toString() : ''
      });
    }
    list.reverse();
    return { success: true, list: list };
  } catch (e) {
    return { success: false, message: e.toString(), list: [] };
  }
}

function approvePembayaranPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var idReq       = (payload.idReq       || '').toString().trim();
    var namaAkun    = (payload.namaAkun    || '').toString().trim();
    var buktiFileId   = (payload.buktiFileId   || '').toString().trim();
    var buktiFileUrl  = (payload.buktiFileUrl  || '').toString().trim();
    var buktiFileName = (payload.buktiFileName || '').toString().trim();
    if (!idReq)    return { success: false, message: 'ID Request tidak boleh kosong.' };
    if (!namaAkun) return { success: false, message: 'Akun pembayaran wajib dipilih.' };
    if (!buktiFileUrl) return { success: false, message: 'Bukti transaksi pembayaran wajib dilampirkan.' };

    var ss      = getSpreadsheet();
    var prSheet = _ensurePOPaymentRequestInvoiceCols(ss);
    SpreadsheetApp.flush();

    var prData = prSheet.getDataRange().getValues();
    var prRowIdx = -1, noPO = '', jumlah = 0, statusReq = '';
    for (var i = 1; i < prData.length; i++) {
      if ((prData[i][0] || '').toString() === idReq) {
        prRowIdx  = i + 1;
        noPO      = (prData[i][1] || '').toString();
        jumlah    = parseFloat(prData[i][6]) || 0;
        statusReq = (prData[i][9] || '').toString();
        break;
      }
    }
    if (prRowIdx === -1)    return { success: false, message: 'Request tidak ditemukan.' };
    if (statusReq !== 'Menunggu') {
      return { success: false, message: 'Request sudah berstatus "' + statusReq + '".' };
    }

    var now    = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    // Update request status
    prSheet.getRange(prRowIdx, 10).setValue('Disetujui');
    prSheet.getRange(prRowIdx, 13).setValue(namaAkun);
    prSheet.getRange(prRowIdx, 14).setValue(payload.approvedBy ? payload.approvedBy.toString() : '');
    prSheet.getRange(prRowIdx, 15).setValue(nowStr);
    prSheet.getRange(prRowIdx, 20).setValue(buktiFileId);
    prSheet.getRange(prRowIdx, 21).setValue(buktiFileUrl);
    prSheet.getRange(prRowIdx, 22).setValue(buktiFileName);

    // Buat catatan pembayaran PO otomatis
    var bayarResult = simpanPembayaranPO({
      noPO:        noPO,
      tanggalBayar: payload.tanggalBayar ? payload.tanggalBayar.toString() : _fmtTgl(now),
      idAkun:      payload.idAkun ? payload.idAkun.toString() : '',
      namaAkun:    namaAkun,
      jumlah:      jumlah,
      catatan:     'Approved dari request ' + idReq + (payload.catatan ? ' — ' + payload.catatan : ''),
      dibuatOleh:  payload.approvedBy ? payload.approvedBy.toString() : ''
    });

    if (!bayarResult.success) {
      // Rollback request
      prSheet.getRange(prRowIdx, 10).setValue('Menunggu');
      prSheet.getRange(prRowIdx, 13).setValue('');
      prSheet.getRange(prRowIdx, 14).setValue('');
      prSheet.getRange(prRowIdx, 15).setValue('');
      prSheet.getRange(prRowIdx, 20).setValue('');
      prSheet.getRange(prRowIdx, 21).setValue('');
      prSheet.getRange(prRowIdx, 22).setValue('');
      return { success: false, message: 'Gagal mencatat pembayaran: ' + bayarResult.message };
    }

    return { success: true, message: 'Pembayaran PO ' + noPO + ' sebesar Rp ' + jumlah.toLocaleString('id-ID') + ' berhasil disetujui dan dicatat.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function tolakRequestPembayaranPO(idReq, namaUser, catatanTolak) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (!catatanTolak || !catatanTolak.toString().trim()) {
      return { success: false, message: 'Catatan penolakan wajib diisi.' };
    }
    var ss      = getSpreadsheet();
    var prSheet = _ensurePOPaymentRequestInvoiceCols(ss);
    SpreadsheetApp.flush();
    var prData = prSheet.getDataRange().getValues();
    for (var i = 1; i < prData.length; i++) {
      if ((prData[i][0] || '').toString() === idReq) {
        if ((prData[i][9] || '').toString() !== 'Menunggu') {
          return { success: false, message: 'Request sudah berstatus "' + prData[i][9] + '".' };
        }
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
        prSheet.getRange(i + 1, 10).setValue('Ditolak');
        prSheet.getRange(i + 1, 14).setValue(namaUser || '');
        prSheet.getRange(i + 1, 15).setValue(nowStr);
        prSheet.getRange(i + 1, 19).setValue(catatanTolak.toString().trim());
        return { success: true, message: 'Request ' + idReq + ' ditolak.' };
      }
    }
    return { success: false, message: 'Request tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
