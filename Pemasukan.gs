/**
 * RenusPro — Modul Pemasukan (bagian dari Cash Manager)
 *
 * Sheet Pemasukan — kolom (0-based):
 *  0  ID Pemasukan       (IN-YYYYMM-NNN)
 *  1  Tanggal
 *  2  Sumber             'Invoice' (otomatis saat invoice Lunas) | 'Langsung' (manual)
 *  3  Kategori           'Saldo Awal' | 'Pembayaran Invoice' | 'Pendapatan Lain' | 'Modal' | 'Pinjaman' | 'Lainnya'
 *  4  ID Akun Pembayaran (akun kas penerima; bukan AP001/Stok)
 *  5  Nama Akun
 *  6  No Invoice/Ref     (teks bebas atau No Invoice sumber)
 *  7  ID Referensi       (No Invoice untuk sumber Invoice; kosong untuk Langsung)
 *  8  Deskripsi
 *  9  Jumlah
 * 10  Catatan
 * 11  Dibuat Oleh
 * 12  Dibuat Pada
 * 13  Diubah Oleh
 * 14  Diubah Pada
 */

// ── Sheet bootstrap ───────────────────────────────────────────────────────────

function _ensurePemasukanSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Pemasukan');
  if (!sheet) {
    sheet = ss.insertSheet('Pemasukan');
    sheet.appendRow([
      'ID Pemasukan', 'Tanggal', 'Sumber', 'Kategori', 'ID Akun Pembayaran',
      'Nama Akun', 'No Invoice/Ref', 'ID Referensi', 'Deskripsi', 'Jumlah',
      'Catatan', 'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada'
    ]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
  }
  return sheet;
}

// ── ID generation ─────────────────────────────────────────────────────────────

function _generateIdPemasukan(sheet) {
  SpreadsheetApp.flush();
  var tz     = Session.getScriptTimeZone();
  var prefix = 'IN-' + Utilities.formatDate(new Date(), tz, 'yyyyMM') + '-';
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

// ── Read operations ───────────────────────────────────────────────────────────

function getPemasukanList(params) {
  try {
    params = params || {};
    var ss    = getSpreadsheet();
    var sheet = _ensurePemasukanSheet(ss);
    var data  = sheet.getDataRange().getValues();

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!r[0]) continue;

      var tanggal  = _fmtTgl(r[1]);
      var sumber   = r[2] ? r[2].toString() : '';
      var kategori = r[3] ? r[3].toString() : '';
      var idAkun   = r[4] ? r[4].toString() : '';

      // Filters
      if (params.sumber   && sumber   !== params.sumber)             continue;
      if (params.kategori && kategori !== params.kategori)           continue;
      if (params.idAkun   && idAkun   !== params.idAkun.toString())  continue;

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

      list.push({
        id:          r[0].toString(),
        tanggal:     tanggal,
        sumber:      sumber,
        kategori:    kategori,
        idAkun:      idAkun,
        namaAkun:    r[5] ? r[5].toString()  : '',
        noRef:       r[6] ? r[6].toString()  : '',
        idReferensi: r[7] ? r[7].toString()  : '',
        deskripsi:   r[8] ? r[8].toString()  : '',
        jumlah:      parseFloat(r[9]) || 0,
        catatan:     r[10] ? r[10].toString() : '',
        dibuatOleh:  r[11] ? r[11].toString() : '',
        dibuatPada:  r[12] ? r[12].toString() : '',
        diubahOleh:  r[13] ? r[13].toString() : '',
        diubahPada:  r[14] ? r[14].toString() : ''
      });
    }

    list.reverse(); // terbaru di atas
    return { success: true, list: list };
  } catch(e) {
    return { success: false, list: [], message: e.toString() };
  }
}

// ── Write: Pemasukan Langsung (manual) ────────────────────────────────────────

