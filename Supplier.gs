/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Master Supplier: list, simpan, edit, hapus.
 */

function _ensureSupplierSheet(ss) {
  ss = ss || getSpreadsheet();
  const existing = ss.getSheetByName('Supplier');
  if (existing) { _ensureSupplierAliasKolom(existing); return existing; }
  const sheet = ss.insertSheet('Supplier');
  sheet.appendRow([
    'ID Supplier', 'Nama', 'PIC', 'Telepon', 'Email',
    'Alamat', 'Catatan', 'Status',
    'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada', 'Nama Alias'
  ]);
  return sheet;
}

// Migrasi lazy: kolom Nama Alias [12] (1-based 13).
function _ensureSupplierAliasKolom(sheet) {
  if (!sheet) return;
  if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('Nama Alias');
}

function getSupplierList() {
  try {
    const data = _cachedSupplier();   // ter-cache (invalidasi di simpan/edit/hapus supplier)
    const list = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          id:         data[i][0].toString(),
          nama:       data[i][1].toString(),
          pic:        data[i][2].toString(),
          telepon:    data[i][3].toString(),
          email:      data[i][4].toString(),
          alamat:     data[i][5].toString(),
          catatan:    data[i][6].toString(),
          status:     data[i][7].toString(),
          dibuatOleh: data[i][8].toString(),
          dibuatPada: data[i][9].toString(),
          alias:      data[i][12] ? data[i][12].toString() : ''
        });
      }
    }
    return list;
  } catch (e) { return []; }
}

