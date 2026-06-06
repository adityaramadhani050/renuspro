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

// ── Daftar Work Order: semua penawaran Deal yang sudah punya No WO ───────────
function getWorkOrderList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Penawaran_Main');
    if (!sheet) return [];

    const sheetKlien = ss.getSheetByName('Master_Klien');
    const klienMap = {};
    if (sheetKlien) {
      const kd = sheetKlien.getDataRange().getValues();
      for (let i = 1; i < kd.length; i++) {
        if (kd[i][0]) klienMap[kd[i][0].toString()] = kd[i][1].toString();
      }
    }

    const data = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const status = data[i][16] ? data[i][16].toString() : '';
      const noWO   = (data[i][17] !== '' && data[i][17] != null) ? data[i][17].toString() : '';
      if (status !== 'Deal' || !noWO) continue;

      const tglStr = data[i][2] instanceof Date
        ? Utilities.formatDate(data[i][2], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][2];
      const validStr = data[i][3] instanceof Date
        ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][3];
      const klienId = data[i][5].toString();

      list.push({
        noWO:           noWO,
        id:             data[i][0].toString(),
        rev:            (parseInt(data[i][1]) || 0).toString(),
        tanggal:        tglStr,
        validUntil:     validStr,
        namaProject:    data[i][4].toString(),
        klienId:        klienId,
        namaKlien:      klienMap[klienId] || klienId,
        dibuatOleh:     data[i][6].toString(),
        subtotal:       parseFloat(data[i][7])  || 0,
        diskon:         parseFloat(data[i][8])  || 0,
        pajak:          parseFloat(data[i][9])  || 0,
        grandTotal:     parseFloat(data[i][10]) || 0,
        hpp:            parseFloat(data[i][11]) || 0,
        profit:         parseFloat(data[i][12]) || 0,
        marginPersen:   parseFloat(data[i][13]) || 0,
        termConditions: data[i][14] ? data[i][14].toString() : '{}',
        items:          data[i][15] ? data[i][15].toString() : '[]',
        status:         status
      });
    }

    // Sisipkan catatan customer per No WO
    const catatanMap = _getCatatanWOMap(ss);
    list.forEach(wo => { wo.catatanCustomer = catatanMap[wo.noWO] || ''; });

    // Urutkan No WO terbaru di atas (numeric-aware)
    list.sort((a, b) => b.noWO.localeCompare(a.noWO, undefined, { numeric: true }));
    return list;
  } catch(e) {
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
    const invSheet = ss.getSheetByName('Invoice_Main');
    const invByWO  = {};
    if (invSheet && invSheet.getLastRow() > 1) {
      const invData = invSheet.getDataRange().getValues();
      // Baca kwitansi map (invoice → kwitansi)
      const kwSheet = ss.getSheetByName('Kwitansi_Main');
      if (kwSheet && kwSheet.getLastRow() > 1) {
        const kwData = kwSheet.getRange(2, 1, kwSheet.getLastRow() - 1, 2).getValues();
        for (let k = 0; k < kwData.length; k++) {
          const noKw  = kwData[k][0] ? kwData[k][0].toString() : '';
          const noInv = kwData[k][1] ? kwData[k][1].toString() : '';
          if (noInv && noKw && !kwMap[noInv]) kwMap[noInv] = noKw;
        }
      }
      for (let i = 1; i < invData.length; i++) {
        if (!invData[i][0]) continue;
        const noWO = invData[i][1] ? invData[i][1].toString() : '';
        if (!noWO) continue;
        const tglStr = invData[i][3] instanceof Date
          ? Utilities.formatDate(invData[i][3], Session.getScriptTimeZone(), 'dd/MM/yyyy')
          : (invData[i][3] || '');
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

      sumKontrak += w.grandTotal || 0;
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
        paymentStatus: paymentStatus, invoices: invoices
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
