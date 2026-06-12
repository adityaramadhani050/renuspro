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
 *   inv_item_zona_start  (baris jangkar di tabel item; "zone" juga diterima)
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
        'Named range "inv_item_zona_start" hilang/#REF. Perbaiki di sheet Template_Invoice: ' +
        'hapus sisa baris footer di zona item, lalu buat ulang named range ' +
        '"inv_item_zona_start" menunjuk ke satu baris kosong tepat di bawah header tabel ' +
        '(No / Description / Qty / Unit / Price / Amount).' };
    }

    // Deteksi kolom tabel dari baris header (tepat di atas anchor) — adaptif
    // terhadap layout 6 kolom (A-F) maupun 8 kolom (A-H, deskripsi merge B-D).
    const col = _detectInvoiceColumns(sheet, _getInvoiceAnchor(cache).getRow() - 1);

    _bersihkanZonaInvoice(sheet, cache);
    _isiHeaderInvoice(cache, inv, klien);
    const rowSetelahItem = _sisipkanBarisInvoice(sheet, cache, inv, meta, col);
    _sisipkanFooterInvoice(sheet, rowSetelahItem, inv, col);

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
  const safe = (s) => (s || '').toString().replace(/\//g, '-');
  return safe(inv.id) + '_' + safe(inv.jenis) + (inv.persen > 0 ? inv.persen + '%' : '') +
    '_' + safe(inv.namaProject) + '_' + safe(inv.namaKlien) + '.pdf';
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
        catatan:     data[i][17] ? data[i][17].toString() : '',
        bankAccount: data[i][19] ? data[i][19].toString() : ''
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

// Ambil anchor zona item — menerima ejaan "zona" (ID) maupun "zone" (EN).
function _getInvoiceAnchor(cache) {
  return cache.get('inv_item_zona_start') || cache.get('inv_item_zone_start') || null;
}

// Cek anchor zona item ada & tidak #REF (getRow tidak melempar error)
function _anchorInvoiceValid(cache) {
  try {
    const anchor = _getInvoiceAnchor(cache);
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
    const anchor = _getInvoiceAnchor(cache);
    if (!anchor) { Logger.log('anchor zona item invoice tidak ditemukan'); return; }
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
// Deteksi indeks kolom (0-based) dari teks baris header tabel invoice.
// Mengembalikan { no, desc, qty, unit, harga, total, ncols, descEnd }.
// Default = layout 8 kolom (samakan Template_Quotation) bila deteksi gagal.
function _detectInvoiceColumns(sheet, headerRow) {
  const def = { no: 0, desc: 1, qty: 4, unit: 5, harga: 6, total: 7 };
  try {
    if (!headerRow || headerRow < 1) throw new Error('header row invalid');
    const lastCol = Math.max(8, sheet.getLastColumn());
    const vals = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
    const f = {};
    for (let i = 0; i < vals.length; i++) {
      const t = (vals[i] == null ? '' : vals[i].toString()).toLowerCase().trim();
      if (!t) continue;
      if (f.no    == null && t.indexOf('no') === 0)                               f.no = i;
      if (f.desc  == null && (t.indexOf('desc') >= 0 || t.indexOf('uraian') >= 0)) f.desc = i;
      if (f.qty   == null && (t.indexOf('qty') >= 0 || t.indexOf('jumlah') >= 0 || t.indexOf('vol') >= 0)) f.qty = i;
      if (f.unit  == null && (t.indexOf('unit') >= 0 || t.indexOf('satuan') >= 0)) f.unit = i;
      if (f.harga == null && (t.indexOf('price') >= 0 || t.indexOf('harga') >= 0)) f.harga = i;
      if (f.total == null && (t.indexOf('amount') >= 0 || t.indexOf('total') >= 0)) f.total = i;
    }
    if (f.qty != null && f.unit != null && f.harga != null && f.total != null) {
      const col = {
        no:    f.no   != null ? f.no   : 0,
        desc:  f.desc != null ? f.desc : 1,
        qty:   f.qty, unit: f.unit, harga: f.harga, total: f.total
      };
      col.ncols   = col.total + 1;
      col.descEnd = Math.max(col.desc, col.qty - 1); // deskripsi merge desc..(qty-1)
      return col;
    }
  } catch (e) { Logger.log('_detectInvoiceColumns gagal, pakai default: ' + e); }
  def.ncols = 8; def.descEnd = 3;
  return def;
}

function _sisipkanBarisInvoice(sheet, cache, inv, meta, col) {
  const anchor = _getInvoiceAnchor(cache);
  if (!anchor) { Logger.log('anchor zona item invoice tidak ditemukan'); return sheet.getLastRow() + 1; }

  const anchorRow = anchor.getRow();
  const NCOLS = col.ncols;
  const COL_NO = col.no, COL_DESC = col.desc, COL_QTY = col.qty, COL_UNIT = col.unit, COL_HARGA = col.harga, COL_TOTAL = col.total;
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

  // 5) Satu baris kosong di akhir agar isi terkesan di tengah kotak item
  baris.push({ type: 'tail', desc: '' });

  const totalRows = baris.length;
  if (totalRows === 0) return anchorRow + 1;

  sheet.insertRowsAfter(anchorRow, totalRows);
  sheet.getRange(anchorRow, 1, 1, NCOLS).copyTo(
    sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false
  );

  // Alignment per kolom (adaptif): No=center, Desc=left, Qty/Unit=center, Harga/Total=right
  const ALIGN_MAIN = new Array(NCOLS).fill('left');
  ALIGN_MAIN[COL_NO] = 'center';
  ALIGN_MAIN[COL_QTY] = 'center';
  ALIGN_MAIN[COL_UNIT] = 'center';
  ALIGN_MAIN[COL_HARGA] = 'right';
  ALIGN_MAIN[COL_TOTAL] = 'right';

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

  // Merge deskripsi (kolom desc..descEnd) per baris + atur tinggi
  const descColStart = COL_DESC + 1;            // 1-based
  const descColSpan  = Math.max(1, col.descEnd - COL_DESC + 1);
  baris.forEach(function(b, idx) {
    const r = anchorRow + 1 + idx;
    try {
      if (descColSpan > 1) sheet.getRange(r, descColStart, 1, descColSpan).merge();
      sheet.getRange(r, descColStart).setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left');
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

// ── Footer invoice: total/PPN/grand total + terbilang + catatan + ttd ───────
function _sisipkanFooterInvoice(sheet, startRow, inv, col) {
  const NCOLS    = col.ncols;
  const labelCol = col.harga + 1;  // 1-based kolom label (= kolom Price)
  const valueCol = col.total + 1;  // 1-based kolom nilai (= kolom Amount)
  const bgWidth  = Math.max(1, labelCol - 1);
  const ttdStart = col.unit + 1;   // ttd mulai dari kolom Unit
  const ttdSpan  = Math.max(1, NCOLS - col.unit);
  let row = startRow;

  const rincian = [
    { label: 'TOTAL',          value: inv.dpp,        bold: false },
    { label: 'PPN ' + (inv.ppnPersen || 0) + '%', value: inv.ppnNominal, bold: false },
    { label: 'GRAND TOTAL',    value: inv.total,      bold: true }
  ].filter(function(r) { return !r.skip; });

  sheet.insertRowsAfter(row - 1, rincian.length);
  rincian.forEach(function(r) {
    sheet.setRowHeight(row, 22);
    sheet.getRange(row, 1, 1, bgWidth).setBackground('#ffffff');
    sheet.getRange(row, labelCol)
      .setValue(r.label)
      .setHorizontalAlignment('right')
      .setFontWeight(r.bold ? 'bold' : 'normal')
      .setFontColor(r.bold ? '#1a3a8f' : '#000000');
    sheet.getRange(row, valueCol)
      .setValue(r.value)
      .setNumberFormat('#,##0')
      .setHorizontalAlignment('right')
      .setFontWeight(r.bold ? 'bold' : 'normal')
      .setFontColor(r.bold ? '#1a3a8f' : '#000000');
    row++;
  });

  // ── Note | Bank Account (dua kolom) ──
  const mid    = Math.ceil(NCOLS / 2);
  const leftW  = mid;
  const rightW = NCOLS - mid;
  const noteVal = (inv.catatan || '').toString();
  const bankVal = (inv.bankAccount || '').toString();

  // Spacer 1 baris antara Grand Total dan Note/Bank Account
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, NCOLS).merge().setBackground('#ffffff');
  sheet.setRowHeight(row, 22);
  row++;

  // Header Note / Bank Account
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, leftW).merge()
    .setValue('Note')
    .setBackground('#d9d9d9').setFontWeight('bold').setFontColor('#000000')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.getRange(row, mid + 1, 1, rightW).merge()
    .setValue('Bank Account')
    .setBackground('#d9d9d9').setFontWeight('bold').setFontColor('#000000')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(row, 22);
  row++;

  // Isi Note / Bank Account
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, leftW).merge()
    .setValue(noteVal)
    .setBackground('#f2f2f2').setFontColor('#000000')
    .setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left');
  sheet.getRange(row, mid + 1, 1, rightW).merge()
    .setValue(bankVal)
    .setBackground('#f2f2f2').setFontColor('#000000')
    .setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left');
  const noteLines = Math.max((noteVal.match(/\n/g) || []).length + 1, Math.ceil(noteVal.length / 45));
  const bankLines = (bankVal.match(/\n/g) || []).length + 1;
  sheet.setRowHeight(row, Math.max(44, Math.max(noteLines, bankLines, 2) * 16 + 10));
  row++;

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
