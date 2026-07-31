/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Penawaran: list, riwayat, simpan, revisi, status, hapus.
 */

/**
 * Cek apakah suatu tanggal masih berada di bulan & tahun yang sama dengan sekarang.
 * Dipakai untuk membatasi revisi penawaran Deal: hanya boleh direvisi selama
 * masih bulan yang sama saat deal dibuat, agar laporan deal bulan sebelumnya
 * tidak berubah.
 */
function _isSameMonthDate(dateVal) {
  if (!dateVal) return false;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function getPenawaranList() {
  try {
    const klienMap = _klienMap();            // Master_Klien (cached)
    const data = _cachedPenawaran();         // Penawaran_Main (cached; Date → ISO string)
    const hoMap = (typeof _hoStatusMap === 'function') ? _hoStatusMap() : {};  // WO → status HO

    // Kumpulkan semua baris dulu, key = noPenawaran
    // Simpan baris dengan rev TERTINGGI per nomor, pertahankan urutan kemunculan pertama
    const orderMap   = {};   // noPenawaran → urutan kemunculan pertama (untuk sort)
    const latestMap  = {};   // noPenawaran → object baris terbaik
    let orderCounter = 0;

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const no  = data[i][0].toString();
      const rev = parseInt(data[i][1]) || 0;

      if (!(no in orderMap)) {
        orderMap[no] = orderCounter++;
      }

      if (!(no in latestMap) || rev > (parseInt(latestMap[no]._rev) || 0)) {
        // _fmtTgl menangani Date maupun ISO string (dari cache) maupun dd/MM/yyyy.
        const tglStr = _fmtTgl(data[i][2]);
        const validStr = _fmtTgl(data[i][3]);
        const klienId = data[i][5].toString();

        latestMap[no] = {
          _rev:          rev,
          id:            no,
          rev:           rev.toString(),
          tanggal:       tglStr,
          validUntil:    validStr,
          namaProject:   data[i][4].toString(),
          klienId:       klienId,
          namaKlien:     klienMap[klienId] || klienId,
          dibuatOleh:    data[i][6].toString(),
          subtotal:      parseFloat(data[i][7])  || 0,
          diskon:        parseFloat(data[i][8])  || 0,
          pajak:         parseFloat(data[i][9])  || 0,
          grandTotal:    parseFloat(data[i][10]) || 0,
          hpp:           parseFloat(data[i][11]) || 0,
          profit:        parseFloat(data[i][12]) || 0,
          marginPersen:  parseFloat(data[i][13]) || 0,
          termConditions: data[i][14] ? data[i][14].toString() : '{}',
          items:          data[i][15] ? data[i][15].toString() : '[]',
          status:         data[i][16] ? data[i][16].toString() : 'On-Progress',
          noWO:              data[i][17] ? data[i][17].toString() : '',
          hoStatus:          (data[i][17] ? (hoMap[data[i][17].toString()] || '') : ''),
          tanggalDeal:       _fmtTgl(data[i][18]),
          channelMarketing:  data[i][19] ? data[i][19].toString() : '',
          catatanFail:       data[i][20] ? data[i][20].toString() : '',
          kodeWin:           data[i][22] ? data[i][22].toString() : '',
          catatanWin:        data[i][23] ? data[i][23].toString() : '',
          kodeLost:          data[i][24] ? data[i][24].toString() : '',
          tanggalFail:       _fmtTgl(data[i][25]),
          lessonLearned:     data[i][26] ? data[i][26].toString() : '',
          action:            data[i][27] ? data[i][27].toString() : ''
        };
      }
    }

    // Urutkan berdasarkan urutan kemunculan pertama (terbaru di bawah = append order),
    // lalu balik agar terbaru di atas
    const list = Object.keys(latestMap)
      .sort((a, b) => orderMap[b] - orderMap[a])
      .map(no => {
        const item = { ...latestMap[no] };
        delete item._rev;
        return item;
      });

    return list;
  } catch(e) { return []; }
}
function getRiwayatRevisi(noPenawaran) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Penawaran_Main');
    if (!sheet) return [];

    const sheetKlien = ss.getSheetByName('Master_Klien');
    const klienMap = {};
    if (sheetKlien) {
      const kd = sheetKlien.getDataRange().getValues();
      for (let i = 1; i < kd.length; i++) {
        if (kd[i][0]) klienMap[kd[i][0].toString()] = kd[i][1].toString();
      }
    }

    const data = sheet.getDataRange().getValues();
    const list = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || data[i][0].toString() !== noPenawaran) continue;

      const tglStr = data[i][2] instanceof Date
        ? Utilities.formatDate(data[i][2], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][2];
      const validStr = data[i][3] instanceof Date
        ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : data[i][3];
      const klienId = data[i][5].toString();

      list.push({
        id:            data[i][0].toString(),
        rev:           (parseInt(data[i][1]) || 0).toString(),
        tanggal:       tglStr,
        validUntil:    validStr,
        namaProject:   data[i][4].toString(),
        klienId:       klienId,
        namaKlien:     klienMap[klienId] || klienId,
        dibuatOleh:    data[i][6].toString(),
        subtotal:      parseFloat(data[i][7])  || 0,
        diskon:        parseFloat(data[i][8])  || 0,
        pajak:         parseFloat(data[i][9])  || 0,
        grandTotal:    parseFloat(data[i][10]) || 0,
        hpp:           parseFloat(data[i][11]) || 0,
        profit:        parseFloat(data[i][12]) || 0,
        marginPersen:  parseFloat(data[i][13]) || 0,
        termConditions: data[i][14] ? data[i][14].toString() : '{}',
        items:          data[i][15] ? data[i][15].toString() : '[]',
        status:            data[i][16] ? data[i][16].toString() : 'On-Progress',
        noWO:              data[i][17] ? data[i][17].toString() : '',
        channelMarketing:  data[i][19] ? data[i][19].toString() : ''
      });
    }

    // Urutkan rev terbesar di atas
    list.sort((a, b) => parseInt(b.rev) - parseInt(a.rev));
    return list;
  } catch(e) { return []; }
}
/** =========================================
 * FUNGSI INTI PENAWARAN
 * ========================================= */
