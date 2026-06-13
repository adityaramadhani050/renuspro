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
    sheet.getRange(1, 6).setValue('Tipe');
  }
}

/**
 * Pastikan kolom Stok ID [6] dan Qty Tersedia [7] ada di Master_Produk.
 */
function _ensureStokLinkKolom(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Master_Produk');
  if (!sheet) return;
  _ensureTipeKolom(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 7) sheet.getRange(1, 7).setValue('Stok ID');
  if (lastCol < 8) sheet.getRange(1, 8).setValue('Qty Tersedia');
}

function getProdukList() {
  try {
    const data = _cachedProduk();
    const list = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          sku:          data[i][0].toString(),
          nama:         data[i][1].toString(),
          unit:         data[i][2].toString(),
          harga:        Number(data[i][3]) || 0,
          hpp:          Number(data[i][4]) || 0,
          tipe:         data[i][5] ? data[i][5].toString() : '',
          stokId:       data[i][6] ? data[i][6].toString() : '',
          qtyTersedia:  Number(data[i][7]) || 0
        });
      }
    }
    return list;
  } catch(e) { return []; }
}

function simpanProduk(nama, unit, harga, hpp, tipe, stokId) {
  try {
    if (!nama || !unit) {
      return { success: false, message: "Data nama/unit tidak boleh kosong." };
    }
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    _ensureStokLinkKolom(ss);
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

    // Jika stokId diberikan, ambil hargaBeli dan qty dari sheet Stok
    let hppFinal = Number(hpp) || 0;
    let qtyTersedia = 0;
    if (stokId) {
      const stokSheet = ss.getSheetByName('Stok');
      if (stokSheet) {
        const stokData = stokSheet.getDataRange().getValues();
        for (let j = 1; j < stokData.length; j++) {
          if ((stokData[j][0] || '').toString().trim() === stokId) {
            qtyTersedia = Number(stokData[j][3]) || 0;
            if (!hppFinal) hppFinal = Number(stokData[j][4]) || 0;
            break;
          }
        }
      }
    }

    sheet.appendRow([nextId, nama, unit, Number(harga) || 0, hppFinal, tipe || '', stokId || '', qtyTersedia]);
    invalidateProdukCache();
    return { success: true, message: "Produk " + nextId + " berhasil ditambahkan!" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function editProduk(id, nama, unit, harga, hpp, tipe, stokId) {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    _ensureStokLinkKolom(ss);

    // Jika stokId diberikan, ambil hargaBeli dan qty dari sheet Stok
    let qtyTersedia = 0;
    if (stokId) {
      const stokSheet = ss.getSheetByName('Stok');
      if (stokSheet) {
        const stokData = stokSheet.getDataRange().getValues();
        for (let j = 1; j < stokData.length; j++) {
          if ((stokData[j][0] || '').toString().trim() === stokId) {
            qtyTersedia = Number(stokData[j][3]) || 0;
            // Jika HPP tidak di-override oleh user (== 0), gunakan harga beli dari stok
            if (!hpp || Number(hpp) === 0) {
              hpp = Number(stokData[j][4]) || 0;
            }
            break;
          }
        }
      }
    }

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[nama, unit, harga, hpp, tipe || '']]);
        sheet.getRange(i + 1, 7).setValue(stokId || '');
        sheet.getRange(i + 1, 8).setValue(qtyTersedia);
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
