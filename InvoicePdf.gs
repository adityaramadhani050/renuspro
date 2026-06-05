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
    const meta = _parseInvoiceMeta(inv);

    const cache = _buildNamedRangeCache(ss);

    // Validasi anchor sebelum operasi destruktif
    if (!_anchorInvoiceValid(cache)) {
      return { success: false, message:
        'Named range "inv_item_zone_start" hilang/#REF. Perbaiki di sheet Template_Invoice: ' +
        'hapus sisa baris footer di zona item, lalu buat ulang named range ' +
        '"inv_item_zone_start" menunjuk ke satu baris kosong tepat di bawah header tabel ' +
        '(No / Description / Qty / Unit / Price / Amount).' };
    }

    _bersihkanZonaInvoice(sheet, cache);
    _isiHeaderInvoice(cache, inv, klien);
    const rowSetelahItem = _sisipkanBarisInvoice(sheet, cache, inv, meta);
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
        metaJson:    data[i][15] ? data[i][15].toString() : '{}',
        catatan:     data[i][17] ? data[i][17].toString() : ''
      };
    }
  }
  return null;
}

// Ambil scope (kelompok penawaran) & nilai kontrak dari meta JSON kolom 16.
function _parseInvoiceMeta(inv) {
  let meta = {};
  try { meta = JSON.parse(inv.metaJson || '{}'); } catch (e) { meta = {}; }
  // Kompatibilitas: data lama menyimpan array item langsung.
  if (Array.isArray(meta)) meta = { scope: meta, nilaiKontrak: 0, inputMode: 'persen' };
  return {
    scope:        Array.isArray(meta.scope) ? meta.scope : [],
    nilaiKontrak: parseFloat(meta.nilaiKontrak) || 0,
    inputMode:    meta.inputMode || 'persen'
  };
}

// Cek anchor inv_item_zone_start ada & tidak #REF (getRow tidak melempar error)
function _anchorInvoiceValid(cache) {
  try {
    const anchor = cache.get('inv_item_zone_start');
    if (!anchor) return false;
    const r = anchor.getRow();
    return r > 0;
  } catch (e) {
    return false; // #REF → getRow() melempar error
  }
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

// ── Sisipkan baris invoice: 1 baris tagih komposit + scope read-only ────────
// Layout mengikuti template:
//   Baris A : No="A" | Deskripsi=Nama Project (tebal) | Qty=1 | Unit=Ls | Price=DPP | Amount=DPP
//   Baris   : keterangan pembayaran ("DP 30% dari total kontrak Rp ...")
//   Baris   : "Deskripsi:"
//   Baris   : header kelompok + sub-item (deskripsi + qty + unit, TANPA harga)
function _sisipkanBarisInvoice(sheet, cache, inv, meta) {
  const anchor = cache.get('inv_item_zone_start');
  if (!anchor) { Logger.log('inv_item_zone_start tidak ditemukan'); return sheet.getLastRow() + 1; }

  const anchorRow = anchor.getRow();
  const NCOLS = 8;
  const COL_NO = 0, COL_DESC = 1, COL_QTY = 4, COL_UNIT = 5, COL_HARGA = 6, COL_TOTAL = 7;
  const C_ALT = '#f3f3f3', C_TEXT = '#000000', C_BLUE = '#1a3a8f';

  // Bangun daftar baris (deskripsi grup)
  const scope = Array.isArray(meta.scope) ? meta.scope : [];

  // 1) Baris utama tagihan
  const baris = [];
  baris.push({
    type: 'main',
    no: 'A',
    desc: inv.namaProject || '',
    qty: 1, unit: 'Ls',
    harga: inv.dpp, total: inv.dpp
  });

  // 2) Keterangan pembayaran
  baris.push({ type: 'ket', desc: _ketPembayaranInvoice(inv, meta) });

  // 3) Spacer + label "Deskripsi:"
  baris.push({ type: 'spacer', desc: '' });
  baris.push({ type: 'label', desc: 'Deskripsi:' });

  // 4) Scope per kelompok
  scope.forEach(function(k) {
    const namaK = (k.namaKelompok || k.nama || '').toString();
    if (namaK) baris.push({ type: 'kelompok', desc: namaK.toUpperCase() });
    (k.subItems || k.items || []).forEach(function(s) {
      baris.push({
        type: 'item',
        desc: s.deskripsi || '',
        qty:  s.qty  || '',
        unit: s.unit || ''
      });
    });
  });

  const totalRows = baris.length;
  if (totalRows === 0) return anchorRow + 1;

  sheet.insertRowsAfter(anchorRow, totalRows);
  sheet.getRange(anchorRow, 1, 1, NCOLS).copyTo(
    sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false
  );

  const ALIGN_MAIN = ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right'];

  const values = [], backgrounds = [], fontColors = [], fontWeights = [], numFormats = [], aligns = [];

  baris.forEach(function(b) {
    const row = new Array(NCOLS).fill('');
    const fmt = new Array(NCOLS).fill('@');
    const fc  = new Array(NCOLS).fill(C_TEXT);
    const fw  = new Array(NCOLS).fill('normal');

    if (b.type === 'main') {
      row[COL_NO]    = b.no;
      row[COL_DESC]  = b.desc;
      row[COL_QTY]   = b.qty;
      row[COL_UNIT]  = b.unit;
      row[COL_HARGA] = b.harga || 0;
      row[COL_TOTAL] = b.total || 0;
      fmt[COL_HARGA] = '#,##0';
      fmt[COL_TOTAL] = '#,##0';
      fw[COL_DESC]   = 'bold';
    } else if (b.type === 'ket') {
      row[COL_DESC] = b.desc;
    } else if (b.type === 'label') {
      row[COL_DESC] = b.desc;
      fw[COL_DESC]  = 'bold';
    } else if (b.type === 'kelompok') {
      row[COL_DESC] = b.desc;
      fw[COL_DESC]  = 'bold';
      fc[COL_DESC]  = C_BLUE;
    } else if (b.type === 'item') {
      row[COL_DESC] = b.desc;
      row[COL_QTY]  = b.qty;
      row[COL_UNIT] = b.unit;
    } // spacer: kosong

    values.push(row);
    backgrounds.push(new Array(NCOLS).fill(C_ALT));
    fontColors.push(fc);
    fontWeights.push(fw);
    numFormats.push(fmt);
    aligns.push(ALIGN_MAIN.slice());
  });

  const zone = sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS);
  zone.setValues(values);
  zone.setBackgrounds(backgrounds);
  zone.setFontColors(fontColors);
  zone.setFontWeights(fontWeights);
  zone.setNumberFormats(numFormats);
  zone.setHorizontalAlignments(aligns);

  // Merge deskripsi (kolom B-D) per baris + atur tinggi
  baris.forEach(function(b, idx) {
    const r = anchorRow + 1 + idx;
    try {
      sheet.getRange(r, 2, 1, 3).merge();
      sheet.getRange(r, 2).setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left');
      const desc = (b.desc || '').toString();
      const lines = Math.max(1, Math.ceil(desc.length / 55));
      sheet.setRowHeight(r, b.type === 'spacer' ? 8 : Math.max(20, lines * 16 + 6));
    } catch (e) {}
  });

  return anchorRow + 1 + totalRows;
}

