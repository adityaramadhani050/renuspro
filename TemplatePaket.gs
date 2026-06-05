/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Template Paket: map, simpan, hapus.
 */

function getTemplatePaketMap(ss) {
  try {
    ss = ss || getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Paket') || buatSheetTemplatePaket(ss);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return {};

    // Bangun produk map sekali — O(1) lookup
    const produkMap = {};
    const sheetProduk = ss.getSheetByName('Master_Produk');
    if (sheetProduk) {
      const pdData = sheetProduk.getDataRange().getValues();
      for (let i = 1; i < pdData.length; i++) {
        if (pdData[i][0]) {
          produkMap[pdData[i][0].toString()] = {
            nama:  pdData[i][1].toString(),
            unit:  pdData[i][2].toString(),
            harga: Number(pdData[i][3]) || 0,
            hpp:   Number(pdData[i][4]) || 0
          };
        }
      }
    }

    const data = sheet.getRange(1, 1, lastRow, 3).getValues();
    const map = {};

    for (let i = 1; i < data.length; i++) {
      const id        = data[i][0];
      const nama      = data[i][1];
      const itemsJson = data[i][2];
      if (!id || !nama || !itemsJson) continue;

      let rawItems = [];
      try { rawItems = JSON.parse(itemsJson); } catch(e) { rawItems = []; }

      // Enrich setiap item dengan harga/hpp/unit live dari Master_Produk
      const enrichedItems = rawItems.map(function(it) {
        const p = produkMap[it.produkId] || {};
        return {
          produkId:  it.produkId,
          deskripsi: it.deskripsi || p.nama || '',
          qty:       it.qty       || 1,
          unit:      p.unit       || it.unit  || '',
          harga:     p.harga      || it.harga || 0,
          hpp:       p.hpp        || it.hpp   || 0
        };
      });

      map[id.toString()] = { nama: nama.toString(), items: enrichedItems };
    }
    return map;
  } catch(e) {
    Logger.log('getTemplatePaketMap error: ' + e);
    return {};
  }
}
// GANTI seluruh fungsi simpanTemplatePaket():
function simpanTemplatePaket(id, nama, itemsJson, editId) {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Paket') || buatSheetTemplatePaket(ss);

    // Flush dulu sebelum membaca agar data terkini
    SpreadsheetApp.flush();
    const data   = sheet.getDataRange().getValues();
    const idCari = (editId || '').toString().trim();
    const idBaru = id.toString().trim();

    // Mode EDIT: cari baris lama berdasarkan editId lalu overwrite
    if (idCari) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString().trim() === idCari) {
          sheet.getRange(i + 1, 1, 1, 3).setValues([[idBaru, nama, itemsJson]]);
          SpreadsheetApp.flush();
          return { success: true, message: 'Template ' + idBaru + ' berhasil diperbarui!' };
        }
      }
      // Jika editId tidak ditemukan di sheet, fallthrough ke append
    }

    // Mode TAMBAH: cek duplikat ID terlebih dahulu
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === idBaru) {
        return { success: false, message: 'ID Template ' + idBaru + ' sudah digunakan.' };
      }
    }

    // Append baris baru
    sheet.appendRow([idBaru, nama, itemsJson]);
    SpreadsheetApp.flush();

    return { success: true, message: 'Template ' + idBaru + ' berhasil ditambahkan!' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// Hapus Template Paket
function hapusTemplatePaket(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Template_Paket');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Template ' + id + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'Template tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
