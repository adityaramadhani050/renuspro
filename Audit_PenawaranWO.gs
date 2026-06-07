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

  if (issueA.length === 0 && issueB.length === 0) {
    Logger.log('\n✅ Tidak ditemukan inkonsistensi data.');
  } else {
    Logger.log('\n⚠️  Total ' + (issueA.length + issueB.length) + ' item bermasalah ditemukan.');
    Logger.log('   Penawaran [A] menyebabkan nilai Dashboard > nilai Work Order.');
    Logger.log('   Penawaran [B] menyebabkan nilai Work Order > nilai Dashboard.');
  }
  Logger.log('═══════════════════════════════════════════════════════');

  // ── Tulis hasil ke sheet Audit_Result ────────────────────────────────────
  _auWriteSheet(ss, issueA, issueB, {
    totalDeal: totalDeal, totalDealNilai: totalDealNilai,
    totalDenganWO: totalDenganWO, totalDenganWONilai: totalDenganWONilai,
    issueANilai: issueANilai, issueBNilai: issueBNilai
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function _auWriteSheet(ss, issueA, issueB, summary) {
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
