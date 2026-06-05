/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Invoice: penomoran, simpan, daftar, sisa tagihan.
 *
 * Invoice diterbitkan dari Work Order (status Deal). Satu WO bisa punya
 * banyak invoice (DP / Termin / Pelunasan / Penuh). No invoice otomatis
 * & terkunci. Nilai baris (items) bersifat pre-tax (DPP); PPN dihitung
 * di footer.
 *
 * Sheet Invoice_Main — kolom (1-based):
 *  1 id              No Invoice (mis. 271/RGI-INV/VI/2026)
 *  2 noWO            No Work Order sumber
 *  3 noPenawaran     No Penawaran referensi
 *  4 tanggal         Tanggal invoice (dd/MM/yyyy)
 *  5 jenis           DP | Termin | Pelunasan | Penuh
 *  6 persen          Persentase tagih (0 jika tidak relevan)
 *  7 noPO            No PO pelanggan
 *  8 tglPO           Tanggal PO pelanggan
 *  9 klienId
 * 10 namaKlien       (snapshot)
 * 11 namaProject     (snapshot)
 * 12 dpp             Subtotal pre-tax (jumlah amount baris)
 * 13 ppnPersen
 * 14 ppnNominal
 * 15 total           Nilai tagih (DPP + PPN)
 * 16 itemsJson       Baris invoice [{deskripsi,qty,unit,harga,amount}]
 * 17 statusBayar     Belum Lunas | Lunas
 * 18 catatan
 * 19 dibuatOleh
 */

function buatSheetInvoiceDefault(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.insertSheet('Invoice_Main');
  sheet.appendRow([
    'No Invoice', 'No WO', 'No Penawaran', 'Tanggal', 'Jenis', 'Persen',
    'No PO', 'Tgl PO', 'Klien ID', 'Nama Klien', 'Nama Project',
    'DPP', 'PPN (%)', 'PPN Nominal', 'Total', 'Rincian Item (JSON)',
    'Status Bayar', 'Catatan', 'Dibuat Oleh'
  ]);
  return sheet;
}

// ── Generate No Invoice berikutnya (urut global, terkunci) ──────────────────
function generateNextInvoiceNumber(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.getSheetByName('Invoice_Main') || buatSheetInvoiceDefault(ss);
  SpreadsheetApp.flush();
  const rows = sheet.getLastRow();
  let maxId = 0;

  if (rows > 1) {
    const ids = sheet.getRange(2, 1, rows - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const val = ids[i][0] ? ids[i][0].toString() : '';
      const m = val.match(/^(\d+)\/RGI-INV/);
      if (m) { const n = parseInt(m[1], 10); if (n > maxId) maxId = n; }
    }
  }

  const roman = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  const mon  = roman[new Date().getMonth()];
  const yr   = new Date().getFullYear();
  const next = String(maxId + 1).padStart(3, '0');
  return `${next}/RGI-INV/${mon}/${yr}`;
}

// ── Total yang sudah ditagih per WO ─────────────────────────────────────────
function _getTagihanMap(ss) {
  const map = {};
  const sheet = ss.getSheetByName('Invoice_Main');
  if (!sheet) return map;
  const d = sheet.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    const noWO = d[i][1] ? d[i][1].toString() : '';
    const total = parseFloat(d[i][14]) || 0; // kolom 15 = Total
    if (noWO) map[noWO] = (map[noWO] || 0) + total;
  }
  return map;
}

// ── Data awal form invoice: daftar WO + sisa tagihan + nomor berikutnya ─────
function getInvoiceInitialData() {
  try {
    const ss = getSpreadsheet();
    const woList = getWorkOrderList();
    const tagihMap = _getTagihanMap(ss);

    const woEnriched = woList.map(function(w) {
      const ditagih = tagihMap[w.noWO] || 0;
      return {
        noWO:        w.noWO,
        id:          w.id,
        rev:         w.rev,
        namaProject: w.namaProject,
        namaKlien:   w.namaKlien,
        klienId:     w.klienId,
        subtotal:    w.subtotal,
        diskon:      w.diskon,
        pajak:       w.pajak,
        grandTotal:  w.grandTotal,
        items:       w.items,
        ditagih:     ditagih,
        sisa:        Math.max(0, w.grandTotal - ditagih)
      };
    });

    return { success: true, woList: woEnriched, nextNo: generateNextInvoiceNumber(ss) };
  } catch (e) {
    return { success: false, error: e.toString(), woList: [], nextNo: '' };
  }
}

