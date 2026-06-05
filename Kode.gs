/**
 * Aplikasi Single-Page Dashboard & Pembuat Penawaran Harga
 * PT. RENUS GLOBAL INDONESIA
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('RenusPro - PT. Renus Global Indonesia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Mendapatkan instance spreadsheet aktif
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** =========================================
 * FUNGSI GET DATA UNTUK TABEL DASHBOARD
 * ========================================= */

function getDashboardStats(namaUser, isAdmin, filterFrom, filterTo) {
  try {
    const ss = getSpreadsheet();
    const sheetMain = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
    const sheetProduk = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    const sheetKlien = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);

    const dataMain = sheetMain.getDataRange().getValues();
    const klienMap = {};
    const kdArr = sheetKlien.getDataRange().getValues();

    // Pemetaan data klien (ID -> Nama Klien)
    for (let i = 1; i < kdArr.length; i++) {
      if (kdArr[i][0]) {
        klienMap[kdArr[i][0].toString()] = kdArr[i][1].toString();
      }
    }

    // Fungsi internal pembantu untuk parsing tanggal secara fleksibel
    function parseTanggal(raw) {
      if (raw instanceof Date) return isNaN(raw) ? null : raw;
      if (!raw) return null;

      const parts = raw.toString().split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        return isNaN(d) ? null : d;
      }

      const d = new Date(raw);
      return isNaN(d) ? null : d;
    }

    // Filter baris penawaran berdasarkan otorisasi nama user
    const filteredRows = [];
    for (let i = 1; i < dataMain.length; i++) {
      if (!dataMain[i][0]) continue;

      if (!isAdmin && namaUser) {
        const pembuatRow = dataMain[i][6] ? dataMain[i][6].toString().trim() : '';
        if (pembuatRow !== namaUser.trim()) continue;
      }
      filteredRows.push(dataMain[i]);
    }

    // Kelompokkan dan ambil revisi tertinggi (terbaru) per nomor penawaran
    const latestRevMap = {};
    for (let i = 0; i < filteredRows.length; i++) {
      const row = filteredRows[i];
      const no = row[0].toString();
      const rev = parseInt(row[1]) || 0;

      if (!(no in latestRevMap) || rev > latestRevMap[no].rev) {
        latestRevMap[no] = {
          rev,
          grandTotal: parseFloat(row[10]) || 0,
          status: row[16] ? row[16].toString() : 'On-Progress',
          tanggal: parseTanggal(row[2]),
          namaProject: row[4].toString(),
          klienId: row[5].toString(),
          dibuatOleh: row[6].toString(),
          id: no
        };
      }
    }

    const allItems = Object.values(latestRevMap);
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;

    // Gunakan filter custom jika dikirim dari client
    let filterStart = null;
    let filterEnd   = null;
    if (filterFrom && filterTo) {
      filterStart = new Date(filterFrom);
      filterEnd   = new Date(filterTo);
      filterEnd.setHours(23, 59, 59, 999);
    }

    const isThisMonth = d => {
      if (!d) return false;
      if (filterStart && filterEnd) return d >= filterStart && d <= filterEnd;
      return d.getMonth() === curMonth && d.getFullYear() === curYear;
    };
    const isPrevMonth = d => {
      if (!d) return false;
      // Jika pakai filter custom, "prev" = periode sebelumnya dengan panjang sama
      if (filterStart && filterEnd) {
        const rangeMs   = filterEnd - filterStart;
        const prevEnd   = new Date(filterStart.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - rangeMs);
        return d >= prevStart && d <= prevEnd;
      }
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    };

    // ─────────────────────────────────────────────────────────────
    // KALKULASI KPI — semua dihitung per bulan (bulan ini vs bulan lalu)
    // ─────────────────────────────────────────────────────────────
    let revThisMonth = 0, revPrevMonth = 0;
    let wonThisMonth = 0, wonPrevMonth = 0;
    let decidedThis = 0, decidedPrev = 0;

    // Variabel all-time tetap dihitung untuk keperluan chart & leaderboard
    let totalRevenue = 0;
    let wonTotal = 0, decidedTotal = 0;

    allItems.forEach(item => {
      const isDeal = item.status === 'Deal';
      const isFail = item.status === 'Fail';

      // All-time (untuk chart & leaderboard)
      if (isDeal) {
        totalRevenue += item.grandTotal;
        wonTotal++;
      }
      if (isDeal || isFail) decidedTotal++;

      // Bulan ini
      if (isThisMonth(item.tanggal)) {
        if (isDeal) revThisMonth += item.grandTotal;
        if (isDeal) wonThisMonth++;
        decidedThis++;  // ← semua penawaran bulan ini, tanpa filter status
      }

      // Bulan lalu
      if (isPrevMonth(item.tanggal)) {
        if (isDeal) revPrevMonth += item.grandTotal;
        if (isDeal) wonPrevMonth++;
        decidedPrev++;  // ← semua penawaran bulan lalu, tanpa filter status
      }
    });

    // ── Win Rate: dihitung dari bulan ini vs bulan lalu ──
    const winRate     = decidedThis > 0 ? Math.round((wonThisMonth / decidedThis) * 100) : 0;
    const prevWinRate = decidedPrev > 0 ? Math.round((wonPrevMonth / decidedPrev) * 100) : 0;

    // ── Perubahan revenue bulan ini vs bulan lalu (%) ──
    const revChangePct = revPrevMonth > 0
      ? +((revThisMonth - revPrevMonth) / revPrevMonth * 100).toFixed(2)
      : (revThisMonth > 0 ? 100 : 0);

    // Target komersial bulanan
    const TARGET_MONTHLY = isAdmin ? 1200000000 : 300000000;

    // ─────────────────────────────────────────────────────────────
    // CHART: Tren Revenue Bulanan 6 bulan terakhir
    // ─────────────────────────────────────────────────────────────
    const romanMonths = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const monthlyLabels = [];
    const monthlyRevenue = [];

    for (let m = 5; m >= 0; m--) {
      let mo = curMonth - m;
      let yr = curYear;
      if (mo < 0) { mo += 12; yr--; }
      monthlyLabels.push(romanMonths[mo]);

      const rev = allItems
        .filter(it => it.tanggal
                   && it.tanggal.getMonth() === mo
                   && it.tanggal.getFullYear() === yr
                   && it.status === 'Deal')
        .reduce((s, it) => s + it.grandTotal, 0);

      monthlyRevenue.push(isAdmin
        ? +(rev / 1e9).toFixed(2)   // Miliar untuk admin
        : +(rev / 1e6).toFixed(2)   // Juta untuk sales
      );
    }

    // ─────────────────────────────────────────────────────────────
    // PIPELINE CHART: berdasarkan data bulan ini
    // ─────────────────────────────────────────────────────────────
    const thisMonthItems = allItems.filter(i => isThisMonth(i.tanggal));

    const failThisMonth   = thisMonthItems.filter(i => i.status === 'Fail').length;
    const onProgThisMonth = thisMonthItems.filter(i => i.status === 'On-Progress').length;

    const pipeline = [
      { stage: 'On-Progress', count: onProgThisMonth },
      { stage: 'Deal',        count: wonThisMonth },
      { stage: 'Fail',        count: failThisMonth },
    ].filter(p => p.count > 0);

    // ─────────────────────────────────────────────────────────────
    // PENAWARAN TERBARU: 20 terbaru berdasarkan nomor urut
    // ─────────────────────────────────────────────────────────────
    const recentQuotes = allItems
      .filter(q => q.tanggal)
      .sort((a, b) => {
        const numA = parseInt(a.id.match(/^(\d+)/)?.[1] || 0);
        const numB = parseInt(b.id.match(/^(\d+)/)?.[1] || 0);
        return numB - numA;
      })
      .slice(0, 20)
      .map(q => ({
        id: q.id,
        namaProject: q.namaProject,
        namaKlien: klienMap[q.klienId] || q.klienId,
        grandTotal: q.grandTotal,
        status: q.status
      }));

    // ─────────────────────────────────────────────────────────────
    // LEADERBOARD: Top Performers bulan ini
    // ─────────────────────────────────────────────────────────────
    let leaderboard = [];

    const salesMap = {};
    const TARGET_PER_SALES = 3600000000;

    for (let i = 0; i < filteredRows.length; i++) {
      const row = filteredRows[i];
      const no = row[0].toString();
      const rev = parseInt(row[1]) || 0;

      if (latestRevMap[no] && latestRevMap[no].rev === rev) {
        const tanggal = parseTanggal(row[2]);

        // ── Leaderboard hanya dari data bulan ini ──
        if (!isThisMonth(tanggal)) continue;

        const nama   = row[6] ? row[6].toString() : 'Unknown';
        const gt     = parseFloat(row[10]) || 0;
        const status = row[16] ? row[16].toString() : '';

        if (!salesMap[nama]) {
          salesMap[nama] = { name: nama, rev: 0, deals: 0 };
        }

        if (status === 'Deal') {
          salesMap[nama].rev   += gt;
          salesMap[nama].deals++;
        }
      }
    }

    // Target leaderboard dibagi 12 (target tahunan → bulanan)
    const TARGET_PER_SALES_MONTHLY = TARGET_PER_SALES / 12;

    leaderboard = Object.values(salesMap)
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 6)
      .map(s => ({
        ...s,
        rev: s.rev,
        target: +(TARGET_PER_SALES_MONTHLY / 1e6).toFixed(2),
        pctTarget: TARGET_PER_SALES_MONTHLY > 0
          ? Math.round((s.rev / TARGET_PER_SALES_MONTHLY) * 100)
          : 0
      }));

    // Target garis pada chart bulanan
    let _monthlyTarget = Array(6).fill(+(TARGET_MONTHLY / 1e6).toFixed(2));
    if (isAdmin) { _monthlyTarget = Array(6).fill(+(TARGET_MONTHLY / 1e9).toFixed(2)); }

    // ─────────────────────────────────────────────────────────────
    // RETURN — semua kartu KPI berbasis bulan ini vs bulan lalu
    // ─────────────────────────────────────────────────────────────
    return {
      // Kartu Revenue → bulan ini
      revenue: 'Rp ' + revThisMonth.toLocaleString('id-ID'),
      revenuePrevMonth: 'Rp ' + revPrevMonth.toLocaleString('id-ID'),
      revenueChangePct: revChangePct,

      // Kartu Target vs Actual → bulan ini
      targetAmount: TARGET_MONTHLY,
      actualAmount: revThisMonth,

      // Kartu Deals → bulan ini vs bulan lalu
      activeQuotes: wonThisMonth,
      prevMonthQuotes: wonPrevMonth,

      // Kartu Win Rate → bulan ini vs bulan lalu
      winRate,
      prevWinRate,

      // Info tambahan
      totalProducts: Math.max(0, sheetProduk.getLastRow() - 1),
      totalCustomers: Math.max(0, sheetKlien.getLastRow() - 1),

      // Chart
      monthlyLabels,
      monthlyRevenue,
      monthlyTarget: _monthlyTarget,

      // Donut chart — bulan ini
      pipeline,

      // Tabel & leaderboard
      leaderboard,
      recentQuotes,

      isAdmin: !!isAdmin,
      namaUser: namaUser || ''
    };

  } catch (e) {
    // Return objek fallback jika terjadi kegagalan sistem
    return {
      revenue: 'Rp 0',
      revenuePrevMonth: 'Rp 0',
      revenueChangePct: 0,
      targetAmount: 1200000000,
      actualAmount: 0,
      activeQuotes: 0,
      prevMonthQuotes: 0,
      winRate: 0,
      prevWinRate: 0,
      totalProducts: 0,
      totalCustomers: 0,
      monthlyLabels: [],
      monthlyRevenue: [],
      monthlyTarget: [],
      pipeline: [],
      leaderboard: [],
      recentQuotes: [],
      isAdmin: false,
      namaUser: ''
    };
  }
}

