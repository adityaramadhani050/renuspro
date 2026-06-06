/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Modul Penawaran: list, riwayat, simpan, revisi, status, hapus.
 */

function getPenawaranList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
    const sheetKlien = ss.getSheetByName('Master_Klien');

    const klienMap = {};
    if (sheetKlien) {
      const kd = sheetKlien.getDataRange().getValues();
      for (let i = 1; i < kd.length; i++) {
        if (kd[i][0]) klienMap[kd[i][0].toString()] = kd[i][1].toString();
      }
    }

    const data = sheet.getDataRange().getValues();

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
        const tglStr = data[i][2] instanceof Date
          ? Utilities.formatDate(data[i][2], Session.getScriptTimeZone(), "dd/MM/yyyy")
          : data[i][2];
        const validStr = data[i][3] instanceof Date
          ? Utilities.formatDate(data[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy")
          : data[i][3];
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
          noWO:           data[i][17] ? data[i][17].toString() : '',
          tanggalDeal:    data[i][18] instanceof Date ? Utilities.formatDate(data[i][18], Session.getScriptTimeZone(), "dd/MM/yyyy") : (data[i][18] ? data[i][18].toString() : '')
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
        status:         data[i][16] ? data[i][16].toString() : 'On-Progress',
        noWO:           data[i][17] ? data[i][17].toString() : ''
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
    const sheetKlien = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);
    const sheetProduk = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    const templatePaketMap = getTemplatePaketMap(ss);
    const nextQuotationNo = generateNextQuotationNumber(ss);

    const klienData = sheetKlien.getDataRange().getValues();
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

    const produkData = sheetProduk.getDataRange().getValues();
    const produkList = [];
    for (let i = 1; i < produkData.length; i++) {
      if (produkData[i][0]) {
        produkList.push({
          id: produkData[i][0].toString(),
          nama: produkData[i][1].toString(),
          unit: produkData[i][2].toString(),
          harga: Number(produkData[i][3]) || 0,
          hpp: Number(produkData[i][4]) || 0
        });
      }
    }

    return { klien: klienList, produk: produkList, templatePaket: templatePaketMap, nextNo: nextQuotationNo, success: true };
  } catch (e) {
    return { klien: [], produk: [], templatePaket: {}, nextNo: "001/QUOT/I/2026", success: false, error: e.toString() };
  }
}

function getTemplatePaketMap(ss) {
  try {
    ss = ss || getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Paket') || buatSheetTemplatePaket(ss);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return {};

    // Bangun produk map sekali — O(1) lookup
    const produkMap = {};
    const sheetProduk = ss.getSheetByName('Master_Produk');
    if (sheetProduk) {
      const pdData = sheetProduk.getDataRange().getValues();
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
  try {
    const ss = getSpreadsheet();
    const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);

    const dataMain = sheetMain.getDataRange().getValues();
    let latestRev = 0;
    for (let i = 1; i < dataMain.length; i++) {
      if (dataMain[i][0] === payload.noPenawaran) {
        const revValue = parseInt(dataMain[i][1]);
        if (!isNaN(revValue) && revValue >= latestRev) latestRev = revValue + 1;
      }
    }

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
      payload.noPenawaran, latestRev, payload.tanggal, payload.validUntil, payload.namaProject,           
      payload.klienId, userActiveName, payload.subtotal, diskon, pajak, payload.grandTotal,            
      totalHpp, estimasiProfit, marginPersen, JSON.stringify(cleanTermConditions), 
      JSON.stringify(payload.items), "On-Progress"                        
    ]);

    const nextNo = generateNextQuotationNumber(ss);
    return { success: true, message: `Penawaran ${payload.noPenawaran} (Rev ${latestRev}) berhasil disimpan!`, nextNo: nextNo };
  } catch (error) {
    return { success: false, message: "Gagal menyimpan: " + error.toString() };
  }
}
function updateStatusPenawaran(noPenawaran, rev, statusBaru) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSpreadsheet().getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === noPenawaran && data[i][1].toString() === rev) {
        sheet.getRange(i + 1, 17).setValue(statusBaru); // Kolom 17 = Status

        // ── Otomasi No WO (Kolom 18) + Tanggal Deal (Kolom 19) ──
        let noWO = data[i][17] ? data[i][17].toString() : '';
        if (statusBaru === 'Deal') {
          // Status menjadi Deal → terbitkan No WO jika belum ada
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
        } else {
          // Keluar dari Deal → kosongkan No WO dan tanggal deal
          if (noWO) {
            sheet.getRange(i + 1, 18).setValue('');
            noWO = '';
          }
          sheet.getRange(i + 1, 19).setValue('');
        }

        SpreadsheetApp.flush();

        // Notifikasi WA saat WO baru dibuat (status → Deal)
        if (statusBaru === 'Deal' && noWO) {
          try {
            const namaProject = data[i][4] ? data[i][4].toString() : '';
            const klienId     = data[i][5] ? data[i][5].toString() : '';
            const subtotal    = parseFloat(data[i][7]) || 0;
            const diskon      = parseFloat(data[i][8]) || 0;
            // Resolve nama klien
            let namaKlien = klienId;
            try {
              const ks = getSpreadsheet().getSheetByName('Master_Klien');
              if (ks) {
                const kd = ks.getDataRange().getValues();
                for (let k = 1; k < kd.length; k++) {
                  if (kd[k][0] && kd[k][0].toString() === klienId) { namaKlien = kd[k][1].toString(); break; }
                }
              }
            } catch(e) {}
            notifWODibuat({
              noWO:        noWO,
              noPenawaran: noPenawaran,
              namaKlien:   namaKlien,
              namaProject: namaProject,
              nilaiKontrak: Math.max(0, subtotal - diskon)
            });
          } catch(e) {}
        }

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

    return { 
      success: true, 
      message: `Penawaran ${noPenawaran} beserta ${rowsToDelete.length} revisi berhasil dihapus.` 
    };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function editPenawaran(payload) {
  try {
    const ss = getSpreadsheet();
    const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
    const data = sheetMain.getDataRange().getValues();

    let currentStatus = '';
    let maxRevCheck = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === payload.noPenawaran) {
        const rev = parseInt(data[i][1]) || 0;
        if (rev > maxRevCheck) {
          maxRevCheck = rev;
          currentStatus = data[i][16] ? data[i][16].toString() : '';
        }
      }
    }
    if (currentStatus === 'Deal') {
      return { success: false, message: "Penawaran berstatus Deal tidak dapat direvisi." };
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

    sheetMain.appendRow([
      payload.noPenawaran, newRev, payload.tanggal, payload.validUntil, payload.namaProject,
      payload.klienId, userActiveName, payload.subtotal, diskon, pajak, payload.grandTotal,
      totalHpp, estimasiProfit, marginPersen, JSON.stringify(cleanTC),
      JSON.stringify(payload.items), payload.status || "On-Progress"
    ]);

    const nextNo = generateNextQuotationNumber(ss);
    return { success: true, message: `${payload.noPenawaran} berhasil direvisi → Rev${newRev}!`, nextNo: nextNo };
  } catch(e) {
    return { success: false, message: "Gagal: " + e.toString() };
  }
}