function getInitialData() {
  try {
    const ss = getSpreadsheet();
    const nextQuotationNo = generateNextQuotationNumber(ss);

    // Klien & Produk via cache (Master_Produk dibaca SEKALI di sini, produkMap
    // dibagikan ke getTemplatePaketMap agar tak baca ulang sheet yg sama).
    const klienData = _cachedKlien();
    const klienList = [];
    for (let i = 1; i < klienData.length; i++) {
      if (klienData[i][0]) {
        klienList.push({
          id: klienData[i][0].toString(),
          nama: klienData[i][1].toString(),
          perusahaan: klienData[i][2].toString(),
          alamat: klienData[i][3].toString(),
          kontak: klienData[i][4].toString()
        });
      }
    }

    const produkData = _cachedProduk();
    const produkList = [];
    const produkMap = {};
    for (let i = 1; i < produkData.length; i++) {
      if (produkData[i][0]) {
        const pid = produkData[i][0].toString();
        const p = {
          nama:  produkData[i][1].toString(),
          unit:  produkData[i][2].toString(),
          harga: Number(produkData[i][3]) || 0,
          hpp:   Number(produkData[i][4]) || 0
        };
        produkMap[pid] = p;
        produkList.push({ id: pid, nama: p.nama, unit: p.unit, harga: p.harga, hpp: p.hpp });
      }
    }

    const templatePaketMap = getTemplatePaketMap(ss, produkMap);

    return { klien: klienList, produk: produkList, templatePaket: templatePaketMap, nextNo: nextQuotationNo, success: true };
  } catch (e) {
    return { klien: [], produk: [], templatePaket: {}, nextNo: "001/QUOT/I/2026", success: false, error: e.toString() };
  }
}

