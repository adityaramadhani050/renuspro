/**
 * RenusPro - Pricelist Supplier (standalone, TIDAK terhubung Master_Produk).
 * Tiap baris = penawaran material dari 1 supplier, dengan data materialnya sendiri.
 * Sheet Pricelist_Supplier kolom (0-based):
 *  0 ID (PL###) | 1 ID Supplier | 2 Kategori | 3 Nama Material | 4 Spesifikasi
 *  5 Merek | 6 Satuan | 7 Harga Beli (net/exclude PPN) | 8 Termasuk PPN (Ya/Tidak)
 *  9 Lead Time | 10 Masa Berlaku Harga | 11 Dibuat Pada
 */

function _ensurePricelistSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pricelist_Supplier');
  if (sheet) { _ensurePricelistKolom(sheet); return sheet; }
  sheet = ss.insertSheet('Pricelist_Supplier');
  sheet.appendRow(['ID', 'ID Supplier', 'Kategori', 'Nama Material', 'Spesifikasi', 'Merek',
    'Satuan', 'Harga Beli', 'Termasuk PPN', 'Lead Time', 'Masa Berlaku Harga', 'Dibuat Pada', 'Ready']);
  sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
  return sheet;
}

// Migrasi lazy: kolom Ready [12] (1-based 13).
function _ensurePricelistKolom(sheet) {
  if (!sheet) return;
  if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('Ready');
}

// Normalisasi nilai tanggal (Date object atau teks) → 'yyyy-MM-dd'.
function _plToIsoDate(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = v.toString().trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[1] + '-' + m[2] + '-' + m[3]) : s;
}

// Normalisasi timestamp (Date object atau teks) → 'dd/MM/yyyy'.
function _plToDateTime(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  var s = v.toString().trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // ambil bagian tanggal saja
  return m ? m[0] : s.split(' ')[0];
}