function simpanPemasukanLangsung(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (!payload.kategori)  return { success: false, message: 'Kategori pemasukan wajib dipilih.' };
    if (!payload.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
    if (!payload.idAkun)    return { success: false, message: 'Akun penerima wajib dipilih.' };
    if (payload.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pemasukan.' };

    var jumlah = parseFloat(payload.jumlah) || 0;
    if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };

    var ss    = getSpreadsheet();
    var sheet = _ensurePemasukanSheet(ss);
    var id    = _generateIdPemasukan(sheet);
    var tz    = Session.getScriptTimeZone();
    var now   = new Date();
    var nowStr  = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm:ss');
    var tanggal = payload.tanggal || Utilities.formatDate(now, tz, 'dd/MM/yyyy');

    sheet.appendRow([
      id, tanggal, 'Langsung',
      payload.kategori ? payload.kategori.toString() : '',
      payload.idAkun   ? payload.idAkun.toString()   : '',
      payload.namaAkun ? payload.namaAkun.toString() : '',
      payload.noRef    ? payload.noRef.toString()    : '',
      '',
      payload.deskripsi ? payload.deskripsi.toString() : '',
      jumlah,
      payload.catatan  ? payload.catatan.toString()  : '',
      payload.dibuatOleh ? payload.dibuatOleh.toString() : '',
      nowStr, '', ''
    ]);

    invalidatePemasukanCache();
    return { success: true, message: 'Pemasukan ' + id + ' berhasil disimpan.', id: id };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function editPemasukanLangsung(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var id = (payload.id || '').toString().trim();
    if (!id) return { success: false, message: 'ID Pemasukan wajib diisi.' };

    if (!payload.kategori)  return { success: false, message: 'Kategori pemasukan wajib dipilih.' };
    if (!payload.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
    if (!payload.idAkun)    return { success: false, message: 'Akun penerima wajib dipilih.' };
    if (payload.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pemasukan.' };

    var jumlah = parseFloat(payload.jumlah) || 0;
    if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };

    var ss    = getSpreadsheet();
    var sheet = _ensurePemasukanSheet(ss);
    SpreadsheetApp.flush();

    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString() === id) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) return { success: false, message: 'Pemasukan tidak ditemukan.' };

    var sumber = (data[rowIdx - 1][2] || '').toString();
    if (sumber !== 'Langsung') {
      return { success: false, message: 'Pemasukan bersumber "' + sumber + '" tidak bisa diedit. Kelola dari sumbernya (mis. status invoice).' };
    }

    var tz      = Session.getScriptTimeZone();
    var nowStr  = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
    var tanggal = payload.tanggal || (data[rowIdx - 1][1] ? _fmtTgl(data[rowIdx - 1][1]) : '');

    // Update cols 2–15 (tanggal s.d. diubah pada), preserve ID & dibuat Oleh/Pada
    sheet.getRange(rowIdx, 2, 1, 14).setValues([[
      tanggal,
      'Langsung',
      payload.kategori ? payload.kategori.toString() : '',
      payload.idAkun   ? payload.idAkun.toString()   : '',
      payload.namaAkun ? payload.namaAkun.toString() : '',
      payload.noRef    ? payload.noRef.toString()    : '',
      data[rowIdx - 1][7] || '',                            // ID Referensi
      payload.deskripsi ? payload.deskripsi.toString() : '',
      jumlah,
      payload.catatan  ? payload.catatan.toString()  : '',
      data[rowIdx - 1][11] || '',                           // Dibuat Oleh
      data[rowIdx - 1][12] || '',                           // Dibuat Pada
      payload.diubahOleh ? payload.diubahOleh.toString() : '',
      nowStr
    ]]);

    invalidatePemasukanCache();
    return { success: true, message: 'Pemasukan ' + id + ' berhasil diperbarui.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hapusPemasukan(id) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss    = getSpreadsheet();
    var sheet = _ensurePemasukanSheet(ss);
    SpreadsheetApp.flush();

    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1;
    var sumber = '';
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString() === id) {
        rowIdx = i + 1;
        sumber = (data[i][2] || '').toString();
        break;
      }
    }
    if (rowIdx === -1) return { success: false, message: 'Pemasukan tidak ditemukan.' };

    if (sumber !== 'Langsung') {
      return { success: false, message: 'Pemasukan bersumber "' + sumber + '" tidak bisa dihapus di sini — batalkan dari sumbernya (mis. ubah status invoice ke Belum Lunas).' };
    }

    sheet.deleteRow(rowIdx);
    invalidatePemasukanCache();
    return { success: true, message: 'Pemasukan ' + id + ' berhasil dihapus.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ── Hook: pemasukan otomatis (dipanggil dari Invoice saat Lunas) ──────────────

function _adaPemasukanReferensi(idReferensi) {
  if (!idReferensi) return false;
  var sheet = _ensurePemasukanSheet();
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][7] || '').toString() === idReferensi.toString()) return true;
  }
  return false;
}

function _buatPemasukanOtomatis(p) {
  // Idempoten: jangan duplikasi bila referensi sudah ada
  if (p.idReferensi && _adaPemasukanReferensi(p.idReferensi)) return '';
  var ss    = getSpreadsheet();
  var sheet = _ensurePemasukanSheet(ss);
  var id    = _generateIdPemasukan(sheet);
  var tz    = Session.getScriptTimeZone();
  var nowStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss');
  sheet.appendRow([
    id,
    p.tanggal   || Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    p.sumber    || 'Invoice',
    p.kategori  || 'Pembayaran Invoice',
    p.idAkun    || '',
    p.namaAkun  || '',
    p.noRef     || (p.idReferensi || ''),
    p.idReferensi || '',
    p.deskripsi || '',
    parseFloat(p.jumlah) || 0,
    p.catatan   || '',
    p.dibuatOleh || 'Sistem',
    nowStr, '', ''
  ]);
  invalidatePemasukanCache();
  return id;
}