// GANTI fungsi getPenawaranList():
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
          status:         data[i][16] ? data[i][16].toString() : 'On-Progress'
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

// TAMBAH fungsi baru getRiwayatRevisi():
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
        status:         data[i][16] ? data[i][16].toString() : 'On-Progress'
      });
    }

    // Urutkan rev terbesar di atas
    list.sort((a, b) => parseInt(b.rev) - parseInt(a.rev));
    return list;
  } catch(e) { return []; }
}

function getProdukList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    const data = sheet.getDataRange().getValues();
    const list = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          sku: data[i][0].toString(),
          nama: data[i][1].toString(),
          unit: data[i][2].toString(),
          harga: Number(data[i][3]) || 0,
          hpp: Number(data[i][4]) || 0
        });
      }
    }
    return list;
  } catch(e) { return []; }
}

function getCustomerList() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);
    const data = sheet.getDataRange().getValues();
    const list = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        list.push({
          id: data[i][0].toString(),
          nama: data[i][1].toString(),
          perusahaan: data[i][2].toString(),
          kontak: data[i][4].toString(),
          alamat: data[i][3].toString()
        });
      }
    }
    return list;
  } catch(e) { return []; }
}

/** =========================================
 * FUNGSI SIMPAN DATA DARI FORM TAMBAHAN
 * ========================================= */