// produkMapArg opsional: bila diberi (dari getInitialData), tak baca Master_Produk lagi.
function getTemplatePaketMap(ss, produkMapArg) {
  try {
    ss = ss || getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Paket') || buatSheetTemplatePaket(ss);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return {};

    // Bangun produk map sekali — O(1) lookup (pakai yg dioper bila ada).
    let produkMap = produkMapArg;
    if (!produkMap) {
      produkMap = {};
      const pdData = _cachedProduk();
      for (let i = 1; i < pdData.length; i++) {
        if (pdData[i][0]) {
          produkMap[pdData[i][0].toString()] = {
            nama:  pdData[i][1].toString(),
            unit:  pdData[i][2].toString(),
            harga: Number(pdData[i][3]) || 0,
            hpp:   Number(pdData[i][4]) || 0
          };
        }
      }
    }

    const data = sheet.getRange(1, 1, lastRow, 3).getValues();
    const map = {};

    for (let i = 1; i < data.length; i++) {
      const id        = data[i][0];
      const nama      = data[i][1];
      const itemsJson = data[i][2];
      if (!id || !nama || !itemsJson) continue;

      let rawItems = [];
      try { rawItems = JSON.parse(itemsJson); } catch(e) { rawItems = []; }

      // Enrich setiap item dengan harga/hpp/unit live dari Master_Produk
      const enrichedItems = rawItems.map(function(it) {
        const p = produkMap[it.produkId] || {};
        return {
          produkId:  it.produkId,
          deskripsi: it.deskripsi || p.nama || '',
          qty:       it.qty       || 1,
          unit:      p.unit       || it.unit  || '',
          harga:     p.harga      || it.harga || 0,
          hpp:       p.hpp        || it.hpp   || 0
        };
      });

      map[id.toString()] = { nama: nama.toString(), items: enrichedItems };
    }
    return map;
  } catch(e) {
    Logger.log('getTemplatePaketMap error: ' + e);
    return {};
  }
}

function generateNextQuotationNumber(ss) {
  ss = ss || getSpreadsheet();
  const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
  SpreadsheetApp.flush();
  const rows = sheetMain.getLastRow();
  let maxId = 0;

  if (rows > 1) {
    const allIds = sheetMain.getRange(2, 1, rows - 1, 1).getValues();
    const uniqueNums = new Set();
    for (let i = 0; i < allIds.length; i++) {
      const val   = allIds[i][0] ? allIds[i][0].toString() : '';
      const match = val.match(/^(\d+)\/QUOT/);
      if (match) uniqueNums.add(parseInt(match[1], 10));
    }
    uniqueNums.forEach(num => { if (num > maxId) maxId = num; });
  }

  const romanMonths = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  const currentMonth = romanMonths[new Date().getMonth()];
  const currentYear  = new Date().getFullYear();
  
  const nextNum = String(maxId + 1).padStart(3, '0'); // ← perubahan di sini
  return `${nextNum}/QUOT/${currentMonth}/${currentYear}`;
}

