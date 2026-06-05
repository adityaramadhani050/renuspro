/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Export PDF dinamis dari Template_Quotation (batch API).
 */

// ============================================================
// EXPORT PDF DINAMIS — VERSI REFACTORED (BATCH API CALLS)
// ============================================================
// PERUBAHAN UTAMA:
// 1. insertRows() sekali (bukan insertRowAfter() per baris)
// 2. setValues() batch 2D array (bukan setValue() per sel)
// 3. setBackgrounds() batch (bukan setBackground() per sel)
// 4. setFontColors() batch
// 5. setFontWeights() batch
// 6. setNumberFormats() batch
// 7. Hapus sleep() manual — flush() saja
// 8. Cache namedRanges (bukan loop scan berulang)
// ============================================================


function exportQuotationDariTemplate(item) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    const ss = getSpreadsheet();
    const sheetTemplate = ss.getSheetByName('Template_Quotation');
    if (!sheetTemplate) {
      return { success: false, message: 'Sheet "Template_Quotation" tidak ditemukan.' };
    }

    let tc = {};
    try { tc = JSON.parse(item.termConditions || '{}'); } catch(e) {}
    let kelompokList = [];
    try { kelompokList = JSON.parse(item.items || '[]'); } catch(e) {}

    const klienMap = _getKlienMap(ss);
    const klien = klienMap[item.klienId] || {};

    // Cache semua named ranges SEKALI — hindari loop scan berulang
    const namedRangeCache = _buildNamedRangeCache(ss);

    // 1. Bersihkan zona dinamis
    _bersihkanZonaDinamis(sheetTemplate, namedRangeCache);

    // 2. Isi header named ranges (pakai cache)
    _isiHeaderTemplate(namedRangeCache, item, klien, tc);

    // 3. Insert semua baris sekaligus (BATCH), returns baris pertama setelah item
    const rowSetelahItem = _sisipkanBarisItem(sheetTemplate, namedRangeCache, kelompokList);

    // 4. Insert footer
    _sisipkanFooter(sheetTemplate, rowSetelahItem, item, tc);

    SpreadsheetApp.flush();
    // HAPUS: Utilities.sleep(1500) — tidak diperlukan setelah flush()

    const pdfBase64 = _exportSheetToPdfBase64(ss, sheetTemplate);

    return {
      success: true,
      pdfBase64: pdfBase64,
      fileName: (item.id || '').replace(/\//g, '-') + '_' + 'Rev' + item.rev +'_' + item.namaProject + '_' + item.namaKlien + '.pdf'
    };

  } catch(e) {
    Logger.log('exportQuotationDariTemplate error: ' + e.toString());
    return { success: false, message: 'Gagal export PDF: ' + e.toString() };
  } finally {
    try {
      const ss = getSpreadsheet();
      const sh = ss.getSheetByName('Template_Quotation');
      if (sh) {
        const cache = _buildNamedRangeCache(ss);
        _bersihkanZonaDinamis(sh, cache);
      }
    } catch(e) { Logger.log('Finally cleanup error: ' + e); }
    lock.releaseLock();
  }
}


// ── Cache semua named ranges ke Map — O(1) lookup ────────────────────────
// ALASAN: ss.getNamedRanges() adalah panggilan API mahal.
// Kode lama memanggilnya berulang kali di setiap _setNamedRange() dan
// _getNamedRangeRow(). Dengan cache Map, kita scan SEKALI dan lookup O(1).
function _buildNamedRangeCache(ss) {
  const cache = new Map();
  ss.getNamedRanges().forEach(function(nr) {
    cache.set(nr.getName(), nr.getRange());
  });
  return cache;
}


// ── Bersihkan zona dinamis ────────────────────────────────────────────────
function _bersihkanZonaDinamis(sheet, namedRangeCache) {
  try {
    const anchorRange = namedRangeCache.get('tpl_item_zone_start');
    if (!anchorRange) {
      Logger.log('tpl_item_zone_start tidak ditemukan');
      return;
    }
    const anchorRow = anchorRange.getRow();
    const lastRow = sheet.getLastRow();
    const delCount = lastRow - anchorRow;
    if (delCount > 0) {
      sheet.deleteRows(anchorRow + 1, delCount);
    }
  } catch(e) {
    Logger.log('_bersihkanZonaDinamis error: ' + e);
  }
}