function simpanProduk(nama, unit, harga, hpp) {
  try {
    if (!nama || !unit) {
      return { success: false, message: "Data nama/unit tidak boleh kosong." };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Produk') || buatSheetProdukDefault(ss);
    SpreadsheetApp.flush();

    const lastRow = sheet.getLastRow();
    let maxNumber = 0;

    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const idVal = idValues[i][0] ? idValues[i][0].toString().trim() : "";
        const match = idVal.match(/^P(\d+)/i);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
      }
    }

    const nextId = "P" + ("000" + (maxNumber + 1)).slice(-3);
    sheet.appendRow([nextId, nama, unit, Number(harga) || 0, Number(hpp) || 0]);

    return { success: true, message: "Produk " + nextId + " berhasil ditambahkan!" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function simpanCustomer(nama, perusahaan, telepon, alamat) {
  try {
    if (!nama) return { success: false, message: "Nama klien tidak boleh kosong." };

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Master_Klien') || buatSheetKlienDefault(ss);
    SpreadsheetApp.flush();

    const lastRow = sheet.getLastRow();
    let maxNumber = 0;

    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const idVal = idValues[i][0] ? idValues[i][0].toString().trim() : "";
        const match = idVal.match(/^K(\d+)/i);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
      }
    }

    const nextId = "K" + ("000" + (maxNumber + 1)).slice(-3);
    sheet.appendRow([nextId, nama, perusahaan, alamat, telepon]);

    return { success: true, message: "Klien (" + nextId + ") berhasil ditambahkan!", newId: nextId };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
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

// =========================================================================
// SCRIPT FALLBACK INITIALIZATION
// =========================================================================

function buatSheetKlienDefault(ss) {
  const sheet = ss.insertSheet('Master_Klien');
  const data = [
    ['ID', 'Nama Klien', 'Perusahaan', 'Alamat', 'Kontak'],
    ['K001', 'PT SUMMIT GLOBAL TEKNOLOGI', 'C&I', 'Tangerang', '081283576437'],
    ['K002', 'PT MAJU JAYA PRIMA', 'Retail', 'Jakarta', '081122334455']
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetProdukDefault(ss) {
  const sheet = ss.insertSheet('Master_Produk');
  const data = [
    ['ID', 'Nama Jasa/Produk', 'Unit', 'Harga Satuan', 'HPP'],
    ['P001', 'Panel Surya Jinko 625Wp Total 10.400Wp', 'unit', 2500000, 1900000],
    ['P002', 'Inverter Hybrid Off-Grid 3 Fasa Deye 10.000 W + Wifi', 'unit', 42000000, 35000000],
    ['P003', 'Baterai Lithium 51,2V 100Ah Total 10,24kWh', 'unit', 16500000, 13000000],
    ['P004', 'Rack baterai (3 slot)', 'unit', 1000000, 750000],
    ['P005', 'Panel Proteksi PLTS (DC Combiner + AC Distribution)', 'unit', 8000000, 6200000],
    ['P006', 'Panel Proteksi Baterai', 'unit', 2000000, 1500000],
    ['P007', 'Solar PV Aluminium Mounting', 'kWp', 1200000, 900000],
    ['P008', 'Kabel PV1-F 1x4mm2', 'm', 18000, 13000],
    ['P009', 'Sistem Grounding (Rod, Kabel, Box, dll)', 'set', 1500000, 1100000],
    ['P010', 'Jasa instalasi, Pembuatan DED, dan Komisioning', 'kWp', 2000000, 1300000],
    ['P011', 'Packing Standar dan Pengiriman', 'Ls', 2000000, 1500000]
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetTemplatePaket(ss) {
  const sheet = ss.insertSheet('Template_Paket');
  const data = [
    ['ID', 'Nama Paket', 'Daftar Item (JSON)'],
    ['PKT001', 'PAKET PLTS OFF-GRID 10KWP DEFAULT', '[{"produkId":"P001","deskripsi":"Panel Surya Jinko 625Wp Total 10.400Wp","qty":17,"unit":"unit","harga":2500000,"hpp":1900000},{"produkId":"P002","deskripsi":"Inverter Hybrid Off-Grid 3 Fasa Deye 10.000 W + Wifi","qty":1,"unit":"unit","harga":42000000,"hpp":35000000},{"produkId":"P003","deskripsi":"Baterai Lithium 51,2V 100Ah Total 10,24kWh","qty":2,"unit":"unit","harga":16500000,"hpp":13000000},{"produkId":"P004","deskripsi":"Rack baterai (3 slot)","qty":1,"unit":"unit","harga":1000000,"hpp":750000},{"produkId":"P005","deskripsi":"Panel Proteksi PLTS (DC Combiner + AC Distribution)","qty":1,"unit":"unit","harga":8000000,"hpp":6200000},{"produkId":"P007","deskripsi":"PV Aluminium Mounting","qty":10.4,"unit":"kWp","harga":1200000,"hpp":900000},{"produkId":"P008","deskripsi":"Kabel PV1-F 1x4mm2","qty":150,"unit":"m","harga":18000,"hpp":13000},{"produkId":"P010","deskripsi":"Jasa instalasi, Pembuatan DED, dan Komisioning","qty":10.4,"unit":"kWp","harga":2000000,"hpp":1300000}]'],
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetPenawaranDefault(ss) {
  const sheet = ss.insertSheet('Penawaran_Main');
  sheet.appendRow([
    'No Penawaran', 'Rev', 'Tanggal', 'Valid Hingga', 'Nama Project',            
    'Klien ID', 'Dibuat Oleh', 'Subtotal', 'Diskon', 'Pajak (PPN)', 'Grand Total',             
    'Total HPP', 'Estimasi Keuntungan', 'Margin Profit (%)', 'Syarat Ketentuan (JSON)', 
    'Rincian Item (JSON)', 'Status'                   
  ]);
  return sheet;
}

function editProduk(id, nama, unit, harga, hpp) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Produk');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[nama, unit, harga, hpp]]);
        return { success: true, message: "Produk " + id + " berhasil diperbarui!" };
      }
    }
    return { success: false, message: "ID produk tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function hapusProduk(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Produk');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Produk " + id + " berhasil dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function editCustomer(id, nama, perusahaan, telepon, alamat) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Klien');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[nama, perusahaan, alamat, telepon]]);
        return { success: true, message: "Klien " + id + " berhasil diperbarui!" };
      }
    }
    return { success: false, message: "ID klien tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function hapusCustomer(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Master_Klien');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Klien " + id + " berhasil dihapus." };
      }
    }
    return { success: false, message: "ID tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function updateStatusPenawaran(noPenawaran, rev, statusBaru) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: "Sheet tidak ditemukan." };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === noPenawaran && data[i][1].toString() === rev) {
        sheet.getRange(i + 1, 17).setValue(statusBaru); // Kolom 17 = Status
        return { success: true, message: "Status diperbarui menjadi: " + statusBaru };
      }
    }
    return { success: false, message: "Penawaran tidak ditemukan." };
  } catch(e) { return { success: false, message: e.toString() }; }
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

// GANTI seluruh fungsi simpanTemplatePaket():
function simpanTemplatePaket(id, nama, itemsJson, editId) {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Template_Paket') || buatSheetTemplatePaket(ss);

    // Flush dulu sebelum membaca agar data terkini
    SpreadsheetApp.flush();
    const data   = sheet.getDataRange().getValues();
    const idCari = (editId || '').toString().trim();
    const idBaru = id.toString().trim();

    // Mode EDIT: cari baris lama berdasarkan editId lalu overwrite
    if (idCari) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString().trim() === idCari) {
          sheet.getRange(i + 1, 1, 1, 3).setValues([[idBaru, nama, itemsJson]]);
          SpreadsheetApp.flush();
          return { success: true, message: 'Template ' + idBaru + ' berhasil diperbarui!' };
        }
      }
      // Jika editId tidak ditemukan di sheet, fallthrough ke append
    }

    // Mode TAMBAH: cek duplikat ID terlebih dahulu
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === idBaru) {
        return { success: false, message: 'ID Template ' + idBaru + ' sudah digunakan.' };
      }
    }

    // Append baris baru
    sheet.appendRow([idBaru, nama, itemsJson]);
    SpreadsheetApp.flush();

    return { success: true, message: 'Template ' + idBaru + ' berhasil ditambahkan!' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// Hapus Template Paket
function hapusTemplatePaket(id) {
  try {
    const sheet = getSpreadsheet().getSheetByName('Template_Paket');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Template ' + id + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'Template tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function getActiveUserName() {
  return "Sales Executive";
}

// ============================================================
// EXPORT PDF DINAMIS — VERSI REFACTORED (BATCH API CALLS)
// ============================================================
// PERUBAHAN UTAMA:
// 1. insertRows() sekali (bukan insertRowAfter() per baris)
// 2. setValues() batch 2D array (bukan setValue() per sel)
// 3. setBackgrounds() batch (bukan setBackground() per sel)
// 4. setFontColors() batch
// 5. setFontWeights() batch
// 6. setNumberFormats() batch
// 7. Hapus sleep() manual — flush() saja
// 8. Cache namedRanges (bukan loop scan berulang)
// ============================================================


function exportQuotationDariTemplate(item) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    const ss = getSpreadsheet();
    const sheetTemplate = ss.getSheetByName('Template_Quotation');
    if (!sheetTemplate) {
      return { success: false, message: 'Sheet "Template_Quotation" tidak ditemukan.' };
    }

    let tc = {};
    try { tc = JSON.parse(item.termConditions || '{}'); } catch(e) {}
    let kelompokList = [];
    try { kelompokList = JSON.parse(item.items || '[]'); } catch(e) {}

    const klienMap = _getKlienMap(ss);
    const klien = klienMap[item.klienId] || {};

    // Cache semua named ranges SEKALI — hindari loop scan berulang
    const namedRangeCache = _buildNamedRangeCache(ss);

    // 1. Bersihkan zona dinamis
    _bersihkanZonaDinamis(sheetTemplate, namedRangeCache);

    // 2. Isi header named ranges (pakai cache)
    _isiHeaderTemplate(namedRangeCache, item, klien, tc);

    // 3. Insert semua baris sekaligus (BATCH), returns baris pertama setelah item
    const rowSetelahItem = _sisipkanBarisItem(sheetTemplate, namedRangeCache, kelompokList);

    // 4. Insert footer
    _sisipkanFooter(sheetTemplate, rowSetelahItem, item, tc);

    SpreadsheetApp.flush();
    // HAPUS: Utilities.sleep(1500) — tidak diperlukan setelah flush()

    const pdfBase64 = _exportSheetToPdfBase64(ss, sheetTemplate);

    return {
      success: true,
      pdfBase64: pdfBase64,
      fileName: (item.id || '').replace(/\//g, '-') + '_' + 'Rev' + item.rev +'_' + item.namaProject + '_' + item.namaKlien + '.pdf'
    };

  } catch(e) {
    Logger.log('exportQuotationDariTemplate error: ' + e.toString());
    return { success: false, message: 'Gagal export PDF: ' + e.toString() };
  } finally {
    try {
      const ss = getSpreadsheet();
      const sh = ss.getSheetByName('Template_Quotation');
      if (sh) {
        const cache = _buildNamedRangeCache(ss);
        _bersihkanZonaDinamis(sh, cache);
      }
    } catch(e) { Logger.log('Finally cleanup error: ' + e); }
    lock.releaseLock();
  }
}


// ── Cache semua named ranges ke Map — O(1) lookup ────────────────────────
// ALASAN: ss.getNamedRanges() adalah panggilan API mahal.
// Kode lama memanggilnya berulang kali di setiap _setNamedRange() dan
// _getNamedRangeRow(). Dengan cache Map, kita scan SEKALI dan lookup O(1).
function _buildNamedRangeCache(ss) {
  const cache = new Map();
  ss.getNamedRanges().forEach(function(nr) {
    cache.set(nr.getName(), nr.getRange());
  });
  return cache;
}


// ── Bersihkan zona dinamis ────────────────────────────────────────────────
function _bersihkanZonaDinamis(sheet, namedRangeCache) {
  try {
    const anchorRange = namedRangeCache.get('tpl_item_zone_start');
    if (!anchorRange) {
      Logger.log('tpl_item_zone_start tidak ditemukan');
      return;
    }
    const anchorRow = anchorRange.getRow();
    const lastRow = sheet.getLastRow();
    const delCount = lastRow - anchorRow;
    if (delCount > 0) {
      sheet.deleteRows(anchorRow + 1, delCount);
    }
  } catch(e) {
    Logger.log('_bersihkanZonaDinamis error: ' + e);
  }
}


function _sisipkanBarisItem(sheet, namedRangeCache, kelompokList) {
  const anchorRange = namedRangeCache.get('tpl_item_zone_start');
  if (!anchorRange) {
    Logger.log('tpl_item_zone_start tidak ditemukan');
    return sheet.getLastRow() + 1;
  }

  const anchorRow = anchorRange.getRow();
  const NCOLS = 8;

  const COL_NO    = 0; // 0-indexed untuk array
  const COL_DESC  = 1;
  const COL_QTY   = 4;
  const COL_UNIT  = 5;
  const COL_HARGA = 6;
  const COL_TOTAL = 7;

  const C_GRP_BG  = '#d9d9d9';
  const C_ALT_BG  = '#f3f3f3';
  const C_WHITE   = '#ffffff';
  const TEXT_COLOR = '#000000';

  // ── Hitung total baris yang dibutuhkan ──
  let totalRows = 0;
  kelompokList.forEach(function(k) {
    totalRows += 1; // baris header kelompok
    totalRows += (k.subItems || []).length;
  });

  if (totalRows === 0) return anchorRow + 1;

  // ── Insert SEMUA baris sekaligus (1 panggilan API) ──
  sheet.insertRowsAfter(anchorRow, totalRows);

  // ── Salin format dari baris anchor ke seluruh zona (1 panggilan API) ──
  const fmtSource = sheet.getRange(anchorRow, 1, 1, NCOLS);
  fmtSource.copyTo(
    sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );

  // ── Alignment per kolom:
  //    No(0)=center | Desc(1)=left | col2-3=left | Qty(4)=center |
  //    Unit(5)=center | Price(6)=right | Amount(7)=right
  const ALIGN_ITEM = ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right'];
  const ALIGN_GRP  = ['center', 'left', 'left', 'left', 'left',   'left',   'right', 'right'];

  // ── Siapkan 2D arrays untuk batch write ──
  const values      = [];
  const backgrounds = [];
  const fontColors  = [];
  const fontWeights = [];
  const numFormats  = [];
  const alignments  = [];

  let globalNo = 1;

  kelompokList.forEach(function(kelompok) {
    // ── Baris header kelompok ──
    const grpVals = new Array(NCOLS).fill('');
    grpVals[COL_NO]    = kelompok.kelompok      || '';
    grpVals[COL_DESC]  = kelompok.namaKelompok  || '';
    grpVals[COL_HARGA] = '';
    grpVals[COL_TOTAL] = kelompok.subtotal      || 0;

    const grpBg  = new Array(NCOLS).fill(C_GRP_BG);
    const grpFg  = new Array(NCOLS).fill(TEXT_COLOR);
    const grpFw  = new Array(NCOLS).fill('bold');
    const grpFmt = new Array(NCOLS).fill('@');
    grpFmt[COL_TOTAL] = '#,##0';

    values.push(grpVals);
    backgrounds.push(grpBg);
    fontColors.push(grpFg);
    fontWeights.push(grpFw);
    numFormats.push(grpFmt);
    alignments.push(ALIGN_GRP.slice());

    // ── Sub-item ──
    (kelompok.subItems || []).forEach(function(si, idx) {
      const rowVals = new Array(NCOLS).fill('');
      rowVals[COL_NO]    = globalNo;
      rowVals[COL_DESC]  = si.deskripsi || '';
      rowVals[COL_QTY]   = si.qty       || 0;
      rowVals[COL_UNIT]  = si.unit      || '';
      rowVals[COL_HARGA] = si.harga     || 0;
      rowVals[COL_TOTAL] = si.total     || 0;

      const rowBg  = new Array(NCOLS).fill(C_ALT_BG);
      const rowFg  = new Array(NCOLS).fill(TEXT_COLOR);
      const rowFw  = new Array(NCOLS).fill('normal');
      const rowFmt = new Array(NCOLS).fill('@');
      rowFmt[COL_HARGA] = '#,##0';
      rowFmt[COL_TOTAL] = '#,##0';

      values.push(rowVals);
      backgrounds.push(rowBg);
      fontColors.push(rowFg);
      fontWeights.push(rowFw);
      numFormats.push(rowFmt);
      alignments.push(ALIGN_ITEM.slice());

      globalNo++;
    });
  });

  // ── Batch write ke seluruh zona (masing-masing 1 panggilan API) ──
  const zone = sheet.getRange(anchorRow + 1, 1, totalRows, NCOLS);
  zone.setValues(values);
  zone.setBackgrounds(backgrounds);
  zone.setFontColors(fontColors);
  zone.setFontWeights(fontWeights);
  zone.setNumberFormats(numFormats);
  zone.setHorizontalAlignments(alignments); // ← satu panggilan untuk semua alignment

  // ── Merge sel header kelompok (unavoidable per-baris, tapi minimal) ──
  // Alignment sudah ditangani oleh setHorizontalAlignments() batch di atas.
  // Di sini hanya merge cell — tidak ada setHorizontalAlignment individual.
// ── Merge & tinggi baris ──
  let mergeRow = anchorRow + 1;
  kelompokList.forEach(function(kelompok) {

    // ── Header kelompok: merge col 2-6 (B-F) ──
    try {
      sheet.getRange(mergeRow, 2, 1, 5).merge();
      sheet.getRange(mergeRow, 2).setWrap(true).setVerticalAlignment('middle');
      sheet.setRowHeight(mergeRow, 22);
    } catch(e) {}

    // ── Sub-item: merge col 2-4 (B-C-D) untuk deskripsi ──
    const subItems = kelompok.subItems || [];
    subItems.forEach(function(si, idx) {
      const itemRow = mergeRow + 1 + idx;

      try {
        // Merge kolom 2,3,4 (B-C-D) untuk deskripsi
        sheet.getRange(itemRow, 2, 1, 3).merge();

        // Wrap & alignment deskripsi
        sheet.getRange(itemRow, 2)
          .setWrap(true)
          .setVerticalAlignment('middle')
          .setHorizontalAlignment('left');
      } catch(e) {}

      // Hitung tinggi baris berdasarkan panjang deskripsi
      // Lebar efektif 3 kolom (B-C-D) ≈ 200 karakter per baris
      const desc      = si.deskripsi || '';
      const lines     = Math.max(1, Math.ceil(desc.length / 55));
      const rowHeight = Math.max(20, lines * 16 + 6);
      try { sheet.setRowHeight(itemRow, rowHeight); } catch(e) {}
    });

    mergeRow += 1 + subItems.length;
  });

  return anchorRow + 1 + totalRows;
}


// ── Footer — tetap sequential tapi lebih ringkas ──────────────────────────
// Footer memiliki baris heterogen (merge berbeda, row height berbeda)
// sehingga sulit di-batch penuh. Namun kita kurangi panggilan redundan
// dengan menghindari set property yang sama berulang.
function _sisipkanFooter(sheet, startRow, item, tc) {
  const NCOLS = 8;
  let row = startRow;

  const netSub = (item.subtotal || 0) - (item.diskon || 0);

  const kalkulasi = [
    { label: 'Subtotal',
      value: item.subtotal  || 0, bold: false, red: false, skip: false },
    { label: 'Diskon',
      value: -(item.diskon  || 0), bold: false, red: true,
      skip: !(item.diskon > 0) },
    { label: 'PPN ' + _pajakPct(netSub, item.pajak) + '%',
      value: item.pajak     || 0, bold: false, red: false, skip: false },
    { label: 'GRAND TOTAL',
      value: item.grandTotal || 0, bold: true,  red: false, skip: false },
  ].filter(function(k) { return !k.skip; });

  // ── Kalkulasi (insert semua baris sekaligus) ──
  sheet.insertRowsAfter(row - 1, kalkulasi.length);

  kalkulasi.forEach(function(k) {
    sheet.setRowHeight(row, 22)
    const labelRange = sheet.getRange(row, 7);
    const valueRange = sheet.getRange(row, 8);
    const leftRange  = sheet.getRange(row, 1, 1, 6);

    leftRange.setBackground('#ffffff');

    labelRange
      .setValue(k.label)
      .setHorizontalAlignment('right')
      .setFontWeight(k.bold ? 'bold' : 'normal')
      .setFontColor(k.red ? '#cc0000' : (k.bold ? '#1a3a8f' : null))
      .setBorder(true, true, true, true, false, false,
                 '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

    valueRange
      .setValue(k.value)
      .setNumberFormat('#,##0')
      .setFontWeight(k.bold ? 'bold' : 'normal')
      .setFontColor(k.red ? '#cc0000' : (k.bold ? '#1a3a8f' : null))
      .setHorizontalAlignment('right')
      .setBorder(true, true, true, true, false, false,
                 '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    row++;
  });

  // ── Catatan ──
  const catatan = tc.catatan || '';
  if (catatan) {
    sheet.insertRowsAfter(row - 1, 2);

    sheet.getRange(row, 1, 1, 5)
      .merge()
      .setValue('Catatan:\n' + catatan)
      .setBackground('#fffce6')
      .setFontColor('#665500')
      .setWrap(true)
      .setVerticalAlignment('top')
      .setHorizontalAlignment('left');
    sheet.getRange(row, 7, 1, 2).setBackground('#ffffff');
    sheet.setRowHeight(row, Math.max(48, Math.ceil(catatan.length / 90) * 16 + 28));
    row++;
  }

  sheet.getRange(row, 1, 1, 8).merge().setBackground('#ffffff');
  row++;

  // ── T&C header ──
  sheet.insertRowsAfter(row - 1, 1);
  sheet.getRange(row, 1, 1, NCOLS)
    .merge()
    .setValue('Term & Condition:')
    .setBackground('#d9d9d9')
    .setFontColor('#000000')
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  row++;

  // ── Baris T&C — insert semua sekaligus ──
  const tcRows = [
    { l1: 'Status Material', v1: ': ' + (tc.material_status || '-'), l2: 'Down Payment',  v2: ': ' + (tc.dp_status     || '-') },
    { l1: 'Term Payment',    v1: ': ' + (tc.term_pay        || '-'), l2: 'Final Payment', v2: ': ' + (tc.final_pay     || '-') },
    { l1: 'Delivery Time',   v1: ': ' + (tc.delivery_time   || '-'), l2: 'Delivery Cond', v2: ': ' + (tc.delivery_cond || '-') },
    { l1: 'Warranty',        v1: ': ' + (tc.warranty        || '-'), l2: 'Bonus',         v2: ': ' + (tc.bonus         || '-') },
  ];

  sheet.insertRowsAfter(row - 1, tcRows.length);
  tcRows.forEach(function(r, idx) {
    sheet.getRange(row, 1, 1, 8)
      .setBackground(idx % 2 === 0 ? '#efefef' : '#f3f3f3')
      .setFontColor('#000000');
    sheet.setRowHeight(row, 24);

    sheet.getRange(row, 1).setValue(r.l1).setFontWeight('bold').setFontColor('#000000').setWrap(false);
    sheet.getRange(row, 3).setValue(r.v1).setFontWeight('normal').setWrap(false);
    sheet.getRange(row, 5).setValue(r.l2).setFontWeight('bold').setFontColor('#000000').setWrap(false);
    sheet.getRange(row, 7).setValue(r.v2).setFontWeight('normal').setWrap(false);

    row++;
  });

  // ── Tanda tangan ──
  sheet.insertRowsAfter(row - 1, 3);
  sheet.getRange(row, 1, 1, 8).merge().setBackground('#ffffff');
  row++;

  sheet.getRange(row, 1, 1, 7)
    .merge()
    .setValue('If you have any questions concerning this quotation, contact Name, Phone Number, E-mail')
    .setFontColor('#000000').setFontWeight('normal').setBackground('#ffffff');
  sheet.getRange(row, 8)
    .setValue('Best Regard,')
    .setWrap(true).setHorizontalAlignment('right').setVerticalAlignment('top')
    .setFontColor('#000000').setFontWeight('normal').setBackground('#ffffff');
  row++;

  sheet.getRange(row, 1, 1, 7)
    .merge()
    .setValue('THANK YOU FOR YOUR BUSINESS!')
    .setBackground('#ffffff')
    .setFontWeight('bold').setFontColor('#000000').setWrap(false);
  sheet.getRange(row, 8)
    .setValue(item.dibuatOleh || 'Sales Executive')
    .setWrap(true).setHorizontalAlignment('right').setVerticalAlignment('top')
    .setFontColor('#000000').setFontWeight('bold').setBackground('#ffffff');
}


// ── Helpers ───────────────────────────────────────────────────────────────

function _getKlienMap(ss) {
  const map = {};
  try {
    const sheet = ss.getSheetByName('Master_Klien');
    if (!sheet) return map;
    // getValues() SEKALI untuk seluruh data (bukan getRange per baris)
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) map[data[i][0].toString()] = {
        nama: data[i][1], perusahaan: data[i][2],
        alamat: data[i][3], kontak: data[i][4]
      };
    }
  } catch(e) {}
  return map;
}

function _isiHeaderTemplate(namedRangeCache, item, klien, tc) {
  // Gunakan cache Map — tidak perlu loop scan ss.getNamedRanges() berulang
  const set = function(name, val) {
    const range = namedRangeCache.get(name);
    if (range) {
      range.setValue(val);
    } else {
      Logger.log('Named range tidak ditemukan: ' + name);
    }
  };
  set('tpl_no_penawaran',     item.id              || '');
  set('tpl_tanggal',          item.tanggal          || '');
  set('tpl_valid_until',      item.validUntil       || '');
  set('tpl_rev',              item.rev    || '0');
  set('tpl_dibuat_oleh',      item.dibuatOleh       || '');
  set('tpl_nama_project',     item.namaProject      || '');
  set('tpl_klien_nama',       klien.nama            || item.namaKlien || '');
  set('tpl_klien_perusahaan', klien.perusahaan      || '');
  set('tpl_klien_alamat',     klien.alamat          || '');
  set('tpl_klien_kontak',     klien.kontak          || '');
}

function _pajakPct(netSub, pajak) {
  if (!netSub || !pajak) return 11;
  return Math.round((pajak / netSub) * 100);
}

function _exportSheetToPdfBase64(ss, sheet) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId()
    + '/export?format=pdf&size=A4&portrait=true&fitw=true'
    + '&gridlines=false&printtitle=false&sheetnames=false'
    + '&pagenumbers=false&attachment=true'
    + '&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5'
    + '&gid=' + sheet.getSheetId();

  const resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('HTTP ' + resp.getResponseCode() + ' saat export PDF');
  }
  return Utilities.base64Encode(resp.getBlob().getBytes());
}

