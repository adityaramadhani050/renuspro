/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Invoice: penomoran, simpan, daftar, sisa tagihan.
 *
 * Invoice diterbitkan dari Work Order (status Deal). Satu WO bisa punya
 * banyak invoice (DP / Termin / Pelunasan / Penuh). No invoice otomatis
 * & terkunci. Nilai baris (items) bersifat pre-tax (DPP); PPN dihitung
 * di footer.
 *
 * Alur: pilih Work Order → sistem ambil data penawaran → user pilih
 * keterangan pembayaran (DP/Termin/Pelunasan/Penuh) & atur nominal
 * berdasarkan PERSENTASE dari nilai kontrak (DPP penawaran) atau NOMINAL.
 * PPN terdeteksi otomatis dari penawaran. Rincian/scope diisi otomatis
 * (read-only) dari item penawaran.
 *
 * Basis persentase = nilai kontrak DPP = (subtotal − diskon) penawaran.
 * Tagihan DPP per WO tidak boleh melebihi nilai kontrak DPP.
 *
 * Sheet Invoice_Main — kolom (1-based):
 *  1 id              No Invoice (mis. 271/RGI-INV/VI/2026)
 *  2 noWO            No Work Order sumber
 *  3 noPenawaran     No Penawaran referensi
 *  4 tanggal         Tanggal invoice (dd/MM/yyyy)
 *  5 jenis           DP | Termin | Pelunasan | Penuh
 *  6 persen          Persentase tagih thd nilai kontrak (0 jika nominal)
 *  7 noPO            No PO pelanggan
 *  8 tglPO           Tanggal PO pelanggan
 *  9 klienId
 * 10 namaKlien       (snapshot)
 * 11 namaProject     (snapshot)
 * 12 dpp             Nilai tagih pre-tax (DPP invoice ini)
 * 13 ppnPersen
 * 14 ppnNominal
 * 15 total           Nilai tagih (DPP + PPN)
 * 16 metaJson        { scope:[kelompok penawaran], nilaiKontrak, inputMode }
 * 17 statusBayar     Belum Lunas | Lunas
 * 18 catatan         (Note)
 * 19 dibuatOleh
 * 20 bankAccount     (rekening tujuan, multi-baris)
 */

