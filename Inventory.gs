/**
 * RenusPro — Modul Inventory / Stok
 * Fase 1: Sheet setup, read functions, rekalkulasi saldo
 * Fase 2: Penerimaan dari PO, sinkron HPP
 * Fase 3: Penerimaan tanpa PO, penyesuaian, gunakanStok (integrasi Modul 3)
 */

// ── Sheet Headers ────────────────────────────────────────────────────────────

function _ensureStokSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Stok');
  if (!sheet) {
    sheet = ss.insertSheet('Stok');
    sheet.appendRow([
      'ID Produk', 'Nama Produk', 'Satuan',
      'Qty Tersedia', 'Harga Beli Terakhir', 'Nilai Stok',
      'Terakhir Diubah Pada'
    ]);
  }
  return sheet;
}

function _ensureMutasiStokSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Mutasi_Stok');
  if (!sheet) {
    sheet = ss.insertSheet('Mutasi_Stok');
    sheet.appendRow([
      'ID Mutasi', 'Tanggal', 'ID Produk', 'Nama Produk',
      'Jenis Mutasi', 'Referensi', 'Qty Masuk', 'Qty Keluar',
      'Harga Satuan', 'Saldo Setelah', 'Keterangan',
      'Dibuat Oleh', 'Dibuat Pada'
    ]);
  }
  return sheet;
}

function _ensurePenerimaanTanpaPOSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Penerimaan_Tanpa_PO');
  if (!sheet) {
    sheet = ss.insertSheet('Penerimaan_Tanpa_PO');
    sheet.appendRow([
      'ID', 'Tanggal', 'ID Produk', 'Nama Produk',
      'Qty', 'Harga Satuan', 'ID Akun Pembayaran', 'Nama Akun',
      'Keterangan', 'Update Harga', 'Dibuat Oleh', 'Dibuat Pada'
    ]);
  }
  return sheet;
}

// ── ID Generator ─────────────────────────────────────────────────────────────

function _ensurePenerimaanPOLogSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Penerimaan_PO_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Penerimaan_PO_Log');
    sheet.appendRow([
      'ID Log', 'No PO', 'Tanggal', 'Mode',
      'Jumlah Item', 'Detail Item (JSON)',
      'Dibuat Oleh', 'Dibuat Pada',
      'Bukti File Id', 'Bukti File Url', 'Bukti File Nama'
    ]);
  }
  return sheet;
}

function _ensurePenerimaanPOLogBuktiCols(ss) {
  ss = ss || getSpreadsheet();
  var sheet = _ensurePenerimaanPOLogSheet(ss);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 9)  sheet.getRange(1, 9).setValue('Bukti File Id');
  if (lastCol < 10) sheet.getRange(1, 10).setValue('Bukti File Url');
  if (lastCol < 11) sheet.getRange(1, 11).setValue('Bukti File Nama');
  return sheet;
}

function _getPOPenerimaanBuktiFolder() {
  var root = DriveApp.getRootFolder();
  var folders = root.getFoldersByName('RenusPro - Bukti Penerimaan Barang (PO)');
  return folders.hasNext() ? folders.next() : root.createFolder('RenusPro - Bukti Penerimaan Barang (PO)');
}

