/**
 * Migrasi_AR_ALL.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrasi data invoice historis dari sheet "AR ALL" ke "Invoice_Main".
 *
 * Kolom AR ALL (terdeteksi otomatis dari header baris 1):
 *   No Invoice | No Quotation | Nama Klien | Tgl. Invoice | Nama Project
 *   DPP | Grand Total | Tgl Bayar | Paid | Outstanding
 *
 * CARA PAKAI:
 *  1. Pastikan sheet "AR ALL" sudah ada di spreadsheet RenusPro
 *  2. Set DRY_RUN = true untuk preview, false untuk jalankan sungguhan
 *  3. Jalankan migrasiARAll()
 *  4. Cek sheet "Migrasi_Log" untuk laporan hasil
 */

var MIGRASI_CFG = {
  SOURCE_SHEET:    'AR ALL',
  TARGET_SHEET:    'Invoice_Main',
  PEN_SHEET:       'Penawaran_Main',
  KLIEN_SHEET:     'Master_Klien',
  DRY_RUN:         true,    // ubah ke false untuk eksekusi nyata
  SKIP_EXISTING:   true     // skip jika No Invoice sudah ada di Invoice_Main
};

// ─────────────────────────────────────────────────────────────────────────────
function migrasiARAll() {
  var ss = getSpreadsheet();

  Logger.log('═══════════════════════════════════════════════════════════════');
  Logger.log('MIGRASI AR ALL → Invoice_Main');
  Logger.log('Mode: ' + (MIGRASI_CFG.DRY_RUN ? 'DRY RUN (tidak ada yang ditulis)' : 'EKSEKUSI NYATA'));
  Logger.log('Dijalankan: ' + new Date().toLocaleString('id-ID'));
  Logger.log('═══════════════════════════════════════════════════════════════');

  // ── 1. Baca AR ALL ──────────────────────────────────────────────────────
  var srcSheet = ss.getSheetByName(MIGRASI_CFG.SOURCE_SHEET);
  if (!srcSheet) { Logger.log('ERROR: Sheet "' + MIGRASI_CFG.SOURCE_SHEET + '" tidak ditemukan.'); return; }
  var srcData = srcSheet.getDataRange().getValues();
  if (srcData.length < 2) { Logger.log('ERROR: Sheet AR ALL kosong.'); return; }

  var headers = srcData[0].map(function(h) { return (h||'').toString().trim().toLowerCase(); });
  var col = _mBuildColMap(headers);
  Logger.log('Kolom terdeteksi: ' + JSON.stringify(col));

  // ── 2. Baca Invoice_Main (untuk cek duplikat) ───────────────────────────
  var tgtSheet = ss.getSheetByName(MIGRASI_CFG.TARGET_SHEET) || buatSheetInvoiceDefault(ss);
  var tgtData  = tgtSheet.getDataRange().getValues();
  var existingIds = {};
  for (var ti = 1; ti < tgtData.length; ti++) {
    if (tgtData[ti][0]) existingIds[tgtData[ti][0].toString().trim()] = true;
  }

  // ── 3. Bangun index Penawaran untuk matching ────────────────────────────
  var penIndex = _mBuildPenawaranIndex(ss);

  // ── 4. Proses setiap baris AR ALL ──────────────────────────────────────
  var toWrite = [], logRows = [];
  var cntSkip = 0, cntDup = 0, cntOk = 0, cntNoMatch = 0;

  for (var i = 1; i < srcData.length; i++) {
    var row = srcData[i];

    var noInv    = _mVal(row, col.noInvoice);
    if (!noInv) continue;                                    // baris kosong

    if (MIGRASI_CFG.SKIP_EXISTING && existingIds[noInv]) {
      cntDup++;
      logRows.push([noInv, 'SKIP', 'Sudah ada di Invoice_Main', '', '', '']);
      continue;
    }

    var noQuot   = _mVal(row, col.noQuotation);
    var namaKlien = _mVal(row, col.namaKlien);
    var tglStr   = _mFmtTgl(row[col.tglInvoice]);
    var namaProj = _mVal(row, col.namaProject);
    var dpp      = _mNum(row, col.dpp);
    var grandTotal = _mNum(row, col.grandTotal);
    var tglBayar = _mFmtTgl(row[col.tglBayar]);
    var paid     = _mNum(row, col.paid);
    var outstanding = _mNum(row, col.outstanding);

    // Hitung PPN dari selisih Grand Total - DPP
    var ppnNominal = Math.max(0, Math.round(grandTotal - dpp));
    var ppnPersen  = dpp > 0 ? Math.round(ppnNominal / dpp * 100) : 0;

    // Status bayar
    var statusBayar = (outstanding !== null && outstanding <= 0 && paid > 0) ? 'Lunas' : 'Belum Lunas';

    // Match ke Penawaran_Main hanya berdasarkan No Penawaran (exact)
    var match = noQuot ? (penIndex.byNoPen[noQuot.trim()] || null) : null;

    var noPenawaran     = noQuot || '';
    var noWO            = match ? (match.noWO     || '') : '';
    var klienId         = match ? (match.klienId  || '') : '';
    var namaKlienFinal  = match ? (match.namaKlien  || namaKlien) : namaKlien;
    var namaProjFinal   = match ? (match.namaProject || namaProj)  : namaProj;

    if (!match) cntNoMatch++;
    var matchInfo = match ? ('MATCH: ' + match.noPenawaran) : (noQuot ? 'NO MATCH (no penawaran tidak ditemukan)' : 'NO QUOT (pakai data AR ALL)');

    // Deteksi jenis invoice
    var jenis = _mDetectJenis(namaProj + ' ' + noInv);

    // Bangun baris Invoice_Main (20 kolom)
    // [1]id [2]noWO [3]noPen [4]tgl [5]jenis [6]persen [7]noPO [8]tglPO
    // [9]klienId [10]namaKlien [11]namaProject [12]dpp [13]ppnPct [14]ppnNom
    // [15]total [16]meta [17]status [18]catatan [19]dibuatOleh [20]bank
    var mapped = [
      noInv,
      noWO,
      noPenawaran || '',
      tglStr,
      jenis,
      0,                              // persen (tidak diketahui dari AR ALL)
      '',                             // noPO
      '',                             // tglPO
      klienId,
      namaKlienFinal,
      namaProjFinal,
      dpp,
      ppnPersen,
      ppnNominal,
      grandTotal,
      '{}',                           // metaJson
      statusBayar,
      'Migrasi dari AR ALL',
      'MIGRASI',
      ''                              // bank
    ];

    toWrite.push(mapped);
    cntOk++;

    logRows.push([noInv, 'OK', matchInfo, namaKlienFinal, namaProjFinal, statusBayar]);

    Logger.log((MIGRASI_CFG.DRY_RUN ? '[DRY] ' : '[OK]  ')
      + noInv + ' | ' + namaKlienFinal + ' | ' + namaProjFinal
      + ' | ' + statusBayar + ' | ' + matchInfo);
  }

  // ── 5. Tulis ke Invoice_Main ────────────────────────────────────────────
  if (!MIGRASI_CFG.DRY_RUN && toWrite.length > 0) {
    var startRow = tgtSheet.getLastRow() + 1;
    tgtSheet.getRange(startRow, 1, toWrite.length, 20).setValues(toWrite);
    SpreadsheetApp.flush();
  }

  // ── 6. Ringkasan ────────────────────────────────────────────────────────
  Logger.log('\n─────────────────────────────────────────────────────────');
  Logger.log('RINGKASAN:');
  Logger.log('  Total baris AR ALL      : ' + (srcData.length - 1));
  Logger.log('  Akan dimigrasi          : ' + cntOk);
  Logger.log('  Skip (duplikat)         : ' + cntDup);
  Logger.log('  Tanpa match penawaran   : ' + cntNoMatch);
  Logger.log('  Mode                    : ' + (MIGRASI_CFG.DRY_RUN ? 'DRY RUN — tidak ada yang ditulis' : 'DITULIS KE Invoice_Main'));
  Logger.log('─────────────────────────────────────────────────────────');

  // ── 7. Tulis log ke sheet Migrasi_Log ──────────────────────────────────
  _mWriteLog(ss, logRows, {
    total: srcData.length - 1, ok: cntOk, dup: cntDup, noMatch: cntNoMatch,
    dryRun: MIGRASI_CFG.DRY_RUN
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: bangun col map dari header AR ALL
// ─────────────────────────────────────────────────────────────────────────────
function _mBuildColMap(headers) {
  var map = { noInvoice:-1, noQuotation:-1, namaKlien:-1, tglInvoice:-1,
              namaProject:-1, dpp:-1, grandTotal:-1, tglBayar:-1, paid:-1, outstanding:-1 };

  var aliases = {
    noInvoice:   ['no. invoice','no invoice','no.invoice','invoice','no inv'],
    noQuotation: ['no. quotation','no quotation','no.quotation','quotation','no quot','no penawaran'],
    namaKlien:   ['nama klien','klien','customer','nama customer'],
    tglInvoice:  ['tgl. invoice','tgl invoice','tanggal invoice','tgl.invoice','invoice date'],
    namaProject: ['nama project','project','nama proyek','proyek'],
    dpp:         ['dpp'],
    grandTotal:  ['grand total','total','nilai total','total tagihan'],
    tglBayar:    ['tgl bayar','tanggal bayar','tgl. bayar','payment date'],
    paid:        ['paid','terbayar','sudah bayar'],
    outstanding: ['outstanding','sisa','belum bayar']
  };

  for (var key in aliases) {
    var aliasList = aliases[key];
    for (var ci = 0; ci < headers.length; ci++) {
      if (aliasList.indexOf(headers[ci]) !== -1) {
        map[key] = ci; break;
      }
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: bangun index Penawaran_Main
// ─────────────────────────────────────────────────────────────────────────────
function _mBuildPenawaranIndex(ss) {
  var index = { byNoPen: {} };

  var kSheet = ss.getSheetByName(MIGRASI_CFG.KLIEN_SHEET);
  var klienMap = {};
  if (kSheet) {
    var kd = kSheet.getDataRange().getValues();
    for (var ki = 1; ki < kd.length; ki++) {
      if (kd[ki][0]) klienMap[kd[ki][0].toString()] = (kd[ki][1] || '').toString();
    }
  }

  var pSheet = ss.getSheetByName(MIGRASI_CFG.PEN_SHEET);
  if (!pSheet) return index;
  var pd = pSheet.getDataRange().getValues();

  // Deduplikasi: ambil revisi tertinggi per noPenawaran
  var latest = {};
  for (var pi = 1; pi < pd.length; pi++) {
    var noPen = (pd[pi][0] || '').toString().trim();
    if (!noPen) continue;
    var rev = parseInt(pd[pi][1]) || 0;
    if (!latest[noPen] || rev > latest[noPen].rev) {
      latest[noPen] = { rev: rev, rowIdx: pi };
    }
  }

  for (var noPen in latest) {
    var row = pd[latest[noPen].rowIdx];
    var klienId = (row[5] || '').toString().trim();
    var obj = {
      noPenawaran: noPen,
      klienId:     klienId,
      namaKlien:   klienMap[klienId] || klienId,
      namaProject: (row[4] || '').toString().trim(),
      noWO:        (row[17] || '').toString().trim(),
      score:       1
    };
    index.byNoPen[noPen] = obj;
  }
  return index;
}


function _mDetectJenis(s) {
  s = (s || '').toLowerCase();
  if (/\bfp\b|full payment|pelunasan/.test(s))  return 'Pelunasan';
  if (/\bdp\b|down payment/.test(s))            return 'DP';
  if (/termin|term\b/.test(s))                  return 'Termin';
  if (/retention/.test(s))                       return 'Termin';
  return 'Penuh';
}

function _mVal(row, idx)  { return idx >= 0 ? (row[idx] || '').toString().trim() : ''; }
function _mNum(row, idx)  { return idx >= 0 ? (parseFloat(row[idx]) || 0) : 0; }
function _mFmtTgl(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return ('0'+val.getDate()).slice(-2)+'/'
         + ('0'+(val.getMonth()+1)).slice(-2)+'/'
         + val.getFullYear();
  }
  return val.toString().trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: tulis log ke sheet Migrasi_Log
// ─────────────────────────────────────────────────────────────────────────────
function _mWriteLog(ss, logRows, summary) {
  var logSheet = ss.getSheetByName('Migrasi_Log');
  if (logSheet) logSheet.clearContents();
  else logSheet = ss.insertSheet('Migrasi_Log');

  var rows = [
    ['LAPORAN MIGRASI AR ALL → Invoice_Main'],
    ['Dijalankan:', new Date().toLocaleString('id-ID')],
    ['Mode:', summary.dryRun ? 'DRY RUN (tidak ada yang ditulis)' : 'EKSEKUSI NYATA'],
    [],
    ['RINGKASAN', '', '', '', '', ''],
    ['Total baris AR ALL',    summary.total,   '', '', '', ''],
    ['Akan dimigrasi',        summary.ok,      '', '', '', ''],
    ['Skip duplikat',         summary.dup,     '', '', '', ''],
    ['Tanpa match penawaran', summary.noMatch, '', '', '', ''],
    [],
    ['No Invoice', 'Status', 'Info Match / Keterangan', 'Nama Klien', 'Nama Project', 'Status Bayar']
  ];
  logRows.forEach(function(r) { rows.push(r); });

  var COLS = 6;
  rows = rows.map(function(r) {
    while (r.length < COLS) r.push('');
    return r.slice(0, COLS);
  });

  logSheet.getRange(1, 1, rows.length, COLS).setValues(rows);
  logSheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  logSheet.getRange(5, 1).setFontWeight('bold');
  logSheet.getRange(11, 1, 1, COLS).setFontWeight('bold');
  logSheet.autoResizeColumns(1, COLS);

  Logger.log('\n📋 Log ditulis ke sheet "Migrasi_Log".');
}