function simpanSupplier(payload) {
  const lock = LockService.getScriptLock();
  try {
    if (!payload.nama) return { success: false, message: 'Nama supplier tidak boleh kosong.' };

    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierSheet(ss);

    const lastRow = sheet.getLastRow();
    let maxNumber = 0;

    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const idVal = idValues[i][0] ? idValues[i][0].toString().trim() : '';
        const match = idVal.match(/^S(\d+)/i);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
      }
    }

    const id = 'S' + ('000' + (maxNumber + 1)).slice(-3);
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

    sheet.appendRow([
      id,
      payload.nama       || '',
      payload.pic        || '',
      payload.telepon    || '',
      payload.email      || '',
      payload.alamat     || '',
      payload.catatan    || '',
      'Aktif',
      payload.dibuatOleh || '',
      when,
      '',
      '',
      payload.alias || ''
    ]);

    invalidateSupplierCache();
    return { success: true, message: 'Supplier (' + id + ') berhasil ditambahkan!', newId: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function editSupplier(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Supplier');
    if (!sheet) return { success: false, message: 'Sheet Supplier tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === payload.id.toString().trim()) {
        const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
        // Update cols 2-8: nama, pic, telepon, email, alamat, catatan, status (1-based cols 2..8)
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          payload.nama    || '',
          payload.pic     || '',
          payload.telepon || '',
          payload.email   || '',
          payload.alamat  || '',
          payload.catatan || '',
          payload.status  || ''
        ]]);
        // Update cols 11-12: diubahOleh, diubahPada (1-based)
        sheet.getRange(i + 1, 11, 1, 2).setValues([[
          payload.diubahOleh || '',
          when
        ]]);
        _ensureSupplierAliasKolom(sheet);
        sheet.getRange(i + 1, 13).setValue(payload.alias || ''); // Nama Alias
        invalidateSupplierCache();
        return { success: true, message: 'Supplier ' + payload.id + ' berhasil diperbarui!' };
      }
    }
    return { success: false, message: 'ID supplier tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusSupplier(id) {
  const lock = LockService.getScriptLock();
  try {
    // Cek referensi di Purchase_Order
    const ss = getSpreadsheet();
    const poSheet = ss.getSheetByName('Purchase_Order');
    if (poSheet) {
      const poData = poSheet.getDataRange().getValues();
      for (let i = 1; i < poData.length; i++) {
        if (poData[i][2] && poData[i][2].toString().trim() === id.toString().trim()) {
          return { success: false, message: 'Supplier ' + id + ' tidak dapat dihapus karena masih digunakan di Purchase Order.' };
        }
      }
    }

    lock.waitLock(15000);
    const sheet = ss.getSheetByName('Supplier');
    if (!sheet) return { success: false, message: 'Sheet Supplier tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        invalidateSupplierCache();
        return { success: true, message: 'Supplier ' + id + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'ID supplier tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  KATALOG ITEM SUPPLIER (relasi supplier ↔ produk, many-to-many)
//  Sheet Supplier_Produk kolom (0-based):
//   0 ID Supplier | 1 ID Produk | 2 Harga Beli (net/exclude PPN) | 3 Dibuat Pada
//   4 Lead Time | 5 Masa Berlaku Harga | 6 Termasuk PPN (Ya/Tidak = sumber inc-PPN)
// ═══════════════════════════════════════════════════════════════════════════

function _ensureSupplierProdukSheet(ss) {
  ss = ss || getSpreadsheet();
  const existing = ss.getSheetByName('Supplier_Produk');
  if (existing) { _ensureSupplierProdukKolom(existing); return existing; }
  const sheet = ss.insertSheet('Supplier_Produk');
  sheet.appendRow(['ID Supplier', 'ID Produk', 'Harga Beli', 'Dibuat Pada', 'Lead Time', 'Masa Berlaku Harga', 'Termasuk PPN', 'Ready']);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  return sheet;
}

// Migrasi lazy: Lead Time [4], Masa Berlaku [5], Termasuk PPN [6], Ready [7].
function _ensureSupplierProdukKolom(sheet) {
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 5) sheet.getRange(1, 5).setValue('Lead Time');
  if (lastCol < 6) sheet.getRange(1, 6).setValue('Masa Berlaku Harga');
  if (lastCol < 7) sheet.getRange(1, 7).setValue('Termasuk PPN');
  if (lastCol < 8) sheet.getRange(1, 8).setValue('Ready');
}

// Map ID Produk → { nama, unit, hpp } dari Master_Produk (via getProdukList)
function _mapProdukById() {
  const map = {};
  try {
    (getProdukList() || []).forEach(function (p) {
      map[p.sku] = { nama: p.nama, unit: p.unit, hpp: p.hpp };
    });
  } catch (e) { /* ignore */ }
  return map;
}

// Daftar produk yang di-assign ke supplier (untuk UI kurasi katalog).
function getSupplierKatalog(idSupplier) {
  try {
    idSupplier = (idSupplier || '').toString().trim();
    if (!idSupplier) return { success: true, list: [] };
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    const data = sheet.getDataRange().getValues();
    const prod = _mapProdukById();
    const list = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || data[i][0].toString().trim() !== idSupplier) continue;
      const idProduk = data[i][1] ? data[i][1].toString() : '';
      const p = prod[idProduk];
      if (!p) continue; // produk sudah dihapus dari master → lewati
      list.push({
        idProduk:    idProduk,
        nama:        p.nama,
        unit:        p.unit,
        hpp:         p.hpp,
        hargaBeli:   (data[i][2] !== '' && data[i][2] != null) ? (parseFloat(data[i][2]) || 0) : null,
        leadTime:    data[i][4] != null ? data[i][4].toString() : '',
        masaBerlaku: data[i][5] != null ? data[i][5].toString() : '',
        termasukPPN: (data[i][6] != null && data[i][6].toString().trim().toLowerCase() === 'ya'),
        ready:       (data[i][7] != null && data[i][7].toString().trim().toLowerCase() === 'ya')
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Item siap-dropdown untuk form PO: { id, nama, unit, hargaBeli }.
// Sumber = Pricelist_Supplier (standalone, lihat Pricelist.gs).
function getProdukBySupplier(idSupplier) {
  try {
    var res = getPricelistBySupplier(idSupplier);
    if (!res.success) return res;
    var list = res.list.map(function (it) {
      var label = it.namaMaterial + (it.spesifikasi ? ' - ' + it.spesifikasi : '');
      return {
        id:        it.id,
        nama:      label,
        unit:      it.satuan || '',
        hargaBeli: Number(it.hargaBeli) || 0,
        leadTime:  it.leadTime || ''
      };
    }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Tulis ulang katalog satu supplier.
// items = [{ idProduk, hargaBeli?(net), leadTime?, masaBerlaku?, termasukPPN? }].
// Harga Beli disimpan sudah net (exclude PPN) — dinormalkan di sisi UI.
function saveSupplierKatalog(idSupplier, items) {
  const lock = LockService.getScriptLock();
  try {
    idSupplier = (idSupplier || '').toString().trim();
    if (!idSupplier) return { success: false, message: 'ID supplier wajib diisi.' };
    items = items || [];

    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    SpreadsheetApp.flush();

    // Kumpulkan idProduk terdampak (lama + baru) untuk recompute HPP
    const affected = {};

    // Hapus baris lama supplier ini (dari bawah ke atas)
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim() === idSupplier) {
        if (data[i][1]) affected[data[i][1].toString().trim()] = true;
        sheet.deleteRow(i + 1);
      }
    }

    // Insert baru (dedup ID Produk)
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    const seen = {};
    for (let j = 0; j < items.length; j++) {
      const idProduk = (items[j].idProduk || '').toString().trim();
      if (!idProduk || seen[idProduk]) continue;
      seen[idProduk] = true;
      affected[idProduk] = true;
      const hb = (items[j].hargaBeli != null && items[j].hargaBeli !== '')
        ? (parseFloat(items[j].hargaBeli) || 0) : '';
      const leadTime    = (items[j].leadTime || '').toString();
      const masaBerlaku = (items[j].masaBerlaku || '').toString();
      const ppn         = items[j].termasukPPN ? 'Ya' : 'Tidak';
      const ready       = items[j].ready ? 'Ya' : 'Tidak';
      sheet.appendRow([idSupplier, idProduk, hb, when, leadTime, masaBerlaku, ppn, ready]);
    }

    return { success: true, message: 'Katalog supplier tersimpan (' + Object.keys(seen).length + ' item).' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Assign supplier dari sisi PRODUK (arah balik dari Supplier_Produk) ────────
// Dipakai halaman Katalog Produk (procurement) untuk assign supplier ke 1 item.

function getSuppliersForProduk(produkId) {
  try {
    produkId = (produkId || '').toString().trim();
    if (!produkId) return { success: true, list: [] };
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    const data = sheet.getDataRange().getValues();
    // Peta id supplier → nama
    const supMap = {};
    try { (getSupplierList() || []).forEach(function (s) { supMap[s.id] = s.nama; }); } catch (e) {}
    const list = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1] || data[i][1].toString().trim() !== produkId) continue;
      const idSupplier = data[i][0] ? data[i][0].toString() : '';
      if (!idSupplier) continue;
      list.push({
        idSupplier: idSupplier,
        nama:       supMap[idSupplier] || idSupplier,
        hargaBeli:  (data[i][2] !== '' && data[i][2] != null) ? (parseFloat(data[i][2]) || 0) : null,
        leadTime:   data[i][4] != null ? data[i][4].toString() : '',
        ready:      (data[i][7] != null && data[i][7].toString().trim().toLowerCase() === 'ya')
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Tautkan 1 supplier ke 1 produk tanpa merusak baris lain (append bila belum ada).
// Harga beli/ready diisi procurement di halaman Supplier. Memicu recompute HPP.
function addSupplierToProduk(produkId, idSupplier) {
  const lock = LockService.getScriptLock();
  try {
    produkId   = (produkId || '').toString().trim();
    idSupplier = (idSupplier || '').toString().trim();
    if (!produkId || !idSupplier) return { success: false, message: 'ID produk & supplier wajib diisi.' };
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idSupplier &&
          (data[i][1] || '').toString().trim() === produkId) {
        return { success: true, message: 'Sudah tertaut.' }; // idempotent
      }
    }
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.appendRow([idSupplier, produkId, '', when, '', '', 'Tidak', 'Tidak']);
    return { success: true, message: 'Supplier ditautkan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Lepas tautan 1 supplier dari 1 produk. Memicu recompute HPP.
function removeSupplierFromProduk(produkId, idSupplier) {
  const lock = LockService.getScriptLock();
  try {
    produkId   = (produkId || '').toString().trim();
    idSupplier = (idSupplier || '').toString().trim();
    if (!produkId || !idSupplier) return { success: false, message: 'ID produk & supplier wajib diisi.' };
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === idSupplier &&
          (data[i][1] || '').toString().trim() === produkId) {
        sheet.deleteRow(i + 1);
      }
    }
    return { success: true, message: 'Tautan supplier dilepas.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Tulis ulang mapping supplier untuk satu produk. supplierIds = ['S001', ...].
// Harga Beli dikosongkan → getProdukBySupplier fallback ke HPP produk.
function setSuppliersForProduk(produkId, supplierIds) {
  const lock = LockService.getScriptLock();
  try {
    produkId = (produkId || '').toString().trim();
    if (!produkId) return { success: false, message: 'ID produk wajib diisi.' };
    supplierIds = supplierIds || [];

    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierProdukSheet(ss);
    SpreadsheetApp.flush();

    // Hapus baris lama untuk produk ini (dari bawah ke atas)
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1] && data[i][1].toString().trim() === produkId) sheet.deleteRow(i + 1);
    }

    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    const seen = {};
    for (let j = 0; j < supplierIds.length; j++) {
      const idSupplier = (supplierIds[j] || '').toString().trim();
      if (!idSupplier || seen[idSupplier]) continue;
      seen[idSupplier] = true;
      sheet.appendRow([idSupplier, produkId, '', when]);
    }
    return { success: true, message: 'Supplier item tersimpan (' + Object.keys(seen).length + ' supplier).' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
