/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Export PDF Invoice dari sheet Template_Invoice (batch API).
 *
 * Memakai ulang helper generik dari PdfExport.gs:
 *   _buildNamedRangeCache(), _getKlienMap(), _exportSheetToPdfBase64()
 *
 * NAMED RANGE yang HARUS ada di sheet Template_Invoice:
 *   inv_no, inv_tanggal, inv_no_po, inv_tgl_po,
 *   inv_klien_nama, inv_klien_perusahaan, inv_klien_alamat, inv_klien_kontak,
 *   inv_item_zone_start  (baris jangkar di tabel item)
 *
 * Struktur kolom tabel item = SAMA seperti Template_Quotation:
 *   A(No) | B–D(Description, merge) | E(Qty) | F(Unit) | G(Price) | H(Amount)
 */

function exportInvoiceDariTemplate(idInvoice) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Invoice');
    if (!sheet) return { success: false, message: 'Sheet "Template_Invoice" tidak ditemukan.' };

    const inv = _getInvoiceById(ss, idInvoice);
    if (!inv) return { success: false, message: 'Invoice tidak ditemukan.' };

    const klien = _getKlienMap(ss)[inv.klienId] || {};
    let items = [];
    try { items = JSON.parse(inv.itemsJson || '[]'); } catch (e) {}

    const cache = _buildNamedRangeCache(ss);

    _bersihkanZonaInvoice(sheet, cache);
    _isiHeaderInvoice(cache, inv, klien);
    const rowSetelahItem = _sisipkanBarisInvoice(sheet, cache, items);
    _sisipkanFooterInvoice(sheet, rowSetelahItem, inv);

    SpreadsheetApp.flush();
    const pdfBase64 = _exportSheetToPdfBase64(ss, sheet);

    return { success: true, pdfBase64: pdfBase64, fileName: _invoiceFileName(inv) };
  } catch (e) {
    Logger.log('exportInvoiceDariTemplate error: ' + e);
    return { success: false, message: 'Gagal export invoice: ' + e.toString() };
  } finally {
    try {
      const ss = getSpreadsheet();
      const sh = ss.getSheetByName('Template_Invoice');
      if (sh) _bersihkanZonaInvoice(sh, _buildNamedRangeCache(ss));
    } catch (e) { Logger.log('Finally cleanup invoice error: ' + e); }
    lock.releaseLock();
  }
}

function _invoiceFileName(inv) {
  const safe = (s) => (s || '').toString().replace(/[\\/]/g, '-');
  return safe(inv.id) + '_' + safe(inv.jenis) + '_' + safe(inv.namaProject) + '.pdf';
}

function _getInvoiceById(ss, idInvoice) {
  const sheet = ss.getSheetByName('Invoice_Main');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString() === idInvoice) {
      const tglStr = data[i][3] instanceof Date
        ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][3];
      const tglPoStr = data[i][7] instanceof Date
        ? Utilities.formatDate(data[i][7], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][7];
      return {
        id:          data[i][0].toString(),
        noWO:        data[i][1] ? data[i][1].toString() : '',
        noPenawaran: data[i][2] ? data[i][2].toString() : '',
        tanggal:     tglStr,
        jenis:       data[i][4] ? data[i][4].toString() : 'Penuh',
        persen:      parseFloat(data[i][5]) || 0,
        noPO:        data[i][6] ? data[i][6].toString() : '',
        tglPO:       tglPoStr,
        klienId:     data[i][8] ? data[i][8].toString() : '',
        namaKlien:   data[i][9] ? data[i][9].toString() : '',
        namaProject: data[i][10] ? data[i][10].toString() : '',
        dpp:         parseFloat(data[i][11]) || 0,
        ppnPersen:   parseFloat(data[i][12]) || 0,
        ppnNominal:  parseFloat(data[i][13]) || 0,
        total:       parseFloat(data[i][14]) || 0,
        itemsJson:   data[i][15] ? data[i][15].toString() : '[]',
        catatan:     data[i][17] ? data[i][17].toString() : ''
      };
    }
  }
  return null;
}

// ── Bersihkan zona dinamis invoice ──────────────────────────────────────────
function _bersihkanZonaInvoice(sheet, cache) {
  try {
    const anchor = cache.get('inv_item_zone_start');
    if (!anchor) { Logger.log('inv_item_zone_start tidak ditemukan'); return; }
    const anchorRow = anchor.getRow();
    const lastRow = sheet.getLastRow();
    const delCount = lastRow - anchorRow;
    if (delCount > 0) sheet.deleteRows(anchorRow + 1, delCount);
  } catch (e) { Logger.log('_bersihkanZonaInvoice error: ' + e); }
}

// ── Isi header named range invoice ──────────────────────────────────────────
function _isiHeaderInvoice(cache, inv, klien) {
  const set = function(name, val) {
    const range = cache.get(name);
    if (range) range.setValue(val);
    else Logger.log('Named range tidak ditemukan: ' + name);
  };
  set('inv_no',              inv.id           || '');
  set('inv_tanggal',         inv.tanggal      || '');
  set('inv_no_po',           inv.noPO         || '');
  set('inv_tgl_po',          inv.tglPO        || '');
  set('inv_klien_nama',      klien.nama       || inv.namaKlien || '');
  set('inv_klien_perusahaan',klien.perusahaan || '');
  set('inv_klien_alamat',    klien.alamat     || '');
  set('inv_klien_kontak',    klien.kontak     || '');
}

