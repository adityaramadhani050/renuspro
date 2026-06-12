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