function _sisipkanBarisItem(sheet, namedRangeCache, kelompokList) {
  const anchorRange = namedRangeCache.get('tpl_item_zone_start');
  if (!anchorRange) {
    Logger.log('tpl_item_zone_start tidak ditemukan');
    return sheet.getLastRow() + 1;
  }

  const anchorRow = anchorRange.getRow();
  const NCOLS = 8;

  const COL_NO    = 0; // 0-indexed untuk array
  const COL_DESC  = 1;
  const COL_QTY   = 4;
  const COL_UNIT  = 5;
  const COL_HARGA = 6;
  const COL_TOTAL = 7;

  const C_GRP_BG  = '#d9d9d9';
  const C_ALT_BG  = '#f3f3f3';
  const C_WHITE   = '#ffffff';
  const TEXT_COLOR = '#000000';

  // ── Hitung total baris yang dibutuhkan ──
  let totalRows = 0;
  kelompokList.forEach(function(k) {
    totalRows += 1; // baris header kelompok
    totalRows += (k.subItems || []).length;
  });

  if (totalRows === 0) return anchorRow + 1;

  // ── Insert SEMUA baris sekaligus (1 panggilan API) ──
  sheet.insertRowsAfter(anchorRow, totalRows);

  // ── Salin format dari baris anchor ke seluruh zona (1 panggilan API) ──
  const fmtSource = sheet.getRange(anchorRow, 1, 1, NCOLS);
  fmtSource.copyTo(
    sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );

  // ── Alignment per kolom:
  //    No(0)=center | Desc(1)=left | col2-3=left | Qty(4)=center |
  //    Unit(5)=center | Price(6)=right | Amount(7)=right
  const ALIGN_ITEM = ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right'];
  const ALIGN_GRP  = ['center', 'left', 'left', 'left', 'left',   'left',   'right', 'right'];

  // ── Siapkan 2D arrays untuk batch write ──
  const values      = [];
  const backgrounds = [];
  const fontColors  = [];
  const fontWeights = [];
  const numFormats  = [];
  const alignments  = [];

  kelompokList.forEach(function(kelompok) {
    let globalNo = 1;
    // ── Baris header kelompok ──
    const grpVals = new Array(NCOLS).fill('');
    grpVals[COL_NO]    = kelompok.kelompok      || '';
    grpVals[COL_DESC]  = kelompok.namaKelompok  || '';
    grpVals[COL_HARGA] = '';
    grpVals[COL_TOTAL] = kelompok.subtotal      || 0;

    const grpBg  = new Array(NCOLS).fill(C_GRP_BG);
    const grpFg  = new Array(NCOLS).fill(TEXT_COLOR);
    const grpFw  = new Array(NCOLS).fill('bold');
    const grpFmt = new Array(NCOLS).fill('@');
    grpFmt[COL_TOTAL] = '#,##0';

    values.push(grpVals);
    backgrounds.push(grpBg);
    fontColors.push(grpFg);
    fontWeights.push(grpFw);
    numFormats.push(grpFmt);
    alignments.push(ALIGN_GRP.slice());

    // ── Sub-item ──
    (kelompok.subItems || []).forEach(function(si, idx) {
      const rowVals = new Array(NCOLS).fill('');
      rowVals[COL_NO]    = globalNo;
      rowVals[COL_DESC]  = si.deskripsi || '';
      rowVals[COL_QTY]   = si.qty       || 0;
      rowVals[COL_UNIT]  = si.unit      || '';
      rowVals[COL_HARGA] = si.harga     || 0;
      rowVals[COL_TOTAL] = si.total     || 0;

      const rowBg  = new Array(NCOLS).fill(C_ALT_BG);
      const rowFg  = new Array(NCOLS).fill(TEXT_COLOR);
      const rowFw  = new Array(NCOLS).fill('normal');
      const rowFmt = new Array(NCOLS).fill('@');
      rowFmt[COL_HARGA] = '#,##0';
      rowFmt[COL_TOTAL] = '#,##0';

      values.push(rowVals);
      backgrounds.push(rowBg);
      fontColors.push(rowFg);
      fontWeights.push(rowFw);
      numFormats.push(rowFmt);
      alignments.push(ALIGN_ITEM.slice());

      globalNo++;
    });
  });

  // ── Batch write ke seluruh zona (masing-masing 1 panggilan API) ──
  const zone = sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS);
  zone.setValues(values);
  zone.setBackgrounds(backgrounds);
  zone.setFontColors(fontColors);
  zone.setFontWeights(fontWeights);
  zone.setNumberFormats(numFormats);
  zone.setHorizontalAlignments(alignments); // ← satu panggilan untuk semua alignment

  // ── Merge sel header kelompok (unavoidable per-baris, tapi minimal) ──
  // Alignment sudah ditangani oleh setHorizontalAlignments() batch di atas.
  // Di sini hanya merge cell — tidak ada setHorizontalAlignment individual.