// ============================================================
// SISTEM LOGIN — TAMBAHKAN KE Code.gs
// Letakkan blok ini di bagian BAWAH file Code.gs yang sudah ada
// ============================================================

// ── Helper: buat / ambil sheet Master_User ────────────────────────────────
function _getOrCreateMasterUser(ss) {
  ss = ss || getSpreadsheet();
  let sheet = ss.getSheetByName('Master_User');
  if (!sheet) {
    sheet = ss.insertSheet('Master_User');
    // Header
    sheet.appendRow(['ID', 'Nama Lengkap', 'Username', 'Password', 'Role', 'Aktif']);
    // Format header
    sheet.getRange(1, 1, 1, 6)
      .setBackground('#1e3a8a')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 6, [60, 160, 120, 120, 80, 60]);

    // Seed: 1 admin default
    sheet.appendRow(['U001', 'Administrator', 'admin', 'admin123', 'admin', 'TRUE']);
    // Seed: contoh sales
    sheet.appendRow(['U002', 'Sales Executive', 'sales1', 'sales123', 'sales', 'TRUE']);
  }
  return sheet;
}

// ── Login: verifikasi username + password ─────────────────────────────────
function loginUser(username, password) {
  try {
    if (!username || !password) {
      return { success: false, message: 'Username dan password wajib diisi.' };
    }
    
    // Gunakan getSpreadsheet() yang sudah ada — akan berjalan sebagai PEMILIK script
    // karena deploy "Execute as: Me"
    const sheet = _getOrCreateMasterUser();
    SpreadsheetApp.flush();
    const data = sheet.getDataRange().getValues();

    const uname = username.toString().trim().toLowerCase();
    const pass  = password.toString().trim();

    for (let i = 1; i < data.length; i++) {
      const rowId    = data[i][0] ? data[i][0].toString().trim() : '';
      const rowNama  = data[i][1] ? data[i][1].toString().trim() : '';
      const rowUser  = data[i][2] ? data[i][2].toString().trim().toLowerCase() : '';
      const rowPass  = data[i][3] ? data[i][3].toString().trim() : '';
      const rowRole  = data[i][4] ? data[i][4].toString().trim().toLowerCase() : 'sales';
      const rowAktif = data[i][5] ? data[i][5].toString().trim().toUpperCase() : 'TRUE';

      if (rowUser === uname && rowPass === pass) {
        if (rowAktif === 'FALSE') {
          return { success: false, message: 'Akun ini tidak aktif. Hubungi administrator.' };
        }
        return {
          success: true,
          user: { id: rowId, nama: rowNama, username: rowUser, role: rowRole },
          message: 'Selamat datang, ' + rowNama + '!'
        };
      }
    }
    return { success: false, message: 'Username atau password salah.' };

  } catch(e) {
    Logger.log('loginUser error: ' + e.toString());
    // Jangan expose detail error teknis ke client
    return { success: false, message: 'Terjadi kesalahan server. Coba beberapa saat lagi.' };
  }
}

