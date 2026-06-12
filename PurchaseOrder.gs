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
 *  6  Status PO       Draft | Disetujui | Diterima Sebagian | Diterima | Selesai | Batal
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
      'Harga Beli Satuan', 'Total', 'Catatan'
    ]);
  }
  return sheet;
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
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;
      list.push({
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
        dibuatPada:   _fmtTgl(r[15])
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
          diubahOleh:   r[16] ? r[16].toString() : '',
          diubahPada:   _fmtTgl(r[17])
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
          idItem:    ir[0] ? ir[0].toString() : '',
          noPO:      ir[1] ? ir[1].toString() : '',
          namaItem:  ir[2] ? ir[2].toString() : '',
          qty:       parseFloat(ir[3]) || 0,
          satuan:    ir[4] ? ir[4].toString() : '',
          hargaBeli: parseFloat(ir[5]) || 0,
          total:     parseFloat(ir[6]) || 0,
          catatan:   ir[7] ? ir[7].toString() : ''
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

    return { success: true, po: header, items: items, pembayaran: pembayaran };
  } catch (e) {
    return { success: false, message: e.toString() };
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
    var subtotal = 0;
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
      subtotal += (parseFloat(it.qty) || 0) * (parseFloat(it.hargaBeli) || 0);
    }
    var ppnPersen  = parseFloat(payload.ppnPersen) || 0;
    var ppnNominal = subtotal * ppnPersen / 100;
    var grandTotal = subtotal + ppnNominal;

    var tanggalStr = payload.tanggal ? payload.tanggal.toString() : _fmtTgl(now);

    // Tulis header PO
    poSheet.appendRow([
      noPO,
      tanggalStr,
      idSupplier,
      payload.namaSupplier   ? payload.namaSupplier.toString()   : '',
      payload.peruntukan     ? payload.peruntukan.toString()     : '',
      payload.noWO           ? payload.noWO.toString()           : '',
      'Draft',
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
      ''
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
    if (poData[poRowIdx - 1][6] !== 'Draft') {
      return { success: false, message: 'Hanya PO berstatus Draft yang dapat diedit.' };
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
    var subtotal = 0;
    for (var k = 0; k < payload.items.length; k++) {
      var it = payload.items[k];
      subtotal += (parseFloat(it.qty) || 0) * (parseFloat(it.hargaBeli) || 0);
    }
    var ppnPersen  = parseFloat(payload.ppnPersen) || 0;
    var ppnNominal = subtotal * ppnPersen / 100;
    var grandTotal = subtotal + ppnNominal;

    var now    = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var tanggalStr = payload.tanggal ? payload.tanggal.toString() : _fmtTgl(now);

    // Update header row
    var updateRange = poSheet.getRange(poRowIdx, 1, 1, 18);
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
      nowStr
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
    var statusLama = '';
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx  = i + 1;
        statusLama = poData[i][6] ? poData[i][6].toString() : '';
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };

    // Validasi transisi
    var validTransitions = {
      'Draft':      ['Disetujui'],
      'Disetujui':  ['Diterima', 'Batal'],
      'Diterima':   ['Selesai']
    };
    var allowed = validTransitions[statusLama] || [];
    if (allowed.indexOf(statusBaru) === -1) {
      return {
        success: false,
        message: 'Transisi status dari "' + statusLama + '" ke "' + statusBaru + '" tidak diizinkan.'
      };
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
    if (statusPO !== 'Draft') {
      return { success: false, message: 'Hanya PO berstatus Draft yang dapat dihapus.' };
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
    var poRowIdx  = -1;
    var grandTotal = 0;
    for (var i = 1; i < poData.length; i++) {
      if (poData[i][0] && poData[i][0].toString() === noPO) {
        poRowIdx   = i + 1;
        grandTotal = parseFloat(poData[i][10]) || 0;
        break;
      }
    }
    if (poRowIdx === -1) return { success: false, message: 'No PO tidak ditemukan.' };

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

    invalidatePOCache();
    invalidatePembayaranPOCache();
    return { success: true, message: 'Pembayaran ' + idBayar + ' berhasil dihapus.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