// ── Merge & tinggi baris ──
  let mergeRow = anchorRow + 1;
  kelompokList.forEach(function(kelompok) {

    // ── Header kelompok: merge col 2-6 (B-F) ──
    try {
      sheet.getRange(mergeRow, 2, 1, 5).merge();
      sheet.getRange(mergeRow, 2).setWrap(true).setVerticalAlignment('middle');
      sheet.setRowHeight(mergeRow, 22);
    } catch(e) {}

    // ── Sub-item: merge col 2-4 (B-C-D) untuk deskripsi ──
    const subItems = kelompok.subItems || [];
    subItems.forEach(function(si, idx) {
      const itemRow = mergeRow + 1 + idx;

      try {
        // Merge kolom 2,3,4 (B-C-D) untuk deskripsi
        sheet.getRange(itemRow, 2, 1, 3).merge();

        // Wrap & alignment deskripsi
        sheet.getRange(itemRow, 2)
          .setWrap(true)
          .setVerticalAlignment('middle')
          .setHorizontalAlignment('left');
      } catch(e) {}

      // Hitung tinggi baris berdasarkan panjang deskripsi
      // Lebar efektif 3 kolom (B-C-D) ≈ 200 karakter per baris
      const desc      = si.deskripsi || '';
      const lines     = Math.max(1, Math.ceil(desc.length / 55));
      const rowHeight = Math.max(20, lines * 16 + 6);
      try { sheet.setRowHeight(itemRow, rowHeight); } catch(e) {}
    });

    mergeRow += 1 + subItems.length;
  });

  return anchorRow + 1 + totalRows;
}


// ── Footer — tetap sequential tapi lebih ringkas ──────────────────────────
// Footer memiliki baris heterogen (merge berbeda, row height berbeda)
// sehingga sulit di-batch penuh. Namun kita kurangi panggilan redundan
// dengan menghindari set property yang sama berulang.
function _sisipkanFooter(sheet, startRow, item, tc) {
  const NCOLS = 8;
  let row = startRow;

  const netSub = (item.subtotal || 0) - (item.diskon || 0);

  const kalkulasi = [
    { label: 'Subtotal',
      value: item.subtotal  || 0, bold: false, red: false, skip: false },
    { label: 'Diskon',
      value: -(item.diskon  || 0), bold: false, red: true,
      skip: !(item.diskon > 0) },
    { label: 'PPN ' + _pajakPct(netSub, item.pajak) + '%',
      value: item.pajak     || 0, bold: false, red: false, skip: false },
    { label: 'GRAND TOTAL',
      value: item.grandTotal || 0, bold: true,  red: false, skip: false },
  ].filter(function(k) { return !k.skip; });

  // ── Kalkulasi (insert semua baris sekaligus) ──
  sheet.insertRowsAfter(row - 1, kalkulasi.length);

  kalkulasi.forEach(function(k) {
    sheet.setRowHeight(row, 22)
    const labelRange = sheet.getRange(row, 7);
    const valueRange = sheet.getRange(row, 8);
    const leftRange  = sheet.getRange(row, 1, 1, 6);

    leftRange.setBackground('#ffffff');

    labelRange
      .setValue(k.label)
      .setHorizontalAlignment('right')
      .setFontWeight(k.bold ? 'bold' : 'normal')
      .setFontColor(k.red ? '#cc0000' : (k.bold ? '#1a3a8f' : null))
      .setBorder(true, true, true, true, false, false,
                 '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

    valueRange
      .setValue(k.value)
      .setNumberFormat('#,##0')
      .setFontWeight(k.bold ? 'bold' : 'normal')
      .setFontColor(k.red ? '#cc0000' : (k.bold ? '#1a3a8f' : null))
      .setHorizontalAlignment('right')
      .setBorder(true, true, true, true, false, false,
                 '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    row++;
  });

  // ── Catatan ──
  const catatan = tc.catatan || '';
  if (catatan) {
    sheet.insertRowsAfter(row - 1, 2);

    sheet.getRange(row, 1, 1, 5)
      .merge()
      .setValue('Catatan:\n' + catatan)
      .setBackground('#fffce6')
      .setFontColor('#665500')
      .setWrap(true)
      .setVerticalAlignment('top')
      .setHorizontalAlignment('left');
    sheet.getRange(row, 7, 1, 2).setBackground('#ffffff');
    sheet.setRowHeight(row, Math.max(48, Math.ceil(catatan.length / 90) * 16 + 28));
    row++;
  }

  sheet.getRange(row, 1, 1, 8).merge().setBackground('#ffffff');
  row++;

  // ── T&C header ──
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, NCOLS)
    .merge()
    .setValue('Term & Condition:')
    .setBackground('#d9d9d9')
    .setFontColor('#000000')
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  row++;

  // ── Baris T&C — insert semua sekaligus ──
  const tcRows = [
    { l1: 'Status Material', v1: ': ' + (tc.material_status || '-'), l2: 'Down Payment',  v2: ': ' + (tc.dp_status     || '-') },
    { l1: 'Term Payment',    v1: ': ' + (tc.term_pay        || '-'), l2: 'Final Payment', v2: ': ' + (tc.final_pay     || '-') },
    { l1: 'Delivery Time',   v1: ': ' + (tc.delivery_time   || '-'), l2: 'Delivery Cond', v2: ': ' + (tc.delivery_cond || '-') },
    { l1: 'Warranty',        v1: ': ' + (tc.warranty        || '-'), l2: 'Bonus',         v2: ': ' + (tc.bonus         || '-') },
  ];

  sheet.insertRowsAfter(row - 1, tcRows.length);
  tcRows.forEach(function(r, idx) {
    sheet.getRange(row, 1, 1, 8)
      .setBackground(idx % 2 === 0 ? '#efefef' : '#f3f3f3')
      .setFontColor('#000000');
    sheet.setRowHeight(row, 24);

    sheet.getRange(row, 1).setValue(r.l1).setFontWeight('bold').setFontColor('#000000').setWrap(false);
    sheet.getRange(row, 3).setValue(r.v1).setFontWeight('normal').setWrap(false);
    sheet.getRange(row, 5).setValue(r.l2).setFontWeight('bold').setFontColor('#000000').setWrap(false);
    sheet.getRange(row, 7).setValue(r.v2).setFontWeight('normal').setWrap(false);

    row++;
  });

  // ── Tanda tangan ──
  sheet.insertRowsAfter(row - 1, 3);
  sheet.getRange(row, 1, 1, 8).merge().setBackground('#ffffff');
  row++;

  sheet.getRange(row, 1, 1, 7)
    .merge()
    .setValue('If you have any questions concerning this quotation, contact Name, Phone Number, E-mail')
    .setFontColor('#000000').setFontWeight('normal').setBackground('#ffffff');
  sheet.getRange(row, 8)
    .setValue('Best Regard,')
    .setWrap(true).setHorizontalAlignment('right').setVerticalAlignment('top')
    .setFontColor('#000000').setFontWeight('normal').setBackground('#ffffff');
  row++;

  sheet.getRange(row, 1, 1, 7)
    .merge()
    .setValue('THANK YOU FOR YOUR BUSINESS!')
    .setBackground('#ffffff')
    .setFontWeight('bold').setFontColor('#000000').setWrap(false);
  sheet.getRange(row, 8)
    .setValue(item.dibuatOleh || 'Sales Executive')
    .setWrap(true).setHorizontalAlignment('right').setVerticalAlignment('top')
    .setFontColor('#000000').setFontWeight('bold').setBackground('#ffffff');
}


// ── Helpers ───────────────────────────────────────────────────────────────

function _getKlienMap(ss) {
  const map = {};
  try {
    const sheet = ss.getSheetByName('Master_Klien');
    if (!sheet) return map;
    // getValues() SEKALI untuk seluruh data (bukan getRange per baris)
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) map[data[i][0].toString()] = {
        nama: data[i][1], perusahaan: data[i][2],
        alamat: data[i][3], kontak: data[i][4]
      };
    }
  } catch(e) {}
  return map;
}

