/**
 * Audit_PenawaranWO.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Program audit inkonsistensi data Penawaran_Main yang menyebabkan
 * selisih nilai antara menu Work Order dan Dashboard Sales.
 *
 * Sumber data: Penawaran_Main
 *   Kolom Q (index 16) = Status  (Deal / On-Progress / Fail)
 *   Kolom R (index 17) = No WO
 *   Kolom S (index 18) = Tanggal Deal
 *
 * Pemeriksaan:
 *  [A] Penawaran status "Deal" tapi kolom R (No WO) KOSONG
 *  [B] Penawaran status BUKAN "Deal" tapi kolom R (No WO) TERISI
 *
 * CARA PAKAI:
 *  1. Buka Google Apps Script project RenusPro
 *  2. Jalankan fungsi  auditPenawaranWO()
 *  3. Lihat hasil di Log (Ctrl+Enter)
 *  4. Hasil juga ditulis ke sheet "Audit_Result" (dibuat otomatis)
 */

function auditPenawaranWO() {
  var ss = getSpreadsheet();

  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('AUDIT INKONSISTENSI PENAWARAN — No WO vs Status');
  Logger.log('Dijalankan: ' + new Date().toLocaleString('id-ID'));
  Logger.log('═══════════════════════════════════════════════════════');

  // ── Load Penawaran_Main ───────────────────────────────────────────────────
  var pSheet = ss.getSheetByName('Penawaran_Main');
  if (!pSheet) { Logger.log('ERROR: Sheet Penawaran_Main tidak ditemukan.'); return; }
  var pData = pSheet.getDataRange().getValues();

  // Load Master_Klien
  var klienMap = {};
  var kSheet = ss.getSheetByName('Master_Klien');
  if (kSheet) {
    var kd = kSheet.getDataRange().getValues();
    for (var ki = 1; ki < kd.length; ki++) {
      if (kd[ki][0]) klienMap[kd[ki][0].toString()] = (kd[ki][1] || '').toString();
    }
  }

  // Deduplikasi: ambil revisi tertinggi per noPenawaran
  var latestRevMap = {};
  for (var pi = 1; pi < pData.length; pi++) {
    var noPen = (pData[pi][0] || '').toString().trim();
    if (!noPen) continue;
    var rev = parseInt(pData[pi][1]) || 0;
    if (!latestRevMap[noPen] || rev > latestRevMap[noPen].rev) {
      latestRevMap[noPen] = { rev: rev, rowIdx: pi };
    }
  }

  // Bangun list penawaran
  var penawaranList = [];
  var totalDeal = 0, totalDealNilai = 0;
  var totalDenganWO = 0, totalDenganWONilai = 0;

  for (var noPen in latestRevMap) {
    var row     = pData[latestRevMap[noPen].rowIdx];
    var klienId = (row[5] || '').toString().trim();
    var status  = (row[16] || '').toString().trim() || 'On-Progress';
    var noWO    = (row[17] || '').toString().trim();
    var grandTotal = parseFloat(row[10]) || 0;

    var p = {
      noPenawaran: noPen,
      tanggal:     _auFmtDate(row[2]),
      namaProject: (row[4] || '').toString().trim(),
      klienId:     klienId,
      namaKlien:   klienMap[klienId] || klienId,
      dibuatOleh:  (row[6] || '').toString().trim(),
      grandTotal:  grandTotal,
      status:      status,
      noWO:        noWO,
      tanggalDeal: _auFmtDate(row[18])
    };
    penawaranList.push(p);

    if (status === 'Deal') { totalDeal++; totalDealNilai += grandTotal; }
    if (noWO)              { totalDenganWO++; totalDenganWONilai += grandTotal; }
  }

  // ════════════════════════════════════════════════════════
  // [A] Penawaran DEAL tapi No WO KOSONG
  // ════════════════════════════════════════════════════════
  var issueA = penawaranList.filter(function(p) { return p.status === 'Deal' && !p.noWO; });
  var issueANilai = issueA.reduce(function(s, p) { return s + p.grandTotal; }, 0);

  Logger.log('\n[A] Penawaran STATUS "Deal" tapi No WO KOSONG: ' + issueA.length + ' item | ' + _auRp(issueANilai));
  if (issueA.length > 0) {
    Logger.log('    No Penawaran          | Klien                        | Project                                | Nilai         | Tgl Deal     | Sales');
    Logger.log('    ' + '-'.repeat(130));
    issueA.forEach(function(p) {
      Logger.log('    ' + _auPad(p.noPenawaran,22)
        + ' | ' + _auPad(p.namaKlien,28)
        + ' | ' + _auPad(p.namaProject,38)
        + ' | ' + _auPadL(_auRp(p.grandTotal),13)
        + ' | ' + _auPad(p.tanggalDeal||'-',12)
        + ' | ' + p.dibuatOleh);
    });
  }

  // ════════════════════════════════════════════════════════
  // [C] No WO DIPAKAI LEBIH DARI SATU PENAWARAN (double)
  //     Periksa dari SEMUA baris (bukan hanya revisi terbaru)
  //     karena revisi lama yang masih punya noWO terisi bisa
  //     menyebabkan WO terhitung ganda.
  // ════════════════════════════════════════════════════════
  var woUsageMap = {}; // noWO → [{noPenawaran, rev, status, namaKlien, namaProject, grandTotal, dibuatOleh}]
  for (var ci = 1; ci < pData.length; ci++) {
    var cNoPen = (pData[ci][0] || '').toString().trim();
    if (!cNoPen) continue;
    var cNoWO  = (pData[ci][17] || '').toString().trim();
    if (!cNoWO) continue;
    var cRev   = parseInt(pData[ci][1]) || 0;
    var cStatus = (pData[ci][16] || '').toString().trim() || 'On-Progress';
    var cKlienId = (pData[ci][5] || '').toString().trim();
    if (!woUsageMap[cNoWO]) woUsageMap[cNoWO] = [];
    woUsageMap[cNoWO].push({
      noPenawaran: cNoPen,
      rev:         cRev,
      status:      cStatus,
      namaKlien:   klienMap[cKlienId] || cKlienId,
      namaProject: (pData[ci][4] || '').toString().trim(),
      grandTotal:  parseFloat(pData[ci][10]) || 0,
      dibuatOleh:  (pData[ci][6] || '').toString().trim()
    });
  }

  var issueC = []; // [{noWO, entries:[...]}]
  for (var wo in woUsageMap) {
    var entries = woUsageMap[wo];
    // Duplikat: lebih dari 1 baris ATAU 1 noPenawaran dengan lebih dari 1 revisi yang punya noWO terisi
    var uniquePenawaran = {};
    entries.forEach(function(e) { uniquePenawaran[e.noPenawaran] = true; });
    if (Object.keys(uniquePenawaran).length > 1 || entries.length > 1) {
      issueC.push({ noWO: wo, entries: entries });
    }
  }
  issueC.sort(function(a, b) { return a.noWO.localeCompare(b.noWO, undefined, { numeric: true }); });

  Logger.log('\n[C] No WO DIPAKAI LEBIH DARI SATU PENAWARAN / REVISI: ' + issueC.length + ' No WO bermasalah');
  if (issueC.length > 0) {
    Logger.log('    No WO   | No Penawaran          | Rev | Status         | Klien                        | Project                          | Nilai         | Sales');
    Logger.log('    ' + '-'.repeat(150));
    issueC.forEach(function(g) {
      g.entries.forEach(function(e) {
        Logger.log('    ' + _auPad(g.noWO,8)
          + ' | ' + _auPad(e.noPenawaran,22)
          + ' | ' + _auPad(e.rev.toString(),3)
          + ' | ' + _auPad(e.status,14)
          + ' | ' + _auPad(e.namaKlien,28)
          + ' | ' + _auPad(e.namaProject,32)
          + ' | ' + _auPadL(_auRp(e.grandTotal),13)
          + ' | ' + e.dibuatOleh);
      });
      Logger.log('    ' + '-'.repeat(150));
    });
  }

  // ════════════════════════════════════════════════════════
  // [B] Penawaran BUKAN Deal tapi No WO TERISI
  // ════════════════════════════════════════════════════════
  var issueB = penawaranList.filter(function(p) { return p.status !== 'Deal' && p.noWO; });
  var issueBNilai = issueB.reduce(function(s, p) { return s + p.grandTotal; }, 0);

  Logger.log('\n[B] Penawaran STATUS BUKAN "Deal" tapi No WO TERISI: ' + issueB.length + ' item | ' + _auRp(issueBNilai));
  if (issueB.length > 0) {
    Logger.log('    No Penawaran          | Status         | No WO        | Klien                        | Project                          | Nilai         | Sales');
    Logger.log('    ' + '-'.repeat(140));
    issueB.forEach(function(p) {
      Logger.log('    ' + _auPad(p.noPenawaran,22)
        + ' | ' + _auPad(p.status,14)
        + ' | ' + _auPad(p.noWO,12)
        + ' | ' + _auPad(p.namaKlien,28)
        + ' | ' + _auPad(p.namaProject,32)
        + ' | ' + _auPadL(_auRp(p.grandTotal),13)
        + ' | ' + p.dibuatOleh);
    });
  }

  // ════════════════════════════════════════════════════════
  // RINGKASAN & ANALISIS SELISIH
  // ════════════════════════════════════════════════════════
  Logger.log('\n═══════════════════════════════════════════════════════');
  Logger.log('RINGKASAN');
  Logger.log('  Penawaran berstatus Deal        : ' + totalDeal + ' item = ' + _auRp(totalDealNilai));
  Logger.log('  Penawaran yang punya No WO      : ' + totalDenganWO + ' item = ' + _auRp(totalDenganWONilai));
  Logger.log('  Selisih jumlah item             : ' + Math.abs(totalDeal - totalDenganWO) + ' item');
  Logger.log('  Selisih nilai                   : ' + _auRp(Math.abs(totalDealNilai - totalDenganWONilai)));
  Logger.log('');
  Logger.log('  [A] Deal tanpa No WO            : ' + issueA.length + ' item = ' + _auRp(issueANilai));
  Logger.log('  [B] Bukan Deal tapi punya No WO : ' + issueB.length + ' item = ' + _auRp(issueBNilai));
  Logger.log('  [C] No WO double (multi-baris)  : ' + issueC.length + ' No WO');

  if (issueA.length === 0 && issueB.length === 0 && issueC.length === 0) {
    Logger.log('\n✅ Tidak ditemukan inkonsistensi data.');
  } else {
    Logger.log('\n⚠️  Inkonsistensi ditemukan:');
    if (issueA.length) Logger.log('   [A] Penawaran Deal tanpa No WO → nilai Dashboard > Work Order.');
    if (issueB.length) Logger.log('   [B] Bukan Deal tapi punya No WO → nilai Work Order > Dashboard.');
    if (issueC.length) Logger.log('   [C] No WO double → Work Order menghitung revisi lama, jumlah & nilai jadi lebih besar.');
  }
  Logger.log('═══════════════════════════════════════════════════════');

  // ── Tulis hasil ke sheet Audit_Result ────────────────────────────────────
  _auWriteSheet(ss, issueA, issueB, issueC, {
    totalDeal: totalDeal, totalDealNilai: totalDealNilai,
    totalDenganWO: totalDenganWO, totalDenganWONilai: totalDenganWONilai,
    issueANilai: issueANilai, issueBNilai: issueBNilai,
    issueCCount: issueC.length
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function _auWriteSheet(ss, issueA, issueB, issueC, summary) {
  var sheetName = 'Audit_Result';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) sheet.clearContents();
  else sheet = ss.insertSheet(sheetName);

  var rows = [];
  rows.push(['HASIL AUDIT INKONSISTENSI PENAWARAN — No WO vs Status']);
  rows.push(['Dijalankan:', new Date().toLocaleString('id-ID')]);
  rows.push([]);
  rows.push(['RINGKASAN']);
  rows.push(['Penawaran berstatus Deal',        summary.totalDeal,      'item', summary.totalDealNilai]);
  rows.push(['Penawaran yang punya No WO',      summary.totalDenganWO,  'item', summary.totalDenganWONilai]);
  rows.push(['Selisih nilai',                   '',                     '',     Math.abs(summary.totalDealNilai - summary.totalDenganWONilai)]);
  rows.push(['[A] Deal tanpa No WO',            issueA.length,          'item', summary.issueANilai]);
  rows.push(['[B] Bukan Deal tapi punya No WO', issueB.length,          'item', summary.issueBNilai]);
  rows.push(['[C] No WO double (multi-baris)',  summary.issueCCount,    'No WO', '']);
  rows.push([]);

  // [A]
  rows.push(['[A] PENAWARAN STATUS "DEAL" TAPI NO WO KOSONG (' + issueA.length + ' item)']);
  rows.push(['No Penawaran','Tanggal','Klien','Project','Nilai','Tanggal Deal','Sales']);
  issueA.forEach(function(p) {
    rows.push([p.noPenawaran, p.tanggal, p.namaKlien, p.namaProject, p.grandTotal, p.tanggalDeal||'-', p.dibuatOleh]);
  });
  if (!issueA.length) rows.push(['(tidak ada masalah)']);
  rows.push([]);

  // [B]
  rows.push(['[B] PENAWARAN BUKAN "DEAL" TAPI NO WO TERISI (' + issueB.length + ' item)']);
  rows.push(['No Penawaran','Status','No WO','Klien','Project','Nilai','Sales']);
  issueB.forEach(function(p) {
    rows.push([p.noPenawaran, p.status, p.noWO, p.namaKlien, p.namaProject, p.grandTotal, p.dibuatOleh]);
  });
  if (!issueB.length) rows.push(['(tidak ada masalah)']);
  rows.push([]);

  // [C]
  rows.push(['[C] NO WO DOUBLE / DIPAKAI LEBIH DARI SATU PENAWARAN (' + issueC.length + ' No WO)']);
  rows.push(['No WO','No Penawaran','Rev','Status','Klien','Project','Nilai']);
  issueC.forEach(function(g) {
    g.entries.forEach(function(e) {
      rows.push([g.noWO, e.noPenawaran, e.rev, e.status, e.namaKlien, e.namaProject, e.grandTotal]);
    });
    rows.push(['---','---','','','','','']);
  });
  if (!issueC.length) rows.push(['(tidak ada masalah)']);

  // Pad semua baris ke 7 kolom agar setValues tidak error
  var COLS = 7;
  rows = rows.map(function(r) {
    while (r.length < COLS) r.push('');
    return r.slice(0, COLS);
  });

  sheet.getRange(1, 1, rows.length, COLS).setValues(rows);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sheet.getRange(4, 1).setFontWeight('bold');
  sheet.getRange(11, 1).setFontWeight('bold');
  sheet.getRange(11 + issueA.length + 3, 1).setFontWeight('bold');

  // Format kolom nilai sebagai angka
  var valColA = sheet.getRange(13, 5, issueA.length || 1, 1);
  var valColB = sheet.getRange(11 + issueA.length + 4, 6, issueB.length || 1, 1);
  valColA.setNumberFormat('#,##0');
  valColB.setNumberFormat('#,##0');
  sheet.getRange(5, 4, 4, 1).setNumberFormat('#,##0');

  sheet.autoResizeColumns(1, 7);
  Logger.log('\n📋 Hasil ditulis ke sheet "' + sheetName + '".');
}

// ─────────────────────────────────────────────────────────────────────────────
function _auFmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return ('0'+val.getDate()).slice(-2)+'/'+('0'+(val.getMonth()+1)).slice(-2)+'/'+val.getFullYear();
  }
  return val.toString().trim();
}
function _auRp(n)        { return 'Rp '+Math.round(n||0).toLocaleString('id-ID'); }
function _auPad(s,len)   { s=(s||'').toString(); return s.length>=len?s.substring(0,len):s+' '.repeat(len-s.length); }
function _auPadL(s,len)  { s=(s||'').toString(); return s.length>=len?s.substring(0,len):' '.repeat(len-s.length)+s; }
