/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Export PDF Purchase Order dari Template_PO (batch API).
 *
 * SETUP (jalankan sekali dari Apps Script editor):
 *   initPOTemplate()
 *
 * Named ranges yang dibuat oleh initPOTemplate():
 *   tpl_po_no, tpl_po_tanggal, tpl_po_quot_no, tpl_po_quot_tgl,
 *   tpl_po_supplier_nama, tpl_po_supplier_alamat, tpl_po_supplier_kontak,
 *   tpl_po_nama_order, tpl_po_no_wo,
 *   tpl_po_item_zona_start
 *
 * Memakai ulang helper dari PdfExport.gs:
 *   _buildNamedRangeCache(), _exportSheetToPdfBase64()
 */

// ── Export utama ──────────────────────────────────────────────────────────────

function exportPODariTemplate(noPO) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    var ss    = getSpreadsheet();
    var sheet = ss.getSheetByName('Template_PO');
    if (!sheet) {
      return { success: false, message: 'Sheet "Template_PO" tidak ditemukan. Jalankan initPOTemplate() dari Apps Script editor terlebih dahulu.' };
    }

    var detail = getPODetail(noPO);
    if (!detail.success) return { success: false, message: detail.message };

    var po       = detail.po;
    var items    = detail.items || [];
    var supplier = _getPOSupplierById(ss, po.idSupplier);

    var tc = {};
    try { tc = JSON.parse(po.termConditions || '{}'); } catch(e) {}

    var tcOptions = _getPOTCOptionsForPDF();
    var cache = _buildNamedRangeCache(ss);

    if (!cache.has('tpl_po_item_zona_start')) {
      return { success: false, message: 'Named range "tpl_po_item_zona_start" tidak ditemukan. Jalankan initPOTemplate() lagi.' };
    }

    _bersihkanZonaPO(sheet, cache);
    _isiHeaderPO(cache, po, supplier);

    var rowSetelahItem = _sisipkanBarisItemPO(sheet, cache, items);
    _sisipkanFooterPO(sheet, rowSetelahItem, po, tc, tcOptions);

    SpreadsheetApp.flush();

    var pdfBase64 = _exportSheetToPdfBase64(ss, sheet);
    var safe = function(s) { return (s || '').toString().replace(/\//g, '-'); };

    return {
      success:   true,
      pdfBase64: pdfBase64,
      fileName:  'PO_' + safe(po.noPO) + '.pdf'
    };

  } catch(e) {
    Logger.log('exportPODariTemplate error: ' + e.toString());
    return { success: false, message: 'Gagal export PDF PO: ' + e.toString() };
  } finally {
    try {
      var ss2    = getSpreadsheet();
      var sheet2 = ss2.getSheetByName('Template_PO');
      if (sheet2) _bersihkanZonaPO(sheet2, _buildNamedRangeCache(ss2));
    } catch(e) { Logger.log('POPdf finally cleanup: ' + e); }
    lock.releaseLock();
  }
}


// ── Init template (jalankan sekali) ───────────────────────────────────────────