function simpanPenawaranKeSheet(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = getSpreadsheet();
    const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);

    // Nomor penawaran di-generate di sini (dalam lock), bukan dari payload.
    // Ini mencegah race condition saat dua user menyimpan bersamaan.
    const noPenawaran = generateNextQuotationNumber(ss);

    const userActiveName = payload.namaUser || "Sales Executive";

    const totalHpp = payload.termConditions.hppTotalGabungan || 0;
    const estimasiProfit = payload.termConditions.estimasiProfitBersih || 0;
    const marginPersen = parseFloat(payload.termConditions.marginPersenInternal) || 0;
    const diskon = payload.termConditions.diskonNominal || 0;
    const pajak = payload.termConditions.pajakNominal || 0;

    const cleanTermConditions = { ...payload.termConditions };
    cleanTermConditions.catatan = payload.catatan || "";
    delete cleanTermConditions.hppTotalGabungan;
    delete cleanTermConditions.estimasiProfitBersih;
    delete cleanTermConditions.marginPersenInternal;
    delete cleanTermConditions.diskonPersen;
    delete cleanTermConditions.diskonNominal;
    delete cleanTermConditions.pajakPersen;
    delete cleanTermConditions.pajakNominal;

    sheetMain.appendRow([
      noPenawaran, 0, payload.tanggal, payload.validUntil, payload.namaProject,
      payload.klienId, userActiveName, payload.subtotal, diskon, pajak, payload.grandTotal,
      totalHpp, estimasiProfit, marginPersen, JSON.stringify(cleanTermConditions),
      JSON.stringify(payload.items), "On-Progress", '', '',
      payload.channelMarketing || ''
    ]);

    invalidatePenawaranCache();
    const nextNo = generateNextQuotationNumber(ss);
    return { success: true, message: `Penawaran ${noPenawaran} berhasil disimpan!`, nextNo: nextNo };
  } catch (error) {
    return { success: false, message: "Gagal menyimpan: " + error.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
// Kolom tambahan (0-idx): 25 Tanggal Fail, 26 Lesson Learned, 27 Action
function _ensurePenawaranExtraCols(sheet) {
  var maxCols = sheet.getMaxColumns();
  if (maxCols < 28) sheet.insertColumnsAfter(maxCols, 28 - maxCols);
  if (!sheet.getRange(1, 26).getValue()) sheet.getRange(1, 26).setValue('Tanggal Fail');
  if (!sheet.getRange(1, 27).getValue()) sheet.getRange(1, 27).setValue('Lesson Learned');
  if (!sheet.getRange(1, 28).getValue()) sheet.getRange(1, 28).setValue('Action');
}

function updateStatusPenawaran(noPenawaran, rev, statusBaru, catatanFail, extra) {
  extra = extra || {};
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSpreadsheet().getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === noPenawaran && data[i][1].toString() === rev) {
        _ensurePenawaranExtraCols(sheet);
        const isWinLoss = (statusBaru === 'Deal' || statusBaru === 'Fail');

        sheet.getRange(i + 1, 17).setValue(statusBaru); // Kolom 17 = Status

        // Kode Lost (kol 25) hanya saat Fail; Kode Win (kol 23) hanya saat Deal
        sheet.getRange(i + 1, 25).setValue(statusBaru === 'Fail' ? (extra.kodeLost || '') : '');
        sheet.getRange(i + 1, 23).setValue(statusBaru === 'Deal' ? (extra.kodeWin || '') : '');

        // Lesson Learned (kol 27) & Action (kol 28) untuk Deal/Fail
        sheet.getRange(i + 1, 27).setValue(isWinLoss ? (extra.lessonLearned || '') : '');
        sheet.getRange(i + 1, 28).setValue(isWinLoss ? (extra.action || '') : '');

        // Catatan lama (kol 21 Catatan Fail / kol 24 Catatan Win) tidak dipakai lagi
        sheet.getRange(i + 1, 21).setValue('');
        sheet.getRange(i + 1, 24).setValue('');

        // ── Otomasi No WO (Kolom 18) + Tanggal Deal (Kolom 19) ──
        let noWO = data[i][17] ? data[i][17].toString() : '';
        const statusLama = data[i][16] ? data[i][16].toString() : ''; // status sebelumnya (kolom 17)
        if (statusBaru === 'Deal') {
          // Hanya jalankan otomasi Deal saat BENAR-BENAR transisi menjadi Deal.
          // Jika sudah Deal sebelumnya (mis. sekadar edit/tambah catatan Win),
          // JANGAN sentuh No WO & Tanggal Deal agar tidak diproses sebagai deal baru.
          if (statusLama !== 'Deal') {
            if (!noWO) {
              noWO = generateNextWONumber(sheet);
              sheet.getRange(i + 1, 18).setValue(Number(noWO));
            }
            // Catat tanggal deal (hanya isi jika belum ada, agar re-deal tidak reset tanggal)
            const existingDealDate = data[i][18];
            if (!existingDealDate) {
              sheet.getRange(i + 1, 19).setValue(new Date());
            }
            // Link pre-deal invoices (noWO kosong) ke WO baru
            _linkPredealInvoices(getSpreadsheet(), noPenawaran, noWO);
          }
        } else {
          // Keluar dari Deal → kosongkan No WO dan tanggal deal
          if (noWO) {
            sheet.getRange(i + 1, 18).setValue('');
            noWO = '';
          }
          sheet.getRange(i + 1, 19).setValue('');
        }

        // ── Tanggal Fail (Kolom 26) — mirror Tanggal Deal ──
        // Hanya stamp saat transisi menjadi Fail; edit/tambah catatan Lost pada
        // penawaran yang sudah Fail tidak mengubah Tanggal Fail.
        if (statusBaru === 'Fail') {
          if (statusLama !== 'Fail' && !data[i][25]) sheet.getRange(i + 1, 26).setValue(new Date());
        } else {
          sheet.getRange(i + 1, 26).setValue('');
        }

        SpreadsheetApp.flush();

        invalidatePenawaranCache();
        _syncWorkOrder(noPenawaran);   // sinkron ke sheet Work_Order
        return { success: true, message: "Status diperbarui menjadi: " + statusBaru, noWO: noWO };
      }
    }
    return { success: false, message: "Penawaran tidak ditemukan." };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ── Link pre-deal invoices ke WO saat penawaran jadi Deal ────────────────────
function _linkPredealInvoices(ss, noPenawaran, noWO) {
  try {
    const invSheet = ss.getSheetByName('Invoice_Main');
    if (!invSheet) return;
    const data = invSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowNoPen = data[i][2] ? data[i][2].toString() : '';
      const rowNoWO  = data[i][1] ? data[i][1].toString() : '';
      if (rowNoPen === noPenawaran && !rowNoWO) {
        invSheet.getRange(i + 1, 2).setValue(noWO); // kolom 2 = noWO
      }
    }
    SpreadsheetApp.flush();
  } catch(e) {
    Logger.log('_linkPredealInvoices error: ' + e);
  }
}

