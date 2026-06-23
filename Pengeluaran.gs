/**
 * RenusPro — Modul Pengeluaran Project (Modul 3)
 *
 * Sheet Pengeluaran — kolom (0-based):
 *  0  ID Pengeluaran    (EXP-YYYYMM-NNN)
 *  1  No Work Order
 *  2  Tanggal
 *  3  Sumber            'Pembayaran PO' | 'Penggunaan Stok' | 'Langsung'
 *  4  No PO             (otomatis Pembayaran PO; teks bebas Langsung; kosong Stok)
 *  5  ID Referensi      (ID Pembayaran PO atau ID Mutasi Stok; kosong untuk Langsung)
 *  6  ID Akun Pembayaran
 *  7  Nama Akun
 *  8  Deskripsi
 *  9  Qty
 * 10  Satuan
 * 11  Harga Satuan
 * 12  Total
 * 13  Catatan
 * 14  Dibuat Oleh
 * 15  Dibuat Pada
 * 16  Diubah Oleh
 * 17  Diubah Pada
 * 18  Kategori          (hanya untuk pengeluaran non-project, kosong No Work Order)
 */

// ── Sheet bootstrap ───────────────────────────────────────────────────────────

function _ensurePengeluaranSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pengeluaran');
  if (!sheet) {
    sheet = ss.insertSheet('Pengeluaran');
    sheet.appendRow([
      'ID Pengeluaran', 'No Work Order', 'Tanggal', 'Sumber', 'No PO',
      'ID Referensi', 'ID Akun Pembayaran', 'Nama Akun', 'Deskripsi',
      'Qty', 'Satuan', 'Harga Satuan', 'Total', 'Catatan',
      'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada', 'Kategori'
    ]);
  }
  return sheet;
}

function _ensurePengeluaranKategoriCol(ss) {
  ss = ss || getSpreadsheet();
  var sheet = _ensurePengeluaranSheet(ss);
  if (sheet.getLastColumn() < 19) sheet.getRange(1, 19).setValue('Kategori');
  return sheet;
}

// ── ID generation ─────────────────────────────────────────────────────────────

