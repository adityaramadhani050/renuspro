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
    var s = raw.trim();
    // ISO string from cache (e.g. "2024-05-01T00:00:00.000Z")
    if (s.indexOf('T') > 0) {
      var dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
    }
    var parts = s.split('/');
    if (parts.length === 3) {
      var d = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var y = parseInt(parts[2], 10);
      var dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
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

/**
 * Sales cycle (hari) untuk 1 penawaran: dari tanggal penawaran awal dibuat
 * sampai tanggal deal (jika Deal) atau tanggal fail (jika Fail).
 * pObj punya field string dd/MM/yyyy: tanggal, tanggalDeal, tanggalFail.
 * @returns {number|null} jumlah hari (>=0) atau null jika tidak dapat dihitung.
 */
function hitungSalesCycle(pObj) {
  var start = parseTgl(pObj.tanggal);
  var end = null;
  if (pObj.status === 'Deal')      end = parseTgl(pObj.tanggalDeal);
  else if (pObj.status === 'Fail') end = parseTgl(pObj.tanggalFail);
  if (!start || !end) return null;
  var days = Math.round((dateOnly(end).getTime() - dateOnly(start).getTime()) / 86400000);
  return days >= 0 ? days : 0;
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
      var klienData = _cachedKlien();
      for (var ki = 1; ki < klienData.length; ki++) {
        var krow = klienData[ki];
        if (krow[0]) klienMap[String(krow[0])] = krow[1] || '';
      }
    } catch(e) { /* ignore */ }

    // Master_User → nama: { targetBulanan }
    var userMap = {}; // key: nama (col 1)
    var allSalesNames = []; // all active sales user names
    var teamNames = null; // null = semua, array = filter ke anggota tim (leadsales)
    try {
      var userData = _cachedUser();
      if (userData && userData.length > 0) {
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
          // Kumpulkan anggota tim untuk leadsales
          if (params.role === 'leadsales' && params.userId) {
            var uLeadId = urow[7] ? urow[7].toString().trim() : '';
            if (uLeadId === params.userId && (uAktif === true || uAktif === 'TRUE')) {
              if (!teamNames) teamNames = [];
              teamNames.push((uNama || '').toString().trim());
            }
          }
        }
      }
    } catch(e) { /* ignore */ }

    // Sertakan data Lead Sales itu sendiri dalam teamNames

    if (params.role === 'leadsales' && namaUser) {
      if (!teamNames) teamNames = [];
      if (!teamNames.includes(namaUser.trim())) teamNames.push(namaUser.trim());
    }

    // Penawaran_Main (cached)
    var pData = _cachedPenawaran();
    if (!pData || pData.length === 0) {
      return { success: false, error: 'Sheet Penawaran_Main tidak ditemukan.' };
    }

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
          dealHpp: 0,
          pipelineCount: 0,
          pipelineValue: 0,
          failCount: 0,
          dealCohort: 0,   // penawaran DIBUAT periode ini yang berstatus Deal (untuk win rate)
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
      var subtotal      = parseFloat(row[7]) || 0;
      var diskon        = parseFloat(row[8]) || 0;
      var nilaiKontrak  = Math.max(0, subtotal - diskon);
      var grandTotal    = parseFloat(row[10]) || 0;
      var totalHpp      = parseFloat(row[11]) || 0;
      var estimasiProfit = parseFloat(row[12]) || 0;
      var marginPersen  = parseFloat(row[13]) || 0;
      var status        = String(row[16] || '').trim();
      var noWO          = row[17] || '';
      var tanggalDeal   = parseTgl(row[18]);
      var catatanFail   = String(row[20] || '').trim();
      var kodeWin       = String(row[22] || '').trim();
      var catatanWin    = String(row[23] || '').trim();
      var kodeLost      = String(row[24] || '').trim();
      var tanggalFail   = parseTgl(row[25]);
      var lessonLearned = String(row[26] || '').trim();
      var actionItem    = String(row[27] || '').trim();
      // Fallback: data lama (sebelum fitur tanggalDeal) → gunakan tanggal penawaran
      var effectiveDealDate = tanggalDeal || tanggal;

      var namaKlien = klienMap[klienId] || klienId;

      // Access control
      if (params.role === 'leadsales') {
        // Lead Sales: hanya tampilkan data anggota tim
        if (!teamNames || !teamNames.includes(dibuatOleh)) continue;
      } else if (!isAdmin) {
        // Sales biasa: hanya data milik sendiri
        if (dibuatOleh !== namaUser) continue;
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
        nilaiKontrak: nilaiKontrak,
        grandTotal:   grandTotal,
        totalHpp:     totalHpp,
        estimasiProfit: estimasiProfit,
        marginPersen: marginPersen,
        status:       status,
        noWO:         noWO,
        catatanFail:  catatanFail,
        kodeWin:      kodeWin,
        catatanWin:   catatanWin,
        kodeLost:     kodeLost,
        tanggalFail:  formatTgl(tanggalFail),
        lessonLearned: lessonLearned,
        action:       actionItem,
        dealInPeriod: dealInRange && !creationInRange  // penawaran dibuat di luar periode tapi deal dalam periode
      };

      // Creation-date-based metrics
      if (creationInRange) {
        sd.totalPenawaran++;
        sd.totalNilaiPenawaran += nilaiKontrak;
        if (status === 'Fail') sd.failCount++;
        if (status === 'Deal') sd.dealCohort++;   // deal dari kohort periode ini
      }

      // Masuk daftar penawaran:
      // - Deal    → berdasarkan tanggal deal (meski penawaran dibuat di periode lain)
      // - Non-Deal → berdasarkan tanggal pembuatan
      var masukList = (status === 'Deal') ? dealInRange : creationInRange;
      if (masukList) {
        if (!sd._penawaranInRange[noPenawaran]) {
          sd._penawaranInRange[noPenawaran] = pObj;
        }
      }

      // Deal-date-based metrics
      if (dealInRange) {
        sd.dealCount++;
        sd.dealRevenue += nilaiKontrak;
        sd.dealHpp += totalHpp;
      }

      // Pipeline — all time, On-Progress (untuk KPI pipeline saja, tidak masuk daftar penawaran)
      if (status === 'On-Progress') {
        sd.pipelineCount++;
        sd.pipelineValue += nilaiKontrak;
      }
    }

    // --- Step 3: Finalize each sales entry ---
    var salesList = [];
    var teamCycleSum = 0, teamCycleCount = 0; // untuk avg sales cycle seluruh sales
    for (var sName in salesData) {
      var sd = salesData[sName];

      // winRate = deal DARI KOHORT periode ini / total penawaran dibuat periode ini.
      // Hindari inflasi: penawaran bulan lalu yang deal bulan ini TIDAK dihitung
      // (bukan bagian kohort periode ini), sehingga WR tidak bisa >100%.
      sd.winRate = sd.totalPenawaran > 0 ? (sd.dealCohort / sd.totalPenawaran) * 100 : 0;

      // Rata-rata margin deal (value-weighted, konsisten dgn tim)
      sd.avgMarginDeal = sd.dealRevenue > 0 ? ((sd.dealRevenue - sd.dealHpp) / sd.dealRevenue) * 100 : null;

      // Rata-rata nilai penawaran (dari penawaran yang dibuat periode ini)
      sd.avgNilaiPenawaran = sd.totalPenawaran > 0 ? (sd.totalNilaiPenawaran / sd.totalPenawaran) : 0;

      // achievement
      sd.achievement = sd.targetBulanan > 0 ? (sd.dealRevenue / sd.targetBulanan) * 100 : null;

      // Penawaran: Deal berdasarkan tanggal deal, non-Deal berdasarkan tanggal pembuatan
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

      // Sales cycle per penawaran + rata-rata per sales.
      // Rata-rata HANYA dari penawaran Deal (Fail tidak dihitung),
      // meski nilai cycle Fail tetap ditampilkan di tabel.
      var cycleSum = 0, cycleCount = 0;
      for (var pci = 0; pci < penawaranArr.length; pci++) {
        var cyc = hitungSalesCycle(penawaranArr[pci]);
        penawaranArr[pci].salesCycleDays = cyc;
        if (cyc !== null && penawaranArr[pci].status === 'Deal') { cycleSum += cyc; cycleCount++; }
      }
      sd.avgSalesCycle = cycleCount > 0 ? (cycleSum / cycleCount) : null;
      teamCycleSum += cycleSum;
      teamCycleCount += cycleCount;

      salesList.push({
        nama:                sd.nama,
        targetBulanan:       sd.targetBulanan,
        totalPenawaran:      sd.totalPenawaran,
        totalNilaiPenawaran: sd.totalNilaiPenawaran,
        avgNilaiPenawaran:   sd.avgNilaiPenawaran,
        dealCount:           sd.dealCount,
        dealRevenue:         sd.dealRevenue,
        dealHpp:             sd.dealHpp,
        pipelineCount:       sd.pipelineCount,
        pipelineValue:       sd.pipelineValue,
        failCount:           sd.failCount,
        dealCohort:          sd.dealCohort,
        winRate:             sd.winRate,
        avgMarginDeal:       sd.avgMarginDeal,
        avgSalesCycle:       sd.avgSalesCycle,
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
    var teamHppDeal      = 0;
    var teamTarget       = 0;
    var teamPenawaran    = 0;
    var teamDealCount    = 0;
    var teamDealCohort   = 0;
    var teamFailCount    = 0;
    var teamPipelineValue = 0;
    var teamPipelineCount = 0;

    for (var si = 0; si < salesList.length; si++) {
      var s = salesList[si];
      teamRevenue        += s.dealRevenue;
      teamHppDeal         += s.dealHpp;
      teamPenawaran      += s.totalPenawaran;
      teamDealCount      += s.dealCount;
      teamDealCohort     += (s.dealCohort || 0);
      teamFailCount      += s.failCount;
      teamPipelineValue  += s.pipelineValue;
      teamPipelineCount  += s.pipelineCount;
    }

    var teamAvgMarginDeal = teamRevenue > 0
      ? ((teamRevenue - teamHppDeal) / teamRevenue) * 100
      : 0;

    var teamAvgSalesCycle = teamCycleCount > 0
      ? (teamCycleSum / teamCycleCount)
      : null;

    // teamTarget = sum of targets sesuai scope
    if (isAdmin) {
      // Admin: jumlah semua sales user
      for (var un in userMap) {
        teamTarget += userMap[un].targetBulanan || 0;
      }
    } else if (params.role === 'leadsales' && teamNames && teamNames.length > 0) {
      // Lead Sales: jumlah target anggota tim saja
      for (var tn = 0; tn < teamNames.length; tn++) {
        teamTarget += (userMap[teamNames[tn]] && userMap[teamNames[tn]].targetBulanan) ? userMap[teamNames[tn]].targetBulanan : 0;
      }
    } else {
      // Sales biasa: target diri sendiri
      teamTarget = (userMap[namaUser] && userMap[namaUser].targetBulanan) ? userMap[namaUser].targetBulanan : 0;
    }

    var teamWinRate = teamPenawaran > 0
      ? (teamDealCohort / teamPenawaran) * 100
      : 0;

    // --- Step 4b: Pipeline Health (coverage, aging, stale) ---
    // Umur penawaran On-Progress dihitung dari tanggal DIBUAT PERTAMA KALI
    // (rev/tanggal paling awal per No Penawaran), bukan revisi terakhir.
    var firstCreatedMap = {}; // noPenawaran -> Date paling awal
    for (var fci = 1; fci < pData.length; fci++) {
      var fcRow = pData[fci];
      var fcNo = String(fcRow[0] || '').trim();
      if (!fcNo) continue;
      var fcTgl = parseTgl(fcRow[2]);
      if (!fcTgl) continue;
      if (!firstCreatedMap[fcNo] || fcTgl < firstCreatedMap[fcNo]) {
        firstCreatedMap[fcNo] = fcTgl;
      }
    }

    var STALE_DAYS = 60; // ambang stale/expired
    var agingBuckets = [
      { label: '0–30 hari',  min: 0,  max: 30,       count: 0, value: 0 },
      { label: '31–60 hari', min: 31, max: 60,       count: 0, value: 0 },
      { label: '61–90 hari', min: 61, max: 90,       count: 0, value: 0 },
      { label: '>90 hari',   min: 91, max: Infinity, count: 0, value: 0 }
    ];
    var staleOffers = [];
    var todayOnly = dateOnly(today);

    for (var agi = 0; agi < dedupedRows.length; agi++) {
      var agRow = dedupedRows[agi];
      var agStatus = String(agRow[16] || '').trim();
      if (agStatus !== 'On-Progress') continue;

      var agDibuat = String(agRow[6] || '').trim();
      // Access control — konsisten dgn agregasi per-sales
      if (params.role === 'leadsales') {
        if (!teamNames || !teamNames.includes(agDibuat)) continue;
      } else if (!isAdmin && agDibuat !== namaUser) continue;

      var agNo = String(agRow[0] || '').trim();
      var agFirst = firstCreatedMap[agNo] || parseTgl(agRow[2]);
      if (!agFirst) continue;
      var umur = Math.round((todayOnly.getTime() - dateOnly(agFirst).getTime()) / 86400000);
      if (umur < 0) umur = 0;
      var agNilai = Math.max(0, (parseFloat(agRow[7]) || 0) - (parseFloat(agRow[8]) || 0));

      for (var bki = 0; bki < agingBuckets.length; bki++) {
        if (umur >= agingBuckets[bki].min && umur <= agingBuckets[bki].max) {
          agingBuckets[bki].count++;
          agingBuckets[bki].value += agNilai;
          break;
        }
      }

      if (umur >= STALE_DAYS) {
        var agKlienId = String(agRow[5] || '').trim();
        staleOffers.push({
          id:       agNo,
          sales:    agDibuat,
          klien:    klienMap[agKlienId] || agKlienId,
          project:  agRow[4] || '',
          nilai:    agNilai,
          umurHari: umur,
          tanggal:  formatTgl(agFirst)
        });
      }
    }
    staleOffers.sort(function(a, b) { return b.umurHari - a.umurHari; });

    var sisaTarget = Math.max(0, teamTarget - teamRevenue);
    // coverage = nilai pipeline / sisa target. null jika target sudah tercapai.
    var coverage = sisaTarget > 0 ? (teamPipelineValue / sisaTarget) : null;
    var staleValue = 0;
    for (var svi = 0; svi < staleOffers.length; svi++) staleValue += staleOffers[svi].nilai;

    var pipelineHealth = {
      pipelineValue:  teamPipelineValue,
      pipelineCount:  teamPipelineCount,
      sisaTarget:     sisaTarget,
      targetTercapai: sisaTarget <= 0,
      coverage:       coverage,
      aging:          agingBuckets,
      staleDays:      STALE_DAYS,
      staleCount:     staleOffers.length,
      staleValue:     staleValue,
      staleOffers:    staleOffers
    };

    // --- Step 5: 3-month trend (team, by tanggalDeal) ---
    var months = lastThreeMonths();
    var trendValues = months.map(function() { return 0; });

    for (var ri2 = 0; ri2 < dedupedRows.length; ri2++) {
      var row2 = dedupedRows[ri2];
      var status2     = String(row2[16] || '').trim();
      var dibuatOleh2 = String(row2[6] || '').trim();
      if (status2 !== 'Deal') continue;
      if (params.role === 'leadsales') {
        if (!teamNames || !teamNames.includes(dibuatOleh2)) continue;
      } else if (!isAdmin && dibuatOleh2 !== namaUser) continue;

      var tanggalDeal2 = parseTgl(row2[18]) || parseTgl(row2[2]);
      if (!tanggalDeal2) continue;
      var nilaiKontrak2 = Math.max(0, (parseFloat(row2[7]) || 0) - (parseFloat(row2[8]) || 0));
      var dealKey = getMonthKey(tanggalDeal2);

      for (var mi = 0; mi < months.length; mi++) {
        if (months[mi].key === dealKey) {
          trendValues[mi] += nilaiKontrak2;
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
      if (params.role === 'leadsales') {
        if (!teamNames || !teamNames.includes(dibuatOleh3)) continue;
      } else if (!isAdmin && dibuatOleh3 !== namaUser) continue;

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
        teamPipelineCount: teamPipelineCount,
        teamAvgMarginDeal: teamAvgMarginDeal,
        teamAvgSalesCycle: teamAvgSalesCycle
      },
      trend:        trend,
      salesList:    salesList,
      recentDeals:  recentDeals,
      pipelineHealth: pipelineHealth,
      isAdmin:      isAdmin
    };

  } catch (err) {
    return {
      success: false,
      error:   err.message || String(err)
    };
  }
}
