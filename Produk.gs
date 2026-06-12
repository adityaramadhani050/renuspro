/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Produk/Jasa: list, simpan, edit, hapus.
 * Kolom: [0]ID, [1]Nama, [2]Unit, [3]Harga Jual, [4]HPP, [5]Tipe (Material/Jasa/kosong)
 */

/**
 * Pastikan kolom Tipe ada di Master_Produk (migrasi lazy — tambah jika belum ada).
 */
function _ensureTipeKolom(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Master_Produk');
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 6) {
    // Tambah header Tipe di kolom 6
    sheet.getRange(1, 6).setValue('Tipe');
  }
}

function getProdukList() {
  try {
    const data = _cachedProduk();
    const list = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          sku:   data[i][0].toString(),
          nama:  data[i][1].toString(),
          unit:  data[i][2].toString(),
          harga: Number(data[i][3]) || 0,
          hpp:   Number(data[i][4]) || 0,
          tipe:  data[i][5] ? data[i][5].toString() : ''
        });
      }
    }
    return list;
  } catch(e) { return []; }
}

function simpanProduk(nama, unit, harga, hpp, tipe) {
  try {
    if (!nama || !unit) {
      return { success: false, message: "Data nama/unit tidak boleh kosong." };
    }
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    _ensureTipeKolom(ss);
    SpreadsheetApp.flush();

    const lastRow = sheet.getLastRow();
    let maxNumber = 0;
    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const idVal = idValues[i][0] ? idValues[i][0].toString().trim() : "";
        const match = idVal.match(/^P(\d+)/i);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
      }
    }

    const nextId = "P" + ("000" + (maxNumber + 1)).slice(-3);
    sheet.appendRow([nextId, nama, unit, Number(harga) || 0, Number(hpp) || 0, tipe || '']);
    invalidateProdukCache();
    return { success: true, message: "Produk " + nextId + " berhasil ditambahkan!" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function editProduk(id, nama, unit, harga, hpp, tipe) {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    _ensureTipeKolom(ss);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[nama, unit, harga, hpp, tipe || '']]);
        invalidateProdukCache();
        return { success: true, message: "Produk " + id + " berhasil diperbarui!" };
      }
    }
    return { success: false, message: "ID produk tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function hapusProduk(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Produk');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        invalidateProdukCache();
        return { success: true, message: "Produk " + id + " berhasil dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}
