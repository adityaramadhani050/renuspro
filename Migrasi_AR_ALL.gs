/**
 * Migrasi_AR_ALL.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrasi data dari sheet "AR ALL" ke sheet "Invoice_Main" RenusPro.
 *
 * CARA PAKAI:
 *  1. Buka Google Apps Script project RenusPro
 *  2. Jalankan fungsi  migrasiARAll()  secara manual
 *  3. Pertama kali jalankan dengan  DRY_RUN = true  untuk preview di Log
 *  4. Jika hasil preview sudah benar, ubah  DRY_RUN = false  lalu jalankan lagi
 *
 * KONFIGURASI — sesuaikan 3 baris di bawah sebelum menjalankan:
 */

var MIGRASI_CONFIG = {
  SOURCE_SPREADSHEET_ID: '13Ao79ds4tt-F1RH9JdOR0k2-it1ge_RP', // ID spreadsheet AR ALL
  SOURCE_SHEET_NAME:     'AR ALL',
  TARGET_SHEET_NAME:     'Invoice_Main',
  DRY_RUN:               true,   // true = hanya preview log, false = benar-benar tulis
  SKIP_EXISTING:         true,   // true = lewati jika No Invoice sudah ada di Invoice_Main
  DEFAULT_BANK_ACCOUNT:  'Bank BSI 7336418717\nA/N. PT. Renus Global Indonesia',
  DEFAULT_DIBUAT_OLEH:   'Migrasi'
};

// ─────────────────────────────────────────────────────────────────────────────

function migrasiARAll() {
  var cfg = MIGRASI_CONFIG;
  Logger.log('═══════════════════════════════════════════');
  Logger.log('MIGRASI AR ALL → Invoice_Main');
  Logger.log('Mode: ' + (cfg.DRY_RUN ? 'DRY RUN (tidak ada yang ditulis)' : 'LIVE (data akan ditulis)'));
  Logger.log('═══════════════════════════════════════════');

  // ── Buka source spreadsheet ──────────────────────────────────────────────
  var srcSS;
  try {
    srcSS = SpreadsheetApp.openById(cfg.SOURCE_SPREADSHEET_ID);
  } catch(e) {
    Logger.log('ERROR: Tidak bisa buka spreadsheet source. Pastikan script punya akses.');
    Logger.log(e.toString());
    return;
  }

  var srcSheet = srcSS.getSheetByName(cfg.SOURCE_SHEET_NAME);
  if (!srcSheet) {
    Logger.log('ERROR: Sheet "' + cfg.SOURCE_SHEET_NAME + '" tidak ditemukan di spreadsheet source.');
    return;
  }

  // ── Buka target sheet Invoice_Main ───────────────────────────────────────
  var tgtSS    = getSpreadsheet(); // fungsi RenusPro
  var tgtSheet = tgtSS.getSheetByName(cfg.TARGET_SHEET_NAME);
  if (!tgtSheet) {
    Logger.log('ERROR: Sheet "' + cfg.TARGET_SHEET_NAME + '" tidak ditemukan di spreadsheet RenusPro.');
    return;
  }

  // ── Baca semua data source ────────────────────────────────────────────────
  var srcData = srcSheet.getDataRange().getValues();
  if (srcData.length < 2) {
    Logger.log('ERROR: Sheet source kosong atau hanya berisi header.');
    return;
  }

  // ── Parse header AR ALL (baris pertama) ──────────────────────────────────
  var headers = srcData[0].map(function(h) { return (h || '').toString().toLowerCase().trim(); });
  var col      = _buildColMap(headers);

  Logger.log('Kolom terdeteksi di AR ALL:');
  Object.keys(col).forEach(function(k) { Logger.log('  ' + k + ' → kolom ' + (col[k] + 1) + ' (' + headers[col[k]] + ')'); });

  // Validasi kolom wajib
  var wajib = ['no_invoice', 'nama_klien', 'tgl_invoice', 'nama_project', 'dpp', 'grand_total'];
  var missing = wajib.filter(function(k) { return col[k] === -1; });
  if (missing.length > 0) {
    Logger.log('ERROR: Kolom wajib tidak ditemukan: ' + missing.join(', '));
    Logger.log('Header yang terdeteksi: ' + headers.join(' | '));
    return;
  }

  // ── Ambil No Invoice yang sudah ada di Invoice_Main (untuk skip duplicate) ─
  var existingIds = {};
  if (cfg.SKIP_EXISTING) {
    var tgtData = tgtSheet.getDataRange().getValues();
    for (var i = 1; i < tgtData.length; i++) {
      var existId = (tgtData[i][0] || '').toString().trim();
      if (existId) existingIds[existId] = true;
    }
    Logger.log('Invoice sudah ada di Invoice_Main: ' + Object.keys(existingIds).length + ' data');
  }

  // ── Proses tiap baris ─────────────────────────────────────────────────────
  var rows        = [];
  var skipped     = 0;
  var errors      = 0;
  var duplicates  = 0;

  for (var r = 1; r < srcData.length; r++) {
    var row = srcData[r];

    var noInvoice = _str(row, col.no_invoice).trim();
    if (!noInvoice) { skipped++; continue; } // baris kosong

    // Skip duplicate
    if (cfg.SKIP_EXISTING && existingIds[noInvoice]) {
      Logger.log('SKIP (sudah ada): ' + noInvoice);
      duplicates++;
      continue;
    }

    try {
      var mapped = _mapRow(row, col, cfg);
      rows.push(mapped);
      Logger.log('OK [' + r + ']: ' + noInvoice + ' | ' + mapped[9] + ' | ' + mapped[3] + ' | Total: ' + _fmtRp(mapped[14]));
    } catch(e) {
      Logger.log('ERROR baris ' + (r + 1) + ' (' + noInvoice + '): ' + e.toString());
      errors++;
    }
  }

  Logger.log('─────────────────────────────────────────────');
  Logger.log('Siap ditulis  : ' + rows.length + ' baris');
  Logger.log('Dilewati (kosong): ' + skipped);
  Logger.log('Dilewati (duplikat): ' + duplicates);
  Logger.log('Error        : ' + errors);

  // ── Tulis ke Invoice_Main ─────────────────────────────────────────────────
  if (!cfg.DRY_RUN && rows.length > 0) {
    tgtSheet.getRange(tgtSheet.getLastRow() + 1, 1, rows.length, 20).setValues(rows);
    SpreadsheetApp.flush();
    Logger.log('✅ ' + rows.length + ' baris berhasil ditulis ke Invoice_Main.');
  } else if (cfg.DRY_RUN) {
    Logger.log('(DRY RUN — tidak ada yang ditulis. Ubah DRY_RUN = false untuk menulis sungguhan.)');
  }

  Logger.log('═══════════════════════════════════════════');
}