function initPOTemplate() {
  var ss = getSpreadsheet();

  // Hapus sheet lama jika ada
  var existing = ss.getSheetByName('Template_PO');
  if (existing) ss.deleteSheet(existing);

  var sheet = ss.insertSheet('Template_PO');

  // Hapus named ranges lama yang bertabrakan
  var poNRNames = [
    'tpl_po_no', 'tpl_po_tanggal', 'tpl_po_quot_no', 'tpl_po_quot_tgl',
    'tpl_po_supplier_nama', 'tpl_po_supplier_alamat', 'tpl_po_supplier_kontak',
    'tpl_po_nama_order', 'tpl_po_no_wo', 'tpl_po_item_zona_start'
  ];
  ss.getNamedRanges().forEach(function(nr) {
    if (poNRNames.indexOf(nr.getName()) !== -1) nr.remove();
  });

  // ── Column widths (A=1 .. H=8) ──
  sheet.setColumnWidth(1, 42);   // A: No.
  sheet.setColumnWidth(2, 175);  // B: Details (merge B-D)
  sheet.setColumnWidth(3, 55);   // C
  sheet.setColumnWidth(4, 55);   // D
  sheet.setColumnWidth(5, 60);   // E: Unit
  sheet.setColumnWidth(6, 50);   // F: Qty
  sheet.setColumnWidth(7, 92);   // G: Unit Price
  sheet.setColumnWidth(8, 92);   // H: Total

  // ── Row heights ──
  var rowHeights = [40,22,18,18,18,8,22,24,24,24,8,22,6];
  rowHeights.forEach(function(h, idx) { sheet.setRowHeight(idx + 1, h); });

  var BLUE      = '#003399';
  var WHITE     = '#ffffff';
  var GRAY_BG   = '#f0f0f0';
  var TEXT_DARK = '#222222';
  var TEXT_MED  = '#444444';
  var TEXT_BLUE = '#003399';

  // ═══════════════════════════════════════════════════════════
  // Row 1: Logo (A1:C1) + PO Title (F1:H1)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A1:C1').merge()
    .setBackground(BLUE).setFontColor(WHITE)
    .setFontWeight('bold').setFontSize(18)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setValue('RENUS');
  sheet.getRange('D1:E1').merge().setBackground(WHITE);
  sheet.getRange('F1:H1').merge()
    .setFontColor('#888888').setFontWeight('bold').setFontSize(22)
    .setHorizontalAlignment('right').setVerticalAlignment('middle')
    .setValue('PURCHASE ORDER');

  // ═══════════════════════════════════════════════════════════
  // Row 2: Company name (A2:E2) + PO Date label+value (F2:H2)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A2:E2').merge()
    .setFontColor(BLUE).setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle')
    .setValue('PT. RENUS GLOBAL INDONESIA');
  sheet.getRange('F2').setValue('PO Date')
    .setFontWeight('bold').setFontSize(8).setFontColor(TEXT_MED)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.getRange('G2').setValue(':').setFontSize(8)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('H2').setFontSize(8).setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ═══════════════════════════════════════════════════════════
  // Row 3: Address (A3:E3) + PO No (F3:H3)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A3:E3').merge()
    .setFontSize(7.5).setFontColor(TEXT_MED)
    .setValue('Penjaringan Asri X PS1 H/5, Kel. Penjaringan Sari, Kec. Rungkut, Kota Surabaya 60293')
    .setWrap(true).setVerticalAlignment('middle');
  sheet.getRange('F3').setValue('PO No.')
    .setFontWeight('bold').setFontSize(8).setFontColor(TEXT_MED)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.getRange('G3').setValue(':').setFontSize(8)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('H3').setFontSize(8).setFontWeight('bold')
    .setFontColor(BLUE).setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ═══════════════════════════════════════════════════════════
  // Row 4: Contact email (A4:E4) + Quot No (F4:H4)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A4:E4').merge()
    .setFontSize(7.5).setFontColor(BLUE)
    .setValue('Email: admin@renergynusantara | renergynusantara@gmail.com')
    .setVerticalAlignment('middle');
  sheet.getRange('F4').setValue('Quot. No.')
    .setFontWeight('bold').setFontSize(8).setFontColor(TEXT_MED)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.getRange('G4').setValue(':').setFontSize(8)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('H4').setFontSize(8).setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ═══════════════════════════════════════════════════════════
  // Row 5: Phone (A5:E5) + Quot Date (F5:H5)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A5:E5').merge()
    .setFontSize(7.5).setFontColor(TEXT_MED)
    .setValue('Telp: 0895-6059-84308 | 0813-5820-8282')
    .setVerticalAlignment('middle');
  sheet.getRange('F5').setValue('Quot. Date')
    .setFontWeight('bold').setFontSize(8).setFontColor(TEXT_MED)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  sheet.getRange('G5').setValue(':').setFontSize(8)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.getRange('H5').setFontSize(8).setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');

  // ═══════════════════════════════════════════════════════════
  // Row 6: Separator (blue line)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A6:H6').merge().setBackground(BLUE);

  // ═══════════════════════════════════════════════════════════
  // Row 7: SUPPLIER INFORMATION header
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A7:H7').merge()
    .setBackground(BLUE).setFontColor(WHITE)
    .setFontWeight('bold').setFontSize(9)
    .setHorizontalAlignment('left').setVerticalAlignment('middle')
    .setValue('   SUPPLIER INFORMATION');

  // ═══════════════════════════════════════════════════════════
  // Rows 8-10: Supplier details (left A-D) + Order info (right E-H)
  // ═══════════════════════════════════════════════════════════
  var _lb = function(range, label) {
    range.setValue(label)
      .setFontWeight('bold').setFontSize(8).setFontColor('#555555')
      .setVerticalAlignment('middle').setBackground(GRAY_BG);
  };
  var _vl = function(range) {
    range.setFontWeight('normal').setFontSize(8).setFontColor(TEXT_DARK)
      .setVerticalAlignment('middle').setBackground(WHITE).setWrap(true);
  };

  // Row 8: Supplier name | Nama Order
  _lb(sheet.getRange('A8'), 'Supplier');
  _vl(sheet.getRange('B8:D8').merge());
  _lb(sheet.getRange('E8'), 'Nama Order');
  _vl(sheet.getRange('F8:H8').merge());

  // Row 9: Alamat | No. WO
  _lb(sheet.getRange('A9'), 'Alamat');
  _vl(sheet.getRange('B9:D9').merge());
  _lb(sheet.getRange('E9'), 'No. WO');
  _vl(sheet.getRange('F9:H9').merge());

  // Row 10: Kontak | (empty right)
  _lb(sheet.getRange('A10'), 'Kontak');
  _vl(sheet.getRange('B10:D10').merge());
  sheet.getRange('E10:H10').merge().setBackground(WHITE);

  // ═══════════════════════════════════════════════════════════
  // Row 11: Separator
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A11:H11').merge()
    .setBackground(BLUE).setValue('');

  // ═══════════════════════════════════════════════════════════
  // Row 12: Items table header
  // ═══════════════════════════════════════════════════════════
  var _th = function(range, text, align) {
    range.setValue(text)
      .setBackground(BLUE).setFontColor(WHITE)
      .setFontWeight('bold').setFontSize(8)
      .setHorizontalAlignment(align || 'center').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false, WHITE, SpreadsheetApp.BorderStyle.SOLID);
  };
  _th(sheet.getRange('A12'), 'No.', 'center');
  _th(sheet.getRange('B12:D12').merge(), 'Details', 'left');
  _th(sheet.getRange('E12'), 'Unit', 'center');
  _th(sheet.getRange('F12'), 'Qty', 'center');
  _th(sheet.getRange('G12'), 'Unit Price (IDR)', 'center');
  _th(sheet.getRange('H12'), 'Total (IDR)', 'center');

  // ═══════════════════════════════════════════════════════════
  // Row 13: Anchor row (tpl_po_item_zona_start)
  // ═══════════════════════════════════════════════════════════
  sheet.getRange('A13:H13')
    .setBackground(WHITE)
    .setBorder(false,true,false,true,false,false, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);

  // ═══════════════════════════════════════════════════════════
  // Named ranges
  // ═══════════════════════════════════════════════════════════
  var nrDefs = [
    { name: 'tpl_po_tanggal',         range: sheet.getRange('H2') },
    { name: 'tpl_po_no',              range: sheet.getRange('H3') },
    { name: 'tpl_po_quot_no',         range: sheet.getRange('H4') },
    { name: 'tpl_po_quot_tgl',        range: sheet.getRange('H5') },
    { name: 'tpl_po_supplier_nama',   range: sheet.getRange('B8') },
    { name: 'tpl_po_supplier_alamat', range: sheet.getRange('B9') },
    { name: 'tpl_po_supplier_kontak', range: sheet.getRange('B10') },
    { name: 'tpl_po_nama_order',      range: sheet.getRange('F8') },
    { name: 'tpl_po_no_wo',           range: sheet.getRange('F9') },
    { name: 'tpl_po_item_zona_start', range: sheet.getRange('A13') }
  ];
  nrDefs.forEach(function(d) { ss.setNamedRange(d.name, d.range); });

  // Move template sheet to last position
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());

  SpreadsheetApp.flush();
  return { success: true, message: 'Template_PO berhasil dibuat dengan ' + nrDefs.length + ' named ranges.' };
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function _getPOSupplierById(ss, idSupplier) {
  try {
    var sheet = ss.getSheetByName('Supplier');
    if (!sheet || !idSupplier) return {};
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === idSupplier.toString()) {
        return {
          nama:    data[i][1] ? data[i][1].toString() : '',
          pic:     data[i][2] ? data[i][2].toString() : '',
          telepon: data[i][3] ? data[i][3].toString() : '',
          email:   data[i][4] ? data[i][4].toString() : '',
          alamat:  data[i][5] ? data[i][5].toString() : ''
        };
      }
    }
  } catch(e) { Logger.log('_getPOSupplierById error: ' + e); }
  return {};
}

