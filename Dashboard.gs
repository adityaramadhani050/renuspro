/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Dashboard: data mentah untuk kalkulasi KPI di sisi klien.
 */

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
        const tgl      = parseTanggal(dataMain[i][2]);
        const tglDeal  = parseTanggal(dataMain[i][18]);
        const status   = dataMain[i][16] ? dataMain[i][16].toString() : 'On-Progress';
        latestRevMap[no] = {
          id:          no,
          rev:         rev,
          tanggal:     tgl ? tgl.getTime() : null,
          tanggalDeal: tglDeal ? tglDeal.getTime() : null, // tanggal saat status jadi Deal
          namaProject: dataMain[i][4].toString(),
          klienId:     dataMain[i][5].toString(),
          namaKlien:   klienMap[dataMain[i][5].toString()] || dataMain[i][5].toString(),
          dibuatOleh:  dataMain[i][6].toString(),
          grandTotal:  parseFloat(dataMain[i][10]) || 0,
          status:      status
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