// ── Sisipkan baris item invoice (flat) ──────────────────────────────────────
function _sisipkanBarisInvoice(sheet, cache, items) {
  const anchor = cache.get('inv_item_zone_start');
  if (!anchor) { Logger.log('inv_item_zone_start tidak ditemukan'); return sheet.getLastRow() + 1; }

  const anchorRow = anchor.getRow();
  const NCOLS = 8;
  const COL_NO = 0, COL_DESC = 1, COL_QTY = 4, COL_UNIT = 5, COL_HARGA = 6, COL_TOTAL = 7;
  const C_ALT = '#f3f3f3', C_TEXT = '#000000';

  const totalRows = items.length;
  if (totalRows === 0) return anchorRow + 1;

  sheet.insertRowsAfter(anchorRow, totalRows);

  // Salin format dari baris anchor
  sheet.getRange(anchorRow, 1, 1, NCOLS).copyTo(
    sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false
  );

  const ALIGN = ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right'];

  const values = [], backgrounds = [], fontColors = [], fontWeights = [], numFormats = [], aligns = [];

  items.forEach(function(it, idx) {
    const row = new Array(NCOLS).fill('');
    row[COL_NO]    = idx + 1;
    row[COL_DESC]  = it.deskripsi || '';
    row[COL_QTY]   = it.qty   || '';
    row[COL_UNIT]  = it.unit  || '';
    row[COL_HARGA] = it.harga || 0;
    row[COL_TOTAL] = (it.amount != null ? it.amount : (it.qty || 0) * (it.harga || 0)) || 0;

    const fmt = new Array(NCOLS).fill('@');
    fmt[COL_HARGA] = '#,##0';
    fmt[COL_TOTAL] = '#,##0';

    values.push(row);
    backgrounds.push(new Array(NCOLS).fill(C_ALT));
    fontColors.push(new Array(NCOLS).fill(C_TEXT));
    fontWeights.push(new Array(NCOLS).fill('normal'));
    numFormats.push(fmt);
    aligns.push(ALIGN.slice());
  });

  const zone = sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS);
  zone.setValues(values);
  zone.setBackgrounds(backgrounds);
  zone.setFontColors(fontColors);
  zone.setFontWeights(fontWeights);
  zone.setNumberFormats(numFormats);
  zone.setHorizontalAlignments(aligns);

  // Merge deskripsi (kolom B-D) per baris
  items.forEach(function(it, idx) {
    const r = anchorRow + 1 + idx;
    try {
      sheet.getRange(r, 2, 1, 3).merge();
      sheet.getRange(r, 2).setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left');
      const desc = it.deskripsi || '';
      const lines = Math.max(1, Math.ceil(desc.length / 55));
      sheet.setRowHeight(r, Math.max(20, lines * 16 + 6));
    } catch (e) {}
  });

  return anchorRow + 1 + totalRows;
}

// ── Footer invoice: subtotal/PPN/total + terbilang + catatan + ttd ──────────
function _sisipkanFooterInvoice(sheet, startRow, inv) {
  const NCOLS = 8;
  let row = startRow;

  const rincian = [
    { label: 'Subtotal (DPP)', value: inv.dpp,        bold: false },
    { label: 'PPN ' + (inv.ppnPersen || 0) + '%', value: inv.ppnNominal, bold: false, skip: !(inv.ppnNominal > 0) },
    { label: 'TOTAL',          value: inv.total,      bold: true }
  ].filter(function(r) { return !r.skip; });

  sheet.insertRowsAfter(row - 1, rincian.length);
  rincian.forEach(function(r) {
    sheet.setRowHeight(row, 22);
    sheet.getRange(row, 1, 1, 6).setBackground('#ffffff');
    sheet.getRange(row, 7)
      .setValue(r.label)
      .setHorizontalAlignment('right')
      .setFontWeight(r.bold ? 'bold' : 'normal')
      .setFontColor(r.bold ? '#1a3a8f' : '#000000');
    sheet.getRange(row, 8)
      .setValue(r.value)
      .setNumberFormat('#,##0')
      .setHorizontalAlignment('right')
      .setFontWeight(r.bold ? 'bold' : 'normal')
      .setFontColor(r.bold ? '#1a3a8f' : '#000000');
    row++;
  });

  // Terbilang
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, NCOLS)
    .merge()
    .setValue('Terbilang: # ' + _capitalize(terbilangIndo(inv.total)) + ' Rupiah #')
    .setBackground('#fffce6')
    .setFontColor('#665500')
    .setFontStyle('italic')
    .setWrap(true)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  sheet.setRowHeight(row, 26);
  row++;

  // Catatan (opsional)
  if (inv.catatan) {
    sheet.insertRowsAfter(row - 1, 1);
    sheet.getRange(row, 1, 1, NCOLS)
      .merge()
      .setValue('Catatan: ' + inv.catatan)
      .setBackground('#ffffff')
      .setFontColor('#444444')
      .setWrap(true)
      .setVerticalAlignment('top')
      .setHorizontalAlignment('left');
    sheet.setRowHeight(row, Math.max(28, Math.ceil(inv.catatan.length / 90) * 16 + 12));
    row++;
  }

  // Spacer
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, NCOLS).merge().setBackground('#ffffff');
  row++;

  // Tanda tangan + QR verifikasi
  row = _insertDocSign(sheet, row, 1, inv.id, NCOLS);
}

function _capitalize(s) {
  s = (s || '').toString();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
