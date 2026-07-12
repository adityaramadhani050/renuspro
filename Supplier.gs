/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Master Supplier: list, simpan, edit, hapus.
 */

function _ensureSupplierSheet(ss) {
  ss = ss || getSpreadsheet();
  const existing = ss.getSheetByName('Supplier');
  if (existing) return existing;
  const sheet = ss.insertSheet('Supplier');
  sheet.appendRow([
    'ID Supplier', 'Nama', 'PIC', 'Telepon', 'Email',
    'Alamat', 'Catatan', 'Status',
    'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada'
  ]);
  return sheet;
}

function getSupplierList() {
  try {
    const ss = getSpreadsheet();
    const sheet = _ensureSupplierSheet(ss);
    const data = sheet.getDataRange().getValues();
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
          dibuatPada: data[i][9].toString()
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
      ''
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
//   0 ID Supplier | 1 ID Produk | 2 Harga Beli (opsional) | 3 Dibuat Pada
// ═══════════════════════════════════════════════════════════════════════════

function _ensureSupplierProdukSheet(ss) {
  ss = ss || getSpreadsheet();
  const existing = ss.getSheetByName('Supplier_Produk');
  if (existing) return existing;
  const sheet = ss.insertSheet('Supplier_Produk');
  sheet.appendRow(['ID Supplier', 'ID Produk', 'Harga Beli', 'Dibuat Pada']);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  return sheet;
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
        idProduk:  idProduk,
        nama:      p.nama,
        unit:      p.unit,
        hpp:       p.hpp,
        hargaBeli: (data[i][2] !== '' && data[i][2] != null) ? (parseFloat(data[i][2]) || 0) : null
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Item siap-dropdown untuk form PO: { id, nama, unit, hargaBeli }.
// hargaBeli = harga beli spesifik supplier bila ada, else fallback ke HPP produk.
function getProdukBySupplier(idSupplier) {
  try {
    const res = getSupplierKatalog(idSupplier);
    if (!res.success) return res;
    const list = res.list.map(function (it) {
      return {
        id:        it.idProduk,
        nama:      it.nama,
        unit:      it.unit,
        hargaBeli: (it.hargaBeli != null) ? it.hargaBeli : (it.hpp || 0)
      };
    }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return { success: true, list: list };
  } catch (e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// Tulis ulang katalog satu supplier. items = [{ idProduk, hargaBeli? }].
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

    // Hapus baris lama supplier ini (dari bawah ke atas)
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] && data[i][0].toString().trim() === idSupplier) sheet.deleteRow(i + 1);
    }

    // Insert baru (dedup ID Produk)
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    const seen = {};
    for (let j = 0; j < items.length; j++) {
      const idProduk = (items[j].idProduk || '').toString().trim();
      if (!idProduk || seen[idProduk]) continue;
      seen[idProduk] = true;
      const hb = (items[j].hargaBeli != null && items[j].hargaBeli !== '')
        ? (parseFloat(items[j].hargaBeli) || 0) : '';
      sheet.appendRow([idSupplier, idProduk, hb, when]);
    }
    return { success: true, message: 'Katalog supplier tersimpan (' + Object.keys(seen).length + ' item).' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