function hapusPenawaran(noPenawaran, rev) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();

    // Kumpulkan SEMUA baris dengan noPenawaran ini (semua rev), hapus dari bawah ke atas
    const rowsToDelete = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === noPenawaran) {
        rowsToDelete.push(i + 1); // +1 karena index sheet 1-based
      }
    }

    if (rowsToDelete.length === 0) {
      return { success: false, message: "Penawaran tidak ditemukan." };
    }

    // Hapus dari baris terbawah agar index tidak bergeser
    rowsToDelete.reverse().forEach(rowNum => sheet.deleteRow(rowNum));

    invalidatePenawaranCache();
    _syncWorkOrder(noPenawaran);   // sinkron ke sheet Work_Order (hapus WO bila perlu)
    return {
      success: true,
      message: `Penawaran ${noPenawaran} beserta ${rowsToDelete.length} revisi berhasil dihapus.`
    };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function editPenawaran(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = getSpreadsheet();
    const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
    const data = sheetMain.getDataRange().getValues();

    let currentStatus = '';
    let maxRevCheck = -1;
    let currentNoWO = '';
    let currentTanggalDeal = null;
    // Catatan Win/Lost dari revisi terakhir agar tidak hilang saat direvisi.
    let curKodeWin = '', curKodeLost = '', curTanggalFail = '', curLesson = '', curAction = '';
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === payload.noPenawaran) {
        const rev = parseInt(data[i][1]) || 0;
        if (rev > maxRevCheck) {
          maxRevCheck = rev;
          currentStatus = data[i][16] ? data[i][16].toString() : '';
          currentNoWO = data[i][17] ? data[i][17].toString() : '';
          currentTanggalDeal = data[i][18] || null;
          curKodeWin     = data[i][22] || '';
          curKodeLost    = data[i][24] || '';
          curTanggalFail = data[i][25] || '';
          curLesson      = data[i][26] || '';
          curAction      = data[i][27] || '';
        }
      }
    }
    if (currentStatus === 'Deal' && typeof _hoStatus === 'function' && _hoStatus(currentNoWO) === 'Selesai') {
      return { success: false, message: "Penawaran Deal tidak dapat direvisi karena Hand Over WO " + currentNoWO + " sudah Selesai (project sudah diserahterimakan ke tim project)." };
    }

    const newRev = maxRevCheck + 1;

    const userActiveName = payload.namaUser || "Sales Executive";

    const totalHpp = payload.termConditions.hppTotalGabungan || 0;
    const estimasiProfit = payload.termConditions.estimasiProfitBersih || 0;
    const marginPersen = parseFloat(payload.termConditions.marginPersenInternal) || 0;
    const diskon = payload.termConditions.diskonNominal || 0;
    const pajak = payload.termConditions.pajakNominal || 0;

    const cleanTC = { ...payload.termConditions };
    cleanTC.catatan = payload.catatan || "";
    ['hppTotalGabungan','estimasiProfitBersih','marginPersenInternal',
     'diskonPersen','diskonNominal','pajakPersen','pajakNominal'].forEach(k => delete cleanTC[k]);

    // Jika sebelumnya sudah Deal (direvisi dalam bulan yang sama), pertahankan
    // status Deal, No WO, dan Tanggal Deal — jangan generate No WO baru.
    const statusBaru      = currentStatus === 'Deal' ? 'Deal' : (payload.status || "On-Progress");
    const noWOBaru         = currentStatus === 'Deal' ? currentNoWO : '';
    const tanggalDealBaru  = currentStatus === 'Deal' ? currentTanggalDeal : '';

    // Bawa catatan Win/Lost sesuai status revisi baru agar tak hilang saat edit.
    const isDeal = statusBaru === 'Deal';
    const isFail = statusBaru === 'Fail';
    const kodeWinBaru  = isDeal ? curKodeWin : '';
    const kodeLostBaru = isFail ? curKodeLost : '';
    const tglFailBaru  = isFail ? curTanggalFail : '';
    const lessonBaru   = (isDeal || isFail) ? curLesson : '';
    const actionBaru   = (isDeal || isFail) ? curAction : '';

    _ensurePenawaranExtraCols(sheetMain);   // pastikan kolom 21-28 ada sebelum append
    sheetMain.appendRow([
      payload.noPenawaran, newRev, payload.tanggal, payload.validUntil, payload.namaProject,
      payload.klienId, userActiveName, payload.subtotal, diskon, pajak, payload.grandTotal,
      totalHpp, estimasiProfit, marginPersen, JSON.stringify(cleanTC),
      JSON.stringify(payload.items), statusBaru, noWOBaru, tanggalDealBaru,
      payload.channelMarketing || '',
      '',            // 20: Catatan Fail (lama, tak dipakai)
      '',            // 21: (tak dipakai)
      kodeWinBaru,   // 22: Kode Win
      '',            // 23: Catatan Win (lama, tak dipakai)
      kodeLostBaru,  // 24: Kode Lost
      tglFailBaru,   // 25: Tanggal Fail
      lessonBaru,    // 26: Lesson Learned
      actionBaru     // 27: Action
    ]);

    invalidatePenawaranCache();
    _syncWorkOrder(payload.noPenawaran);   // sinkron snapshot WO bila penawaran Deal direvisi
    const nextNo = generateNextQuotationNumber(ss);
    return { success: true, message: `${payload.noPenawaran} berhasil direvisi → Rev${newRev}!`, nextNo: nextNo };
  } catch(e) {
    return { success: false, message: "Gagal: " + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function restoreRevisiPenawaran(noPenawaran, rev, namaUser) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheetMain = getSpreadsheet().getSheetByName('Penawaran_Main');
    if (!sheetMain) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheetMain.getDataRange().getValues();

    let maxRev = -1, currentStatus = '', targetRowIdx = -1, currentNoWO = '', currentTanggalDeal = null;
    let curKodeWin = '', curKodeLost = '', curTanggalFail = '', curLesson = '', curAction = '';
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() !== noPenawaran) continue;
      const r = parseInt(data[i][1]) || 0;
      if (r > maxRev) {
        maxRev = r;
        currentStatus = data[i][16] ? data[i][16].toString() : '';
        currentNoWO = data[i][17] ? data[i][17].toString() : '';
        currentTanggalDeal = data[i][18] || null;
        curKodeWin     = data[i][22] || '';
        curKodeLost    = data[i][24] || '';
        curTanggalFail = data[i][25] || '';
        curLesson      = data[i][26] || '';
        curAction      = data[i][27] || '';
      }
      if (r.toString() === rev.toString()) targetRowIdx = i;
    }
    if (targetRowIdx === -1) return { success: false, message: "Revisi tidak ditemukan." };
    if (currentStatus === 'Deal' && typeof _hoStatus === 'function' && _hoStatus(currentNoWO) === 'Selesai') {
      return { success: false, message: "Penawaran Deal tidak dapat direvisi/restore karena Hand Over WO " + currentNoWO + " sudah Selesai." };
    }
    if (parseInt(rev) === maxRev) {
      return { success: false, message: "Revisi ini sudah menjadi revisi terbaru." };
    }

    const newRev = maxRev + 1;
    const old = data[targetRowIdx];

    // Jika sebelumnya sudah Deal (restore dalam bulan yang sama), pertahankan
    // status Deal, No WO, dan Tanggal Deal — jangan generate No WO baru.
    const statusBaru      = currentStatus === 'Deal' ? 'Deal' : 'On-Progress';
    const noWOBaru         = currentStatus === 'Deal' ? currentNoWO : '';
    const tanggalDealBaru  = currentStatus === 'Deal' ? currentTanggalDeal : '';

    // Bawa catatan Win/Lost dari revisi terakhir sesuai status baru.
    const isDeal = statusBaru === 'Deal';
    const isFail = statusBaru === 'Fail';
    const kodeWinBaru  = isDeal ? curKodeWin : '';
    const kodeLostBaru = isFail ? curKodeLost : '';
    const tglFailBaru  = isFail ? curTanggalFail : '';
    const lessonBaru   = (isDeal || isFail) ? curLesson : '';
    const actionBaru   = (isDeal || isFail) ? curAction : '';

    _ensurePenawaranExtraCols(sheetMain);   // pastikan kolom 21-28 ada sebelum append
    sheetMain.appendRow([
      noPenawaran, newRev, old[2], old[3], old[4],
      old[5], namaUser || (old[6] ? old[6].toString() : 'Sales Executive'),
      old[7], old[8], old[9], old[10],
      old[11], old[12], old[13], old[14],
      old[15], statusBaru, noWOBaru, tanggalDealBaru,
      old[19] || '',
      '',            // 20: Catatan Fail (lama, tak dipakai)
      '',            // 21: (tak dipakai)
      kodeWinBaru,   // 22: Kode Win
      '',            // 23: Catatan Win (lama, tak dipakai)
      kodeLostBaru,  // 24: Kode Lost
      tglFailBaru,   // 25: Tanggal Fail
      lessonBaru,    // 26: Lesson Learned
      actionBaru     // 27: Action
    ]);

    invalidatePenawaranCache();
    _syncWorkOrder(noPenawaran);   // sinkron snapshot WO bila penawaran Deal di-restore
    return { success: true, message: `Rev${rev} berhasil dipulihkan sebagai revisi terbaru → Rev${newRev}!`, newRev: newRev };
  } catch(e) {
    return { success: false, message: "Gagal: " + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
