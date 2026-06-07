/**
 * Audit_PenawaranWO.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Program audit untuk mendeteksi inkonsistensi data antara Penawaran_Main
 * dan WorkOrder_Main yang bisa menyebabkan selisih nilai antara menu
 * Work Order dan Dashboard Sales.
 *
 * Pemeriksaan yang dilakukan:
 *  [A] Penawaran status "Deal" tapi TIDAK punya No WO
 *  [B] Penawaran status BUKAN "Deal" tapi PUNYA No WO
 *  [C] No WO di Penawaran_Main yang tidak terdaftar di WorkOrder_Main
 *  [D] No WO di WorkOrder_Main yang tidak punya referensi penawaran Deal
 *
 * CARA PAKAI:
 *  1. Buka Google Apps Script project RenusPro
 *  2. Jalankan fungsi  auditPenawaranWO()
 *  3. Lihat hasil di Log (Ctrl+Enter)
 *  4. Hasil juga ditulis ke sheet "Audit_Result" (dibuat otomatis jika belum ada)
 */

function auditPenawaranWO() {
  var ss = getSpreadsheet();

  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('AUDIT INKONSISTENSI PENAWARAN ↔ WORK ORDER');
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

  // Bangun map penawaran
  var penawaranMap = {}; // noPenawaran → object
  for (var noPen in latestRevMap) {
    var row    = pData[latestRevMap[noPen].rowIdx];
    var klienId = (row[5] || '').toString().trim();
    penawaranMap[noPen] = {
      noPenawaran:  noPen,
      tanggal:      _auFmtDate(row[2]),
      namaProject:  (row[4] || '').toString().trim(),
      klienId:      klienId,
      namaKlien:    klienMap[klienId] || klienId,
      dibuatOleh:   (row[6] || '').toString().trim(),
      grandTotal:   parseFloat(row[10]) || 0,
      status:       (row[16] || '').toString().trim() || 'On-Progress',
      noWO:         (row[17] || '').toString().trim(),
      tanggalDeal:  _auFmtDate(row[18])
    };
  }

  // ── Load WorkOrder_Main ───────────────────────────────────────────────────
  var woSheet = ss.getSheetByName('WorkOrder_Main');
  var woMap   = {}; // noWO → object
  if (woSheet) {
    var woData = woSheet.getDataRange().getValues();
    // WorkOrder_Main: [0]noWO [1]noPenawaran [2]tanggal ... (sesuai WorkOrder.gs)
    for (var wi = 1; wi < woData.length; wi++) {
      var noWO  = (woData[wi][0] || '').toString().trim();
      var penRef = (woData[wi][1] || '').toString().trim();
      if (!noWO) continue;
      woMap[noWO] = {
        noWO:        noWO,
        noPenawaran: penRef,
        tanggal:     _auFmtDate(woData[wi][2]),
        namaProject: (woData[wi][3] || woData[wi][4] || '').toString().trim(),
        nilaiKontrak: parseFloat(woData[wi][5] || woData[wi][6] || 0) || 0
      };
    }
  } else {
    Logger.log('PERINGATAN: Sheet WorkOrder_Main tidak ditemukan.');
  }

  // ════════════════════════════════════════════════════════
  // [A] Penawaran DEAL tapi TIDAK punya No WO
  // ════════════════════════════════════════════════════════
  var issueA = [];
  for (var np in penawaranMap) {
    var p = penawaranMap[np];
    if (p.status === 'Deal' && !p.noWO) {
      issueA.push(p);
    }
  }

  Logger.log('\n[A] Penawaran STATUS "Deal" tapi TIDAK memiliki No WO: ' + issueA.length + ' item');
  if (issueA.length > 0) {
    Logger.log('    No Penawaran          | Klien                        | Project                          | Nilai         | Tgl Deal     | Sales');
    Logger.log('    ' + '-'.repeat(120));
    issueA.forEach(function(p) {
      Logger.log('    ' + _auPad(p.noPenawaran,22) + ' | ' + _auPad(p.namaKlien,28) + ' | ' + _auPad(p.namaProject,32) + ' | ' + _auPadL(_auRp(p.grandTotal),13) + ' | ' + _auPad(p.tanggalDeal||'-',12) + ' | ' + p.dibuatOleh);
    });
  }

  // ════════════════════════════════════════════════════════
  // [B] Penawaran BUKAN Deal tapi PUNYA No WO
  // ════════════════════════════════════════════════════════
  var issueB = [];
  for (var np2 in penawaranMap) {
    var p2 = penawaranMap[np2];
    if (p2.status !== 'Deal' && p2.noWO) {
      issueB.push(p2);
    }
  }

  Logger.log('\n[B] Penawaran STATUS BUKAN "Deal" tapi PUNYA No WO: ' + issueB.length + ' item');
  if (issueB.length > 0) {
    Logger.log('    No Penawaran          | Status       | No WO        | Klien                        | Project');
    Logger.log('    ' + '-'.repeat(110));
    issueB.forEach(function(p) {
      Logger.log('    ' + _auPad(p.noPenawaran,22) + ' | ' + _auPad(p.status,12) + ' | ' + _auPad(p.noWO,12) + ' | ' + _auPad(p.namaKlien,28) + ' | ' + p.namaProject);
    });
  }

  // ════════════════════════════════════════════════════════
  // [C] No WO di Penawaran_Main yang tidak ada di WorkOrder_Main
  // ════════════════════════════════════════════════════════
  var issueC = [];
  for (var np3 in penawaranMap) {
    var p3 = penawaranMap[np3];
    if (p3.noWO && !woMap[p3.noWO]) {
      issueC.push(p3);
    }
  }

  Logger.log('\n[C] No WO di Penawaran_Main yang TIDAK TERDAFTAR di WorkOrder_Main: ' + issueC.length + ' item');
  if (issueC.length > 0) {
    Logger.log('    No Penawaran          | No WO        | Status       | Klien                        | Project');
    Logger.log('    ' + '-'.repeat(110));
    issueC.forEach(function(p) {
      Logger.log('    ' + _auPad(p.noPenawaran,22) + ' | ' + _auPad(p.noWO,12) + ' | ' + _auPad(p.status,12) + ' | ' + _auPad(p.namaKlien,28) + ' | ' + p.namaProject);
    });
  }

  // ════════════════════════════════════════════════════════
  // [D] No WO di WorkOrder_Main tanpa referensi Penawaran Deal
  // ════════════════════════════════════════════════════════
  var issueD = [];
  for (var noWO in woMap) {
    var wo     = woMap[noWO];
    var penRef = wo.noPenawaran;
    var linked = penRef && penawaranMap[penRef];
    if (!linked || penawaranMap[penRef].status !== 'Deal') {
      issueD.push({
        noWO:        wo.noWO,
        noPenawaran: penRef,
        namaProject: wo.namaProject,
        nilaiKontrak: wo.nilaiKontrak,
        statusPen:   linked ? penawaranMap[penRef].status : '(penawaran tidak ditemukan)'
      });
    }
  }

  Logger.log('\n[D] No WO di WorkOrder_Main tanpa referensi Penawaran "Deal": ' + issueD.length + ' item');
  if (issueD.length > 0) {
    Logger.log('    No WO         | No Penawaran          | Status Penawaran              | Nilai Kontrak | Project');
    Logger.log('    ' + '-'.repeat(110));
    issueD.forEach(function(w) {
      Logger.log('    ' + _auPad(w.noWO,14) + ' | ' + _auPad(w.noPenawaran||'(kosong)',22) + ' | ' + _auPad(w.statusPen,29) + ' | ' + _auPadL(_auRp(w.nilaiKontrak),13) + ' | ' + w.namaProject);
    });
  }

  // ════════════════════════════════════════════════════════
  // RINGKASAN & SELISIH NILAI
  // ════════════════════════════════════════════════════════
  var totalDealPenawaran = 0, countDeal = 0;
  for (var np4 in penawaranMap) {
    if (penawaranMap[np4].status === 'Deal') {
      totalDealPenawaran += penawaranMap[np4].grandTotal;
      countDeal++;
    }
  }

  var totalWOKontrak = 0, countWO = 0;
  for (var nw in woMap) {
    totalWOKontrak += woMap[nw].nilaiKontrak;
    countWO++;
  }

  Logger.log('\n═══════════════════════════════════════════════════════');
  Logger.log('RINGKASAN');
  Logger.log('  Total penawaran Deal   : ' + countDeal + ' item = ' + _auRp(totalDealPenawaran));
  Logger.log('  Total Work Order       : ' + countWO + ' item = ' + _auRp(totalWOKontrak));
  Logger.log('  Selisih nilai          : ' + _auRp(Math.abs(totalDealPenawaran - totalWOKontrak))
    + (totalDealPenawaran >= totalWOKontrak ? ' (Penawaran lebih besar)' : ' (WO lebih besar)'));
  Logger.log('  [A] Deal tanpa WO      : ' + issueA.length);
  Logger.log('  [B] Bukan Deal ber-WO  : ' + issueB.length);
  Logger.log('  [C] WO tidak di WO_Main: ' + issueC.length);
  Logger.log('  [D] WO tanpa Deal Pen  : ' + issueD.length);

  var totalIssue = issueA.length + issueB.length + issueC.length + issueD.length;
  if (totalIssue === 0) {
    Logger.log('\n✅ Tidak ditemukan inkonsistensi data.');
  } else {
    Logger.log('\n⚠️  Total ' + totalIssue + ' item bermasalah ditemukan. Lihat detail di atas.');
  }
  Logger.log('═══════════════════════════════════════════════════════');

  // ── Tulis hasil ke sheet Audit_Result ────────────────────────────────────
  _auWriteSheet(ss, issueA, issueB, issueC, issueD, {
    totalDealPenawaran: totalDealPenawaran, countDeal: countDeal,
    totalWOKontrak: totalWOKontrak, countWO: countWO
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tulis hasil audit ke sheet
// ─────────────────────────────────────────────────────────────────────────────
function _auWriteSheet(ss, issueA, issueB, issueC, issueD, summary) {
  var sheetName = 'Audit_Result';
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) sheet.clearContents();
  else sheet = ss.insertSheet(sheetName);

  var rows = [];
  var now = new Date().toLocaleString('id-ID');

  rows.push(['HASIL AUDIT INKONSISTENSI PENAWARAN ↔ WORK ORDER', '', '', '', '', '', '']);
  rows.push(['Dijalankan:', now, '', '', '', '', '']);
  rows.push(['']);

  // Ringkasan
  rows.push(['RINGKASAN', '', '', '', '', '', '']);
  rows.push(['Total penawaran Deal', summary.countDeal, 'item', _auRp(summary.totalDealPenawaran)]);
  rows.push(['Total Work Order', summary.countWO, 'item', _auRp(summary.totalWOKontrak)]);
  rows.push(['Selisih', '', '', _auRp(Math.abs(summary.totalDealPenawaran - summary.totalWOKontrak))]);
  rows.push(['[A] Deal tanpa WO', issueA.length, 'item']);
  rows.push(['[B] Bukan Deal ber-WO', issueB.length, 'item']);
  rows.push(['[C] WO tidak di WO_Main', issueC.length, 'item']);
  rows.push(['[D] WO tanpa Deal Penawaran', issueD.length, 'item']);
  rows.push(['']);

  // [A]
  rows.push(['[A] PENAWARAN DEAL TANPA NO WO (' + issueA.length + ' item)']);
  rows.push(['No Penawaran','Tanggal','Klien','Project','Nilai','Tgl Deal','Sales']);
  issueA.forEach(function(p) {
    rows.push([p.noPenawaran, p.tanggal, p.namaKlien, p.namaProject, p.grandTotal, p.tanggalDeal||'-', p.dibuatOleh]);
  });
  if (!issueA.length) rows.push(['(tidak ada)']);
  rows.push(['']);

  // [B]
  rows.push(['[B] PENAWARAN BUKAN DEAL TAPI PUNYA NO WO (' + issueB.length + ' item)']);
  rows.push(['No Penawaran','Status','No WO','Klien','Project','Nilai','Sales']);
  issueB.forEach(function(p) {
    rows.push([p.noPenawaran, p.status, p.noWO, p.namaKlien, p.namaProject, p.grandTotal, p.dibuatOleh]);
  });
  if (!issueB.length) rows.push(['(tidak ada)']);
  rows.push(['']);

  // [C]
  rows.push(['[C] NO WO DI PENAWARAN_MAIN TIDAK TERDAFTAR DI WORKORDER_MAIN (' + issueC.length + ' item)']);
  rows.push(['No Penawaran','Status','No WO (tidak valid)','Klien','Project','Nilai']);
  issueC.forEach(function(p) {
    rows.push([p.noPenawaran, p.status, p.noWO, p.namaKlien, p.namaProject, p.grandTotal]);
  });
  if (!issueC.length) rows.push(['(tidak ada)']);
  rows.push(['']);

  // [D]
  rows.push(['[D] NO WO DI WORKORDER_MAIN TANPA REFERENSI PENAWARAN DEAL (' + issueD.length + ' item)']);
  rows.push(['No WO','No Penawaran Referensi','Status Penawaran','Nilai Kontrak WO','Project']);
  issueD.forEach(function(w) {
    rows.push([w.noWO, w.noPenawaran||'(kosong)', w.statusPen, w.nilaiKontrak, w.namaProject]);
  });
  if (!issueD.length) rows.push(['(tidak ada)']);

  sheet.getRange(1, 1, rows.length, 7).setValues(rows);

  // Format header rows
  var boldRows = [1, 4, 12, 12 + issueA.length + 3, 12 + issueA.length + 3 + issueB.length + 3,
                  12 + issueA.length + 3 + issueB.length + 3 + issueC.length + 3];
  sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setFontSize(12);
  sheet.getRange(4, 1, 1, 4).setFontWeight('bold');
  sheet.autoResizeColumns(1, 7);

  Logger.log('\n📋 Hasil audit juga ditulis ke sheet "' + sheetName + '" di spreadsheet.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function _auFmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return ('0'+val.getDate()).slice(-2) + '/' + ('0'+(val.getMonth()+1)).slice(-2) + '/' + val.getFullYear();
  }
  return val.toString().trim();
}
function _auRp(n)        { return 'Rp ' + Math.round(n||0).toLocaleString('id-ID'); }
function _auPad(s, len)  { s = (s||'').toString(); return s.length >= len ? s.substring(0,len) : s + ' '.repeat(len - s.length); }
function _auPadL(s, len) { s = (s||'').toString(); return s.length >= len ? s.substring(0,len) : ' '.repeat(len - s.length) + s; }
