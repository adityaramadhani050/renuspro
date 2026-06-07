/**
 * Migrasi_AR_ALL.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrasi data dari sheet "AR ALL" ke sheet "Invoice_Main" RenusPro.
 * Dilengkapi deteksi otomatis noPenawaran berdasarkan kecocokan
 * Nama Klien + Nama Project dengan data di Penawaran_Main.
 *
 * CARA PAKAI:
 *  1. Buka Google Apps Script project RenusPro
 *  2. Jalankan fungsi  migrasiARAll()  secara manual
 *  3. Pertama kali jalankan dengan  DRY_RUN = true  untuk preview di Log
 *  4. Jika hasil preview sudah benar, ubah  DRY_RUN = false  lalu jalankan lagi
 *
 * KONFIGURASI — sesuaikan sebelum menjalankan:
 */

var MIGRASI_CONFIG = {
  SOURCE_SPREADSHEET_ID: '13Ao79ds4tt-F1RH9JdOR0k2-it1ge_RP',
  SOURCE_SHEET_NAME:     'AR ALL',
  TARGET_SHEET_NAME:     'Invoice_Main',
  PENAWARAN_SHEET_NAME:  'Penawaran_Main',
  DRY_RUN:               true,   // true = preview log saja, false = tulis sungguhan
  SKIP_EXISTING:         true,   // lewati jika No Invoice sudah ada
  // Threshold kecocokan nama project (0.0–1.0). Turunkan jika terlalu ketat.
  MATCH_THRESHOLD:       0.45,
  DEFAULT_BANK_ACCOUNT:  'Bank BSI 7336418717\nA/N. PT. Renus Global Indonesia',
  DEFAULT_DIBUAT_OLEH:   'Migrasi'
};

// ─────────────────────────────────────────────────────────────────────────────