// ── Simpan invoice baru ─────────────────────────────────────────────────────
function simpanInvoice(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Invoice_Main') || buatSheetInvoiceDefault(ss);

    const items = Array.isArray(payload.items) ? payload.items : [];
    const dpp = items.reduce(function(s, it) { return s + (parseFloat(it.amount) || 0); }, 0);
    if (dpp <= 0) return { success: false, message: 'Nilai invoice harus lebih dari 0.' };

    const ppnPersen  = parseFloat(payload.ppnPersen) || 0;
    const ppnNominal = Math.round(dpp * ppnPersen / 100);
    const total      = dpp + ppnNominal;

    // Validasi tidak melebihi sisa tagihan WO
    const tagihMap = _getTagihanMap(ss);
    const woList   = getWorkOrderList();
    const wo       = woList.find(function(w) { return w.noWO === payload.noWO; });
    if (!wo) return { success: false, message: 'Work Order tidak ditemukan.' };
    const sisa = wo.grandTotal - (tagihMap[payload.noWO] || 0);
    if (total > sisa + 1) { // toleransi pembulatan 1
      return { success: false, message: 'Nilai invoice (Rp ' + total.toLocaleString('id-ID') +
        ') melebihi sisa tagihan WO (Rp ' + Math.round(sisa).toLocaleString('id-ID') + ').' };
    }

    const noInvoice = generateNextInvoiceNumber(ss);

    sheet.appendRow([
      noInvoice, payload.noWO, payload.noPenawaran || wo.id, payload.tanggal,
      payload.jenis || 'Penuh', parseFloat(payload.persen) || 0,
      payload.noPO || '', payload.tglPO || '',
      payload.klienId || wo.klienId, payload.namaKlien || wo.namaKlien,
      payload.namaProject || wo.namaProject,
      dpp, ppnPersen, ppnNominal, total,
      JSON.stringify(items), 'Belum Lunas',
      payload.catatan || '', payload.dibuatOleh || 'Sales Executive'
    ]);

    SpreadsheetApp.flush();
    return {
      success: true,
      message: 'Invoice ' + noInvoice + ' berhasil dibuat!',
      noInvoice: noInvoice,
      nextNo: generateNextInvoiceNumber(ss)
    };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan invoice: ' + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ── Daftar semua invoice ────────────────────────────────────────────────────
function getInvoiceList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Invoice_Main');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const tglStr = data[i][3] instanceof Date
        ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][3];
      const tglPoStr = data[i][7] instanceof Date
        ? Utilities.formatDate(data[i][7], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][7];

      list.push({
        id:          data[i][0].toString(),
        noWO:        data[i][1] ? data[i][1].toString() : '',
        noPenawaran: data[i][2] ? data[i][2].toString() : '',
        tanggal:     tglStr,
        jenis:       data[i][4] ? data[i][4].toString() : 'Penuh',
        persen:      parseFloat(data[i][5]) || 0,
        noPO:        data[i][6] ? data[i][6].toString() : '',
        tglPO:       tglPoStr,
        klienId:     data[i][8] ? data[i][8].toString() : '',
        namaKlien:   data[i][9] ? data[i][9].toString() : '',
        namaProject: data[i][10] ? data[i][10].toString() : '',
        dpp:         parseFloat(data[i][11]) || 0,
        ppnPersen:   parseFloat(data[i][12]) || 0,
        ppnNominal:  parseFloat(data[i][13]) || 0,
        total:       parseFloat(data[i][14]) || 0,
        items:       data[i][15] ? data[i][15].toString() : '[]',
        statusBayar: data[i][16] ? data[i][16].toString() : 'Belum Lunas',
        catatan:     data[i][17] ? data[i][17].toString() : '',
        dibuatOleh:  data[i][18] ? data[i][18].toString() : ''
      });
    }

    list.sort(function(a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
    return list;
  } catch (e) {
    Logger.log('getInvoiceList error: ' + e);
    return [];
  }
}

// ── Update status bayar invoice ─────────────────────────────────────────────
function updateStatusBayarInvoice(idInvoice, statusBaru) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Invoice_Main');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === idInvoice) {
        sheet.getRange(i + 1, 17).setValue(statusBaru); // kolom 17 = Status Bayar
        SpreadsheetApp.flush();
        return { success: true, message: 'Status bayar diperbarui: ' + statusBaru };
      }
    }
    return { success: false, message: 'Invoice tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ── Hapus invoice ───────────────────────────────────────────────────────────
function hapusInvoice(idInvoice) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Invoice_Main');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString() === idInvoice) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Invoice ' + idInvoice + ' dihapus.' };
      }
    }
    return { success: false, message: 'Invoice tidak ditemukan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ── Terbilang (angka → kata, Bahasa Indonesia) ──────────────────────────────
function terbilangIndo(n) {
  n = Math.floor(Math.abs(n || 0));
  if (n === 0) return 'nol';
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

  function konversi(x) {
    if (x < 12) return satuan[x];
    if (x < 20) return konversi(x - 10) + ' belas';
    if (x < 100) {
      return satuan[Math.floor(x / 10)] + ' puluh' + (x % 10 ? ' ' + konversi(x % 10) : '');
    }
    if (x < 200) return 'seratus' + (x % 100 ? ' ' + konversi(x % 100) : '');
    if (x < 1000) {
      return satuan[Math.floor(x / 100)] + ' ratus' + (x % 100 ? ' ' + konversi(x % 100) : '');
    }
    if (x < 2000) return 'seribu' + (x % 1000 ? ' ' + konversi(x % 1000) : '');
    if (x < 1000000) {
      return konversi(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + konversi(x % 1000) : '');
    }
    if (x < 1000000000) {
      return konversi(Math.floor(x / 1000000)) + ' juta' + (x % 1000000 ? ' ' + konversi(x % 1000000) : '');
    }
    if (x < 1000000000000) {
      return konversi(Math.floor(x / 1000000000)) + ' miliar' + (x % 1000000000 ? ' ' + konversi(x % 1000000000) : '');
    }
    return konversi(Math.floor(x / 1000000000000)) + ' triliun' + (x % 1000000000000 ? ' ' + konversi(x % 1000000000000) : '');
  }

  return konversi(n).replace(/\s+/g, ' ').trim();
}