function _bersihkanZonaPO(sheet, cache) {
  try {
    var anchor = cache.get('tpl_po_item_zona_start');
    if (!anchor) { Logger.log('tpl_po_item_zona_start tidak ditemukan'); return; }
    var anchorRow = anchor.getRow();
    var lastRow   = sheet.getLastRow();
    var delCount  = lastRow - anchorRow;
    if (delCount > 0) sheet.deleteRows(anchorRow + 1, delCount);
  } catch(e) { Logger.log('_bersihkanZonaPO error: ' + e); }
}

function _isiHeaderPO(cache, po, supplier) {
  var set = function(name, value) {
    var r = cache.get(name);
    if (r) r.setValue(value !== null && value !== undefined ? value : '');
    // tidak log jika tidak ditemukan — named range opsional
  };
  set('tpl_po_no',              po.noPO        || '');
  set('tpl_po_tanggal',         po.tanggal     || '');
  set('tpl_po_quot_no',         po.quotNo      || '');
  set('tpl_po_quot_tgl',        po.quotTanggal || '');
  set('tpl_po_supplier_nama',   supplier.nama  || po.namaSupplier || '');
  set('tpl_po_supplier_alamat', supplier.alamat || '');
  set('tpl_po_supplier_kontak', supplier.telepon || '');  // nomor telepon saja
  set('tpl_po_supplier_email',  supplier.email   || '');  // email terpisah
  // tpl_po_no_wo & tpl_po_nama_order tidak ditampilkan di PDF (hanya kebutuhan internal)
}

