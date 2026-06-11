/**
 * FinanceReport.gs — RenusPro
 * Laporan progress pembayaran untuk tim Finance & Admin.
 *
 * Invoice_Main kolom tambahan:
 *  21 tanggalBayar   Tanggal saat status diubah ke Lunas (dd/MM/yyyy)
 */

// ── Pastikan kolom tanggalBayar ada di header ───────────────────────────────
function _ensureTanggalBayarCol(ss) {
  const sheet = ss.getSheetByName('Invoice_Main');
  if (!sheet || sheet.getLastRow() < 1) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 21) {
    sheet.getRange(1, 21).setValue('Tanggal Bayar');
  }
}

// ── Catat tanggal bayar saat status diubah ke Lunas ─────────────────────────
function catatTanggalBayar(idInvoice) {
  const ss = getSpreadsheet();
  _ensureTanggalBayarCol(ss);
  const sheet = ss.getSheetByName('Invoice_Main');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === idInvoice) {
      const tglBayar = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
      sheet.getRange(i + 1, 21).setValue(tglBayar);
      SpreadsheetApp.flush();
      invalidateInvoiceCache();
      return;
    }
  }
}

// ── Helper: aging bucket (hari sejak tanggal invoice) ───────────────────────
function _agingBucket(tglStr) {
  if (!tglStr) return null;
  var parts = tglStr.split('/');
  if (parts.length !== 3) return null;
  var d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  if (isNaN(d.getTime())) return null;
  var days = Math.floor((new Date() - d) / 86400000);
  return days;
}

