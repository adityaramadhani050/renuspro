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
function _updateStokEntry(ss, idProduk, namaProduk, satuan, qtyDelta, hargaBeli) {
  var sheet = _ensureStokSheet(ss);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  var tz    = Session.getScriptTimeZone();
  var tgl   = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm');

  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === idProduk.toString().trim()) {
      var newQty   = (Number(data[i][3]) || 0) + qtyDelta;
      var newHarga = hargaBeli !== null ? hargaBeli : (Number(data[i][4]) || 0);
      var nilaiStok = newQty * newHarga;
      sheet.getRange(i + 1, 4, 1, 4).setValues([[newQty, newHarga, nilaiStok, tgl]]);
      return newQty;
    }
  }
  // Produk belum ada di Stok — buat baris baru
  var newQty    = qtyDelta;
  var newHarga  = hargaBeli !== null ? hargaBeli : 0;
  var nilaiStok = newQty * newHarga;
  sheet.appendRow([idProduk, namaProduk, satuan, newQty, newHarga, nilaiStok, tgl]);
  return newQty;
}

/**
 * Sinkron HPP di Master_Produk untuk idProduk tertentu.
 */
function _syncHPPProduk(ss, idProduk, hargaBeli) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Master_Produk');
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === idProduk.toString().trim()) {
      sheet.getRange(i + 1, 5).setValue(hargaBeli); // col[4] = HPP
      break;
    }
  }
  invalidateProdukCache();
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
        nilaiStok:       qty * harga,
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

// ── Rekalkulasi Saldo dari Mutasi ────────────────────────────────────────────

function rekalkulasiSaldoDariMutasi() {
  try {
    var ss   = getSpreadsheet();
    var mSheet = _ensureMutasiStokSheet(ss);
    var sSheet = _ensureStokSheet(ss);
    var mData  = mSheet.getDataRange().getValues();

    // Akumulasi per produk
    var saldo  = {}; // idProduk → { qty, hargaTerakhir, nama, satuan }

    for (var i = 1; i < mData.length; i++) {
      var idP   = (mData[i][2] || '').toString().trim();
      var nama  = (mData[i][3] || '').toString();
      var masuk = Number(mData[i][6]) || 0;
      var keluar= Number(mData[i][7]) || 0;
      var harga = Number(mData[i][8]) || 0;

      if (!idP) continue;
      if (!saldo[idP]) saldo[idP] = { qty: 0, hargaTerakhir: 0, nama: nama, satuan: '' };
      saldo[idP].qty += masuk - keluar;
      if (masuk > 0 && harga > 0) saldo[idP].hargaTerakhir = harga;
    }

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
    var ids = Object.keys(saldo).sort();
    var newRows = [['ID Produk','Nama Produk','Satuan','Qty Tersedia','Harga Beli Terakhir','Nilai Stok','Terakhir Diubah Pada']];
    ids.forEach(function(id) {
      var s  = saldo[id];
      var qt = Math.max(0, s.qty);
      newRows.push([id, s.nama, satuanMap[id] || '', qt, s.hargaTerakhir, qt * s.hargaTerakhir, now]);
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
    if (statusPO !== 'Disetujui' && statusPO !== 'Diterima Sebagian') {
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
    if (statusPO !== 'Disetujui' && statusPO !== 'Diterima Sebagian') {
      return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
    }

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
      var harga2   = Number(it2.hargaBeli) || 0;

      // Cari info produk untuk nama & satuan
      var namaProduk = it2.namaItem;
      var satuanProduk = it2.satuan;
      if (it2.idProduk && produkMap[it2.idProduk]) {
        namaProduk   = produkMap[it2.idProduk].nama;
        satuanProduk = produkMap[it2.idProduk].satuan;
      }

      var idStokItem = it2.idStok || it2.idProduk;
      if (idStokItem) {
        var saldoBaru = _updateStokEntry(ss, idStokItem, namaProduk, satuanProduk, qtyTerima2, harga2);
        var idMutasi  = _generateIdMutasi(mSheet);
        mSheet.appendRow([
          idMutasi, tglStr, idStokItem, namaProduk,
          'Penerimaan PO', noPO,
          qtyTerima2, 0, harga2, saldoBaru,
          'Penerimaan dari PO ' + noPO,
          namaUser, nowStr
        ]);
        _syncHPPProduk(ss, idStokItem, harga2);
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

    var idProduk  = payload.idStok || payload.idProduk;
    var qty       = Number(payload.qty) || 0;
    var harga     = Number(payload.hargaSatuan) || 0;
    var tgl       = payload.tanggal || '';
    var namaUser  = payload.namaUser || '';
    var tz        = Session.getScriptTimeZone();
    var nowStr    = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

    if (!idProduk) return { success: false, message: 'Item stok wajib dipilih.' };
    if (qty <= 0)  return { success: false, message: 'Qty harus lebih dari 0.' };
    if (!tgl)      return { success: false, message: 'Tanggal wajib diisi.' };

    // Cari info item dari sheet Stok
    var namaProduk = idProduk, satuanProduk = '';
    var stokSheet  = _ensureStokSheet(ss);
    var stokData   = stokSheet.getDataRange().getValues();
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

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qty, hargaUntukStok);

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

    if (updateHarga && harga > 0) _syncHPPProduk(ss, idProduk, harga);
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

    var qtyDelta  = jenis === '+' ? qty : -qty;
    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qtyDelta, null);

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

    var tz     = Session.getScriptTimeZone();
    var nowStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var tglStr = tanggal || Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, -qty, null);
    var idMutasi  = _generateIdMutasi(mSheet);
    mSheet.appendRow([
      idMutasi, tglStr, idProduk, namaProduk,
      'Penggunaan WO', noWO,
      0, qty, hargaTerakhir, saldoBaru,
      keterangan || 'Penggunaan untuk WO ' + noWO,
      namaUser, nowStr
    ]);

    SpreadsheetApp.flush();
    invalidateStokCache();
    invalidateMutasiStokCache();
    return {
      success:      true,
      idMutasi:     idMutasi,
      hargaSatuan:  hargaTerakhir,
      total:        qty * hargaTerakhir,
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

    var saldoBaru = _updateStokEntry(ss, idProduk, namaProduk, satuanProduk, qty, null);
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