function uploadFileBuktiPenerimaanPO(payload) {
  try {
    var base64Data = (payload.base64Data || '').toString();
    var fileName   = (payload.fileName   || 'bukti-penerimaan').toString();
    var mimeType   = (payload.mimeType   || 'application/octet-stream').toString();
    if (!base64Data) return { success: false, message: 'File tidak boleh kosong.' };

    var blob   = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var folder = _getPOPenerimaanBuktiFolder();
    var file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function _generateIdPenerimaanPOLog(sheet) {
  SpreadsheetApp.flush();
  var lastRow = sheet.getLastRow();
  return 'RCV-' + new Date().getTime() + '-' + lastRow;
}

function _catatPenerimaanPOLog(ss, noPO, mode, itemsDiterima, namaUser, bukti) {
  var sheet = _ensurePenerimaanPOLogBuktiCols(ss);
  var tz     = Session.getScriptTimeZone();
  var now    = new Date();
  var tglStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  var nowStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm:ss');
  var detail = itemsDiterima.map(function(it) {
    return { namaItem: it.namaItem || '', qty: it.qty || 0, satuan: it.satuan || '', catatan: (it.catatan || '').toString().trim() };
  });
  bukti = bukti || {};
  sheet.appendRow([
    _generateIdPenerimaanPOLog(sheet), noPO, tglStr, mode,
    detail.length, JSON.stringify(detail),
    namaUser || '', nowStr,
    bukti.fileId || '', bukti.fileUrl || '', bukti.fileName || ''
  ]);
}

/**
 * Riwayat penerimaan barang dari PO (lintas-PO), untuk ditampilkan
 * di menu Inventory agar warehouse bisa melihat riwayat tanpa harus
 * membuka detail Purchase Order.
 */
function getRiwayatPenerimaanList(params) {
  try {
    params = params || {};
    var ss = getSpreadsheet();

    // Map noPO -> info supplier/peruntukan/noWO
    var poInfoMap = {};
    var poSheet = ss.getSheetByName('Purchase_Order');
    if (poSheet) {
      var poData = poSheet.getDataRange().getValues();
      for (var p = 1; p < poData.length; p++) {
        var noPOKey = (poData[p][0] || '').toString().trim();
        if (!noPOKey) continue;
        poInfoMap[noPOKey] = {
          namaSupplier: poData[p][3] ? poData[p][3].toString() : '',
          peruntukan:   poData[p][4] ? poData[p][4].toString() : '',
          noWO:         poData[p][5] ? poData[p][5].toString() : ''
        };
      }
    }

    var logSheet = _ensurePenerimaanPOLogBuktiCols(ss);
    var logData  = logSheet.getDataRange().getValues();
    var riwayat  = [];
    for (var i = 1; i < logData.length; i++) {
      var lr = logData[i];
      var noPO = lr[1] ? lr[1].toString().trim() : '';
      if (!noPO) continue;
      if (params.noPO && noPO !== params.noPO) continue;
      var detailItem = [];
      try { detailItem = JSON.parse(lr[5] || '[]'); } catch (eParse) { detailItem = []; }
      var info = poInfoMap[noPO] || {};
      riwayat.push({
        idLog:        lr[0] ? lr[0].toString() : '',
        noPO:         noPO,
        namaSupplier: info.namaSupplier || '',
        peruntukan:   info.peruntukan || '',
        noWO:         info.noWO || '',
        tanggal:      _fmtTgl(lr[2]),
        mode:         lr[3] ? lr[3].toString() : '',
        jumlahItem:   parseFloat(lr[4]) || 0,
        items:        detailItem,
        dibuatOleh:   lr[6] ? lr[6].toString() : '',
        dibuatPada:   lr[7] ? lr[7].toString() : '',
        buktiFileId:   lr[8]  ? lr[8].toString()  : '',
        buktiFileUrl:  lr[9]  ? lr[9].toString()  : '',
        buktiFileName: lr[10] ? lr[10].toString() : ''
      });
    }
    riwayat.reverse();
    return { success: true, list: riwayat };
  } catch (e) {
    return { success: false, message: e.toString(), list: [] };
  }
}

function _generateIdStok(sheet) {
  var data   = sheet.getDataRange().getValues();
  var maxSeq = 0;
  for (var i = 1; i < data.length; i++) {
    var id = (data[i][0] || '').toString();
    if (/^STK-\d+$/i.test(id)) {
      var seq = parseInt(id.replace(/^STK-/i, ''), 10) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return 'STK-' + ('000' + (maxSeq + 1)).slice(-3);
}

function _generateIdMutasi(sheet) {
  var now    = new Date();
  var tz     = Session.getScriptTimeZone();
  var prefix = 'MUT-' + Utilities.formatDate(now, tz, 'yyyyMM') + '-';
  var data   = sheet.getDataRange().getValues();
  var maxSeq = 0;
  for (var i = 1; i < data.length; i++) {
    var id = (data[i][0] || '').toString();
    if (id.indexOf(prefix) === 0) {
      var seq = parseInt(id.replace(prefix, ''), 10) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return prefix + ('000' + (maxSeq + 1)).slice(-3);
}

function _generateIdPenerimaanTanpaPO(sheet) {
  var now    = new Date();
  var tz     = Session.getScriptTimeZone();
  var prefix = 'PTNPO-' + Utilities.formatDate(now, tz, 'yyyyMM') + '-';
  var data   = sheet.getDataRange().getValues();
  var maxSeq = 0;
  for (var i = 1; i < data.length; i++) {
    var id = (data[i][0] || '').toString();
    if (id.indexOf(prefix) === 0) {
      var seq = parseInt(id.replace(prefix, ''), 10) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return prefix + ('000' + (maxSeq + 1)).slice(-3);
}

// ── Stok CRUD ────────────────────────────────────────────────────────────────

function tambahItemStok(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss     = getSpreadsheet();
    var sheet  = _ensureStokSheet(ss);
    var nama   = (payload.nama || '').trim();
    var satuan = (payload.satuan || '').trim();
    var harga  = Number(payload.hargaBeli) || 0;
    var qty    = Number(payload.stokAwal) || 0;
    if (!nama)   return { success: false, message: 'Nama item wajib diisi.' };
    if (!satuan) return { success: false, message: 'Satuan wajib diisi.' };
    var id      = _generateIdStok(sheet);
    var tz      = Session.getScriptTimeZone();
    var nowStr  = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var nilai   = qty * harga;
    sheet.appendRow([id, nama, satuan, qty, harga, nilai, nowStr]);
    if (qty > 0) {
      var mSheet = _ensureMutasiStokSheet(ss);
      var idMut  = _generateIdMutasi(mSheet);
      mSheet.appendRow([idMut, Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'), id, nama,
        'Stok Awal', '', qty, 0, harga, qty, 'Stok awal saat pendaftaran item', payload.namaUser || '', nowStr]);
    }
    invalidateStokCache();
    return { success: true, message: 'Item stok ' + id + ' berhasil ditambahkan.', idStok: id };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function editItemStok(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss     = getSpreadsheet();
    var sheet  = _ensureStokSheet(ss);
    var idStok = (payload.idStok || '').toString().trim();
    var nama   = (payload.nama || '').trim();
    var satuan = (payload.satuan || '').trim();
    if (!idStok) return { success: false, message: 'ID Stok wajib diisi.' };
    if (!nama)   return { success: false, message: 'Nama item wajib diisi.' };
    if (!satuan) return { success: false, message: 'Satuan wajib diisi.' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idStok) {
        sheet.getRange(i + 1, 2, 1, 2).setValues([[nama, satuan]]);
        invalidateStokCache();
        return { success: true, message: 'Item stok ' + idStok + ' berhasil diperbarui.' };
      }
    }
    return { success: false, message: 'ID Stok tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusItemStok(idStok) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss     = getSpreadsheet();
    // Cek apakah ada Master_Produk yang link ke stok ini
    _ensureStokLinkKolom(ss);
    var pSheet = ss.getSheetByName('Master_Produk');
    if (pSheet) {
      var pData = pSheet.getDataRange().getValues();
      for (var k = 1; k < pData.length; k++) {
        if ((pData[k][6] || '').toString().trim() === idStok) {
          return { success: false, message: 'Tidak bisa dihapus — Produk/Jasa "' + pData[k][1] + '" terhubung ke item stok ini.' };
        }
      }
    }
    var sSheet = _ensureStokSheet(ss);
    var data   = sSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idStok) {
        sSheet.deleteRow(i + 1);
        invalidateStokCache();
        return { success: true, message: 'Item stok ' + idStok + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'ID Stok tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sinkron col[7] Qty Tersedia di Master_Produk untuk semua produk yang link ke idStok.
 */
function _syncQtyTersediaProduk(ss, idStok, qtyBaru) {
  ss = ss || getSpreadsheet();
  _ensureStokLinkKolom(ss);
  var pSheet = ss.getSheetByName('Master_Produk');
  if (!pSheet) return;
  var data = pSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][6] || '').toString().trim() === idStok) {
      pSheet.getRange(i + 1, 8).setValue(qtyBaru);
    }
  }
  invalidateProdukCache();
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Update atau buat baris di sheet Stok untuk ID produk tertentu.
 * qtyDelta: + untuk masuk, - untuk keluar
 * Mengembalikan saldo baru.
 */
function _updateStokEntry(ss, idProduk, namaProduk, satuan, qtyDelta, hargaBeli, nilaiDelta) {
  var sheet = _ensureStokSheet(ss);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  var tz    = Session.getScriptTimeZone();
  var tgl   = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm');
  nilaiDelta = Number(nilaiDelta) || 0;

  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === idProduk.toString().trim()) {
      var newQty   = (Number(data[i][3]) || 0) + qtyDelta;
      var newHarga = hargaBeli !== null ? hargaBeli : (Number(data[i][4]) || 0);
      var nilaiStok = Math.max(0, (Number(data[i][5]) || 0) + nilaiDelta);
      sheet.getRange(i + 1, 4, 1, 4).setValues([[newQty, newHarga, nilaiStok, tgl]]);
      return newQty;
    }
  }
  // Produk belum ada di Stok — buat baris baru
  var newQty    = qtyDelta;
  var newHarga  = hargaBeli !== null ? hargaBeli : 0;
  var nilaiStok = Math.max(0, nilaiDelta);
  sheet.appendRow([idProduk, namaProduk, satuan, newQty, newHarga, nilaiStok, tgl]);
  return newQty;
}

/**
 * ── FIFO Lot Helpers ──
 * Lot biaya per produk diturunkan (derive) dari riwayat Mutasi_Stok yang sudah
 * append-only & urut kronologis — bukan disimpan terpisah — agar tidak ada
 * sumber data ganda yang bisa tidak sinkron.
 *
 * rows: array [qtyMasuk, qtyKeluar, hargaSatuan] urut kronologis untuk satu produk.
 */
function _replayLotsFromRows(rows) {
  var lots = [];
  var hargaTerakhir = 0;
  for (var i = 0; i < rows.length; i++) {
    var masuk = rows[i][0], keluar = rows[i][1], harga = rows[i][2];
    if (masuk > 0) {
      lots.push({ qty: masuk, harga: harga });
      if (harga > 0) hargaTerakhir = harga;
    } else if (keluar > 0) {
      var sisa = keluar;
      while (sisa > 0 && lots.length > 0) {
        var lot = lots[0];
        if (lot.qty <= sisa) { sisa -= lot.qty; lots.shift(); }
        else { lot.qty -= sisa; sisa = 0; }
      }
    }
  }
  return { lots: lots, hargaTerakhir: hargaTerakhir };
}

/**
 * Ambil lot FIFO (yang masih tersisa) untuk satu produk, langsung dari sheet
 * Mutasi_Stok (live, bukan cache) — dipakai sebelum mengeluarkan stok.
 */
function _deriveLotsUntukProduk(ss, idProduk) {
  idProduk = idProduk.toString().trim();
  var mSheet = _ensureMutasiStokSheet(ss);
  var mData  = mSheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < mData.length; i++) {
    if ((mData[i][2] || '').toString().trim() !== idProduk) continue;
    rows.push([Number(mData[i][6]) || 0, Number(mData[i][7]) || 0, Number(mData[i][8]) || 0]);
  }
  return _replayLotsFromRows(rows).lots;
}

/**
 * Bangun map lot FIFO untuk SEMUA produk sekaligus dalam satu pass —
 * dipakai oleh rekalkulasiSaldoDariMutasi agar tidak perlu N pass terpisah.
 * Mengembalikan { idProduk: { lots, hargaTerakhir, nama } }.
 */
function _buildLotsMapFromMutasi(mData) {
  var grouped = {};
  for (var i = 1; i < mData.length; i++) {
    var idP = (mData[i][2] || '').toString().trim();
    if (!idP) continue;
    if (!grouped[idP]) grouped[idP] = { rows: [], nama: '' };
    var nama = (mData[i][3] || '').toString();
    if (nama) grouped[idP].nama = nama;
    grouped[idP].rows.push([Number(mData[i][6]) || 0, Number(mData[i][7]) || 0, Number(mData[i][8]) || 0]);
  }
  var map = {};
  for (var idP2 in grouped) {
    var replay = _replayLotsFromRows(grouped[idP2].rows);
    map[idP2] = { lots: replay.lots, hargaTerakhir: replay.hargaTerakhir, nama: grouped[idP2].nama };
  }
  return map;
}

/**
 * Hitung biaya FIFO untuk mengeluarkan qtyButuh dari lots (tidak memodifikasi lots asli).
 * Mengembalikan { totalQty, totalCost, hargaRataRata } atau null jika lot tidak cukup.
 */
function _hitungBiayaFIFO(lots, qtyButuh) {
  var totalTersedia = 0;
  for (var i = 0; i < lots.length; i++) totalTersedia += lots[i].qty;
  if (totalTersedia < qtyButuh) return null;
  var sisa = qtyButuh, totalCost = 0;
  for (var j = 0; j < lots.length && sisa > 0; j++) {
    var ambil = Math.min(lots[j].qty, sisa);
    totalCost += ambil * lots[j].harga;
    sisa -= ambil;
  }
  return {
    totalQty:      qtyButuh,
    totalCost:     totalCost,
    hargaRataRata: qtyButuh > 0 ? (totalCost / qtyButuh) : 0
  };
}

/**
 * Rincian lot FIFO produk tertentu untuk ditampilkan di UI ("Lihat Rincian Lot").
 */
function getRincianLotProduk(idProduk) {
  try {
    var ss   = getSpreadsheet();
    var lots = _deriveLotsUntukProduk(ss, (idProduk || '').toString().trim());
    var qtyTotal = 0, nilaiTotal = 0;
    var rincian = lots.map(function(lot) {
      qtyTotal   += lot.qty;
      nilaiTotal += lot.qty * lot.harga;
      return { qty: lot.qty, harga: lot.harga, nilai: lot.qty * lot.harga };
    });
    return { success: true, lots: rincian, qtyTotal: qtyTotal, nilaiTotal: nilaiTotal };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Sinkron HPP di Master_Produk.
 * Cari baris yang col[0] === idProduk ATAU col[6] === idProduk (untuk STK-###).
 */
function _syncHPPProduk(ss, idProduk, hargaBeli) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Master_Produk');
  if (!sheet) return;
  _ensureStokLinkKolom(ss);
  var data = sheet.getDataRange().getValues();
  var updated = false;
  for (var i = 1; i < data.length; i++) {
    var matchById   = (data[i][0] || '').toString().trim() === idProduk.toString().trim();
    var matchByStok = (data[i][6] || '').toString().trim() === idProduk.toString().trim();
    if (matchById || matchByStok) {
      sheet.getRange(i + 1, 5).setValue(hargaBeli); // col[4] = HPP
      updated = true;
    }
  }
  if (updated) invalidateProdukCache();
}

// ── Read Functions ───────────────────────────────────────────────────────────

function getStokList() {
  try {
    _ensureStokSheet();
    var data = _cachedStok();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var qty    = Number(data[i][3]) || 0;
      var harga  = Number(data[i][4]) || 0;
      list.push({
        idStok:          data[i][0].toString(),
        idProduk:        data[i][0].toString(),
        namaProduk:      data[i][1].toString(),
        satuan:          data[i][2].toString(),
        qtyTersedia:     qty,
        hargaBeliTerakhir: harga,
        nilaiStok:       Number(data[i][5]) || 0,
        terakhirDiubah:  data[i][6] ? data[i][6].toString() : ''
      });
    }
    return list;
  } catch(e) { return []; }
}

function getMutasiStokList(params) {
  try {
    _ensureMutasiStokSheet();
    params = params || {};
    var data = _cachedMutasiStok();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var row = {
        idMutasi:    data[i][0].toString(),
        tanggal:     _fmtTgl(data[i][1]),
        idProduk:    data[i][2].toString(),
        namaProduk:  data[i][3].toString(),
        jenisMutasi: data[i][4].toString(),
        referensi:   data[i][5].toString(),
        qtyMasuk:    Number(data[i][6]) || 0,
        qtyKeluar:   Number(data[i][7]) || 0,
        hargaSatuan: Number(data[i][8]) || 0,
        saldoSetelah:Number(data[i][9]) || 0,
        keterangan:  data[i][10].toString(),
        dibuatOleh:  data[i][11].toString(),
        dibuatPada:  data[i][12] ? data[i][12].toString() : ''
      };
      // Filter
      if (params.idProduk && row.idProduk !== params.idProduk) continue;
      if (params.jenisMutasi && row.jenisMutasi !== params.jenisMutasi) continue;
      list.push(row);
    }
    // Sort terbaru dulu
    list.reverse();
    return list;
  } catch(e) { return []; }
}

/**
 * Edit keterangan riwayat mutasi. Hanya field Keterangan yang bisa diubah
 * agar tidak merusak konsistensi saldo/qty yang sudah terhitung.
 */
function editMutasiStok(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = _ensureMutasiStokSheet(ss);
    var idMutasi = (payload.idMutasi || '').toString().trim();
    if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
    var keterangan = (payload.keterangan || '').toString();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idMutasi) {
        sheet.getRange(i + 1, 11).setValue(keterangan);
        invalidateMutasiStokCache();
        return { success: true, message: 'Keterangan mutasi ' + idMutasi + ' berhasil diperbarui.' };
      }
    }
    return { success: false, message: 'ID Mutasi tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hapus satu baris riwayat mutasi, lalu rekalkulasi ulang saldo stok
 * dari seluruh riwayat yang tersisa agar Qty Tersedia tetap konsisten.
 */
function hapusMutasiStok(idMutasi) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = _ensureMutasiStokSheet(ss);
    idMutasi = (idMutasi || '').toString().trim();
    if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
    var data = sheet.getDataRange().getValues();
    var idProduk = '';
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idMutasi) {
        idProduk = (data[i][2] || '').toString().trim();
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
    sheet.deleteRow(rowIdx + 1);

    var hasil = rekalkulasiSaldoDariMutasi();
    if (!hasil.success) return hasil;

    if (idProduk) {
      var stokList = getStokList();
      var found = null;
      for (var k = 0; k < stokList.length; k++) {
        if (stokList[k].idStok === idProduk) { found = stokList[k]; break; }
      }
      _syncQtyTersediaProduk(ss, idProduk, found ? found.qtyTersedia : 0);
    }
    return { success: true, message: 'Riwayat mutasi ' + idMutasi + ' berhasil dihapus & saldo stok disesuaikan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Rekalkulasi Saldo dari Mutasi ────────────────────────────────────────────

function rekalkulasiSaldoDariMutasi() {
  try {
    var ss   = getSpreadsheet();
    var mSheet = _ensureMutasiStokSheet(ss);
    var sSheet = _ensureStokSheet(ss);
    var mData  = mSheet.getDataRange().getValues();

    // Replay seluruh riwayat sebagai lot FIFO per produk (qty & nilai stok jadi akurat
    // per-batch, bukan qty total dikali harga terakhir).
    var lotsMap = _buildLotsMapFromMutasi(mData); // idProduk → { lots, hargaTerakhir, nama }

    // Baca satuan dari Stok sheet existing atau Master_Produk
    var stokData   = sSheet.getDataRange().getValues();
    var satuanMap  = {};
    for (var j = 1; j < stokData.length; j++) {
      satuanMap[(stokData[j][0] || '').toString()] = (stokData[j][2] || '').toString();
    }
    var produkSheet = ss.getSheetByName('Master_Produk');
    if (produkSheet) {
      var pData = produkSheet.getDataRange().getValues();
      for (var k = 1; k < pData.length; k++) {
        var pid = (pData[k][0] || '').toString();
        if (!satuanMap[pid]) satuanMap[pid] = (pData[k][2] || '').toString();
      }
    }

    // Rebuild sheet Stok
    var tz  = Session.getScriptTimeZone();
    var now = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var ids = Object.keys(lotsMap).sort();
    var newRows = [['ID Produk','Nama Produk','Satuan','Qty Tersedia','Harga Beli Terakhir','Nilai Stok','Terakhir Diubah Pada']];
    ids.forEach(function(id) {
      var info = lotsMap[id];
      var qtyTotal = 0, nilaiTotal = 0;
      info.lots.forEach(function(lot) { qtyTotal += lot.qty; nilaiTotal += lot.qty * lot.harga; });
      newRows.push([id, info.nama || id, satuanMap[id] || '', qtyTotal, info.hargaTerakhir, nilaiTotal, now]);
    });

    sSheet.clearContents();
    if (newRows.length > 0) {
      sSheet.getRange(1, 1, newRows.length, 7).setValues(newRows);
    }
    invalidateStokCache();
    invalidateMutasiStokCache();
    return { success: true, message: 'Rekalkulasi selesai. ' + ids.length + ' produk diproses.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Fase 2: Penerimaan dari PO ───────────────────────────────────────────────

/**
 * Ambil item PO beserta qty diterima, untuk form penerimaan.
 */
function getPOItemsUntukPenerimaan(noPO) {
  try {
    var ss      = getSpreadsheet();
    var poSheet = ss.getSheetByName('Purchase_Order');
    var itSheet = _ensurePOItemCols(ss);
    if (!poSheet || !itSheet) return { success: false, message: 'Sheet PO tidak ditemukan.' };

    // Validasi status PO
    var poData  = poSheet.getDataRange().getValues();
    var statusPO = '';
    for (var i = 1; i < poData.length; i++) {
      if ((poData[i][0] || '').toString().trim() === noPO) {
        statusPO = (poData[i][6] || '').toString();
        break;
      }
    }
    if (!statusPO) return { success: false, message: 'PO tidak ditemukan.' };
    if (statusPO !== 'Aktif' && statusPO !== 'Diterima Sebagian' && statusPO !== 'Menunggu Penerimaan Gudang') {
      return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
    }

    // Ambil item PO dan data produk
    var itData  = itSheet.getDataRange().getValues();
    var produkSheet = ss.getSheetByName('Master_Produk');
    var produkMap = {};
    if (produkSheet) {
      var pData = produkSheet.getDataRange().getValues();
      for (var k = 1; k < pData.length; k++) {
        produkMap[(pData[k][0] || '').toString()] = {
          tipe: (pData[k][5] || '').toString(),
          satuan: (pData[k][2] || '').toString()
        };
      }
    }

    var items = [];
    for (var j = 1; j < itData.length; j++) {
      if ((itData[j][1] || '').toString().trim() !== noPO) continue;
      var idItem    = (itData[j][0] || '').toString();
      var namaItem  = (itData[j][2] || '').toString();
      var qty       = Number(itData[j][3]) || 0;
      var satuan    = (itData[j][4] || '').toString();
      var harga     = Number(itData[j][5]) || 0;
      var qtyDiterima = Number(itData[j][8]) || 0;
      var qtySisa   = qty - qtyDiterima;

      // Cari produk match berdasarkan nama (nama item PO = nama produk untuk Material matching)
      // ID Produk disimpan di col[9] jika ada, atau kosong
      var idProduk = itData[j][9] ? itData[j][9].toString() : '';

      items.push({
        idItem:        idItem,
        namaItem:      namaItem,
        satuan:        satuan,
        hargaBeli:     harga,
        qtyPesan:      qty,
        qtyDiterima:   qtyDiterima,
        qtySisa:       Math.max(0, qtySisa),
        idProduk:      idProduk
      });
    }

    return { success: true, items: items, statusPO: statusPO };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Proses penerimaan PO items.
 * payload: { noPO, items: [{idItem, idProduk, namaItem, satuan, qty, hargaBeli}], namaUser }
 * Strategi: validasi penuh dulu, baru tulis berurutan.
 */
function terimaPOItems(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss       = getSpreadsheet();
    var poSheet  = ss.getSheetByName('Purchase_Order');
    var itSheet  = _ensurePOItemCols(ss);
    var mSheet   = _ensureMutasiStokSheet(ss);
    var sSheet   = _ensureStokSheet(ss);
    var produkSheet = ss.getSheetByName('Master_Produk');

    if (!poSheet || !itSheet) return { success: false, message: 'Sheet PO tidak ditemukan.' };

    var noPO     = payload.noPO;
    var items    = payload.items || [];
    var namaUser = payload.namaUser || '';
    var now      = new Date();
    var tz       = Session.getScriptTimeZone();
    var nowStr   = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm');
    var tglStr   = Utilities.formatDate(now, tz, 'dd/MM/yyyy');

    if (!items.length) return { success: false, message: 'Tidak ada item yang diterima.' };

    var buktiFileUrl = (payload.buktiFileUrl || '').toString().trim();
    if (!buktiFileUrl) {
      return { success: false, message: 'Bukti barang diterima inventory wajib dilampirkan.' };
    }

    // ── VALIDASI PENUH ──
    var poData   = poSheet.getDataRange().getValues();
    var poRowIdx = -1;
    var statusPO = '';
    for (var i = 1; i < poData.length; i++) {
      if ((poData[i][0] || '').toString().trim() === noPO) {
        poRowIdx = i;
        statusPO = (poData[i][6] || '').toString();
        break;
      }
    }
    if (poRowIdx < 0) return { success: false, message: 'PO tidak ditemukan.' };
    if (statusPO !== 'Aktif' && statusPO !== 'Diterima Sebagian' && statusPO !== 'Menunggu Penerimaan Gudang') {
      return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
    }
    var noWOPO       = (poData[poRowIdx][5] || '').toString().trim();
    var namaSupplier = (poData[poRowIdx][3] || '').toString();

    // Biaya tambahan penerimaan (ongkir, handling, manpower, dll) dibagi rata per unit
    var biayaTambahan = Number(payload.biayaTambahan) || 0;
    var totalQtyDiterima = 0;
    for (var iq = 0; iq < items.length; iq++) {
      totalQtyDiterima += Number(items[iq].qty) || 0;
    }
    var biayaPerUnit = (biayaTambahan > 0 && totalQtyDiterima > 0) ? (biayaTambahan / totalQtyDiterima) : 0;

    var itData = itSheet.getDataRange().getValues();
    var itRowMap = {}; // idItem → rowIndex di itData
    for (var j = 1; j < itData.length; j++) {
      itRowMap[(itData[j][0] || '').toString()] = j;
    }

    // Validasi tiap item
    var produkMap = {};
    if (produkSheet) {
      var pData = produkSheet.getDataRange().getValues();
      for (var k = 1; k < pData.length; k++) {
        produkMap[(pData[k][0] || '').toString()] = {
          nama: (pData[k][1] || '').toString(),
          satuan: (pData[k][2] || '').toString(),
          tipe: (pData[k][5] || '').toString()
        };
      }
    }

    for (var ii = 0; ii < items.length; ii++) {
      var it       = items[ii];
      var qtyTerima = Number(it.qty) || 0;
      if (qtyTerima <= 0) continue;

      var itRow = itRowMap[it.idItem];
      if (itRow === undefined) return { success: false, message: 'Item ' + it.idItem + ' tidak ditemukan.' };

      var qtySisa = (Number(itData[itRow][3]) || 0) - (Number(itData[itRow][8]) || 0);
      if (qtyTerima > qtySisa) {
        return { success: false, message: 'Qty item "' + it.namaItem + '" melebihi sisa (' + qtySisa + ').' };
      }
      // Validasi item stok ada di sheet Stok
      var idStokCheck = it.idStok || it.idProduk;
      if (idStokCheck) {
        var sDataCheck = sSheet.getDataRange().getValues();
        var stokFound = false;
        for (var sc = 1; sc < sDataCheck.length; sc++) {
          if ((sDataCheck[sc][0] || '').toString().trim() === idStokCheck) { stokFound = true; break; }
        }
        if (!stokFound) return { success: false, message: 'Item stok ' + idStokCheck + ' tidak ditemukan.' };
      }
    }

    // ── TULIS BERURUTAN ──
    // 1. Mutasi Stok + update Stok
    var allQtyDiterimaMap = {}; // idItem → total baru qtyDiterima
    for (var ii2 = 0; ii2 < items.length; ii2++) {
      var it2      = items[ii2];
      var qtyTerima2 = Number(it2.qty) || 0;
      if (qtyTerima2 <= 0) continue;
      var hargaAsli2 = Number(it2.hargaBeli) || 0;
      var harga2   = Math.round(hargaAsli2 + biayaPerUnit); // harga DPP (exclude PPN) + biaya tambahan per unit

      // Cari info produk untuk nama & satuan
      var namaProduk = it2.namaItem;
      var satuanProduk = it2.satuan;
      if (it2.idProduk && produkMap[it2.idProduk]) {
        namaProduk   = produkMap[it2.idProduk].nama;
        satuanProduk = produkMap[it2.idProduk].satuan;
      }

      var idStokItem = (it2.idStok || it2.idProduk || '').toString().trim();
      if (!idStokItem) {
        // Auto-create stok dari data PO item
        var autoNama   = it2.namaItem || ('Item PO ' + it2.idItem);
        var autoSatuan = it2.satuan || 'unit';
        var autoId     = _generateIdStok(sSheet);
        var autoNow    = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
        sSheet.appendRow([autoId, autoNama, autoSatuan, 0, 0, 0, autoNow]);
        SpreadsheetApp.flush();
        idStokItem = autoId;
      }
      if (idStokItem) {
        var saldoBaru = _updateStokEntry(ss, idStokItem, namaProduk, satuanProduk, qtyTerima2, harga2, qtyTerima2 * harga2);
        var idMutasi  = _generateIdMutasi(mSheet);
        var keteranganMutasi = 'Penerimaan dari PO ' + noPO +
          ' (harga DPP excl. PPN' + (biayaPerUnit > 0 ? ' + biaya tambahan' : '') + ')';
        mSheet.appendRow([
          idMutasi, tglStr, idStokItem, namaProduk,
          'Penerimaan PO', noPO,
          qtyTerima2, 0, harga2, saldoBaru,
          keteranganMutasi,
          namaUser, nowStr
        ]);
        _syncQtyTersediaProduk(ss, idStokItem, saldoBaru);
      }

      // Track qty diterima per item
      var rowIdxOld = itRowMap[it2.idItem];
      var oldQtyDiterima = Number(itData[rowIdxOld][8]) || 0;
      allQtyDiterimaMap[it2.idItem] = oldQtyDiterima + qtyTerima2;
    }

    // 2. Update Qty Diterima di PO_Item
    var itDataFresh = itSheet.getDataRange().getValues();
    for (var idItem in allQtyDiterimaMap) {
      for (var r = 1; r < itDataFresh.length; r++) {
        if ((itDataFresh[r][0] || '').toString() === idItem) {
          itSheet.getRange(r + 1, 9).setValue(allQtyDiterimaMap[idItem]);
          break;
        }
      }
    }

    // 3. Update status PO
    var itDataCheck = itSheet.getDataRange().getValues();
    var allDiterima = true;
    var adaDiterima = false;
    for (var r2 = 1; r2 < itDataCheck.length; r2++) {
      if ((itDataCheck[r2][1] || '').toString().trim() !== noPO) continue;
      var qtyPesan2  = Number(itDataCheck[r2][3]) || 0;
      var qtyDit2    = Number(itDataCheck[r2][8]) || 0;
      if (qtyDit2 > 0) adaDiterima = true;
      if (qtyDit2 < qtyPesan2) allDiterima = false;
    }
    var newStatus = allDiterima ? 'Diterima' : (adaDiterima ? 'Diterima Sebagian' : statusPO);
    poSheet.getRange(poRowIdx + 1, 7).setValue(newStatus);
    poSheet.getRange(poRowIdx + 1, 17).setValue(nowStr); // Diubah Pada

    var itemsDiterimaLog = items.filter(function(it) {
      return (Number(it.qty) || 0) > 0 || (it.catatan && it.catatan.toString().trim());
    });
    if (itemsDiterimaLog.length) {
      _catatPenerimaanPOLog(ss, noPO, 'Gudang', itemsDiterimaLog, namaUser, {
        fileId:   payload.buktiFileId   ? payload.buktiFileId.toString()   : '',
        fileUrl:  buktiFileUrl,
        fileName: payload.buktiFileName ? payload.buktiFileName.toString() : ''
      });
    }

    // Hook Pengeluaran: catat biaya tambahan penerimaan (ongkir/handling/dll) jika PO terikat Work Order
    if (biayaTambahan > 0 && noWOPO) {
      try {
        _buatPengeluaranOtomatis({
          noWO:        noWOPO,
          tanggal:     tglStr,
          sumber:      'Biaya Penerimaan',
          noPO:        noPO,
          idReferensi: 'BTP-' + noPO + '-' + now.getTime(),
          idAkun:      payload.idAkunBiaya   ? payload.idAkunBiaya.toString()   : '',
          namaAkun:    payload.namaAkunBiaya ? payload.namaAkunBiaya.toString() : '',
          deskripsi:   'Biaya tambahan penerimaan PO ' + noPO + ' — ' + namaSupplier,
          qty:         1,
          satuan:      '',
          hargaSatuan: biayaTambahan,
          total:       biayaTambahan,
          catatan:     payload.keteranganBiaya ? payload.keteranganBiaya.toString() : '',
          dibuatOleh:  namaUser
        });
      } catch(eHookBiaya) {
        Logger.log('Hook pengeluaran biaya penerimaan gagal: ' + eHookBiaya.toString());
      }
    }

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();
    invalidatePOCache();
    invalidateProdukCache();

    return { success: true, message: 'Penerimaan berhasil. Status PO: ' + newStatus };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Fase 3: Penerimaan Tanpa PO ──────────────────────────────────────────────

/**
 * payload: { tanggal, idProduk, qty, hargaSatuan, idAkun, namaAkun, keterangan, janganhUpdateHarga, namaUser }
 */
function simpanPenerimaanTanpaPO(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss      = getSpreadsheet();
    var pSheet  = _ensurePenerimaanTanpaPOSheet(ss);
    var mSheet  = _ensureMutasiStokSheet(ss);
    var produkSheet = ss.getSheetByName('Master_Produk');

    var qty       = Number(payload.qty) || 0;
    var harga     = Number(payload.hargaSatuan) || 0;
    var tgl       = payload.tanggal || '';
    var namaUser  = payload.namaUser || '';
    var tz        = Session.getScriptTimeZone();
    var nowStr    = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

    if (qty <= 0)  return { success: false, message: 'Qty harus lebih dari 0.' };
    if (!tgl)      return { success: false, message: 'Tanggal wajib diisi.' };

    var sSheet = _ensureStokSheet(ss);

    // Auto-create stok baru jika namaBaru diisi
    var idProduk = (payload.idStok || payload.idProduk || '').toString().trim();
    if (!idProduk && payload.namaBaru) {
      var nama   = (payload.namaBaru || '').toString().trim();
      var satuan = (payload.satuanBaru || '').toString().trim() || 'unit';
      var newId  = _generateIdStok(sSheet);
      var nowNew = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
      sSheet.appendRow([newId, nama, satuan, 0, 0, 0, nowNew]);
      idProduk = newId;
      SpreadsheetApp.flush();
    }
    if (!idProduk) return { success: false, message: 'Item stok wajib dipilih atau nama item baru wajib diisi.' };

    // Cari info item dari sheet Stok
    var namaProduk = idProduk, satuanProduk = '';
    var stokData   = sSheet.getDataRange().getValues();
    var stokFound  = false;
    for (var i = 1; i < stokData.length; i++) {
      if ((stokData[i][0] || '').toString().trim() === idProduk) {
        namaProduk   = (stokData[i][1] || '').toString();
        satuanProduk = (stokData[i][2] || '').toString();
        stokFound = true;
        break;
      }
    }
    if (!stokFound) return { success: false, message: 'Item stok tidak ditemukan.' };

    var updateHarga = !payload.janganhUpdateHarga;
    var hargaUntukStok = updateHarga ? harga : null;

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qty, hargaUntukStok, qty * harga);

    var idMutasi = _generateIdMutasi(mSheet);
    mSheet.appendRow([
      idMutasi, tgl, idProduk, namaProduk,
      'Penerimaan Tanpa PO', payload.referensi || '',
      qty, 0, harga, saldoBaru,
      payload.keterangan || '',
      namaUser, nowStr
    ]);

    var idPTNPO = _generateIdPenerimaanTanpaPO(pSheet);
    pSheet.appendRow([
      idPTNPO, tgl, idProduk, namaProduk,
      qty, harga,
      payload.idAkun || '', payload.namaAkun || '',
      payload.keterangan || '',
      updateHarga ? 'Ya' : 'Tidak',
      namaUser, nowStr
    ]);

    _syncQtyTersediaProduk(ss, idProduk, saldoBaru);

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();
    return { success: true, message: 'Penerimaan berhasil. Saldo: ' + saldoBaru + ' ' + satuanProduk };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Fase 3: Penyesuaian Stok ─────────────────────────────────────────────────

/**
 * payload: { idProduk, jenis ('+' atau '-'), qty, keterangan, namaUser }
 */
function simpanPenyesuaianStok(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss     = getSpreadsheet();
    var mSheet = _ensureMutasiStokSheet(ss);
    var sSheet = _ensureStokSheet(ss);

    var idProduk  = payload.idStok || payload.idProduk;
    var jenis     = payload.jenis; // '+' atau '-'
    var qty       = Number(payload.qty) || 0;
    var keterangan = (payload.keterangan || '').trim();
    var namaUser  = payload.namaUser || '';
    var tz        = Session.getScriptTimeZone();
    var nowStr    = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var tglStr    = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');

    if (!idProduk)   return { success: false, message: 'Produk wajib dipilih.' };
    if (qty <= 0)    return { success: false, message: 'Qty harus lebih dari 0.' };
    if (!keterangan) return { success: false, message: 'Keterangan wajib diisi untuk penyesuaian stok.' };
    if (jenis !== '+' && jenis !== '-') return { success: false, message: 'Jenis tidak valid.' };

    // Cari saldo & harga terakhir
    var saldoSaat = 0, hargaTerakhir = 0, namaProduk = idProduk, satuanProduk = '';
    var sData = sSheet.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) {
      if ((sData[i][0] || '').toString().trim() === idProduk) {
        saldoSaat     = Number(sData[i][3]) || 0;
        hargaTerakhir = Number(sData[i][4]) || 0;
        namaProduk    = (sData[i][1] || '').toString();
        satuanProduk  = (sData[i][2] || '').toString();
        break;
      }
    }

    if (jenis === '-' && qty > saldoSaat) {
      return { success: false, message: 'Stok tidak cukup. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk };
    }

    var saldoBaru;
    if (jenis === '+') {
      saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qty, null, qty * hargaTerakhir);
    } else {
      var lotsAdj  = _deriveLotsUntukProduk(ss, idProduk);
      var biayaAdj = _hitungBiayaFIFO(lotsAdj, qty);
      if (!biayaAdj) {
        return { success: false, message: 'Stok tidak cukup untuk penyesuaian. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk };
      }
      hargaTerakhir = Math.round(biayaAdj.hargaRataRata);
      saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, -qty, null, -biayaAdj.totalCost);
    }

    var jenisMutasi = jenis === '+' ? 'Penyesuaian +' : 'Penyesuaian -';
    var idMutasi    = _generateIdMutasi(mSheet);
    mSheet.appendRow([
      idMutasi, tglStr, idProduk, namaProduk,
      jenisMutasi, '',
      jenis === '+' ? qty : 0,
      jenis === '-' ? qty : 0,
      hargaTerakhir, saldoBaru,
      keterangan, namaUser, nowStr
    ]);

    _syncQtyTersediaProduk(ss, idProduk, saldoBaru);

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();
    return { success: true, message: 'Penyesuaian berhasil. Saldo baru: ' + saldoBaru + ' ' + satuanProduk };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Titik Integrasi Modul 3: gunakanStok ────────────────────────────────────

/**
 * Digunakan oleh Modul Pengeluaran (Tahap 3) untuk mencatat pemakaian stok pada WO.
 * Mengembalikan { hargaSatuan, total, idMutasi } jika berhasil.
 */
function gunakanStok(noWO, idProduk, qty, tanggal, keterangan, namaUser) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss    = getSpreadsheet();
    var mSheet = _ensureMutasiStokSheet(ss);
    var sSheet = _ensureStokSheet(ss);

    qty = Number(qty) || 0;
    if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };

    var saldoSaat = 0, hargaTerakhir = 0, namaProduk = idProduk, satuanProduk = '';
    var sData = sSheet.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) {
      if ((sData[i][0] || '').toString().trim() === idProduk) {
        saldoSaat     = Number(sData[i][3]) || 0;
        hargaTerakhir = Number(sData[i][4]) || 0;
        namaProduk    = (sData[i][1] || '').toString();
        satuanProduk  = (sData[i][2] || '').toString();
        break;
      }
    }

    if (qty > saldoSaat) {
      return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup. Tersedia: ' + saldoSaat + ' ' + satuanProduk };
    }

    // Blokir jika WO sudah Closed
    if (noWO) {
      try {
        var statusWOStok = _getStatusWO(noWO.toString());
        if (statusWOStok === 'Closed') {
          return { success: false, message: 'Work Order ' + noWO + ' sudah Closed — tidak bisa menggunakan stok.' };
        }
      } catch(eWOStok) { /* lanjut jika WO tidak ditemukan */ }
    }

    var lots  = _deriveLotsUntukProduk(ss, idProduk);
    var biaya = _hitungBiayaFIFO(lots, qty);
    if (!biaya) {
      return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup. Tersedia: ' + saldoSaat + ' ' + satuanProduk };
    }
    var hargaPakai = Math.round(biaya.hargaRataRata);

    var tz     = Session.getScriptTimeZone();
    var nowStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var tglStr = tanggal || Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, -qty, null, -biaya.totalCost);
    var idMutasi  = _generateIdMutasi(mSheet);
    var jenisMutasi = noWO ? 'Penggunaan WO' : 'Penggunaan';
    var referensi   = noWO || '';
    var defaultKet  = noWO ? ('Penggunaan untuk WO ' + noWO) : 'Penggunaan stok';
    mSheet.appendRow([
      idMutasi, tglStr, idProduk, namaProduk,
      jenisMutasi, referensi,
      0, qty, hargaPakai, saldoBaru,
      keterangan || defaultKet,
      namaUser, nowStr
    ]);

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();

    // Hook Pengeluaran: jika penggunaan terikat WO, buat entry pengeluaran otomatis
    if (noWO) {
      try {
        _buatPengeluaranOtomatis({
          noWO:        noWO.toString(),
          tanggal:     tglStr,
          sumber:      'Penggunaan Stok',
          noPO:        '',
          idReferensi: idMutasi,
          idAkun:      'AP001',
          namaAkun:    'Stok',
          deskripsi:   'Penggunaan stok: ' + namaProduk,
          qty:         qty,
          satuan:      satuanProduk,
          hargaSatuan: hargaPakai,
          total:       biaya.totalCost,
          catatan:     keterangan || defaultKet,
          dibuatOleh:  namaUser || ''
        });
      } catch(eHookStok) {
        Logger.log('Hook pengeluaran stok gagal: ' + eHookStok.toString());
      }
    }

    return {
      success:      true,
      idMutasi:     idMutasi,
      hargaSatuan:  hargaPakai,
      total:        biaya.totalCost,
      message:      'Stok berhasil digunakan. Saldo: ' + saldoBaru + ' ' + satuanProduk
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Batalkan penggunaan stok (reversal). Modul 3 menggunakan ini untuk koreksi.
 */
function batalkanPenggunaanStok(idMutasi, namaUser) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss    = getSpreadsheet();
    var mSheet = _ensureMutasiStokSheet(ss);
    var data   = mSheet.getDataRange().getValues();

    var targetRow = null;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === idMutasi) {
        targetRow = data[i];
        break;
      }
    }
    if (!targetRow) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
    if (targetRow[4] !== 'Penggunaan WO') {
      return { success: false, message: 'Hanya mutasi "Penggunaan WO" yang bisa dibatalkan.' };
    }

    var idProduk  = targetRow[2].toString();
    var namaProduk = targetRow[3].toString();
    var satuanProduk = '';
    var qty       = Number(targetRow[7]) || 0;
    var harga     = Number(targetRow[8]) || 0;

    var tz     = Session.getScriptTimeZone();
    var nowStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var tglStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qty, harga, qty * harga);
    var idMutasiBaru = _generateIdMutasi(mSheet);
    mSheet.appendRow([
      idMutasiBaru, tglStr, idProduk, namaProduk,
      'Penyesuaian +', '',
      qty, 0, harga, saldoBaru,
      'Pembatalan ' + idMutasi,
      namaUser, nowStr
    ]);

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();
    return { success: true, message: 'Pembatalan berhasil. Saldo dipulihkan: ' + saldoBaru };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getPOMenungguPenerimaan() {
  try {
    var ss = getSpreadsheet();
    var poSheet = ss.getSheetByName('Purchase_Order');
    var itSheet = ss.getSheetByName('PO_Item');
    if (!poSheet || !itSheet) return [];

    var poData = poSheet.getDataRange().getValues();
    var itData = itSheet.getDataRange().getValues();

    // Build item map by noPO
    var itemsByPO = {};
    for (var j = 1; j < itData.length; j++) {
      var row = itData[j];
      var noPO = (row[1] || '').toString().trim();
      if (!noPO) continue;
      if (!itemsByPO[noPO]) itemsByPO[noPO] = [];
      var qtyPesan    = Number(row[3]) || 0;
      var qtyDiterima = Number(row[8]) || 0;
      var qtySisa     = qtyPesan - qtyDiterima;
      if (qtySisa <= 0) continue; // skip item sudah penuh
      itemsByPO[noPO].push({
        idItem:      (row[0] || '').toString(),
        namaItem:    (row[2] || '').toString(),
        satuan:      (row[4] || '').toString(),
        hargaBeli:   Number(row[5]) || 0,
        qtyPesan:    qtyPesan,
        qtyDiterima: qtyDiterima,
        qtySisa:     qtySisa
      });
    }

    // Build noWO → namaProject map from Penawaran_Main
    var woNamaMap = {};
    try {
      var penData = _cachedPenawaran();
      for (var p = 1; p < penData.length; p++) {
        var wNo = penData[p][17] != null ? penData[p][17].toString().trim() : '';
        var wNm = penData[p][4]  ? penData[p][4].toString().trim() : '';
        if (wNo && wNm) woNamaMap[wNo] = wNm;
      }
    } catch(ep) { /* ignore */ }

    var tz = Session.getScriptTimeZone();
    var result = [];
    for (var i = 1; i < poData.length; i++) {
      var status = (poData[i][6] || '').toString();
      if (status !== 'Menunggu Penerimaan Gudang') continue;
      var noPO2 = (poData[i][0] || '').toString().trim();
      var noWO3 = (poData[i][5] || '').toString();
      var tgl   = poData[i][1]
        ? (poData[i][1] instanceof Date
            ? Utilities.formatDate(poData[i][1], tz, 'dd/MM/yyyy')
            : poData[i][1].toString())
        : '';
      result.push({
        noPO:              noPO2,
        tanggal:           tgl,
        namaSupplier:      (poData[i][3] || '').toString(),
        peruntukan:        (poData[i][4] || '').toString(),
        noWO:              noWO3,
        namaProject:       noWO3 ? (woNamaMap[noWO3] || '') : '',
        ppnPersen:         parseFloat(poData[i][8]) || 0,
        jumlahItemPending: (itemsByPO[noPO2] || []).length,
        items:             itemsByPO[noPO2] || []
      });
    }
    return result;
  } catch(e) {
    return [];
  }
}