// ── Get daftar user (admin only) ──────────────────────────────────────────
function getUserList() {
  try {
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    const list  = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      list.push({
        id:       data[i][0].toString(),
        nama:     data[i][1].toString(),
        username: data[i][2].toString(),
        // Password sengaja tidak dikirim ke client
        role:     data[i][4].toString(),
        aktif:    data[i][5].toString().toUpperCase() !== 'FALSE'
      });
    }
    return list;
  } catch(e) { return []; }
}

// ── Tambah user baru (admin only) ─────────────────────────────────────────
function simpanUser(nama, username, password, role) {
  try {
    if (!nama || !username || !password || !role) {
      return { success: false, message: 'Semua field wajib diisi.' };
    }
    const sheet = _getOrCreateMasterUser();
    SpreadsheetApp.flush();
    const data = sheet.getDataRange().getValues();

    // Cek duplikat username
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] && data[i][2].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
        return { success: false, message: 'Username "' + username + '" sudah digunakan.' };
      }
    }

    // Generate ID
    let maxNum = 0;
    for (let i = 1; i < data.length; i++) {
      const m = data[i][0] ? data[i][0].toString().match(/^U(\d+)/i) : null;
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    const nextId = 'U' + String(maxNum + 1).padStart(3, '0');

    sheet.appendRow([nextId, nama, username.trim().toLowerCase(), password, role.toLowerCase(), 'TRUE']);
    return { success: true, message: 'User ' + nextId + ' (' + nama + ') berhasil ditambahkan!' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Edit user (admin only) ────────────────────────────────────────────────
function editUser(id, nama, username, password, role, aktif) {
  try {
    if (!id || !nama || !username || !role) {
      return { success: false, message: 'Data tidak lengkap.' };
    }
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        // Cek duplikat username (exclude baris sendiri)
        for (let j = 1; j < data.length; j++) {
          if (j !== i && data[j][2] &&
              data[j][2].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
            return { success: false, message: 'Username "' + username + '" sudah digunakan user lain.' };
          }
        }
        const newPass = (password && password.trim()) ? password.trim() : data[i][3].toString();
        sheet.getRange(i + 1, 2, 1, 5).setValues([[
          nama, username.trim().toLowerCase(), newPass,
          role.toLowerCase(), aktif ? 'TRUE' : 'FALSE'
        ]]);
        return { success: true, message: 'User ' + id + ' berhasil diperbarui!' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

// ── Hapus user (admin only) ───────────────────────────────────────────────
function hapusUser(id) {
  try {
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'User ' + id + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

// ── Ganti password (self-service) ─────────────────────────────────────────
function gantiPassword(userId, passwordLama, passwordBaru) {
  try {
    if (!passwordLama || !passwordBaru) {
      return { success: false, message: 'Password lama dan baru wajib diisi.' };
    }
    if (passwordBaru.length < 6) {
      return { success: false, message: 'Password baru minimal 6 karakter.' };
    }
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === userId.toString().trim()) {
        if (data[i][3].toString().trim() !== passwordLama.trim()) {
          return { success: false, message: 'Password lama tidak sesuai.' };
        }
        sheet.getRange(i + 1, 4).setValue(passwordBaru.trim());
        return { success: true, message: 'Password berhasil diubah!' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function getDashboardRawData(namaUser, isAdmin) {
  try {
    const ss = getSpreadsheet();
    const sheetMain   = ss.getSheetByName('Penawaran_Main') || buatSheetPenawaranDefault(ss);
    const sheetProduk = ss.getSheetByName('Master_Produk')  || buatSheetProdukDefault(ss);
    const sheetKlien  = ss.getSheetByName('Master_Klien')   || buatSheetKlienDefault(ss);

    const dataMain = sheetMain.getDataRange().getValues();
    const klienMap = {};
    const kdArr    = sheetKlien.getDataRange().getValues();
    for (let i = 1; i < kdArr.length; i++) {
      if (kdArr[i][0]) klienMap[kdArr[i][0].toString()] = kdArr[i][1].toString();
    }

    function parseTanggal(raw) {
      if (raw instanceof Date) return isNaN(raw) ? null : raw;
      if (!raw) return null;
      const parts = raw.toString().split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        return isNaN(d) ? null : d;
      }
      const d = new Date(raw);
      return isNaN(d) ? null : d;
    }

    // Kumpulkan semua baris, filter by user jika bukan admin
    const latestRevMap = {};
    for (let i = 1; i < dataMain.length; i++) {
      if (!dataMain[i][0]) continue;
      if (!isAdmin && namaUser) {
        const pembuat = dataMain[i][6] ? dataMain[i][6].toString().trim() : '';
        if (pembuat !== namaUser.trim()) continue;
      }
      const no  = dataMain[i][0].toString();
      const rev = parseInt(dataMain[i][1]) || 0;
      if (!(no in latestRevMap) || rev > latestRevMap[no].rev) {
        const tgl = parseTanggal(dataMain[i][2]);
        latestRevMap[no] = {
          id:          no,
          rev:         rev,
          tanggal:     tgl ? tgl.getTime() : null, // kirim sebagai timestamp ms
          namaProject: dataMain[i][4].toString(),
          klienId:     dataMain[i][5].toString(),
          namaKlien:   klienMap[dataMain[i][5].toString()] || dataMain[i][5].toString(),
          dibuatOleh:  dataMain[i][6].toString(),
          grandTotal:  parseFloat(dataMain[i][10]) || 0,
          status:      dataMain[i][16] ? dataMain[i][16].toString() : 'On-Progress'
        };
      }
    }

    const allItems = Object.values(latestRevMap);

    return {
      success:        true,
      items:          allItems,
      totalProducts:  Math.max(0, sheetProduk.getLastRow() - 1),
      totalCustomers: Math.max(0, sheetKlien.getLastRow()  - 1),
      isAdmin:        !!isAdmin,
      namaUser:       namaUser || ''
    };
  } catch(e) {
    return { success: false, items: [], totalProducts: 0, totalCustomers: 0, isAdmin: false, namaUser: '' };
  }
}
