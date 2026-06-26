/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Kwitansi: tanda terima pembayaran (umumnya atas sebuah Invoice).
 *
 * No Kwitansi otomatis & terkunci, format: NNN/RGI/KWT/[bulan romawi]/[tahun].
 *
 * Sheet Kwitansi_Main — kolom (1-based):
 *  1 id          No Kwitansi
 *  2 noInvoice   Invoice yang dibayar (referensi)
 *  3 noWO        Work Order terkait
 *  4 tanggal     Tanggal terima (dd/MM/yyyy)
 *  5 terimaDari  Nama klien/pembayar
 *  6 jumlah      Nominal diterima
 *  7 untuk       Untuk pembayaran (deskripsi)
 *  8 metode      Tunai | Transfer
 *  9 catatan
 * 10 dibuatOleh
 */

function buatSheetKwitansiDefault(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.insertSheet('Kwitansi_Main');
  sheet.appendRow([
    'No Kwitansi', 'No Invoice', 'No WO', 'Tanggal', 'Terima Dari',
    'Jumlah', 'Untuk Pembayaran', 'Metode', 'Catatan', 'Dibuat Oleh'
  ]);
  return sheet;
}

function generateNextKwitansiNumber(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.getSheetByName('Kwitansi_Main') || buatSheetKwitansiDefault(ss);
  SpreadsheetApp.flush();
  const rows = sheet.getLastRow();
  let maxId = 0;

  if (rows > 1) {
    const ids = sheet.getRange(2, 1, rows - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const val = ids[i][0] ? ids[i][0].toString() : '';
      const m = val.match(/^(\d+)\/RGI(?:-KW|\/KWT)/);
      if (m) { const n = parseInt(m[1], 10); if (n > maxId) maxId = n; }
    }
  }

  const roman = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  const mon  = roman[new Date().getMonth()];
  const yr   = new Date().getFullYear();
  const next = String(maxId + 1).padStart(3, '0');
  return `${next}/RGI/KWT/${mon}/${yr}`;
}

// ── Data awal form kwitansi: daftar invoice + nomor berikutnya ──────────────
function getKwitansiInitialData() {
  try {
    const ss = getSpreadsheet();
    return { success: true, invoiceList: getInvoiceList(), nextNo: generateNextKwitansiNumber(ss) };
  } catch (e) {
    return { success: false, error: e.toString(), invoiceList: [], nextNo: '' };
  }
}

// ── Helper internal (tanpa lock) — dipanggil dari Invoice.gs ────────────────
function _appendKwitansiRow(ss, payload) {
  const sheet = ss.getSheetByName('Kwitansi_Main') || buatSheetKwitansiDefault(ss);
  const jumlah = parseFloat(payload.jumlah) || 0;
  if (jumlah <= 0) return '';
  const noKwitansi = generateNextKwitansiNumber(ss);
  sheet.appendRow([
    noKwitansi, payload.noInvoice || '', payload.noWO || '', payload.tanggal,
    payload.terimaDari || '', jumlah, payload.untuk || '',
    payload.metode || 'Transfer', payload.catatan || '',
    payload.dibuatOleh || 'Sistem'
  ]);
  SpreadsheetApp.flush();
  invalidateKwitansiCache();
  return noKwitansi;
}

function simpanKwitansi(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Kwitansi_Main') || buatSheetKwitansiDefault(ss);

    const jumlah = parseFloat(payload.jumlah) || 0;
    if (jumlah <= 0) return { success: false, message: 'Jumlah kwitansi harus lebih dari 0.' };

    const noKwitansi = generateNextKwitansiNumber(ss);
    sheet.appendRow([
      noKwitansi, payload.noInvoice || '', payload.noWO || '', payload.tanggal,
      payload.terimaDari || '', jumlah, payload.untuk || '',
      payload.metode || 'Transfer', payload.catatan || '',
      payload.dibuatOleh || 'Sales Executive'
    ]);

    SpreadsheetApp.flush();
    invalidateKwitansiCache();
    return { success: true, message: 'Kwitansi ' + noKwitansi + ' berhasil dibuat!', noKwitansi: noKwitansi };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan kwitansi: ' + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getKwitansiList() {
  try {
    const data = _cachedKwitansi();
    if (!data || data.length === 0) return [];
    const list = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const tglStr = _fmtTgl(data[i][3]);
      list.push({
        id:         data[i][0].toString(),
        noInvoice:  data[i][1] ? data[i][1].toString() : '',
        noWO:       data[i][2] ? data[i][2].toString() : '',
        tanggal:    tglStr,
        terimaDari: data[i][4] ? data[i][4].toString() : '',
        jumlah:     parseFloat(data[i][5]) || 0,
        untuk:      data[i][6] ? data[i][6].toString() : '',
        metode:     data[i][7] ? data[i][7].toString() : '',
        catatan:    data[i][8] ? data[i][8].toString() : '',
        dibuatOleh: data[i][9] ? data[i][9].toString() : ''
      });
    }

    list.sort(function(a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
    return list;
  } catch (e) {
    Logger.log('getKwitansiList error: ' + e);
    return [];
  }
}

function editKwitansi(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Kwitansi_Main');
    if (!sheet) return { success: false, message: 'Sheet Kwitansi_Main tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === payload.id) { rowIdx = i; break; }
    }
    if (rowIdx < 0) return { success: false, message: 'Kwitansi tidak ditemukan.' };

    const jumlah = parseFloat(payload.jumlah) || 0;
    if (jumlah <= 0) return { success: false, message: 'Jumlah kwitansi harus lebih dari 0.' };

    const r = rowIdx + 1; // 1-based
    sheet.getRange(r, 4).setValue(payload.tanggal || '');       // Tanggal
    sheet.getRange(r, 5).setValue(payload.terimaDari || '');    // Terima Dari
    sheet.getRange(r, 6).setValue(jumlah);                      // Jumlah
    sheet.getRange(r, 7).setValue(payload.untuk || '');         // Untuk
    sheet.getRange(r, 8).setValue(payload.metode || 'Transfer');// Metode
    sheet.getRange(r, 9).setValue(payload.catatan || '');       // Catatan

    SpreadsheetApp.flush();
    invalidateKwitansiCache();
    return { success: true, message: 'Kwitansi ' + payload.id + ' berhasil diperbarui!' };
  } catch (e) {
    return { success: false, message: 'Gagal memperbarui kwitansi: ' + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusKwitansi(idKwitansi) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Kwitansi_Main');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString() === idKwitansi) {
        sheet.deleteRow(i + 1);
        invalidateKwitansiCache();
        return { success: true, message: 'Kwitansi ' + idKwitansi + ' dihapus.' };
      }
    }
    return { success: false, message: 'Kwitansi tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}