function migrasiARAll() {
  var cfg = MIGRASI_CONFIG;
  Logger.log('═══════════════════════════════════════════════════════');
  Logger.log('MIGRASI AR ALL → Invoice_Main');
  Logger.log('Mode: ' + (cfg.DRY_RUN ? 'DRY RUN (tidak ada yang ditulis)' : 'LIVE (data akan ditulis)'));
  Logger.log('═══════════════════════════════════════════════════════');

  // ── Buka source spreadsheet ──────────────────────────────────────────────
  var srcSS;
  try {
    srcSS = SpreadsheetApp.openById(cfg.SOURCE_SPREADSHEET_ID);
  } catch(e) {
    Logger.log('ERROR: Tidak bisa buka spreadsheet source. Pastikan script punya akses.\n' + e);
    return;
  }

  var srcSheet = srcSS.getSheetByName(cfg.SOURCE_SHEET_NAME);
  if (!srcSheet) {
    Logger.log('ERROR: Sheet "' + cfg.SOURCE_SHEET_NAME + '" tidak ditemukan.');
    return;
  }

  // ── Buka target & penawaran sheet ────────────────────────────────────────
  var tgtSS    = getSpreadsheet();
  var tgtSheet = tgtSS.getSheetByName(cfg.TARGET_SHEET_NAME);
  if (!tgtSheet) { Logger.log('ERROR: Sheet "' + cfg.TARGET_SHEET_NAME + '" tidak ditemukan.'); return; }

  // ── Muat index Penawaran untuk matching ──────────────────────────────────
  var penawaranIndex = _buildPenawaranIndex(tgtSS, cfg.PENAWARAN_SHEET_NAME);
  Logger.log('Penawaran dimuat: ' + penawaranIndex.length + ' entri');

  // ── Baca semua data source ────────────────────────────────────────────────
  var srcData = srcSheet.getDataRange().getValues();
  if (srcData.length < 2) { Logger.log('ERROR: Sheet source kosong.'); return; }

  var headers = srcData[0].map(function(h) { return (h || '').toString().toLowerCase().trim(); });
  var col     = _buildColMap(headers);

  Logger.log('\nKolom terdeteksi di AR ALL:');
  Object.keys(col).forEach(function(k) {
    if (col[k] !== -1) Logger.log('  ' + k + ' → kolom ' + (col[k]+1) + ' ("' + headers[col[k]] + '")');
    else Logger.log('  ' + k + ' → TIDAK DITEMUKAN');
  });

  var wajib   = ['no_invoice','nama_klien','tgl_invoice','nama_project','dpp','grand_total'];
  var missing = wajib.filter(function(k){ return col[k] === -1; });
  if (missing.length > 0) {
    Logger.log('\nERROR: Kolom wajib tidak ditemukan: ' + missing.join(', '));
    return;
  }

  // ── No Invoice yang sudah ada di Invoice_Main ─────────────────────────────
  var existingIds = {};
  if (cfg.SKIP_EXISTING) {
    var tgtData = tgtSheet.getDataRange().getValues();
    for (var i = 1; i < tgtData.length; i++) {
      var eid = (tgtData[i][0] || '').toString().trim();
      if (eid) existingIds[eid] = true;
    }
    Logger.log('\nInvoice sudah ada: ' + Object.keys(existingIds).length);
  }

  // ── Proses tiap baris ─────────────────────────────────────────────────────
  var rows       = [];
  var skipped    = 0;
  var duplicates = 0;
  var errors     = 0;
  var matched    = 0;
  var unmatched  = 0;

  Logger.log('\n──────────────── DETAIL PROSES ────────────────');

  for (var r = 1; r < srcData.length; r++) {
    var row       = srcData[r];
    var noInvoice = _str(row, col.no_invoice).trim();
    if (!noInvoice) { skipped++; continue; }

    if (cfg.SKIP_EXISTING && existingIds[noInvoice]) {
      duplicates++;
      continue;
    }

    try {
      var namaKlien   = _str(row, col.nama_klien).trim();
      var namaProject = _str(row, col.nama_project).trim();

      // ── Cari noPenawaran & noWO yang cocok ─────────────────────────────
      var matchResult = _findPenawaran(namaKlien, namaProject, penawaranIndex, cfg.MATCH_THRESHOLD);
      var noPenawaran = matchResult ? matchResult.noPenawaran : '';
      var noWO        = matchResult ? (matchResult.noWO || '') : '';

      // Jika di source sudah ada no_penawaran / no_wo → prioritaskan source
      if (col.no_penawaran !== -1) {
        var srcPen = _str(row, col.no_penawaran).trim();
        if (srcPen) noPenawaran = srcPen;
      }
      if (col.no_wo !== -1) {
        var srcWO = _str(row, col.no_wo).trim();
        if (srcWO) noWO = srcWO;
      }

      var matchLabel = matchResult
        ? ('✓ ' + matchResult.noPenawaran + ' (skor:' + matchResult.score.toFixed(2) + ')')
        : '? tidak ditemukan';

      if (matchResult) matched++; else unmatched++;

      var mapped = _mapRow(row, col, cfg, noPenawaran, noWO);
      rows.push(mapped);

      Logger.log('[' + r + '] ' + noInvoice + ' | ' + namaKlien + ' | Penawaran: ' + matchLabel
        + ' | ' + mapped[4] + ' | ' + _fmtRp(mapped[14]));
    } catch(e) {
      Logger.log('ERROR baris ' + (r+1) + ' (' + noInvoice + '): ' + e);
      errors++;
    }
  }

  Logger.log('\n──────────────── RINGKASAN ────────────────────');
  Logger.log('Siap ditulis      : ' + rows.length);
  Logger.log('Match penawaran   : ' + matched);
  Logger.log('Tidak match       : ' + unmatched);
  Logger.log('Dilewati (kosong) : ' + skipped);
  Logger.log('Duplikat dilewati : ' + duplicates);
  Logger.log('Error             : ' + errors);

  if (!cfg.DRY_RUN && rows.length > 0) {
    tgtSheet.getRange(tgtSheet.getLastRow() + 1, 1, rows.length, 20).setValues(rows);
    SpreadsheetApp.flush();
    Logger.log('\n✅ ' + rows.length + ' baris berhasil ditulis ke Invoice_Main.');
  } else if (cfg.DRY_RUN) {
    Logger.log('\n(DRY RUN — tidak ada yang ditulis. Ubah DRY_RUN = false untuk menulis sungguhan.)');
  }
  Logger.log('═══════════════════════════════════════════════════════');
}