// Susun kalimat keterangan pembayaran untuk baris invoice.
function _ketPembayaranInvoice(inv, meta) {
  const nilai = meta.nilaiKontrak || 0;
  const totalKontrakStr = 'Rp ' + Math.round(nilai).toLocaleString('id-ID');
  const jenis = inv.jenis || 'Penuh';
  const persen = parseFloat(inv.persen) || 0;

  if (jenis === 'Pelunasan') {
    return 'Pelunasan dari total kontrak ' + totalKontrakStr;
  }
  if (jenis === 'Penuh') {
    return 'Pembayaran penuh dari total kontrak ' + totalKontrakStr;
  }
  // DP / Termin
  const label = (jenis === 'DP') ? 'DP' : 'Termin';
  const persenStr = persen > 0 ? (' ' + persen + '%') : '';
  return label + persenStr + ' dari total kontrak ' + totalKontrakStr;
}

// ── Footer invoice: subtotal/PPN/total + terbilang + catatan + ttd ──────────
function _sisipkanFooterInvoice(sheet, startRow, inv) {
  const NCOLS = 8;
  let row = startRow;

  const rincian = [
    { label: 'TOTAL',          value: inv.dpp,        bold: false },
    { label: 'PPN ' + (inv.ppnPersen || 0) + '%', value: inv.ppnNominal, bold: false, skip: !(inv.ppnNominal > 0) },
    { label: 'GRAND TOTAL',    value: inv.total,      bold: true }
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

  // Tanda tangan (kanan)
  sheet.insertRowsAfter(row - 1, 4);
  sheet.getRange(row, 6, 1, 3)
    .merge()
    .setValue('Hormat kami,')
    .setHorizontalAlignment('center')
    .setFontColor('#000000');
  sheet.setRowHeight(row, 20);
  const ttdRow = row;
  row += 3;
  sheet.getRange(row, 6, 1, 3)
    .merge()
    .setValue('PT. RENUS GLOBAL INDONESIA')
    .setHorizontalAlignment('center')
    .setFontWeight('bold')
    .setFontColor('#000000');
  sheet.setRowHeight(row, 20);
}

function _capitalize(s) {
  s = (s || '').toString();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
