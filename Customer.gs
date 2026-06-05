/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Customer/Klien: list, simpan, edit, hapus.
 */

function getCustomerList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);
    const data = sheet.getDataRange().getValues();
    const list = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          id: data[i][0].toString(),
          nama: data[i][1].toString(),
          perusahaan: data[i][2].toString(),
          kontak: data[i][4].toString(),
          alamat: data[i][3].toString()
        });
      }
    }
    return list;
  } catch(e) { return []; }
}
function simpanCustomer(nama, perusahaan, telepon, alamat) {
  try {
    if (!nama) return { success: false, message: "Nama klien tidak boleh kosong." };

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);
    SpreadsheetApp.flush();

    const lastRow = sheet.getLastRow();
    let maxNumber = 0;

    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const idVal = idValues[i][0] ? idValues[i][0].toString().trim() : "";
        const match = idVal.match(/^K(\d+)/i);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
      }
    }

    const nextId = "K" + ("000" + (maxNumber + 1)).slice(-3);
    sheet.appendRow([nextId, nama, perusahaan, alamat, telepon]);

    return { success: true, message: "Klien (" + nextId + ") berhasil ditambahkan!", newId: nextId };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}
function editCustomer(id, nama, perusahaan, telepon, alamat) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Klien');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[nama, perusahaan, alamat, telepon]]);
        return { success: true, message: "Klien " + id + " berhasil diperbarui!" };
      }
    }
    return { success: false, message: "ID klien tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function hapusCustomer(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Klien');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Klien " + id + " berhasil dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}