// ─────────────────────────────────────────────────────────────────────────────
// PENAWARAN INDEX & MATCHING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat index dari Penawaran_Main.
 * Setiap entri: { noPenawaran, namaProject, klienId, namaKlien, noWO }
 * klienId diambil dari kol[5], nama klien dari Master_Klien.
 * noWO dari WorkOrder_Main jika ada.
 */
function _buildPenawaranIndex(ss, sheetName) {
  var index = [];

  // Map klienId → namaKlien
  var klienMap = {};
  var sheetKlien = ss.getSheetByName('Master_Klien');
  if (sheetKlien) {
    var kd = sheetKlien.getDataRange().getValues();
    for (var i = 1; i < kd.length; i++) {
      if (kd[i][0]) klienMap[kd[i][0].toString()] = (kd[i][1] || '').toString();
    }
  }

  // Map noPenawaran → noWO dari WorkOrder_Main
  var woMap = {};
  var sheetWO = ss.getSheetByName('WorkOrder_Main');
  if (sheetWO) {
    var wd = sheetWO.getDataRange().getValues();
    // WorkOrder_Main: kol[0]=noWO, kol[1]=noPenawaran (cek Penawaran.gs / WorkOrder.gs)
    for (var j = 1; j < wd.length; j++) {
      var woNo  = (wd[j][0] || '').toString().trim();
      var penNo = (wd[j][1] || '').toString().trim();
      if (woNo && penNo) woMap[penNo] = woNo;
    }
  }

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return index;

  var data = sheet.getDataRange().getValues();
  // Penawaran_Main: [0]noPenawaran [1]rev [2]tgl [3]validUntil [4]namaProject [5]klienId
  for (var r = 1; r < data.length; r++) {
    var noPen = (data[r][0] || '').toString().trim();
    if (!noPen) continue;
    var klienId   = (data[r][5] || '').toString().trim();
    var namaKlien = klienMap[klienId] || klienId;
    index.push({
      noPenawaran: noPen,
      namaProject: (data[r][4] || '').toString().trim(),
      klienId:     klienId,
      namaKlien:   namaKlien,
      noWO:        woMap[noPen] || ''
    });
  }
  return index;
}

/**
 * Cari penawaran terbaik berdasarkan kecocokan nama klien + nama project.
 * Strategi (dijalankan berurutan, berhenti saat ditemukan):
 *  1. Exact match nama project (setelah strip prefix jenis)
 *  2. Similarity score ≥ threshold (Jaccard token)
 * Return: { noPenawaran, noWO, score } atau null.
 */
function _findPenawaran(namaKlien, namaProject, index, threshold) {
  if (!namaProject || index.length === 0) return null;

  var projectClean = _stripJenisPrefix(namaProject).toUpperCase();
  var klienClean   = _normalize(namaKlien);

  var best = null;
  var bestScore = -1;

  for (var i = 0; i < index.length; i++) {
    var entry        = index[i];
    var entryProject = _stripJenisPrefix(entry.namaProject).toUpperCase();
    var entryKlien   = _normalize(entry.namaKlien);

    // Bobot: 70% kecocokan project, 30% kecocokan klien
    var scoreProject = _jaccardSimilarity(projectClean, entryProject);
    var scoreKlien   = _jaccardSimilarity(klienClean,   entryKlien);
    var score        = scoreProject * 0.7 + scoreKlien * 0.3;

    // Bonus: exact substring
    if (entryProject.indexOf(projectClean) !== -1 || projectClean.indexOf(entryProject) !== -1) {
      score = Math.max(score, 0.75);
    }

    if (score > bestScore) {
      bestScore = score;
      best      = entry;
    }
  }

  if (best && bestScore >= threshold) {
    return { noPenawaran: best.noPenawaran, noWO: best.noWO, score: bestScore };
  }
  return null;
}