function _sisipkanBarisItemPO(sheet, cache, items) {
  var anchor = cache.get('tpl_po_item_zona_start');
  if (!anchor) return sheet.getLastRow() + 1;

  var anchorRow = anchor.getRow();
  var START_COL = 2;   // mulai dari kolom B
  var NCOLS     = 6;   // B=No. | C=Details | D=Unit | E=Qty | F=Unit Price | G=Total

  if (!items || items.length === 0) return anchorRow + 1;

  var totalRows = items.length;

  // Anchor row dipakai langsung sebagai baris item pertama (tidak ada baris kosong).
  // Hanya insert (totalRows - 1) baris tambahan untuk item ke-2 dst.
  if (totalRows > 1) {
    sheet.insertRowsAfter(anchorRow, totalRows - 1);
    sheet.getRange(anchorRow, START_COL, 1, NCOLS).copyTo(
      sheet.getRange(anchorRow + 1, START_COL, totalRows - 1, NCOLS),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false
    );
  }

  var values      = [];
  var backgrounds = [];
  var fontWeights = [];
  var numFormats  = [];
  var alignments  = [];

  items.forEach(function(item, idx) {
    var row = new Array(NCOLS).fill('');
    row[0] = idx + 1;               // B: No.
    row[1] = item.namaItem || '';   // C: Details
    row[2] = item.satuan   || '';   // D: Unit
    row[3] = item.qty      || 0;    // E: Qty
    row[4] = item.hargaBeli|| 0;    // F: Unit Price
    row[5] = item.total    || 0;    // G: Total

    var bg  = new Array(NCOLS).fill('#e8e8e8');
    var fw  = new Array(NCOLS).fill('normal');
    var fmt = new Array(NCOLS).fill('@');
    fmt[3] = '#,##0.##';  // E Qty
    fmt[4] = '#,##0';     // F Unit Price
    fmt[5] = '#,##0';     // G Total

    values.push(row);
    backgrounds.push(bg);
    fontWeights.push(fw);
    numFormats.push(fmt);
    alignments.push(['center', 'left', 'center', 'center', 'right', 'right']);
  });

  // Tulis data mulai dari anchorRow (bukan anchorRow+1)
  var zone = sheet.getRange(anchorRow, START_COL, totalRows, NCOLS);
  zone.setValues(values);
  zone.setBackgrounds(backgrounds);
  zone.setFontWeights(fontWeights);
  zone.setNumberFormats(numFormats);
  zone.setHorizontalAlignments(alignments);
  zone.setFontSize(10);
  zone.setVerticalAlignment('middle');
  zone.setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

  for (var r = 0; r < totalRows; r++) {
    sheet.getRange(anchorRow + r, 3).setWrap(true);  // C: Details wrap
    sheet.setRowHeight(anchorRow + r, 22);
  }

  return anchorRow + totalRows;  // footer mulai tepat setelah item terakhir
}