function _pricelistNextId(sheet) {
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var v = ids[i][0] ? ids[i][0].toString().trim() : '';
      var m = v.match(/^PL(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return 'PL' + ('000' + (maxNum + 1)).slice(-3);
}

// Semua item pricelist + nama supplier (di-join dari master Supplier).
// ── Master Kategori (dikelola dari menu Pricelist; dipakai pricelist & BOM) ──
function _ensureKategoriSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pricelist_Kategori');
  if (sheet) return sheet;
  sheet = ss.insertSheet('Pricelist_Kategori');
  sheet.appendRow(['Nama']);
  sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
  ['Panel Surya', 'Inverter', 'Baterai', 'Kabel', 'PJU', 'Pompa', 'Aksesoris Inverter',
   'Portable Power Station', 'Mounting Panel Surya', 'Panel Proteksi']
    .forEach(function (n) { sheet.appendRow([n]); });
  return sheet;
}

function getKategoriList() {
  try {
    var sheet = _ensureKategoriSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < data.length; i++) { var n = (data[i][0] || '').toString().trim(); if (n) out.push(n); }
    out.sort(function (a, b) { return a.localeCompare(b, 'id'); });
    return { success: true, list: out };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

function tambahKategori(nama) {
  var lock = LockService.getScriptLock();
  try {
    nama = (nama || '').toString().trim();
    if (!nama) return { success: false, message: 'Nama kategori wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _ensureKategoriSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === nama.toLowerCase()) return { success: false, message: 'Kategori "' + nama + '" sudah ada.' };
    }
    sheet.appendRow([nama]);
    return { success: true, message: 'Kategori "' + nama + '" ditambahkan.' };
  } catch (e) { return { success: false, message: e.toString() }; } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Rename kategori + cascade ke item Pricelist_Supplier yang memakainya.
function updateKategori(oldNama, newNama) {
  var lock = LockService.getScriptLock();
  try {
    oldNama = (oldNama || '').toString().trim(); newNama = (newNama || '').toString().trim();
    if (!oldNama || !newNama) return { success: false, message: 'Nama kategori wajib.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureKategoriSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var n = (data[i][0] || '').toString().trim();
      if (n.toLowerCase() === newNama.toLowerCase() && n.toLowerCase() !== oldNama.toLowerCase()) return { success: false, message: 'Kategori "' + newNama + '" sudah ada.' };
    }
    var found = false;
    for (var j = 1; j < data.length; j++) {
      if ((data[j][0] || '').toString().trim().toLowerCase() === oldNama.toLowerCase()) { sheet.getRange(j + 1, 1).setValue(newNama); found = true; break; }
    }
    if (!found) return { success: false, message: 'Kategori tidak ditemukan.' };
    try {
      var pl = _ensurePricelistSheet(ss), pd = pl.getDataRange().getValues();
      for (var k = 1; k < pd.length; k++) { if ((pd[k][2] || '').toString().trim().toLowerCase() === oldNama.toLowerCase()) pl.getRange(k + 1, 3).setValue(newNama); }
    } catch (e) {}
    return { success: true, message: 'Kategori diperbarui.' };
  } catch (e) { return { success: false, message: e.toString() }; } finally { try { lock.releaseLock(); } catch (e) {} }
}

function hapusKategori(nama) {
  var lock = LockService.getScriptLock();
  try {
    nama = (nama || '').toString().trim();
    if (!nama) return { success: false, message: 'Nama kategori wajib.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var inUse = 0;
    try {
      var pl = _ensurePricelistSheet(ss), pd = pl.getDataRange().getValues();
      for (var k = 1; k < pd.length; k++) { if ((pd[k][2] || '').toString().trim().toLowerCase() === nama.toLowerCase()) inUse++; }
    } catch (e) {}
    if (inUse > 0) return { success: false, message: 'Kategori dipakai ' + inUse + ' item pricelist — ubah item tersebut dulu.' };
    var sheet = _ensureKategoriSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) { if ((data[i][0] || '').toString().trim().toLowerCase() === nama.toLowerCase()) sheet.deleteRow(i + 1); }
    return { success: true, message: 'Kategori "' + nama + '" dihapus.' };
  } catch (e) { return { success: false, message: e.toString() }; } finally { try { lock.releaseLock(); } catch (e) {} }
}

function getPricelistAll() {
  try {
    var ss = getSpreadsheet();
    var sheet = _ensurePricelistSheet(ss);
    var data = sheet.getDataRange().getValues();
    var supMap = {};
    try { (getSupplierList() || []).forEach(function (s) { supMap[s.id] = (s.alias && s.alias.trim()) ? s.alias : s.nama; }); } catch (e) {}
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var idSup = data[i][1] ? data[i][1].toString() : '';
      list.push({
        id:           data[i][0].toString(),
        idSupplier:   idSup,
        namaSupplier: supMap[idSup] || idSup || '(supplier terhapus)',
        kategori:     data[i][2] ? data[i][2].toString() : '',
        namaMaterial: data[i][3] ? data[i][3].toString() : '',
        spesifikasi:  data[i][4] ? data[i][4].toString() : '',
        merek:        data[i][5] ? data[i][5].toString() : '',
        satuan:       data[i][6] ? data[i][6].toString() : '',
        hargaBeli:    Number(data[i][7]) || 0,
        termasukPPN:  (data[i][8] != null && data[i][8].toString().trim().toLowerCase() === 'ya'),
        updateTerakhir: _plToDateTime(data[i][11]),
        ready:        (data[i][12] != null && data[i][12].toString().trim().toLowerCase() === 'ya')
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

function getPricelistBySupplier(idSupplier) {
  var res = getPricelistAll();
  if (!res.success) return res;
  idSupplier = (idSupplier || '').toString().trim();
  return { success: true, list: res.list.filter(function (x) { return x.idSupplier === idSupplier; }) };
}

// payload: { idSupplier, kategori, namaMaterial, spesifikasi, merek, satuan,
//            hargaBeli(net), termasukPPN, leadTime, masaBerlaku }
function tambahPricelistItem(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    if (!payload.idSupplier) return { success: false, message: 'Supplier wajib dipilih.' };
    if (!payload.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensurePricelistSheet(ss);
    SpreadsheetApp.flush();
    var id = _pricelistNextId(sheet);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.appendRow([
      id, payload.idSupplier, payload.kategori || '', payload.namaMaterial || '',
      payload.spesifikasi || '', payload.merek || '', payload.satuan || '',
      Number(payload.hargaBeli) || 0, payload.termasukPPN ? 'Ya' : 'Tidak',
      '', '', when, payload.ready ? 'Ya' : 'Tidak'
    ]);
    return { success: true, message: 'Item pricelist ' + id + ' ditambahkan.', id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function updatePricelistItem(id, payload) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    payload = payload || {};
    if (!id) return { success: false, message: 'ID item wajib.' };
    if (!payload.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensurePricelistSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          payload.idSupplier || data[i][1], payload.kategori || '', payload.namaMaterial || '',
          payload.spesifikasi || '', payload.merek || '', payload.satuan || '',
          Number(payload.hargaBeli) || 0
        ]]);
        sheet.getRange(i + 1, 12).setValue(when);                            // Update Terakhir
        if (payload.ready != null) sheet.getRange(i + 1, 13).setValue(payload.ready ? 'Ya' : 'Tidak');
        return { success: true, message: 'Item ' + id + ' berhasil diperbarui.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Toggle status Ready 1 item (dipakai tombol centang di kolom Aksi).
function setPricelistReady(id, ready) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID item wajib.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensurePricelistSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        sheet.getRange(i + 1, 13).setValue(ready ? 'Ya' : 'Tidak');
        return { success: true, message: 'Status ready diperbarui.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusPricelistItem(id) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID item wajib.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensurePricelistSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Item pricelist dihapus.' };
      }
    }
    return { success: false, message: 'Item tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