/** Hilangkan prefix jenis (DP, FP, TERM II, dll) dari nama project */
function _stripJenisPrefix(s) {
  return (s || '').toString()
    .replace(/^(DP|FP|FULL\s*PAYMENT|DOWN\s*PAYMENT|TERM\s*(II|2|III|3|IV|4)|TERMIN\s*\d*|PELUNASAN|RETENTION|RETENSI)\s*/i, '')
    .trim();
}

/** Normalisasi string untuk perbandingan */
function _normalize(s) {
  return (s || '').toString().toUpperCase()
    .replace(/\bBPK\.?\s*/g, '')
    .replace(/\bPT\.?\s*/g, '')
    .replace(/\bCV\.?\s*/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard similarity berbasis token (kata) */
function _jaccardSimilarity(a, b) {
  if (!a || !b) return 0;
  var tokA = a.split(/\s+/).filter(function(t){ return t.length > 1; });
  var tokB = b.split(/\s+/).filter(function(t){ return t.length > 1; });
  if (tokA.length === 0 || tokB.length === 0) return 0;

  var setA = {}, setB = {}, union = {};
  tokA.forEach(function(t){ setA[t] = 1; union[t] = 1; });
  tokB.forEach(function(t){ setB[t] = 1; union[t] = 1; });

  var intersect = 0;
  Object.keys(setA).forEach(function(t){ if (setB[t]) intersect++; });
  return intersect / Object.keys(union).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPPING ROW
// ─────────────────────────────────────────────────────────────────────────────

function _mapRow(row, col, cfg, noPenawaran, noWO) {
  var noInvoice   = _str(row, col.no_invoice).trim();
  var namaKlien   = _str(row, col.nama_klien).trim();
  var tglInvoice  = _parseDate(row[col.tgl_invoice]);
  var namaProject = _str(row, col.nama_project).trim();
  var dpp         = _num(row, col.dpp);
  var grandTotal  = _num(row, col.grand_total);
  var paid        = col.paid !== -1        ? _num(row, col.paid)        : 0;
  var outstanding = col.outstanding !== -1 ? _num(row, col.outstanding) : (grandTotal - paid);

  var ppnNominal = col.ppn !== -1 ? _num(row, col.ppn) : Math.round(grandTotal - dpp);
  var ppnPersen  = (dpp > 0 && ppnNominal > 0) ? Math.round(ppnNominal / dpp * 100) : 0;
  if (ppnPersen >= 9 && ppnPersen <= 12) ppnPersen = 11;
  else if (ppnPersen < 1) ppnPersen = 0;

  var statusBayar = (outstanding <= 0) ? 'Lunas' : 'Belum Lunas';
  var jenis       = _detectJenis(namaProject);
  var noPO        = col.no_po  !== -1 ? _str(row, col.no_po).trim()        : '';
  var tglPO       = col.tgl_po !== -1 ? _parseDate(row[col.tgl_po])        : '';
  var catatan     = col.catatan !== -1 ? _str(row, col.catatan).trim()      : '';
  var bankAccount = col.bank_account !== -1 ? _str(row, col.bank_account).trim() : '';
  if (!bankAccount) bankAccount = cfg.DEFAULT_BANK_ACCOUNT;

  var metaJson = JSON.stringify({
    scope: [{ kelompok: namaProject, items: [] }],
    nilaiKontrak: grandTotal,
    inputMode: 'nominal',
    migrasi: true
  });

  return [
    noInvoice,                 //  1 id
    noWO        || '',         //  2 noWO
    noPenawaran || '',         //  3 noPenawaran
    tglInvoice,                //  4 tanggal
    jenis,                     //  5 jenis
    0,                         //  6 persen
    noPO,                      //  7 noPO
    tglPO,                     //  8 tglPO
    '',                        //  9 klienId
    namaKlien,                 // 10 namaKlien
    namaProject,               // 11 namaProject
    dpp,                       // 12 dpp
    ppnPersen,                 // 13 ppnPersen
    ppnNominal,                // 14 ppnNominal
    grandTotal,                // 15 total
    metaJson,                  // 16 metaJson
    statusBayar,               // 17 statusBayar
    catatan,                   // 18 catatan
    cfg.DEFAULT_DIBUAT_OLEH,   // 19 dibuatOleh
    bankAccount                // 20 bankAccount
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _buildColMap(headers) {
  function find() {
    var aliases = Array.prototype.slice.call(arguments);
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i].toLowerCase());
      if (idx !== -1) return idx;
    }
    for (var j = 0; j < aliases.length; j++) {
      for (var k = 0; k < headers.length; k++) {
        if (headers[k].indexOf(aliases[j].toLowerCase()) !== -1) return k;
      }
    }
    return -1;
  }
  return {
    no_invoice:   find('no. invoice','no invoice','nomor invoice','invoice no','no_invoice'),
    nama_klien:   find('nama klien','klien','customer','nama customer','client'),
    tgl_invoice:  find('tgl. invoice','tgl invoice','tanggal invoice','tanggal','date','tgl'),
    nama_project: find('nama project','project','nama proyek','proyek','keterangan','description'),
    dpp:          find('dpp','nilai dpp','harga'),
    grand_total:  find('grand total','total','nilai total','amount'),
    paid:         find('paid','terbayar','bayar','pembayaran'),
    outstanding:  find('outstanding','sisa','piutang','belum bayar'),
    ppn:          find('ppn','tax','pajak','vat'),
    no_po:        find('no po','no. po','nopo','po number','no_po'),
    tgl_po:       find('tgl po','tgl. po','tanggal po'),
    no_wo:        find('no wo','no. wo','nowo','work order'),
    no_penawaran: find('no penawaran','no. penawaran','penawaran','quotation'),
    catatan:      find('catatan','note','remark'),
    bank_account: find('bank account','bank','rekening','account'),
  };
}

function _detectJenis(s) {
  var u = (s || '').toString().toUpperCase().trim();
  if (/^DP\b|^DOWN PAYMENT/.test(u))             return 'DP';
  if (/^FP\b|^FULL PAYMENT|^FULL PAY/.test(u))   return 'Pelunasan';
  if (/^PELUNASAN/.test(u))                       return 'Pelunasan';
  if (/^TERM\s*(II|2|III|3|IV|4)\b/.test(u))     return 'Termin';
  if (/^TERMIN/.test(u))                          return 'Termin';
  if (/^RETENTION|^RETENSI/.test(u))              return 'Termin';
  return 'Penuh';
}

function _parseDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return _pad(val.getDate()) + '/' + _pad(val.getMonth()+1) + '/' + val.getFullYear();
  }
  var s = val.toString().trim();
  var monthMap = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,mei:5,agu:8,okt:10,des:12};
  var m1 = s.match(/^(\d{1,2})[-\s\/]([a-zA-Z]+)[-\s\/](\d{2,4})$/);
  if (m1) {
    var mo = monthMap[m1[2].toLowerCase().substring(0,3)];
    var yr = m1[3].length===2 ? '20'+m1[3] : m1[3];
    if (mo) return _pad(+m1[1]) + '/' + _pad(mo) + '/' + yr;
  }
  var m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    var yr2 = m2[3].length===2 ? '20'+m2[3] : m2[3];
    return _pad(+m2[1]) + '/' + _pad(+m2[2]) + '/' + yr2;
  }
  return s;
}

function _str(row, idx) { return (idx===-1||idx===undefined) ? '' : (row[idx]||'').toString(); }
function _num(row, idx) {
  if (idx===-1||idx===undefined) return 0;
  var v = row[idx];
  if (typeof v==='number') return v;
  return parseFloat((v||'0').toString().replace(/[^\d.-]/g,''))||0;
}
function _pad(n) { return n<10?'0'+n:n.toString(); }
function _fmtRp(n) { return 'Rp '+Math.round(n||0).toLocaleString('id'); }