// ── Helper: baca TC options dari Script Properties ────────────────────────────

function _getPOTCOptionsForPDF() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('TC_PO_OPTIONS');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    po_material_status: ['Ready Stock', 'Indent 4-6 Weeks After DP'],
    po_down_payment:    ['50% From PO', 'Cover GIRO 30 Days'],
    po_balance_pay:     ['Before Shipping', '70% 60 Days After Receive Invoice & BAST'],
    po_delivery_cond:   ['DDP', 'Franco Jakarta/Surabaya', 'Loco', 'Free On Board'],
    po_warranty:        ['A Year', 'Back to Back from Manufacture'],
    po_documents:       ['Datasheet', 'Warranty', 'Datasheet & Warranty']
  };
}

// ── Helper: tulis 1 baris summary (E=gap, F=label, G=value, gray bg, no border) ─

function _poSummaryRow(sheet, r, label, value, isDash, isBold) {
  var GRAY_BG = '#e8e8e8';
  var color   = isBold ? '#003399' : '#333333';
  var fw      = isBold ? 'bold' : 'normal';

  // E (col 5): spacer/gap (putih)
  sheet.getRange(r, 5).setValue('').setBackground('#ffffff');

  // F (col 6): label
  sheet.getRange(r, 6)
    .setValue(label)
    .setHorizontalAlignment('left').setFontWeight(fw)
    .setFontSize(10).setFontColor(color).setBackground(GRAY_BG);

  // G (col 7): value
  if (isDash) {
    sheet.getRange(r, 7)
      .setValue('-')
      .setHorizontalAlignment('right').setFontWeight(fw)
      .setFontSize(10).setFontColor(color).setBackground(GRAY_BG);
  } else {
    sheet.getRange(r, 7)
      .setValue(value).setNumberFormat('#,##0')
      .setHorizontalAlignment('right').setFontWeight(fw)
      .setFontSize(10).setFontColor(color).setBackground(GRAY_BG);
  }
  sheet.setRowHeight(r, 22);
}