function _isiHeaderTemplate(namedRangeCache, item, klien, tc) {
  // Gunakan cache Map — tidak perlu loop scan ss.getNamedRanges() berulang
  const set = function(name, val) {
    const range = namedRangeCache.get(name);
    if (range) {
      range.setValue(val);
    } else {
      Logger.log('Named range tidak ditemukan: ' + name);
    }
  };
  set('tpl_no_penawaran',     item.id              || '');
  set('tpl_tanggal',          item.tanggal          || '');
  set('tpl_valid_until',      item.validUntil       || '');
  set('tpl_rev',              item.rev    || '0');
  set('tpl_dibuat_oleh',      item.dibuatOleh       || '');
  set('tpl_nama_project',     item.namaProject      || '');
  set('tpl_klien_nama',       klien.nama            || item.namaKlien || '');
  set('tpl_klien_perusahaan', klien.perusahaan      || '');
  set('tpl_klien_alamat',     klien.alamat          || '');
  set('tpl_klien_kontak',     klien.kontak          || '');
}

function _pajakPct(netSub, pajak) {
  if (!netSub || !pajak) return 11;
  return Math.round((pajak / netSub) * 100);
}

function _exportSheetToPdfBase64(ss, sheet) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId()
    + '/export?format=pdf&size=A4&portrait=true&fitw=true'
    + '&gridlines=false&printtitle=false&sheetnames=false'
    + '&pagenumbers=false&attachment=true'
    + '&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5'
    + '&gid=' + sheet.getSheetId();

  const resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('HTTP ' + resp.getResponseCode() + ' saat export PDF');
  }
  return Utilities.base64Encode(resp.getBlob().getBytes());
}
