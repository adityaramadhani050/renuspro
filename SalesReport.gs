/**
 * SalesReport.gs — RenusPro Sales Management System
 * Laporan penjualan per sales & team summary.
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse Date object or "dd/MM/yyyy" string → Date or null.
 */
function parseTgl(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'string') {
    var parts = raw.trim().split('/');
    if (parts.length === 3) {
      var d = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var y = parseInt(parts[2], 10);
      var dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  // Try native parse as last resort
  var dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Format Date → "dd/MM/yyyy" string.
 */
function formatTgl(raw) {
  var dt = parseTgl(raw);
  if (!dt) return '';
  var d = String(dt.getDate()).padStart(2, '0');
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var y = dt.getFullYear();
  return d + '/' + m + '/' + y;
}

/**
 * Strip time component → midnight Date for comparison.
 */
function dateOnly(dt) {
  if (!dt) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Check if dt (Date) is within [from, to] (both Date, inclusive).
 */
function inRange(dt, from, to) {
  if (!dt) return false;
  var d = dateOnly(dt);
  return d >= from && d <= to;
}

// ---------------------------------------------------------------------------
// Trend helper — last N months labels in Bahasa Indonesia
// ---------------------------------------------------------------------------

var BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function getMonthKey(dt) {
  // "YYYY-MM"
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}

function monthLabel(year, month) {
  // month is 0-indexed
  return BULAN_ID[month];
}

/**
 * Build last 3 full-month anchors relative to today.
 * Returns array of { key:"YYYY-MM", label:"Mei", from:Date, to:Date }
 */
function lastThreeMonths() {
  var today = new Date();
  var result = [];
  for (var i = 2; i >= 0; i--) {
    var y = today.getFullYear();
    var m = today.getMonth() - i; // may be negative
    // Normalize
    while (m < 0) { m += 12; y--; }
    var from = new Date(y, m, 1);
    var to = new Date(y, m + 1, 0); // last day of month
    var key = y + '-' + String(m + 1).padStart(2, '0');
    result.push({ key: key, label: monthLabel(y, m), from: from, to: to });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * getSalesReportData(params)
 *
 * @param {Object} params
 * @param {string} [params.dateFrom]  "dd/MM/yyyy" — default 1st of current month
 * @param {string} [params.dateTo]    "dd/MM/yyyy" — default today
 * @param {boolean} params.isAdmin
 * @param {string}  params.namaUser   Sales name (used when isAdmin=false)
 * @returns {Object}
 */
function getSalesReportData(params) {
  try {
    params = params || {};
    var isAdmin = !!params.isAdmin;
    var namaUser = params.namaUser || '';

    // --- Resolve date range (MTD default) ---
    var today = new Date();
    var rangeFrom, rangeTo;

    if (params.dateFrom) {
      rangeFrom = dateOnly(parseTgl(params.dateFrom));
    } else {
      rangeFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    if (params.dateTo) {
      rangeTo = dateOnly(parseTgl(params.dateTo));
    } else {
      rangeTo = dateOnly(today);
    }

    var dateFromStr = formatTgl(rangeFrom);
    var dateToStr   = formatTgl(rangeTo);

    // --- Load sheets ---
    var ss = getSpreadsheet();

    // Master_Klien → id: nama
    var klienMap = {};
    try {
      var klienSheet = ss.getSheetByName('Master_Klien');
      if (klienSheet) {
        var klienData = klienSheet.getDataRange().getValues();
        for (var ki = 1; ki < klienData.length; ki++) {
          var krow = klienData[ki];
          if (krow[0]) klienMap[String(krow[0])] = krow[1] || '';
        }
      }
    } catch(e) { /* ignore */ }

    // Master_User → nama: { targetBulanan }
    var userMap = {}; // key: nama (col 1)
    var allSalesNames = []; // all active sales user names
    try {
      var userSheet = ss.getSheetByName('Master_User');
      if (userSheet) {
        var userData = userSheet.getDataRange().getValues();
        for (var ui = 1; ui < userData.length; ui++) {
          var urow = userData[ui];
          var uNama = urow[1] || '';
          var uAktif = urow[5];
          var uTarget = parseFloat(urow[6]) || 0;
          if (uNama) {
            userMap[uNama] = { targetBulanan: uTarget };
            if (uAktif === true || uAktif === 'TRUE' || uAktif === 'Ya' || uAktif === 1) {
              allSalesNames.push(uNama);
            }
          }
        }
      }
    } catch(e) { /* ignore */ }

    // Penawaran_Main
    var pSheet = ss.getSheetByName('Penawaran_Main');
    if (!pSheet) {
      return { success: false, error: 'Sheet Penawaran_Main tidak ditemukan.' };
    }
    var pData = pSheet.getDataRange().getValues();

    // --- Step 1: Deduplicate — keep latest rev per No Penawaran ---
    // Map: noPenawaran → { rowIndex, rev }
    var latestRevMap = {}; // noPenawaran → pData row index
    for (var pi = 1; pi < pData.length; pi++) {
      var prow = pData[pi];
      var noPenawaran = String(prow[0] || '').trim();
      if (!noPenawaran) continue;
      var rev = parseInt(prow[1], 10) || 0;
      if (!latestRevMap[noPenawaran] || rev > latestRevMap[noPenawaran].rev) {
        latestRevMap[noPenawaran] = { index: pi, rev: rev };
      }
    }

    // Collect deduplicated rows
    var dedupedRows = [];
    for (var key in latestRevMap) {
      dedupedRows.push(pData[latestRevMap[key].index]);
    }

    // --- Step 2: Build per-sales aggregation ---
    // salesData[nama] = { ... }
    var salesData = {};

    // Helper: ensure entry exists
    function ensureSales(nama) {
      if (!salesData[nama]) {
        var target = (userMap[nama] && userMap[nama].targetBulanan) ? userMap[nama].targetBulanan : 0;
        salesData[nama] = {
          nama: nama,
          targetBulanan: target,
          totalPenawaran: 0,
          totalNilaiPenawaran: 0,
          dealCount: 0,
          dealRevenue: 0,
          pipelineCount: 0,
          pipelineValue: 0,
          failCount: 0,
          // penawaran IDs to collect (deduplication via set)
          _penawaranInRange: {}    // key: noPenawaran, val: penawaran object (filtered by creation date)
        };
      }
    }

    // Populate from deduplicated rows
    for (var ri = 0; ri < dedupedRows.length; ri++) {
      var row = dedupedRows[ri];

      var noPenawaran   = String(row[0] || '').trim();
      var rev           = row[1];
      var tanggal       = parseTgl(row[2]);
      var namaProject   = row[4] || '';
      var klienId       = String(row[5] || '').trim();
      var dibuatOleh    = String(row[6] || '').trim();
      var grandTotal    = parseFloat(row[10]) || 0;
      var status        = String(row[16] || '').trim();
      var noWO          = row[17] || '';
      var tanggalDeal   = parseTgl(row[18]);
      // Fallback: data lama (sebelum fitur tanggalDeal) → gunakan tanggal penawaran
      var effectiveDealDate = tanggalDeal || tanggal;

      var namaKlien = klienMap[klienId] || klienId;

      // Access control
      if (!isAdmin && params.role !== 'leadsales' && dibuatOleh !== namaUser) continue;
      if (params.role === 'leadsales' && Array.isArray(params.teamNames) && params.teamNames.length > 0) {
        if (!params.teamNames.includes(dibuatOleh)) continue;
      }

      ensureSales(dibuatOleh);
      var sd = salesData[dibuatOleh];

      var creationInRange = inRange(tanggal, rangeFrom, rangeTo);
      var dealInRange     = (status === 'Deal') && inRange(effectiveDealDate, rangeFrom, rangeTo);

      // Build penawaran object
      var pObj = {
        id:           noPenawaran,
        rev:          rev,
        tanggal:      formatTgl(tanggal),
        tanggalDeal:  formatTgl(tanggalDeal),
        namaProject:  namaProject,
        namaKlien:    namaKlien,
        grandTotal:   grandTotal,
        status:       status,
        noWO:         noWO,
        dealInPeriod: dealInRange && !creationInRange  // penawaran dibuat di luar periode tapi deal dalam periode
      };

      // Creation-date-based metrics
      if (creationInRange) {
        sd.totalPenawaran++;
        sd.totalNilaiPenawaran += grandTotal;
        if (status === 'Fail') sd.failCount++;
      }

      // Masuk daftar penawaran jika dibuat dalam periode ATAU deal dalam periode
      if (creationInRange || dealInRange) {
        if (!sd._penawaranInRange[noPenawaran]) {
          sd._penawaranInRange[noPenawaran] = pObj;
        }
      }

      // Deal-date-based metrics
      if (dealInRange) {
        sd.dealCount++;
        sd.dealRevenue += grandTotal;
      }

      // Pipeline — all time, On-Progress (untuk KPI pipeline saja, tidak masuk daftar penawaran)
      if (status === 'On-Progress') {
        sd.pipelineCount++;
        sd.pipelineValue += grandTotal;
      }
    }

    // --- Step 3: Finalize each sales entry ---
    var salesList = [];
    for (var sName in salesData) {
      var sd = salesData[sName];

      // winRate = Deal / Total Penawaran (konsisten dengan dashboard)
      sd.winRate = sd.totalPenawaran > 0 ? (sd.dealCount / sd.totalPenawaran) * 100 : 0;

      // achievement
      sd.achievement = sd.targetBulanan > 0 ? (sd.dealRevenue / sd.targetBulanan) * 100 : null;

      // Penawaran: hanya yang tanggal pembuatan dalam periode
      var penawaranArr = [];
      for (var pid in sd._penawaranInRange) penawaranArr.push(sd._penawaranInRange[pid]);

      // Sort: Deal first, On-Progress second, Fail third; within each by grandTotal desc
      var statusOrder = { 'Deal': 0, 'On-Progress': 1, 'Fail': 2 };
      penawaranArr.sort(function(a, b) {
        var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 9;
        var sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 9;
        if (sa !== sb) return sa - sb;
        return b.grandTotal - a.grandTotal;
      });

      salesList.push({
        nama:                sd.nama,
        targetBulanan:       sd.targetBulanan,
        totalPenawaran:      sd.totalPenawaran,
        totalNilaiPenawaran: sd.totalNilaiPenawaran,
        dealCount:           sd.dealCount,
        dealRevenue:         sd.dealRevenue,
        pipelineCount:       sd.pipelineCount,
        pipelineValue:       sd.pipelineValue,
        failCount:           sd.failCount,
        winRate:             sd.winRate,
        achievement:         sd.achievement,
        penawaran:           penawaranArr
      });

      // Cleanup internal fields
      delete sd._penawaranInRange;
      delete sd._penawaranPipeline;
    }

    // Sort salesList by dealRevenue descending (leaderboard)
    salesList.sort(function(a, b) { return b.dealRevenue - a.dealRevenue; });

    // --- Step 4: Team summary ---
    var teamRevenue      = 0;
    var teamTarget       = 0;
    var teamPenawaran    = 0;
    var teamDealCount    = 0;
    var teamFailCount    = 0;
    var teamPipelineValue = 0;
    var teamPipelineCount = 0;

    for (var si = 0; si < salesList.length; si++) {
      var s = salesList[si];
      teamRevenue        += s.dealRevenue;
      teamPenawaran      += s.totalPenawaran;
      teamDealCount      += s.dealCount;
      teamFailCount      += s.failCount;
      teamPipelineValue  += s.pipelineValue;
      teamPipelineCount  += s.pipelineCount;
    }

    // teamTarget = sum of ALL sales users (from Master_User), not just those with data
    if (isAdmin) {
      for (var un in userMap) {
        teamTarget += userMap[un].targetBulanan || 0;
      }
    } else {
      // For non-admin, just that user's target
      teamTarget = (userMap[namaUser] && userMap[namaUser].targetBulanan) ? userMap[namaUser].targetBulanan : 0;
    }

    var teamWinRate = (teamDealCount + teamFailCount) > 0
      ? (teamDealCount / (teamDealCount + teamFailCount)) * 100
      : 0;

    // --- Step 5: 3-month trend (team, by tanggalDeal) ---
    var months = lastThreeMonths();
    var trendValues = months.map(function() { return 0; });

    for (var ri2 = 0; ri2 < dedupedRows.length; ri2++) {
      var row2 = dedupedRows[ri2];
      var status2     = String(row2[16] || '').trim();
      var dibuatOleh2 = String(row2[6] || '').trim();
      if (status2 !== 'Deal') continue;
      if (!isAdmin && dibuatOleh2 !== namaUser) continue;

      var tanggalDeal2 = parseTgl(row2[18]) || parseTgl(row2[2]);
      if (!tanggalDeal2) continue;
      var grandTotal2 = parseFloat(row2[10]) || 0;
      var dealKey = getMonthKey(tanggalDeal2);

      for (var mi = 0; mi < months.length; mi++) {
        if (months[mi].key === dealKey) {
          trendValues[mi] += grandTotal2;
          break;
        }
      }
    }

    var trend = {
      labels: months.map(function(m) { return m.label; }),
      values: trendValues
    };

    // --- Step 6: Recent deals — top 5 by grandTotal in date range ---
    var recentDeals = [];
    for (var ri3 = 0; ri3 < dedupedRows.length; ri3++) {
      var row3 = dedupedRows[ri3];
      var status3     = String(row3[16] || '').trim();
      var dibuatOleh3 = String(row3[6] || '').trim();
      if (status3 !== 'Deal') continue;
      if (!isAdmin && dibuatOleh3 !== namaUser) continue;

      var tanggalDeal3 = parseTgl(row3[18]) || parseTgl(row3[2]);
      if (!inRange(tanggalDeal3, rangeFrom, rangeTo)) continue;

      var klienId3   = String(row3[5] || '').trim();
      var namaKlien3 = klienMap[klienId3] || klienId3;

      recentDeals.push({
        namaProject:  row3[4] || '',
        namaKlien:    namaKlien3,
        grandTotal:   parseFloat(row3[10]) || 0,
        dibuatOleh:   dibuatOleh3,
        tanggalDeal:  formatTgl(tanggalDeal3)
      });
    }

    // Sort by grandTotal desc, take top 5
    recentDeals.sort(function(a, b) { return b.grandTotal - a.grandTotal; });
    recentDeals = recentDeals.slice(0, 5);

    // --- Return ---
    return {
      success:      true,
      dateFrom:     dateFromStr,
      dateTo:       dateToStr,
      summary: {
        teamRevenue:       teamRevenue,
        teamTarget:        teamTarget,
        teamPenawaran:     teamPenawaran,
        teamDealCount:     teamDealCount,
        teamWinRate:       teamWinRate,
        teamPipelineValue: teamPipelineValue,
        teamPipelineCount: teamPipelineCount
      },
      trend:        trend,
      salesList:    salesList,
      recentDeals:  recentDeals,
      isAdmin:      isAdmin
    };

  } catch (err) {
    return {
      success: false,
      error:   err.message || String(err)
    };
  }
}
