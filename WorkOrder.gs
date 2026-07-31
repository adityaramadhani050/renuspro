/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Work Order (WO): penomoran & daftar penawaran berstatus Deal.
 *
 * No WO menjadi ID utama fitur Work Order dan akan dipakai sebagai
 * referensi untuk fitur Invoice & Kwitansi.
 *
 * Format No WO: [YY][NNN]  → contoh "26012"
 *   - YY  = 2 digit tahun (mis. 2026 → "26")
 *   - NNN = nomor urut 3 digit, RESET setiap tahun
 *
 * Kolom Penawaran_Main: Status = kolom 17, No WO = kolom 18.
 */

// ── Generate No WO berikutnya (urut per tahun) ──────────────────────────────
// Dipanggil dari dalam updateStatusPenawaran() yang sudah memegang ScriptLock.
function generateNextWONumber(sheet) {
  sheet = sheet || getSpreadsheet().getSheetByName('Penawaran_Main');

  const yy = String(new Date().getFullYear()).slice(-2); // "26"
  const lastRow = sheet.getLastRow();
  let maxSeq = 0;

  if (lastRow > 1) {
    const woVals = sheet.getRange(2, 18, lastRow - 1, 1).getValues(); // kolom 18 = No WO
    for (let i = 0; i < woVals.length; i++) {
      const val = woVals[i][0] !== '' && woVals[i][0] != null
        ? woVals[i][0].toString().trim() : '';
      // Hanya hitung WO dengan prefix tahun yang sama
      if (val.length >= 4 && val.slice(0, 2) === yy) {
        const seq = parseInt(val.slice(2), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return yy + nextSeq; // "26012"
}

// ════════════════════════════════════════════════════════════════════════════
//  SHEET WORK ORDER TERSENDIRI (proyeksi dari Penawaran_Main).
//  Alasan: memindai seluruh Penawaran_Main tiap baca WO makin berat seiring
//  data penawaran bertambah. Work_Order menyimpan HANYA WO (Deal/Closed +
//  No WO), disinkron dari satu titik `_syncWorkOrder(noPenawaran)` di setiap
//  jalur tulis penawaran. Sumber kebenaran tetap Penawaran; sheet ini salinan
//  cepat yang di-cache.
//  Kolom: No WO | No Penawaran | Rev | Tanggal | Valid Until | Nama Project |
//         Klien ID | Nama Klien | Dibuat Oleh | Subtotal | Diskon | Pajak |
//         Grand Total | HPP | Profit | Margin% | Term Conditions | Items |
//         Status | Tanggal Deal
// ════════════════════════════════════════════════════════════════════════════
var _WO_HEADERS = ['No WO', 'No Penawaran', 'Rev', 'Tanggal', 'Valid Until', 'Nama Project',
  'Klien ID', 'Nama Klien', 'Dibuat Oleh', 'Subtotal', 'Diskon', 'Pajak', 'Grand Total',
  'HPP', 'Profit', 'Margin %', 'Term Conditions', 'Items', 'Status', 'Tanggal Deal'];

function _woKlienMap(ss) {
  var m = {};
  var kd = _cachedKlien();
  for (var i = 1; i < kd.length; i++) { if (kd[i][0]) m[kd[i][0].toString()] = kd[i][1].toString(); }
  return m;
}

// Bangun 1 baris Work_Order dari baris Penawaran_Main (rev tertinggi).
function _woRecordFromPenRow(row, rev, klienMap) {
  var klienId = (row[5] != null ? row[5] : '').toString();
  var noWO = (row[17] !== '' && row[17] != null) ? row[17].toString() : '';
  return [
    noWO,
    (row[0] != null ? row[0] : '').toString(),
    (rev != null ? rev : (parseInt(row[1]) || 0)).toString(),
    _fmtTgl(row[2]), _fmtTgl(row[3]),
    (row[4] != null ? row[4] : '').toString(),
    klienId, klienMap[klienId] || klienId,
    (row[6] != null ? row[6] : '').toString(),
    parseFloat(row[7]) || 0, parseFloat(row[8]) || 0, parseFloat(row[9]) || 0, parseFloat(row[10]) || 0,
    parseFloat(row[11]) || 0, parseFloat(row[12]) || 0, parseFloat(row[13]) || 0,
    row[14] ? row[14].toString() : '{}',
    row[15] ? row[15].toString() : '[]',
    (row[16] != null ? row[16] : '').toString(),
    _fmtTgl(row[18])
  ];
}

function _backfillWorkOrderSheet(ss, sheet) {
  var pen = ss.getSheetByName('Penawaran_Main');
  if (!pen || pen.getLastRow() < 2) return;
  var data = pen.getDataRange().getValues();
  var klienMap = _woKlienMap(ss);
  var latest = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var noPen = data[i][0].toString().trim();
    var rev = parseInt(data[i][1]) || 0;
    if (!latest[noPen] || rev > latest[noPen].rev) latest[noPen] = { rev: rev, row: data[i] };
  }
  var rows = [];
  for (var k in latest) {
    var r = latest[k].row;
    var status = r[16] ? r[16].toString() : '';
    var noWO = (r[17] !== '' && r[17] != null) ? r[17].toString() : '';
    if ((status !== 'Deal' && status !== 'Closed') || !noWO) continue;
    rows.push(_woRecordFromPenRow(r, latest[k].rev, klienMap));
  }
  if (rows.length) sheet.getRange(2, 1, rows.length, _WO_HEADERS.length).setValues(rows);
}

function _ensureWorkOrderSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Work_Order');
  if (sheet) return sheet;
  sheet = ss.insertSheet('Work_Order');
  sheet.appendRow(_WO_HEADERS);
  sheet.getRange(1, 1, 1, _WO_HEADERS.length).setFontWeight('bold');
  // Kolom tanggal (4, 5, 20) sbg TEXT agar tak di-auto-parse Sheets jadi Date.
  var maxR = sheet.getMaxRows();
  sheet.getRange(2, 4, maxR - 1, 2).setNumberFormat('@');
  sheet.getRange(2, 20, maxR - 1, 1).setNumberFormat('@');
  _backfillWorkOrderSheet(ss, sheet);   // migrasi sekali dari penawaran existing
  return sheet;
}

function _cachedWorkOrder() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('cache_workorder');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  var ss = getSpreadsheet();
  var sheet = _ensureWorkOrderSheet(ss);
  var data = sheet.getDataRange().getValues().map(function (row) {
    return row.map(function (cell) { return cell instanceof Date ? cell.toISOString() : cell; });
  });
  try { var j = JSON.stringify(data); if (j.length < 95000) cache.put('cache_workorder', j, CACHE_TTL); } catch (e) {}
  return data;
}

function invalidateWorkOrderCache() { try { CacheService.getScriptCache().remove('cache_workorder'); } catch (e) {} }

// Titik sinkron tunggal: hitung ulang snapshot WO utk 1 penawaran (rev tertinggi).
// Dipanggil dari setiap jalur tulis penawaran (deal, edit, restore, hapus, close).
function _syncWorkOrder(noPenawaran) {
  try {
    noPenawaran = (noPenawaran || '').toString().trim();
    if (!noPenawaran) return;
    var ss = getSpreadsheet();
    var pen = ss.getSheetByName('Penawaran_Main');
    if (!pen) return;
    var pdata = pen.getDataRange().getValues();
    var best = null, bestRev = -1;
    for (var i = 1; i < pdata.length; i++) {
      if (!pdata[i][0] || pdata[i][0].toString().trim() !== noPenawaran) continue;
      var rev = parseInt(pdata[i][1]) || 0;
      if (rev > bestRev) { bestRev = rev; best = pdata[i]; }
    }
    var qualifies = false, record = null;
    if (best) {
      var status = best[16] ? best[16].toString() : '';
      var noWO = (best[17] !== '' && best[17] != null) ? best[17].toString() : '';
      if ((status === 'Deal' || status === 'Closed') && noWO) {
        qualifies = true;
        record = _woRecordFromPenRow(best, bestRev, _woKlienMap(ss));
      }
    }
    var woSheet = _ensureWorkOrderSheet(ss);
    var wdata = woSheet.getDataRange().getValues();
    var foundRow = -1;
    for (var j = 1; j < wdata.length; j++) {
      if ((wdata[j][1] || '').toString().trim() === noPenawaran) { foundRow = j + 1; break; }
    }
    if (qualifies) {
      if (foundRow > 0) woSheet.getRange(foundRow, 1, 1, _WO_HEADERS.length).setValues([record]);
      else woSheet.appendRow(record);
    } else if (foundRow > 0) {
      woSheet.deleteRow(foundRow);
    }
    invalidateWorkOrderCache();
  } catch (e) { Logger.log('_syncWorkOrder error: ' + e); }
}

// Bangun ulang seluruh sheet Work_Order dari penawaran (perbaikan manual).
function rebuildWorkOrderSheet() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = getSpreadsheet();
    var old = ss.getSheetByName('Work_Order');
    if (old) ss.deleteSheet(old);
    _ensureWorkOrderSheet(ss);   // buat ulang + backfill
    invalidateWorkOrderCache();
    return { success: true, message: 'Sheet Work_Order dibangun ulang.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Daftar Work Order: baca dari sheet Work_Order (cepat & di-cache) ─────────
function getWorkOrderList() {
  try {
    var data = _cachedWorkOrder();
    if (!data || data.length < 2) return [];
    var catatanMap = _getCatatanWOMap();
    var hoMap = (typeof _hoStatusMap === 'function') ? _hoStatusMap() : {};
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var noWO = (r[0] !== '' && r[0] != null) ? r[0].toString() : '';
      if (!noWO) continue;
      list.push({
        noWO:           noWO,
        id:             (r[1] || '').toString(),
        rev:            (r[2] != null ? r[2] : '').toString(),
        tanggal:        _fmtTgl(r[3]),   // normalisasi (sheet bisa auto-ubah string → Date/ISO)
        validUntil:     _fmtTgl(r[4]),
        namaProject:    (r[5] || '').toString(),
        klienId:        (r[6] || '').toString(),
        namaKlien:      (r[7] || '').toString(),
        dibuatOleh:     (r[8] || '').toString(),
        subtotal:       parseFloat(r[9])  || 0,
        diskon:         parseFloat(r[10]) || 0,
        pajak:          parseFloat(r[11]) || 0,
        grandTotal:     parseFloat(r[12]) || 0,
        hpp:            parseFloat(r[13]) || 0,
        profit:         parseFloat(r[14]) || 0,
        marginPersen:   parseFloat(r[15]) || 0,
        termConditions: (r[16] || '{}').toString(),
        items:          (r[17] || '[]').toString(),
        status:         (r[18] || '').toString(),
        hoStatus:       hoMap[noWO] || '',
        catatanCustomer: catatanMap[noWO] || ''
      });
    }
    list.sort(function (a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });
    return list;
  } catch (e) {
    Logger.log('getWorkOrderList error: ' + e);
    return [];
  }
}

// ── Catatan Customer per Work Order ─────────────────────────────────────────
// Disimpan di sheet terpisah agar tidak mengubah struktur Penawaran_Main.
// Kolom: [No WO, Catatan, Diupdate Oleh, Diupdate Pada]
function buatSheetWorkOrderCatatan(ss) {
  ss = ss || getSpreadsheet();
  const sheet = ss.insertSheet('WorkOrder_Catatan');
  sheet.appendRow(['No WO', 'Catatan', 'Diupdate Oleh', 'Diupdate Pada']);
  return sheet;
}

function getWorkOrderDashboard() {
  try {
    const ss = getSpreadsheet();
    const woList = getWorkOrderList();
    const kwMap  = {};

    // Baca Invoice_Main: group by noWO
    const invByWO  = {};
    const invData = _cachedInvoice();
    if (invData.length > 1) {
      // Baca kwitansi map (invoice → kwitansi)
      const kwData = _cachedKwitansi();
      for (let k = 1; k < kwData.length; k++) {
        const noKw  = kwData[k][0] ? kwData[k][0].toString() : '';
        const noInv = kwData[k][1] ? kwData[k][1].toString() : '';
        if (noInv && noKw && !kwMap[noInv]) kwMap[noInv] = noKw;
      }
      for (let i = 1; i < invData.length; i++) {
        if (!invData[i][0]) continue;
        const noWO = invData[i][1] ? invData[i][1].toString() : '';
        if (!noWO) continue;
        const tglStr = _fmtTgl(invData[i][3]);
        const invId  = invData[i][0].toString();
        if (!invByWO[noWO]) invByWO[noWO] = [];
        invByWO[noWO].push({
          id:         invId,
          tanggal:    tglStr,
          jenis:      invData[i][4] ? invData[i][4].toString() : 'Penuh',
          persen:     parseFloat(invData[i][5]) || 0,
          dpp:        parseFloat(invData[i][11]) || 0,
          ppnNominal: parseFloat(invData[i][13]) || 0,
          total:      parseFloat(invData[i][14]) || 0,
          statusBayar: invData[i][16] ? invData[i][16].toString() : 'Belum Lunas',
          kwitansiId: kwMap[invId] || ''
        });
      }
    }

    let sumKontrak = 0, sumDitagih = 0, sumLunas = 0;

    const woDashboard = woList.map(function(w) {
      const nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
      const ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
      const invoices = invByWO[w.noWO] || [];

      let totalDitagihDpp = 0, totalLunasDpp = 0, totalLunasTotal = 0;
      invoices.forEach(function(inv) {
        totalDitagihDpp += inv.dpp;
        if (inv.statusBayar === 'Lunas') {
          totalLunasDpp   += inv.dpp;
          totalLunasTotal += inv.total;
        }
      });

      const sisaDpp     = Math.max(0, nilaiKontrak - totalDitagihDpp);
      const pctDitagih  = nilaiKontrak > 0 ? Math.min(100, Math.round(totalDitagihDpp / nilaiKontrak * 100)) : 0;
      const pctLunas    = nilaiKontrak > 0 ? Math.min(100, Math.round(totalLunasDpp / nilaiKontrak * 100)) : 0;

      let paymentStatus;
      if (invoices.length === 0) {
        paymentStatus = 'Belum Ditagih';
      } else if (pctLunas >= 100 && pctDitagih >= 100) {
        paymentStatus = 'Lunas';
      } else if (totalLunasDpp > 0) {
        paymentStatus = 'Lunas Sebagian';
      } else {
        paymentStatus = 'Ditagih';
      }

      sumKontrak += nilaiKontrak;
      sumDitagih += totalDitagihDpp + Math.round(totalDitagihDpp * ppnRate / 100);
      sumLunas   += totalLunasTotal;

      return {
        noWO: w.noWO, id: w.id, rev: w.rev, tanggal: w.tanggal,
        namaProject: w.namaProject, namaKlien: w.namaKlien, dibuatOleh: w.dibuatOleh,
        subtotal: w.subtotal, diskon: w.diskon, pajak: w.pajak, grandTotal: w.grandTotal,
        items: w.items, termConditions: w.termConditions, catatanCustomer: w.catatanCustomer,
        nilaiKontrak: nilaiKontrak, ppnRate: ppnRate,
        totalDitagihDpp: totalDitagihDpp, totalLunasDpp: totalLunasDpp,
        totalLunasTotal: totalLunasTotal, sisaDpp: sisaDpp,
        pctDitagih: pctDitagih, pctLunas: pctLunas,
        paymentStatus: paymentStatus, invoices: invoices,
        hoStatus: w.hoStatus || ''
      };
    });

    return {
      success: true,
      woList: woDashboard,
      summary: {
        totalWO:      woDashboard.length,
        totalKontrak: sumKontrak,
        totalDitagih: sumDitagih,
        totalLunas:   sumLunas
      }
    };
  } catch (e) {
    Logger.log('getWorkOrderDashboard error: ' + e);
    return { success: false, woList: [], summary: {}, message: e.toString() };
  }
}

function _getCatatanWOMap(ss) {
  ss = ss || getSpreadsheet();
  const map = {};
  const sheet = ss.getSheetByName('WorkOrder_Catatan');
  if (!sheet) return map;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return map;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    const noWO = (data[i][0] !== '' && data[i][0] != null) ? data[i][0].toString() : '';
    if (noWO) map[noWO] = data[i][1] ? data[i][1].toString() : '';
  }
  return map;
}