// ── Mapping header → index kolom ─────────────────────────────────────────────
function _buildColMap(headers) {
  function find() {
    var aliases = Array.prototype.slice.call(arguments);
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i].toLowerCase());
      if (idx !== -1) return idx;
    }
    // partial match
    for (var j = 0; j < aliases.length; j++) {
      for (var k = 0; k < headers.length; k++) {
        if (headers[k].indexOf(aliases[j].toLowerCase()) !== -1) return k;
      }
    }
    return -1;
  }

  return {
    no_invoice:   find('no. invoice', 'no invoice', 'nomor invoice', 'invoice no', 'no_invoice'),
    nama_klien:   find('nama klien', 'klien', 'customer', 'nama customer', 'client'),
    tgl_invoice:  find('tgl. invoice', 'tgl invoice', 'tanggal invoice', 'tanggal', 'date', 'tgl'),
    nama_project: find('nama project', 'project', 'nama proyek', 'proyek', 'keterangan', 'description'),
    dpp:          find('dpp', 'nilai dpp', 'harga'),
    grand_total:  find('grand total', 'total', 'nilai total', 'amount'),
    paid:         find('paid', 'terbayar', 'bayar', 'pembayaran'),
    outstanding:  find('outstanding', 'sisa', 'piutang', 'belum bayar'),
    ppn:          find('ppn', 'tax', 'pajak', 'vat'),
    no_po:        find('no po', 'no. po', 'nopo', 'po number', 'no_po'),
    tgl_po:       find('tgl po', 'tgl. po', 'tanggal po'),
    no_wo:        find('no wo', 'no. wo', 'nowo', 'work order'),
    no_penawaran: find('no penawaran', 'no. penawaran', 'penawaran', 'quotation'),
    catatan:      find('catatan', 'note', 'keterangan', 'remark'),
    bank_account: find('bank account', 'bank', 'rekening', 'account'),
  };
}

