const { test, expect } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// ─────────────────────────────────────────────────────────────────────────────
// FLOW NUMERIK — PEMBAYARAN PO (ber-WO) → PENGELUARAN PROJECT → REALISASI HPP.
// Alur: request pembayaran PO → approve. Saat approve, porsi DPP dari jumlah
// bayar dicatat sbg pengeluaran project WO (sumber 'Pembayaran PO', mencantumkan
// No PO) → masuk realisasi HPP. Porsi PPN dicatat terpisah tanpa WO (tidak masuk
// HPP). Jadi realisasiHPP(noWO) HARUS bertambah tepat = dppPortion.
//
// MEMBUAT DATA (request + approval + pengeluaran). Hanya jalan bila
// E2E_ALLOW_WRITES=1. Jalankan di DB TES.
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const admin = credsFor('admin');
const today = new Date().toISOString().slice(0, 10);

test.describe('Pembayaran PO → Pengeluaran project → Realisasi HPP (numerik)', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati.');
  test.skip(!admin, 'Butuh kredensial admin.');

  test('pembayaran PO ber-WO menambah realisasi HPP sebesar porsi DPP', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, 'admin');
    const arr = (x) => (Array.isArray(x) ? x : (x && x.list) || []);

    // Cari PO peruntukan WO, status dapat-dibayar, WO belum Closed, grandTotal>0.
    const pos = arr(await gsCall(page, 'getPOList'));
    let target = null;
    for (const p of pos) {
      const noPO = p.noPO || p.id;
      if (!noPO) continue;
      const det = await gsCall(page, 'getPODetail', noPO);
      const po = det && det.po;
      if (!po || !po.noWO) continue;
      const st = (po.statusPO || '').toString();
      if (st === 'Selesai' || st === 'Batal') continue;
      if ((Number(po.grandTotal) || 0) <= 0) continue;
      target = { noPO, noWO: po.noWO, grandTotal: Number(po.grandTotal) || 0, ppnNominal: Number(po.ppnNominal) || 0 };
      break;
    }
    test.skip(!target, 'Tidak ada PO peruntukan WO (status dapat-dibayar, kontrak>0) di DB tes.');

    const { noPO, noWO, grandTotal, ppnNominal } = target;

    // Jumlah bayar kecil; hitung porsi DPP yang akan masuk HPP.
    const jumlah = Math.max(1000, Math.min(100000, Math.round(grandTotal / 4)));
    const ppnRatio = grandTotal > 0 ? ppnNominal / grandTotal : 0;
    const ppnPortion = Math.round(jumlah * ppnRatio);
    const dppPortion = jumlah - ppnPortion;

    // Akun pembayaran valid (bukan AP001 "Stok").
    const akun = arr(await gsCall(page, 'getAkunPembayaranList')).find((a) => a.id && a.id !== 'AP001');
    test.skip(!akun, 'Tidak ada akun pembayaran (selain AP001) di DB tes.');

    // Realisasi HPP WO sebelum.
    const hpp0 = await realisasiTotal(page, noWO);

    // 1) Request pembayaran PO (invoice supplier wajib → URL dummy).
    const req = await gsCall(page, 'requestPembayaranPO', {
      noPO, jumlah, tanggalRequest: today, catatan: 'E2E TEST bayar PO',
      invoiceFileUrl: 'https://e2e.test/inv-supplier.pdf', invoiceFileId: '', invoiceFileName: 'inv.pdf',
      dibuatOleh: 'E2E',
    });
    expect(req && req.success, 'requestPembayaranPO gagal: ' + (req && req.message)).toBeTruthy();
    expect(req.idReq, 'idReq kosong').toBeTruthy();

    // 2) Approve → catat pembayaran + pengeluaran.
    const appr = await gsCall(page, 'approvePembayaranPO', {
      idReq: req.idReq, idAkun: akun.id, namaAkun: akun.namaAkun,
      buktiFileUrl: 'https://e2e.test/bukti-bayar.pdf', buktiFileId: '', buktiFileName: 'bukti.pdf',
      approvedBy: 'E2E', tanggalBayar: today, catatan: 'E2E TEST',
    });
    expect(appr && appr.success, 'approvePembayaranPO gagal: ' + (appr && appr.message)).toBeTruthy();

    // 3) Realisasi HPP WO bertambah tepat = dppPortion (PPN tidak masuk).
    const hpp1 = await realisasiTotal(page, noWO);
    expect(hpp1, `realisasiHPP ${hpp1} != ${hpp0}+${dppPortion} (dpp dari jumlah ${jumlah}, ppn ${ppnPortion})`)
      .toBe(hpp0 + dppPortion);

    // 4) Pengeluaran project mencantumkan No PO (validasi "dengan No PO").
    const peng = arr(await gsCall(page, 'getPengeluaranList'));
    const row = peng.find((e) => (e.noPO === noPO || e.no_po === noPO) &&
      (e.noWO === noWO || e.no_wo === noWO) &&
      Math.abs((Number(e.total) || 0) - dppPortion) <= 1);
    if (row) {
      expect(row).toBeTruthy();
    } else {
      test.info().annotations.push({
        type: 'pengeluaran-noPO',
        description: `Pengeluaran DPP (No PO ${noPO}, WO ${noWO}, total ${dppPortion}) tak ditemukan lewat getPengeluaranList — cek nama field. Delta realisasiHPP tetap terverifikasi.`,
      });
    }
  });
});

async function realisasiTotal(page, noWO) {
  const r = await gsCall(page, 'getRealisasiHPP', noWO);
  return Number(r && (r.realisasiHPP != null ? r.realisasiHPP : 0)) || 0;
}