// ── Footer utama ──────────────────────────────────────────────────────────────

function _sisipkanFooterPO(sheet, startRow, po, tc, tcOptions) {
  var SC      = 2;          // kolom B
  var NCOLS   = 6;          // B–G
  var row     = startRow;
  var BLUE    = '#003399';
  var WHITE   = '#ffffff';
  var GRAY_BG = '#e8e8e8';

  tcOptions = tcOptions || {};

  // ── Summary lines ──
  var summaryLines = [];
  summaryLines.push({ label: 'Subtotal', value: po.subtotal || 0, isDash: false, isBold: false });
  if ((po.ppnNominal || 0) > 0) {
    summaryLines.push({ label: 'Taxes (' + (po.ppnPersen || 0) + '%)', value: po.ppnNominal, isDash: false, isBold: false });
  }
  var diskonVal = po.diskonNominal || 0;
  summaryLines.push({
    label:  diskonVal > 0 && (po.diskonPersen || 0) > 0 ? 'Discount (' + po.diskonPersen + '%)' : 'Discount (Rp)',
    value:  diskonVal,
    isDash: diskonVal === 0,
    isBold: false
  });
  summaryLines.push({ label: 'Total', value: po.grandTotal || 0, isDash: false, isBold: true });

  var NS = summaryLines.length;  // 3 atau 4 baris

  // ── Blok Notes + Summary berdampingan ──────────────────────────────────────
  // Layout: B–D = Notes | E = gap (abu-abu) | F = label | G = value
  sheet.insertRowsAfter(row - 1, NS);

  // Baris pertama: Notes header (B–D) + Summary line 0 (F–G via _poSummaryRow)
  sheet.getRange(row, SC, 1, 3).merge()
    .setValue('Additional Notes :')
    .setBackground(BLUE).setFontColor(WHITE).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(row, 20);
  _poSummaryRow(sheet, row, summaryLines[0].label, summaryLines[0].value, summaryLines[0].isDash, summaryLines[0].isBold);

  // Baris 2 dst: Notes content (B–D merged) + sisa summary (F–G via _poSummaryRow)
  if (NS > 1) {
    var contentRows = NS - 1;
    sheet.getRange(row + 1, SC, contentRows, 3).merge()
      .setValue(po.catatan || '')
      .setBackground(GRAY_BG).setFontColor('#444444').setFontSize(10)
      .setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left')
      .setBorder(true, true, true, true, false, false, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    // Set E (col 5) putih (gap antara notes dan summary)
    sheet.getRange(row + 1, 5, contentRows, 1).setBackground('#ffffff');
    for (var si = 1; si < NS; si++) {
      var s = summaryLines[si];
      _poSummaryRow(sheet, row + si, s.label, s.value, s.isDash, s.isBold);
    }
  }

  row += NS;

  // ── Separator antara Notes/Summary dan T&C ────────────────────────────────
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, SC, 1, NCOLS).merge().setBackground(WHITE);
  sheet.setRowHeight(row, 8);
  row++;

  // ── Term & Condition (label : value, 2 item per baris) ────────────────────
  var tcFields = [
    { key: 'po_material_status', label: 'Material Status' },
    { key: 'po_down_payment',    label: 'Down Payment' },
    { key: 'po_balance_pay',     label: 'Balance Payment' },
    { key: 'po_delivery_cond',   label: 'Delivery Condition' },
    { key: 'po_warranty',        label: 'Warranty' },
    { key: 'po_documents',       label: 'Documents' }
  ];
  var tcEntries = tcFields.filter(function(f) { return tc[f.key] && tc[f.key] !== '-'; });

  if (tcEntries.length > 0) {
    sheet.insertRowsAfter(row - 1, 1);
    sheet.getRange(row, SC, 1, NCOLS).merge()
      .setValue('Term & Condition :')
      .setBackground('#d9d9d9').setFontColor('#000000').setFontWeight('bold')
      .setHorizontalAlignment('left').setVerticalAlignment('middle').setFontSize(10);
    sheet.setRowHeight(row, 22);
    row++;

    var tcPairs = [];
    for (var pi = 0; pi < tcEntries.length; pi += 2) {
      tcPairs.push({ left: tcEntries[pi], right: tcEntries[pi + 1] || null });
    }

    sheet.insertRowsAfter(row - 1, tcPairs.length);
    tcPairs.forEach(function(pair, idx) {
      var bg = idx % 2 === 0 ? '#efefef' : '#f5f5f5';
      sheet.getRange(row, SC, 1, NCOLS).setBackground(bg).setFontSize(10);
      sheet.setRowHeight(row, 22);

      // B–C merged: label kiri
      sheet.getRange(row, SC, 1, 2).merge()
        .setValue(pair.left.label + ':')
        .setFontWeight('bold').setFontSize(10).setFontColor('#222222')
        .setBackground(bg).setWrap(false);
      // D–E merged: value kiri (normal, tidak bold)
      sheet.getRange(row, 4, 1, 2).merge()
        .setValue(tc[pair.left.key] || '').setFontSize(10).setFontWeight('normal').setBackground(bg);

      if (pair.right) {
        // F: label kanan
        sheet.getRange(row, 6)
          .setValue(pair.right.label + ':')
          .setFontWeight('bold').setFontSize(10).setFontColor('#222222')
          .setBackground(bg).setWrap(false);
        // G: value kanan (normal, tidak bold)
        sheet.getRange(row, 7)
          .setValue(tc[pair.right.key] || '').setFontSize(10).setFontWeight('normal').setBackground(bg);
      } else {
        sheet.getRange(row, 6, 1, 2).merge().setBackground(bg);
      }
      row++;
    });
  }

  // ── Separator antara T&C dan Signature ────────────────────────────────────
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, SC, 1, NCOLS).merge().setBackground(WHITE);
  sheet.setRowHeight(row, 12);
  row++;

  // ── Signature ─────────────────────────────────────────────────────────────
  sheet.insertRowsAfter(row - 1, 4);

  // Header bar: rata kiri
  sheet.getRange(row, SC, 1, 3).merge()
    .setValue('Customer')
    .setBackground(BLUE).setFontColor(WHITE).setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.getRange(row, 5, 1, 3).merge()
    .setValue('Supplier')
    .setBackground(BLUE).setFontColor(WHITE).setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(row, 20);
  row++;

  // Nama perusahaan
  sheet.getRange(row, SC, 1, 3).merge()
    .setValue('PT. RENUS GLOBAL INDONESIA')
    .setFontWeight('bold').setFontSize(10).setBackground(WHITE)
    .setHorizontalAlignment('left').setVerticalAlignment('bottom');
  sheet.getRange(row, 5, 1, 3).merge()
    .setValue(po.namaSupplier || '')
    .setFontWeight('bold').setFontSize(10).setBackground(WHITE)
    .setHorizontalAlignment('left').setVerticalAlignment('bottom');
  sheet.setRowHeight(row, 18);
  row++;

  // Area tanda tangan (kosong)
  sheet.getRange(row, SC, 1, 3).merge().setBackground(WHITE);
  sheet.getRange(row, 5, 1, 3).merge().setBackground(WHITE);
  sheet.setRowHeight(row, 55);
  row++;

  // Nama: tanpa garis border
  var dibuatOleh = po.dibuatOleh || 'Procurement';
  sheet.getRange(row, SC, 1, 3).merge()
    .setValue('(' + dibuatOleh + ')')
    .setFontSize(10).setFontWeight('bold').setBackground(WHITE)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sheet.getRange(row, 5, 1, 3).merge()
    .setValue('(............................................)')
    .setFontSize(10).setBackground(WHITE)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sheet.setRowHeight(row, 18);
}