function buatSheetInvoiceDefault(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.insertSheet('Invoice_Main');
  sheet.appendRow([
    'No Invoice', 'No WO', 'No Penawaran', 'Tanggal', 'Jenis', 'Persen',
    'No PO', 'Tgl PO', 'Klien ID', 'Nama Klien', 'Nama Project',
    'DPP', 'PPN (%)', 'PPN Nominal', 'Total', 'Rincian Item (JSON)',
    'Status Bayar', 'Catatan', 'Dibuat Oleh', 'Bank Account'
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

// ── DPP yang sudah ditagih per WO (basis pre-tax) ───────────────────────────
function _getTagihanMap(ss) {
  const map = {};
  const sheet = ss.getSheetByName('Invoice_Main');
  if (!sheet) return map;
  const d = sheet.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    const noWO = d[i][1] ? d[i][1].toString() : '';
    const dpp = parseFloat(d[i][11]) || 0; // kolom 12 = DPP (pre-tax)
    if (noWO) map[noWO] = (map[noWO] || 0) + dpp;
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
      const nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0)); // DPP penawaran
      const ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
      const ditagihDpp = tagihMap[w.noWO] || 0;
      return {
        noWO:         w.noWO,
        id:           w.id,
        rev:          w.rev,
        namaProject:  w.namaProject,
        namaKlien:    w.namaKlien,
        klienId:      w.klienId,
        subtotal:     w.subtotal,
        diskon:       w.diskon,
        pajak:        w.pajak,
        grandTotal:   w.grandTotal,
        items:        w.items,
        nilaiKontrak: nilaiKontrak,
        ppnRate:      ppnRate,
        ditagihDpp:   ditagihDpp,
        sisaDpp:      Math.max(0, nilaiKontrak - ditagihDpp)
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

    // Ambil ulang data WO (sumber kebenaran) untuk validasi & snapshot
    const woList = getWorkOrderList();
    const wo     = woList.find(function(w) { return w.noWO === payload.noWO; });
    if (!wo) return { success: false, message: 'Work Order tidak ditemukan.' };

    const nilaiKontrak = Math.max(0, (wo.subtotal || 0) - (wo.diskon || 0)); // DPP penawaran
    const ppnPersen    = nilaiKontrak > 0 ? Math.round((wo.pajak || 0) / nilaiKontrak * 100) : 0;

    // Tentukan DPP tagihan
    const jenis = payload.jenis || 'Penuh';
    const tagihMap   = _getTagihanMap(ss);
    const ditagihDpp = tagihMap[payload.noWO] || 0;
    const sisaDpp    = Math.max(0, nilaiKontrak - ditagihDpp);

    let dpp, persen;
    if (jenis === 'Pelunasan') {
      dpp = sisaDpp;
      persen = 0;
    } else if (jenis === 'Penuh') {
      dpp = nilaiKontrak;
      persen = 100;
    } else if (payload.inputMode === 'nominal') {
      dpp = Math.round(parseFloat(payload.dpp) || 0);
      persen = nilaiKontrak > 0 ? Math.round(dpp / nilaiKontrak * 100) : 0;
    } else { // persentase
      persen = parseFloat(payload.persen) || 0;
      dpp = Math.round(persen / 100 * nilaiKontrak);
    }

    if (dpp <= 0) return { success: false, message: 'Nilai tagihan harus lebih dari 0.' };

    // Validasi tidak melebihi sisa DPP kontrak
    if (dpp > sisaDpp + 1) { // toleransi pembulatan 1
      return { success: false, message: 'Nilai tagihan (Rp ' + dpp.toLocaleString('id-ID') +
        ') melebihi sisa kontrak yang bisa ditagih (Rp ' + Math.round(sisaDpp).toLocaleString('id-ID') + ').' };
    }

    const ppnNominal = Math.round(dpp * ppnPersen / 100);
    const total      = dpp + ppnNominal;

    // Scope read-only dari penawaran (struktur kelompok)
    let scope = [];
    try { scope = JSON.parse(wo.items || '[]'); } catch (e) { scope = []; }
    const meta = { scope: scope, nilaiKontrak: nilaiKontrak, inputMode: payload.inputMode || 'persen' };

    const noInvoice = generateNextInvoiceNumber(ss);

    sheet.appendRow([
      noInvoice, payload.noWO, wo.id, payload.tanggal,
      jenis, persen,
      payload.noPO || '', payload.tglPO || '',
      wo.klienId, wo.namaKlien, wo.namaProject,
      dpp, ppnPersen, ppnNominal, total,
      JSON.stringify(meta), 'Belum Lunas',
      payload.catatan || '', payload.dibuatOleh || 'Sales Executive',
      payload.bankAccount || ''
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

// ── Edit invoice yang sudah ada ─────────────────────────────────────────────
function editInvoice(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Invoice_Main');
    if (!sheet) return { success: false, message: 'Sheet Invoice_Main tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === payload.id) { rowIdx = i; break; }
    }
    if (rowIdx < 0) return { success: false, message: 'Invoice tidak ditemukan.' };

    const noWO = data[rowIdx][1] ? data[rowIdx][1].toString() : '';
    const oldDpp = parseFloat(data[rowIdx][11]) || 0;

    // Data WO (sumber kebenaran)
    const wo = getWorkOrderList().find(function(w) { return w.noWO === noWO; });
    if (!wo) return { success: false, message: 'Work Order sumber tidak ditemukan.' };

    const nilaiKontrak = Math.max(0, (wo.subtotal || 0) - (wo.diskon || 0));
    const ppnPersen    = nilaiKontrak > 0 ? Math.round((wo.pajak || 0) / nilaiKontrak * 100) : 0;

    // Sisa kontrak tidak termasuk invoice ini sendiri
    const ditagihLain = (_getTagihanMap(ss)[noWO] || 0) - oldDpp;
    const sisaDpp = Math.max(0, nilaiKontrak - ditagihLain);

    const jenis = payload.jenis || 'Penuh';
    let dpp, persen;
    if (jenis === 'Pelunasan')          { dpp = sisaDpp; persen = 0; }
    else if (jenis === 'Penuh')         { dpp = nilaiKontrak; persen = 100; }
    else if (payload.inputMode === 'nominal') {
      dpp = Math.round(parseFloat(payload.dpp) || 0);
      persen = nilaiKontrak > 0 ? Math.round(dpp / nilaiKontrak * 100) : 0;
    } else {
      persen = parseFloat(payload.persen) || 0;
      dpp = Math.round(persen / 100 * nilaiKontrak);
    }

    if (dpp <= 0) return { success: false, message: 'Nilai tagihan harus lebih dari 0.' };
    if (dpp > sisaDpp + 1) {
      return { success: false, message: 'Nilai tagihan (Rp ' + dpp.toLocaleString('id-ID') +
        ') melebihi sisa kontrak yang bisa ditagih (Rp ' + Math.round(sisaDpp).toLocaleString('id-ID') + ').' };
    }

    const ppnNominal = Math.round(dpp * ppnPersen / 100);
    const total      = dpp + ppnNominal;

    let scope = [];
    try { scope = JSON.parse(wo.items || '[]'); } catch (e) { scope = []; }
    const meta = { scope: scope, nilaiKontrak: nilaiKontrak, inputMode: payload.inputMode || 'persen' };

    const r = rowIdx + 1; // 1-based
    sheet.getRange(r, 4).setValue(payload.tanggal);          // Tanggal
    sheet.getRange(r, 5).setValue(jenis);                    // Jenis
    sheet.getRange(r, 6).setValue(persen);                   // Persen
    sheet.getRange(r, 7).setValue(payload.noPO || '');       // No PO
    sheet.getRange(r, 8).setValue(payload.tglPO || '');      // Tgl PO
    sheet.getRange(r, 12).setValue(dpp);                     // DPP
    sheet.getRange(r, 13).setValue(ppnPersen);               // PPN %
    sheet.getRange(r, 14).setValue(ppnNominal);              // PPN Nominal
    sheet.getRange(r, 15).setValue(total);                   // Total
    sheet.getRange(r, 16).setValue(JSON.stringify(meta));    // meta
    sheet.getRange(r, 18).setValue(payload.catatan || '');   // Catatan
    sheet.getRange(r, 20).setValue(payload.bankAccount || ''); // Bank Account

    SpreadsheetApp.flush();
    return { success: true, message: 'Invoice ' + payload.id + ' berhasil diperbarui!' };
  } catch (e) {
    return { success: false, message: 'Gagal memperbarui invoice: ' + e.toString() };
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
        dibuatOleh:  data[i][18] ? data[i][18].toString() : '',
        bankAccount: data[i][19] ? data[i][19].toString() : ''
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