function _generateIdPengeluaran(sheet) {
  SpreadsheetApp.flush();
  var tz     = Session.getScriptTimeZone();
  var prefix = 'EXP-' + Utilities.formatDate(new Date(), tz, 'yyyyMM') + '-';
  var data   = sheet.getDataRange().getValues();
  var maxSeq = 0;
  for (var i = 1; i < data.length; i++) {
    var id = (data[i][0] || '').toString();
    if (id.indexOf(prefix) === 0) {
      var seq = parseInt(id.slice(prefix.length), 10) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return prefix + ('000' + (maxSeq + 1)).slice(-3);
}

// ── Internal helper: cek status WO ───────────────────────────────────────────

function _getStatusWO(noWO) {
  var data    = _cachedPenawaran();
  var noWOStr = noWO.toString().trim();
  for (var i = 1; i < data.length; i++) {
    var rowNoWO = (data[i][17] != null && data[i][17] !== '') ? data[i][17].toString().trim() : '';
    if (rowNoWO === noWOStr) return (data[i][16] || '').toString();
  }
  return '';
}

// ── Internal: build map noWO → {namaProject, namaKlien} ──────────────────────

function _buildWOInfoMap() {
  var klienData = _cachedKlien();
  var klienMap  = {};
  for (var k = 1; k < klienData.length; k++) {
    if (klienData[k][0]) klienMap[klienData[k][0].toString()] = (klienData[k][1] || '').toString();
  }
  var penData = _cachedPenawaran();
  var woMap   = {};
  for (var p = 1; p < penData.length; p++) {
    var pNoWO = (penData[p][17] != null && penData[p][17] !== '') ? penData[p][17].toString().trim() : '';
    if (pNoWO && !woMap[pNoWO]) {
      var klienId = penData[p][5] ? penData[p][5].toString() : '';
      woMap[pNoWO] = {
        namaProject: (penData[p][4] || '').toString(),
        namaKlien:   klienMap[klienId] || klienId
      };
    }
  }
  return woMap;
}

// ── Read operations ───────────────────────────────────────────────────────────

function getPengeluaranList(params) {
  try {
    params = params || {};
    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranSheet(ss);
    var data  = sheet.getDataRange().getValues();
    var woMap = {};
    try { woMap = _buildWOInfoMap(); } catch(e2) {}

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;

      var noWO    = r[1] ? r[1].toString() : '';
      var tanggal = _fmtTgl(r[2]);
      var sumber  = r[3] ? r[3].toString() : '';
      var idAkun  = r[6] ? r[6].toString() : '';
      var noPOVal = r[4] ? r[4].toString() : '';

      // Filters
      if (params.noWO   && noWO   !== params.noWO.toString())   continue;
      if (params.sumber && sumber !== params.sumber)             continue;
      if (params.idAkun && idAkun !== params.idAkun.toString()) continue;
      if (params.noPO   && noPOVal.toLowerCase().indexOf(params.noPO.toLowerCase()) === -1) continue;

      if (params.tanggalDari || params.tanggalSampai) {
        var tp = tanggal.split('/');
        if (tp.length === 3) {
          var tglMs = new Date(parseInt(tp[2]), parseInt(tp[1]) - 1, parseInt(tp[0])).getTime();
          if (params.tanggalDari) {
            var fd = params.tanggalDari.split('-');
            if (tglMs < new Date(parseInt(fd[0]), parseInt(fd[1]) - 1, parseInt(fd[2])).getTime()) continue;
          }
          if (params.tanggalSampai) {
            var td = params.tanggalSampai.split('-');
            if (tglMs > new Date(parseInt(td[0]), parseInt(td[1]) - 1, parseInt(td[2])).getTime()) continue;
          }
        }
      }

      var woInfo = woMap[noWO] || { namaProject: '', namaKlien: '' };
      list.push({
        id:          r[0].toString(),
        noWO:        noWO,
        namaProject: woInfo.namaProject,
        namaKlien:   woInfo.namaKlien,
        tanggal:     tanggal,
        sumber:      sumber,
        noPO:        noPOVal,
        idReferensi: r[5] ? r[5].toString() : '',
        idAkun:      idAkun,
        namaAkun:    r[7]  ? r[7].toString()   : '',
        deskripsi:   r[8]  ? r[8].toString()   : '',
        qty:         parseFloat(r[9])  || 0,
        satuan:      r[10] ? r[10].toString()  : '',
        hargaSatuan: parseFloat(r[11]) || 0,
        total:       parseFloat(r[12]) || 0,
        catatan:     r[13] ? r[13].toString()  : '',
        dibuatOleh:  r[14] ? r[14].toString()  : '',
        dibuatPada:  r[15] ? r[15].toString()  : '',
        diubahOleh:  r[16] ? r[16].toString()  : '',
        diubahPada:  r[17] ? r[17].toString()  : '',
        kategori:    r[18] ? r[18].toString()  : ''
      });
    }

    list.reverse(); // terbaru di atas
    return { success: true, list: list };
  } catch(e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// ── Write: Pengeluaran Langsung ───────────────────────────────────────────────

function simpanPengeluaranLangsung(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var noWO     = (payload.noWO || '').toString().trim();
    var kategori = (payload.kategori || '').toString().trim();
    if (!noWO && !kategori)     return { success: false, message: 'Kategori pengeluaran wajib dipilih untuk pengeluaran non-project.' };
    if (!payload.deskripsi)     return { success: false, message: 'Deskripsi wajib diisi.' };
    if (!payload.idAkun)        return { success: false, message: 'Akun pembayaran wajib dipilih.' };
    if (payload.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pengeluaran langsung.' };

    var qty         = parseFloat(payload.qty) || 0;
    var hargaSatuan = parseFloat(payload.hargaSatuan) || 0;
    if (qty <= 0)         return { success: false, message: 'Qty harus lebih dari 0.' };
    if (hargaSatuan <= 0) return { success: false, message: 'Harga satuan harus lebih dari 0.' };

    if (noWO) {
      var statusWO = _getStatusWO(noWO);
      if (!statusWO)          return { success: false, message: 'Work Order tidak ditemukan.' };
      if (statusWO === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa menambah pengeluaran.' };
    }

    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranKategoriCol(ss);
    var id    = _generateIdPengeluaran(sheet);
    var tz    = Session.getScriptTimeZone();
    var now   = new Date();
    var nowStr  = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm:ss');
    var tanggal = payload.tanggal || Utilities.formatDate(now, tz, 'dd/MM/yyyy');

    sheet.appendRow([
      id, noWO, tanggal, 'Langsung',
      payload.noPO     ? payload.noPO.toString()     : '',
      '',
      payload.idAkun   ? payload.idAkun.toString()   : '',
      payload.namaAkun ? payload.namaAkun.toString() : '',
      payload.deskripsi ? payload.deskripsi.toString() : '',
      qty,
      payload.satuan   ? payload.satuan.toString()   : '',
      hargaSatuan,
      qty * hargaSatuan,
      payload.catatan  ? payload.catatan.toString()  : '',
      payload.dibuatOleh ? payload.dibuatOleh.toString() : '',
      nowStr, '', '',
      noWO ? '' : kategori
    ]);

    invalidatePengeluaranCache();
    return { success: true, message: 'Pengeluaran ' + id + ' berhasil disimpan.', id: id };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function editPengeluaranLangsung(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var id = (payload.id || '').toString().trim();
    if (!id) return { success: false, message: 'ID Pengeluaran wajib diisi.' };

    var qty         = parseFloat(payload.qty) || 0;
    var hargaSatuan = parseFloat(payload.hargaSatuan) || 0;
    if (qty <= 0)         return { success: false, message: 'Qty harus lebih dari 0.' };
    if (hargaSatuan <= 0) return { success: false, message: 'Harga satuan harus lebih dari 0.' };
    if (!payload.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
    if (!payload.idAkun)    return { success: false, message: 'Akun pembayaran wajib dipilih.' };
    if (payload.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pengeluaran langsung.' };

    var kategoriBaru = (payload.kategori || '').toString().trim();

    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranKategoriCol(ss);
    SpreadsheetApp.flush();

    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString() === id) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) return { success: false, message: 'Pengeluaran tidak ditemukan.' };

    var sumber = (data[rowIdx - 1][3] || '').toString();
    if (sumber !== 'Langsung') {
      return { success: false, message: 'Pengeluaran bersumber "' + sumber + '" tidak bisa diedit dari modul ini. Kelola dari sumbernya.' };
    }

    var noWO     = (data[rowIdx - 1][1] || '').toString();
    if (noWO) {
      var statusWO = _getStatusWO(noWO);
      if (statusWO === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa mengedit pengeluaran.' };
    } else if (!kategoriBaru) {
      return { success: false, message: 'Kategori pengeluaran wajib dipilih untuk pengeluaran non-project.' };
    }

    var tz      = Session.getScriptTimeZone();
    var nowStr  = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
    var tanggal = payload.tanggal || (data[rowIdx - 1][2] ? _fmtTgl(data[rowIdx - 1][2]) : '');

    // Update cols 3–19 (tanggal s.d. kategori), preserve ID Referensi & dibuat Oleh/Pada
    sheet.getRange(rowIdx, 3, 1, 17).setValues([[
      tanggal,
      'Langsung',
      payload.noPO     ? payload.noPO.toString()     : '',
      data[rowIdx - 1][5] || '',                           // ID Referensi
      payload.idAkun   ? payload.idAkun.toString()   : '',
      payload.namaAkun ? payload.namaAkun.toString() : '',
      payload.deskripsi ? payload.deskripsi.toString() : '',
      qty,
      payload.satuan   ? payload.satuan.toString()   : '',
      hargaSatuan,
      qty * hargaSatuan,
      payload.catatan  ? payload.catatan.toString()  : '',
      data[rowIdx - 1][14] || '',                          // Dibuat Oleh
      data[rowIdx - 1][15] || '',                          // Dibuat Pada
      payload.diubahOleh ? payload.diubahOleh.toString() : '',
      nowStr,
      noWO ? '' : kategoriBaru
    ]]);

    invalidatePengeluaranCache();
    return { success: true, message: 'Pengeluaran ' + id + ' berhasil diperbarui.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusPengeluaran(id) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranSheet(ss);
    SpreadsheetApp.flush();

    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1;
    var sumber = '', noWO = '', idReferensi = '';
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString() === id) {
        rowIdx      = i + 1;
        sumber      = (data[i][3] || '').toString();
        noWO        = (data[i][1] || '').toString();
        idReferensi = (data[i][5] || '').toString();
        break;
      }
    }
    if (rowIdx === -1) return { success: false, message: 'Pengeluaran tidak ditemukan.' };

    if (sumber === 'Pembayaran PO') {
      return { success: false, message: 'Pengeluaran bersumber Pembayaran PO tidak bisa dihapus di sini — hapus pembayarannya di detail PO.' };
    }
    if (sumber === 'Penggunaan Stok') {
      // Panggil pembatalan stok lalu hapus baris
      var batalResult = batalkanPenggunaanStok(idReferensi, '');
      if (!batalResult.success) return batalResult;
      // Re-read setelah batalkan (baris mungkin bergeser)
      SpreadsheetApp.flush();
      var data2 = sheet.getDataRange().getValues();
      for (var j = data2.length - 1; j >= 1; j--) {
        if ((data2[j][0] || '').toString() === id) { sheet.deleteRow(j + 1); break; }
      }
      invalidatePengeluaranCache();
      return { success: true, message: 'Pengeluaran dan mutasi stok berhasil dibatalkan.' };
    }

    // Langsung
    var statusWO = _getStatusWO(noWO);
    if (statusWO === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa menghapus pengeluaran.' };

    sheet.deleteRow(rowIdx);
    invalidatePengeluaranCache();
    return { success: true, message: 'Pengeluaran ' + id + ' berhasil dihapus.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Hook: dipanggil oleh simpanPembayaranPO (Fase 2) dan gunakanStok (Fase 2) ─

function _buatPengeluaranOtomatis(p) {
  var ss    = getSpreadsheet();
  var sheet = _ensurePengeluaranSheet(ss);
  var id    = _generateIdPengeluaran(sheet);
  var tz    = Session.getScriptTimeZone();
  var nowStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  sheet.appendRow([
    id,
    p.noWO        || '',
    p.tanggal     || Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    p.sumber      || '',
    p.noPO        || '',
    p.idReferensi || '',
    p.idAkun      || '',
    p.namaAkun    || '',
    p.deskripsi   || '',
    parseFloat(p.qty)         || 1,
    p.satuan      || '',
    parseFloat(p.hargaSatuan) || 0,
    parseFloat(p.total)       || 0,
    p.catatan     || '',
    p.dibuatOleh  || '',
    nowStr, '', ''
  ]);
  invalidatePengeluaranCache();
  return id;
}

function _hapusPengeluaranByReferensi(idReferensi) {
  if (!idReferensi) return;
  var ss    = getSpreadsheet();
  var sheet = _ensurePengeluaranSheet(ss);
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if ((data[i][5] || '').toString() === idReferensi.toString()) {
      sheet.deleteRow(i + 1);
    }
  }
  invalidatePengeluaranCache();
}

// ── Fase 3: Realisasi HPP & Margin per WO ────────────────────────────────────

function getRealisasiHPP(noWO) {
  try {
    noWO = noWO ? noWO.toString().trim() : '';
    if (!noWO) return { success: false, message: 'No WO wajib diisi.' };

    // Nilai kontrak & estimasi HPP dari Penawaran_Main
    var penData = _cachedPenawaran();
    var nilaiKontrak = 0, estimasiHPP = 0, namaProject = '', namaKlien = '';
    var klienData = _cachedKlien();
    var klienMap  = {};
    for (var k = 1; k < klienData.length; k++) {
      if (klienData[k][0]) klienMap[klienData[k][0].toString()] = (klienData[k][1] || '').toString();
    }
    var maxRevPen = -1;
    for (var p = 1; p < penData.length; p++) {
      var pNoWO = (penData[p][17] != null && penData[p][17] !== '') ? penData[p][17].toString().trim() : '';
      if (pNoWO !== noWO) continue;
      var pRev = parseInt(penData[p][1]) || 0;
      if (pRev <= maxRevPen) continue; // ambil revisi tertinggi (terbaru) per No WO
      maxRevPen = pRev;
      nilaiKontrak = Math.max(0, (parseFloat(penData[p][7]) || 0) - (parseFloat(penData[p][8]) || 0));
      estimasiHPP  = parseFloat(penData[p][11]) || 0;
      namaProject  = (penData[p][4] || '').toString();
      var klienId  = penData[p][5] ? penData[p][5].toString() : '';
      namaKlien    = klienMap[klienId] || klienId;
    }

    // Baca pengeluaran WO
    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranSheet(ss);
    var data  = sheet.getDataRange().getValues();

    var realisasiHPP = 0;
    var akunMap      = {}; // namaAkun → total
    var sumberMap    = { 'Pembayaran PO': 0, 'Penggunaan Stok': 0, 'Langsung': 0 };
    var pengeluaranList = [];

    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;
      if ((r[1] || '').toString().trim() !== noWO) continue;

      var total  = parseFloat(r[12]) || 0;
      var sumber = (r[3] || '').toString();
      var namaAkun = (r[7] || '').toString();

      realisasiHPP += total;
      akunMap[namaAkun] = (akunMap[namaAkun] || 0) + total;
      if (sumber in sumberMap) sumberMap[sumber] += total;

      pengeluaranList.push({
        id:          r[0].toString(),
        tanggal:     _fmtTgl(r[2]),
        sumber:      sumber,
        noPO:        r[4] ? r[4].toString() : '',
        idReferensi: r[5] ? r[5].toString() : '',
        idAkun:      r[6] ? r[6].toString() : '',
        namaAkun:    namaAkun,
        deskripsi:   r[8] ? r[8].toString() : '',
        qty:         parseFloat(r[9])  || 0,
        satuan:      r[10] ? r[10].toString() : '',
        hargaSatuan: parseFloat(r[11]) || 0,
        total:       total,
        catatan:     r[13] ? r[13].toString() : ''
      });
    }

    var selisih = estimasiHPP - realisasiHPP;
    var selisihPersen = estimasiHPP > 0 ? Math.round(selisih / estimasiHPP * 100) : null;
    var marginEstimasi  = nilaiKontrak > 0 ? ((nilaiKontrak - estimasiHPP) / nilaiKontrak * 100) : null;
    var marginRealisasi = nilaiKontrak > 0 ? ((nilaiKontrak - realisasiHPP) / nilaiKontrak * 100) : null;

    // Breakdown per akun (terurut descending)
    var breakdownAkun = Object.keys(akunMap).map(function(nama) {
      return {
        namaAkun: nama,
        total:    akunMap[nama],
        persen:   realisasiHPP > 0 ? Math.round(akunMap[nama] / realisasiHPP * 100) : 0
      };
    }).sort(function(a, b) { return b.total - a.total; });

    // Breakdown per sumber
    var breakdownSumber = Object.keys(sumberMap).map(function(s) {
      return {
        sumber: s,
        total:  sumberMap[s],
        persen: realisasiHPP > 0 ? Math.round(sumberMap[s] / realisasiHPP * 100) : 0
      };
    });

    // PO ber-peruntukan WO ini beserta status bayar
    var poTerkait = [];
    try {
      var poSheet = getSpreadsheet().getSheetByName('Purchase_Order');
      if (poSheet) {
        var poData = poSheet.getDataRange().getValues();
        for (var q = 1; q < poData.length; q++) {
          var pNoWO2 = (poData[q][5] || '').toString().trim();
          if (pNoWO2 !== noWO) continue;
          var grandTotal  = parseFloat(poData[q][10]) || 0;
          var totalBayar  = parseFloat(poData[q][13]) || 0;
          poTerkait.push({
            noPO:          (poData[q][0] || '').toString(),
            namaSupplier:  (poData[q][3] || '').toString(),
            statusPO:      (poData[q][6] || '').toString(),
            statusBayar:   (poData[q][12] || '').toString(),
            grandTotal:    grandTotal,
            totalDibayar:  totalBayar,
            sisaTagihan:   Math.max(0, grandTotal - totalBayar)
          });
        }
      }
    } catch(e3) {}

    pengeluaranList.reverse();

    return {
      success:         true,
      noWO:            noWO,
      namaProject:     namaProject,
      namaKlien:       namaKlien,
      nilaiKontrak:    nilaiKontrak,
      estimasiHPP:     estimasiHPP,
      realisasiHPP:    realisasiHPP,
      selisih:         selisih,
      selisihPersen:   selisihPersen,
      marginEstimasi:  marginEstimasi,
      marginRealisasi: marginRealisasi,
      breakdownAkun:   breakdownAkun,
      breakdownSumber: breakdownSumber,
      pengeluaranList: pengeluaranList,
      poTerkait:       poTerkait
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Fase 4: Laporan Profitabilitas ────────────────────────────────────────────

function getLaporanProfitabilitas(params) {
  try {
    params = params || {};

    // Semua pengeluaran per WO
    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranSheet(ss);
    var expData = sheet.getDataRange().getValues();

    // Hitung total pengeluaran per WO dan per akun
    var expByWO  = {}; // noWO → total
    var expByAkun = {}; // namaAkun → total (global, untuk rekap akun)
    for (var i = 1; i < expData.length; i++) {
      var r    = expData[i];
      if (!r[0]) continue;
      var noWO  = (r[1] || '').toString().trim();
      var total = parseFloat(r[12]) || 0;
      var namaAkun = (r[7] || '').toString();
      expByWO[noWO]  = (expByWO[noWO]  || 0) + total;
      expByAkun[namaAkun] = (expByAkun[namaAkun] || 0) + total;
    }

    // Data WO dari Penawaran_Main
    var penData  = _cachedPenawaran();
    var klienData = _cachedKlien();
    var klienMap  = {};
    for (var k = 1; k < klienData.length; k++) {
      if (klienData[k][0]) klienMap[klienData[k][0].toString()] = (klienData[k][1] || '').toString();
    }

    // Deduplikasi: ambil revisi tertinggi per noPenawaran
    var latestRevMap = {};
    for (var p2 = 1; p2 < penData.length; p2++) {
      var noPen = penData[p2][0] ? penData[p2][0].toString() : '';
      if (!noPen) continue;
      var rev   = parseInt(penData[p2][1]) || 0;
      if (!latestRevMap[noPen] || rev > latestRevMap[noPen].rev) {
        latestRevMap[noPen] = { rev: rev, idx: p2 };
      }
    }

    var rows = [];
    for (var noPen2 in latestRevMap) {
      var idx    = latestRevMap[noPen2].idx;
      var status = (penData[idx][16] || '').toString();
      var noWO2  = (penData[idx][17] != null && penData[idx][17] !== '') ? penData[idx][17].toString().trim() : '';
      if (!noWO2 || (status !== 'Deal' && status !== 'Closed')) continue;

      // Filter status
      if (params.status && params.status !== status) continue;

      var tanggal     = _fmtTgl(penData[idx][2]);
      var nilaiKontrak = Math.max(0, (parseFloat(penData[idx][7]) || 0) - (parseFloat(penData[idx][8]) || 0));
      var estimasiHPP  = parseFloat(penData[idx][11]) || 0;
      var realisasiHPP = expByWO[noWO2] || 0;

      // Filter periode (by tanggal WO/penawaran)
      if (params.tanggalDari || params.tanggalSampai) {
        var tp2 = tanggal.split('/');
        if (tp2.length === 3) {
          var tglMs2 = new Date(parseInt(tp2[2]), parseInt(tp2[1]) - 1, parseInt(tp2[0])).getTime();
          if (params.tanggalDari) {
            var fd2 = params.tanggalDari.split('-');
            if (tglMs2 < new Date(parseInt(fd2[0]), parseInt(fd2[1]) - 1, parseInt(fd2[2])).getTime()) continue;
          }
          if (params.tanggalSampai) {
            var td2 = params.tanggalSampai.split('-');
            if (tglMs2 > new Date(parseInt(td2[0]), parseInt(td2[1]) - 1, parseInt(td2[2])).getTime()) continue;
          }
        }
      }

      var selisih     = estimasiHPP - realisasiHPP;
      var margEst     = nilaiKontrak > 0 ? (nilaiKontrak - estimasiHPP) / nilaiKontrak * 100 : null;
      var margReal    = nilaiKontrak > 0 ? (nilaiKontrak - realisasiHPP) / nilaiKontrak * 100 : null;
      var klienId     = penData[idx][5] ? penData[idx][5].toString() : '';

      rows.push({
        noWO:            noWO2,
        namaProject:     (penData[idx][4] || '').toString(),
        namaKlien:       klienMap[klienId] || klienId,
        namaSales:       (penData[idx][6] || '').toString(),
        tanggal:         tanggal,
        status:          status,
        nilaiKontrak:    nilaiKontrak,
        estimasiHPP:     estimasiHPP,
        realisasiHPP:    realisasiHPP,
        selisih:         selisih,
        marginEstimasi:  margEst,
        marginRealisasi: margReal,
        isOverBudget:    margReal !== null && margEst !== null && margReal < margEst
      });
    }

    rows.sort(function(a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });

    // Summary
    var totalKontrak = 0, totalRealisasi = 0, sumMargReal = 0, countMarg = 0;
    rows.forEach(function(r2) {
      totalKontrak  += r2.nilaiKontrak;
      totalRealisasi += r2.realisasiHPP;
      if (r2.marginRealisasi !== null) { sumMargReal += r2.marginRealisasi; countMarg++; }
    });

    // Rekap per akun (global dalam periode)
    var rekapAkun = Object.keys(expByAkun).map(function(nama) {
      return { namaAkun: nama, total: expByAkun[nama] };
    }).sort(function(a, b) { return b.total - a.total; });

    return {
      success:      true,
      rows:         rows,
      summary: {
        totalKontrak:       totalKontrak,
        totalRealisasiHPP:  totalRealisasi,
        rataMarginRealisasi: countMarg > 0 ? sumMargReal / countMarg : null
      },
      rekapAkun: rekapAkun
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Laporan Keuntungan Bulanan (perusahaan, exclude PPN) ──────────────────────
// Keuntungan = nilai invoice ditagihkan (DPP, by tanggal terbit) - pengeluaran project - pengeluaran non-project

var _LP_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
  'Agustus','September','Oktober','November','Desember'];

function getLaporanKeuntunganBulanan(params) {
  try {
    params = params || {};
    var tahun = parseInt(params.tahun, 10) || new Date().getFullYear();

    var bulanData = [];
    for (var b = 0; b < 12; b++) {
      bulanData.push({
        bulan:               _LP_BULAN[b],
        bulanIdx:            b + 1,
        invoiceDPP:          0,
        pengeluaranProject:  0,
        pengeluaranNonProject: 0
      });
    }

    // Invoice DPP per bulan (berdasarkan tanggal terbit invoice)
    var invData = _cachedInvoice();
    for (var i = 1; i < invData.length; i++) {
      var rowInv = invData[i];
      if (!rowInv[0]) continue;
      var tglInv = _fmtTgl(rowInv[3]);
      var tp = tglInv.split('/');
      if (tp.length !== 3) continue;
      var y = parseInt(tp[2], 10), m = parseInt(tp[1], 10);
      if (y !== tahun) continue;
      var dpp = parseFloat(rowInv[11]) || 0;
      bulanData[m - 1].invoiceDPP += dpp;
    }

    // Pengeluaran per bulan (project & non-project), + breakdown kategori non-project
    var kategoriTotal = {};
    var ss    = getSpreadsheet();
    var sheet = _ensurePengeluaranKategoriCol(ss);
    var expData = sheet.getDataRange().getValues();
    for (var j = 1; j < expData.length; j++) {
      var rowExp = expData[j];
      if (!rowExp[0]) continue;
      var tglExp = _fmtTgl(rowExp[2]);
      var tpe = tglExp.split('/');
      if (tpe.length !== 3) continue;
      var ye = parseInt(tpe[2], 10), me = parseInt(tpe[1], 10);
      if (ye !== tahun) continue;
      var totalExp = parseFloat(rowExp[12]) || 0;
      var noWOExp  = (rowExp[1] || '').toString().trim();
      if (noWOExp) {
        bulanData[me - 1].pengeluaranProject += totalExp;
      } else {
        bulanData[me - 1].pengeluaranNonProject += totalExp;
        var kat = (rowExp[18] || 'Lainnya').toString();
        kategoriTotal[kat] = (kategoriTotal[kat] || 0) + totalExp;
      }
    }

    var totalInvoiceDPP = 0, totalPengeluaranProject = 0, totalPengeluaranNonProject = 0;
    var rows = bulanData.map(function(d) {
      var keuntungan = d.invoiceDPP - d.pengeluaranProject - d.pengeluaranNonProject;
      totalInvoiceDPP            += d.invoiceDPP;
      totalPengeluaranProject    += d.pengeluaranProject;
      totalPengeluaranNonProject += d.pengeluaranNonProject;
      return {
        bulan:                 d.bulan,
        bulanIdx:               d.bulanIdx,
        invoiceDPP:             d.invoiceDPP,
        pengeluaranProject:     d.pengeluaranProject,
        pengeluaranNonProject:  d.pengeluaranNonProject,
        keuntungan:             keuntungan
      };
    });

    var kategoriBreakdown = Object.keys(kategoriTotal).map(function(k) {
      return { kategori: k, total: kategoriTotal[k] };
    }).sort(function(a, b) { return b.total - a.total; });

    return {
      success: true,
      tahun:   tahun,
      rows:    rows,
      summary: {
        totalInvoiceDPP:            totalInvoiceDPP,
        totalPengeluaranProject:    totalPengeluaranProject,
        totalPengeluaranNonProject: totalPengeluaranNonProject,
        totalPengeluaran:           totalPengeluaranProject + totalPengeluaranNonProject,
        totalKeuntungan:            totalInvoiceDPP - totalPengeluaranProject - totalPengeluaranNonProject
      },
      kategoriBreakdown: kategoriBreakdown
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Fase 4: Data export laporan pengeluaran per WO ────────────────────────────

function getExportPengeluaranWO(noWO) {
  try {
    var hpp = getRealisasiHPP(noWO);
    if (!hpp.success) return hpp;

    // Bangun struktur D: rincian per akun
    var akunGroups = {}; // namaAkun → [pengeluaran items]
    hpp.pengeluaranList.forEach(function(p) {
      var key = p.namaAkun || '(Tanpa Akun)';
      if (!akunGroups[key]) akunGroups[key] = [];
      akunGroups[key].push(p);
    });

    var detailPerAkun = Object.keys(akunGroups).map(function(nama) {
      var items    = akunGroups[nama];
      var subtotal = items.reduce(function(s, it) { return s + it.total; }, 0);
      return { namaAkun: nama, items: items, subtotal: subtotal };
    }).sort(function(a, b) { return b.subtotal - a.subtotal; });

    return {
      success:        true,
      header: {
        noWO:         hpp.noWO,
        namaProject:  hpp.namaProject,
        namaKlien:    hpp.namaKlien,
        tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy')
      },
      ringkasan: {
        nilaiKontrak:    hpp.nilaiKontrak,
        estimasiHPP:     hpp.estimasiHPP,
        realisasiHPP:    hpp.realisasiHPP,
        selisih:         hpp.selisih,
        marginEstimasi:  hpp.marginEstimasi,
        marginRealisasi: hpp.marginRealisasi
      },
      rekapAkun:     hpp.breakdownAkun,
      detailPerAkun: detailPerAkun
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