// ── Helper: parse "YYYY-MM-DD" → Date ───────────────────────────────────────
function _frParseDate(s) {
  if (!s) return null;
  var p = s.split('-');
  if (p.length !== 3) return null;
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

// ── Data utama laporan finance ───────────────────────────────────────────────
function getFinanceReportData(filter) {
  try {
    var ss = getSpreadsheet();
    _ensureTanggalBayarCol(ss);

    // Parse rentang tanggal dari filter (opsional)
    var dateFrom = filter && filter.from ? _frParseDate(filter.from) : null;
    var dateTo   = filter && filter.to   ? _frParseDate(filter.to)   : null;
    if (dateTo) dateTo.setHours(23, 59, 59);

    // ── 1. Baca semua Work Order (hanya Deal) ──
    var woList = getWorkOrderList(); // sudah ada — hanya WO yang Deal

    // ── 2. Baca semua Invoice ──
    var invData = _cachedInvoice();

    // Build invoice map keyed by noWO
    var invByWO = {};   // noWO → [invoice, ...]
    var invByPen = {};  // noPenawaran → [invoice, ...] (pre-deal)
    var agingSummary = { current: 0, gte30: 0, gte60: 0, gte90: 0 };
    var totalTagihan = 0, totalTerbayar = 0;

    for (var i = 1; i < invData.length; i++) {
      if (!invData[i][0]) continue;
      var noInv   = invData[i][0].toString();
      var noWO    = invData[i][1] ? invData[i][1].toString() : '';
      var noPen   = invData[i][2] ? invData[i][2].toString() : '';
      var tgl     = _fmtTgl(invData[i][3]);
      var jenis   = invData[i][4] ? invData[i][4].toString() : '';
      var dpp     = parseFloat(invData[i][11]) || 0;
      var ppnPct  = parseFloat(invData[i][12]) || 0;
      var ppnNom  = parseFloat(invData[i][13]) || 0;
      var total   = parseFloat(invData[i][14]) || 0;
      var status  = invData[i][16] ? invData[i][16].toString() : 'Belum Lunas';
      var tglBayar = invData[i][20] ? _fmtTgl(invData[i][20]) : '';

      // Filter periode: periksa tanggal invoice
      if (dateFrom || dateTo) {
        var rawTgl3 = invData[i][3];
        var invDate;
        if (rawTgl3 instanceof Date) {
          invDate = rawTgl3;
        } else if (rawTgl3 && rawTgl3.toString().indexOf('T') > 0) {
          invDate = new Date(rawTgl3.toString()); // ISO dari cache
        } else {
          invDate = _frParseDate((rawTgl3 || '').toString().split('/').reverse().join('-'));
        }
        if (invDate) {
          if (dateFrom && invDate < dateFrom) continue;
          if (dateTo   && invDate > dateTo)   continue;
        } else {
          continue; // tanggal tidak bisa di-parse, lewati
        }
      }

      var inv = { noInv: noInv, noWO: noWO, noPen: noPen, tgl: tgl, jenis: jenis,
                  dpp: dpp, ppnPct: ppnPct, ppnNom: ppnNom, total: total,
                  status: status, tglBayar: tglBayar };

      totalTagihan += total;
      if (status === 'Lunas') totalTerbayar += total;

      // Aging hanya untuk yang belum lunas
      if (status !== 'Lunas') {
        var days = _agingBucket(tgl);
        if (days !== null) {
          if (days >= 90) agingSummary.gte90 += total;
          else if (days >= 60) agingSummary.gte60 += total;
          else if (days >= 30) agingSummary.gte30 += total;
          else agingSummary.current += total;
        }
      }

      if (noWO) {
        if (!invByWO[noWO]) invByWO[noWO] = [];
        invByWO[noWO].push(inv);
      } else if (noPen) {
        if (!invByPen[noPen]) invByPen[noPen] = [];
        invByPen[noPen].push(inv);
      }
    }

    // ── 3. Gabungkan WO + invoice-nya ──
    var woRows = woList.map(function(w) {
      var invoices = invByWO[w.noWO] || [];
      invoices.sort(function(a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
      var tagihan = 0, terbayar = 0;
      invoices.forEach(function(inv) {
        tagihan += inv.total;
        if (inv.status === 'Lunas') terbayar += inv.total;
      });
      var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
      var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
      var nilaiKontrakBruto = nilaiKontrak + (w.pajak || 0); // DPP + PPN
      return {
        noWO:        w.noWO,
        noPenawaran: w.id,
        namaKlien:   w.namaKlien,
        namaProject: w.namaProject,
        nilaiKontrak: nilaiKontrakBruto,
        ppnRate:     ppnRate,
        invoices:    invoices,
        tagihan:     tagihan,
        terbayar:    terbayar,
        outstanding: tagihan - terbayar,
        belumDitagih: Math.max(0, nilaiKontrakBruto - tagihan)
      };
    });

    // ── 4. Pre-deal invoices tanpa WO (kelompok tersendiri) ──
    var preDealRows = [];
    Object.keys(invByPen).forEach(function(noPen) {
      // Hanya yang invoice-nya tidak punya noWO
      var invList = invByPen[noPen].filter(function(inv) { return !inv.noWO; });
      if (!invList.length) return;
      invList.sort(function(a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
      var tagihan = 0, terbayar = 0;
      invList.forEach(function(inv) { tagihan += inv.total; if (inv.status === 'Lunas') terbayar += inv.total; });
      preDealRows.push({
        noWO:        '',
        noPenawaran: noPen,
        namaKlien:   invList[0].namaKlien || '',
        namaProject: invList[0].namaProject || '',
        nilaiKontrak: 0,
        ppnRate:     0,
        invoices:    invList,
        tagihan:     tagihan,
        terbayar:    terbayar,
        outstanding: tagihan - terbayar,
        belumDitagih: 0,
        isPredeal:   true
      });
    });

    // Gabung & sort: WO dulu, lalu pre-deal
    var allRows = woRows.concat(preDealRows);

    return {
      success:      true,
      summary: {
        totalTagihan:   totalTagihan,
        totalTerbayar:  totalTerbayar,
        totalOutstanding: totalTagihan - totalTerbayar,
        aging:          agingSummary
      },
      rows: allRows
    };
  } catch (e) {
    return { success: false, error: e.toString(), summary: {}, rows: [] };
  }
}