function _hapusPemasukanByReferensi(idReferensi) {
  if (!idReferensi) return;
  var ss    = getSpreadsheet();
  var sheet = _ensurePemasukanSheet(ss);
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if ((data[i][7] || '').toString() === idReferensi.toString()) {
      sheet.deleteRow(i + 1);
    }
  }
  invalidatePemasukanCache();
}

// ── Resolusi akun kas dari teks Bank Account invoice ─────────────────────────
// Invoice menyimpan teks detail rekening (kolom 20). Tiap entri BANK_ACCOUNTS
// dipetakan ke Akun Pembayaran via field `akunId` (diatur di Settings).
function _resolveAkunKasFromBankText(bankText) {
  var res = { idAkun: '', namaAkun: '' };
  if (!bankText) return res;
  try {
    var raw   = PropertiesService.getScriptProperties().getProperty('BANK_ACCOUNTS');
    var banks = raw ? JSON.parse(raw) : [];
    var target = bankText.toString().trim();
    var akunId = '';
    for (var i = 0; i < banks.length; i++) {
      if ((banks[i].detail || '').toString().trim() === target) {
        akunId = (banks[i].akunId || '').toString();
        break;
      }
    }
    if (!akunId) return res;
    res.idAkun = akunId;
    var sheet = _ensureAkunPembayaranSheet();
    var data  = sheet.getDataRange().getValues();
    for (var j = 1; j < data.length; j++) {
      if ((data[j][0] || '').toString() === akunId) { res.namaAkun = (data[j][1] || '').toString(); break; }
    }
  } catch(e) {}
  return res;
}

// ── Saldo per akun (inti Cash Manager) ───────────────────────────────────────
// Saldo tiap akun kas = Σ Pemasukan − Σ Pengeluaran (akun AP001/Stok dikecualikan
// karena bukan kas riil, hanya realisasi HPP).

function getSaldoAkun() {
  try {
    var ss = getSpreadsheet();

    // Daftar akun (kecuali AP001/Stok)
    var akunSheet = _ensureAkunPembayaranSheet(ss);
    var akunData  = akunSheet.getDataRange().getValues();
    var akunOrder = [];
    var akunMap   = {};
    for (var a = 1; a < akunData.length; a++) {
      var aid = (akunData[a][0] || '').toString();
      if (!aid || aid === 'AP001') continue;
      akunMap[aid] = {
        id:     aid,
        nama:   (akunData[a][1] || '').toString(),
        tipe:   (akunData[a][2] || '').toString(),
        status: (akunData[a][4] || '').toString(),
        masuk:  0,
        keluar: 0,
        saldo:  0
      };
      akunOrder.push(aid);
    }

    // Pemasukan → masuk per akun
    var pemSheet = _ensurePemasukanSheet(ss);
    var pemData  = pemSheet.getDataRange().getValues();
    for (var i = 1; i < pemData.length; i++) {
      if (!pemData[i][0]) continue;
      var pAkun = (pemData[i][4] || '').toString();
      if (pAkun === 'AP001' || !akunMap[pAkun]) continue;
      akunMap[pAkun].masuk += parseFloat(pemData[i][9]) || 0;
    }

    // Pengeluaran → keluar per akun
    var engSheet = _ensurePengeluaranSheet(ss);
    var engData  = engSheet.getDataRange().getValues();
    for (var j = 1; j < engData.length; j++) {
      if (!engData[j][0]) continue;
      var eAkun = (engData[j][6] || '').toString();
      if (eAkun === 'AP001' || !akunMap[eAkun]) continue;
      akunMap[eAkun].keluar += parseFloat(engData[j][12]) || 0;
    }

    var akunList = [];
    var totalMasuk = 0, totalKeluar = 0, totalSaldo = 0;
    for (var k = 0; k < akunOrder.length; k++) {
      var it = akunMap[akunOrder[k]];
      it.saldo = it.masuk - it.keluar;
      totalMasuk  += it.masuk;
      totalKeluar += it.keluar;
      totalSaldo  += it.saldo;
      akunList.push(it);
    }

    return {
      success:     true,
      akun:        akunList,
      totalMasuk:  totalMasuk,
      totalKeluar: totalKeluar,
      totalSaldo:  totalSaldo
    };
  } catch(e) {
    return { success: false, message: e.toString(), akun: [], totalMasuk: 0, totalKeluar: 0, totalSaldo: 0 };
  }
}