// ── Map satu baris AR ALL → 20 kolom Invoice_Main ────────────────────────────
function _mapRow(row, col, cfg) {
  var noInvoice   = _str(row, col.no_invoice).trim();
  var namaKlien   = _str(row, col.nama_klien).trim();
  var tglInvoice  = _parseDate(row[col.tgl_invoice]);
  var namaProject = _str(row, col.nama_project).trim();
  var dpp         = _num(row, col.dpp);
  var grandTotal  = _num(row, col.grand_total);
  var paid        = col.paid !== -1    ? _num(row, col.paid) : 0;
  var outstanding = col.outstanding !== -1 ? _num(row, col.outstanding) : (grandTotal - paid);

  // Hitung PPN
  var ppnNominal  = col.ppn !== -1 ? _num(row, col.ppn) : Math.round(grandTotal - dpp);
  var ppnPersen   = (dpp > 0 && ppnNominal > 0) ? Math.round(ppnNominal / dpp * 100) : 0;
  // Normalize: jika sekitar 11% → 11, jika 0 → 0, lainnya tetap
  if (ppnPersen >= 9 && ppnPersen <= 12) ppnPersen = 11;
  else if (ppnPersen < 1) ppnPersen = 0;

  // Status bayar
  var statusBayar = (outstanding <= 0 || outstanding < 1) ? 'Lunas' : 'Belum Lunas';

  // Jenis invoice dari nama project
  var jenis = _detectJenis(namaProject);

  // Field opsional
  var noPO        = col.no_po !== -1        ? _str(row, col.no_po).trim()        : '';
  var tglPO       = col.tgl_po !== -1       ? _parseDate(row[col.tgl_po])        : '';
  var noWO        = col.no_wo !== -1        ? _str(row, col.no_wo).trim()        : '';
  var noPenawaran = col.no_penawaran !== -1 ? _str(row, col.no_penawaran).trim() : '';
  var catatan     = col.catatan !== -1      ? _str(row, col.catatan).trim()      : '';
  var bankAccount = col.bank_account !== -1 ? _str(row, col.bank_account).trim() : cfg.DEFAULT_BANK_ACCOUNT;
  if (!bankAccount) bankAccount = cfg.DEFAULT_BANK_ACCOUNT;

  var metaJson = JSON.stringify({
    scope: [{ kelompok: namaProject, items: [] }],
    nilaiKontrak: grandTotal,
    inputMode: 'nominal',
    migrasi: true
  });

  // ── 20 kolom Invoice_Main (sesuai urutan di Invoice.gs) ──────────────────
  //  1 id              2 noWO          3 noPenawaran   4 tanggal
  //  5 jenis           6 persen        7 noPO          8 tglPO
  //  9 klienId        10 namaKlien    11 namaProject   12 dpp
  // 13 ppnPersen      14 ppnNominal   15 total         16 metaJson
  // 17 statusBayar    18 catatan      19 dibuatOleh    20 bankAccount
  return [
    noInvoice,                  //  1 id
    noWO,                       //  2 noWO
    noPenawaran,                //  3 noPenawaran
    tglInvoice,                 //  4 tanggal
    jenis,                      //  5 jenis
    0,                          //  6 persen (0 = nominal)
    noPO,                       //  7 noPO
    tglPO,                      //  8 tglPO
    '',                         //  9 klienId (tidak ada di source)
    namaKlien,                  // 10 namaKlien
    namaProject,                // 11 namaProject
    dpp,                        // 12 dpp
    ppnPersen,                  // 13 ppnPersen
    ppnNominal,                 // 14 ppnNominal
    grandTotal,                 // 15 total
    metaJson,                   // 16 metaJson
    statusBayar,                // 17 statusBayar
    catatan,                    // 18 catatan
    cfg.DEFAULT_DIBUAT_OLEH,    // 19 dibuatOleh
    bankAccount                 // 20 bankAccount
  ];
}

// ── Deteksi jenis invoice dari nama project ───────────────────────────────────
function _detectJenis(namaProject) {
  var s = (namaProject || '').toString().toUpperCase().trim();
  if (/^DP\b|^DOWN PAYMENT/.test(s))               return 'DP';
  if (/^FP\b|^FULL PAYMENT|^FULL PAY/.test(s))     return 'Pelunasan';
  if (/^PELUNASAN/.test(s))                         return 'Pelunasan';
  if (/^TERM\s*(II|2|III|3|IV|4)\b/.test(s))       return 'Termin';
  if (/^TERMIN/.test(s))                            return 'Termin';
  if (/^RETENTION|^RETENSI/.test(s))                return 'Termin';
  if (/^JASA\b/.test(s))                            return 'Penuh';
  return 'Penuh'; // default
}

// ── Parse tanggal → format dd/MM/yyyy ────────────────────────────────────────
function _parseDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var d = val.getDate(), m = val.getMonth() + 1, y = val.getFullYear();
    return _pad(d) + '/' + _pad(m) + '/' + y;
  }
  var s = val.toString().trim();
  // Coba parse "1-Jan-26", "1 Jan 2026", "01/01/2026", dll
  var monthMap = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                   mei:5,agu:8,okt:10,des:12 };
  var m1 = s.match(/^(\d{1,2})[-\s\/]([a-zA-Z]+)[-\s\/](\d{2,4})$/);
  if (m1) {
    var mo = monthMap[m1[2].toLowerCase().substring(0,3)];
    var yr = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    if (mo) return _pad(parseInt(m1[1])) + '/' + _pad(mo) + '/' + yr;
  }
  var m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    var yr2 = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return _pad(parseInt(m2[1])) + '/' + _pad(parseInt(m2[2])) + '/' + yr2;
  }
  return s;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _str(row, idx) {
  if (idx === -1 || idx === undefined) return '';
  return (row[idx] || '').toString();
}

function _num(row, idx) {
  if (idx === -1 || idx === undefined) return 0;
  var v = row[idx];
  if (typeof v === 'number') return v;
  return parseFloat((v || '0').toString().replace(/[^\d.-]/g, '')) || 0;
}

function _pad(n) { return n < 10 ? '0' + n : n.toString(); }

function _fmtRp(n) { return 'Rp ' + Math.round(n || 0).toLocaleString('id'); }