function getCatatanWO(noWO) {
  try {
    const map = _getCatatanWOMap();
    return { success: true, catatan: map[String(noWO)] || '' };
  } catch(e) {
    return { success: false, catatan: '', message: e.toString() };
  }
}

function simpanCatatanWO(noWO, catatan, namaUser) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('WorkOrder_Catatan') || buatSheetWorkOrderCatatan(ss);
    noWO = String(noWO);
    catatan = catatan || '';
    const who = namaUser || 'Sales Executive';
    const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    const lastRow = sheet.getLastRow();
    let targetRow = -1;
    if (lastRow > 1) {
      const woVals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < woVals.length; i++) {
        const val = (woVals[i][0] !== '' && woVals[i][0] != null) ? woVals[i][0].toString() : '';
        if (val === noWO) { targetRow = i + 2; break; }
      }
    }

    if (targetRow === -1) {
      sheet.appendRow([noWO, catatan, who, when]);
    } else {
      sheet.getRange(targetRow, 2, 1, 3).setValues([[catatan, who, when]]);
    }

    SpreadsheetApp.flush();
    return { success: true, message: 'Catatan Work Order tersimpan.', catatan: catatan };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ── Tutup Work Order (ubah status ke Closed) ─────────────────────────────────
function closeWorkOrder(noWO, namaUser) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: 'Sheet Penawaran_Main tidak ditemukan.' };

    SpreadsheetApp.flush();
    const data    = sheet.getDataRange().getValues();
    const noWOStr = String(noWO);
    let   found   = false;

    let syncNoPen = '';
    for (let i = 1; i < data.length; i++) {
      const rowNoWO = data[i][17] !== '' && data[i][17] != null ? data[i][17].toString() : '';
      if (rowNoWO !== noWOStr) continue;
      const status = data[i][16] ? data[i][16].toString() : '';
      if (status === 'Closed') return { success: false, message: 'WO sudah berstatus Closed.' };
      if (status !== 'Deal' && status !== 'On-Progress')
        return { success: false, message: 'Hanya WO berstatus Deal atau On-Progress yang bisa ditutup.' };
      sheet.getRange(i + 1, 17).setValue('Closed');
      if (data[i][0]) syncNoPen = data[i][0].toString();
      found = true;
    }

    if (!found) return { success: false, message: 'Work Order tidak ditemukan.' };
    SpreadsheetApp.flush();
    invalidatePenawaranCache();
    if (syncNoPen) _syncWorkOrder(syncNoPen);   // sinkron status Closed ke Work_Order
    return { success: true, message: 'Work Order ' + noWO + ' berhasil ditutup.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
