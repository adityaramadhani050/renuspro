const { test, expect } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// ─────────────────────────────────────────────────────────────────────────────
// FLOW NUMERIK — INVOICE → PEMBAYARAN → KWITANSI.
// Buat invoice DP dari WO ber-kontrak, verifikasi invarian total = dpp + PPN,
// lalu tandai Lunas dan pastikan kwitansi otomatis dibuat dgn jumlah = total.
//
// MEMBUAT DATA (invoice + kwitansi + pemasukan). Hanya jalan bila
// E2E_ALLOW_WRITES=1. Jalankan di DB TES. Ditandai "E2E TEST".
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const cred = credsFor('finance') || credsFor('admin');
const today = new Date().toISOString().slice(0, 10);

test.describe('Invoice → Kwitansi (numerik)', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati.');
  test.skip(!cred, 'Butuh kredensial finance atau admin.');

  test('invoice DP: total = dpp + PPN; setelah Lunas kwitansi otomatis = total', async ({ page }) => {
    await login(page, credsFor('finance') ? 'finance' : 'admin');

    // Pilih WO dengan nilai kontrak terbesar (> 0).
    const wos = await gsCall(page, 'getWorkOrderList');
    const warr = Array.isArray(wos) ? wos : (wos && wos.list) || [];
    const wo = warr
      .filter((w) => w.noWO && (Number(w.nilaiKontrak) || 0) > 0)
      .sort((a, b) => (Number(b.nilaiKontrak) || 0) - (Number(a.nilaiKontrak) || 0))[0];
    test.skip(!wo, 'Tidak ada Work Order dengan nilai kontrak > 0 di DB tes.');

    const nilaiKontrak = Number(wo.nilaiKontrak) || 0;
    // DP kecil agar tak melebihi sisa: seperempat kontrak, minimal 1.
    const dpp = Math.max(1, Math.min(100000, Math.round(nilaiKontrak / 4)));

    // Buat invoice DP.
    const created = await gsCall(page, 'simpanInvoice', {
      noWO: wo.noWO, noPenawaran: wo.id || '', tanggal: today, jenis: 'DP',
      inputMode: 'nominal', dpp, noPO: '', tglPO: '', catatan: 'E2E TEST invoice',
      bankAccount: '', dibuatOleh: 'E2E',
    });
    expect(created && created.success, 'simpanInvoice gagal: ' + (created && created.message)).toBeTruthy();
    expect(created.noInvoice, 'noInvoice kosong').toBeTruthy();
    const noInvoice = created.noInvoice;

    // Baca kembali invoice → invarian total = dpp + ppnNominal.
    const invs = await gsCall(page, 'getInvoiceList');
    const iarr = Array.isArray(invs) ? invs : (invs && invs.list) || [];
    const inv = iarr.find((x) => x.id === noInvoice);
    expect(inv, 'invoice baru tidak ditemukan di getInvoiceList').toBeTruthy();

    const invDpp = Number(inv.dpp) || 0;
    const invPpn = Number(inv.ppnNominal) || 0;
    const invTotal = Number(inv.total) || 0;
    expect(invTotal, `total(${invTotal}) != dpp(${invDpp}) + ppn(${invPpn})`).toBe(invDpp + invPpn);
    // PPN konsisten dengan persen tersimpan.
    const expPpn = Math.round(invDpp * (Number(inv.ppnPersen) || 0) / 100);
    expect(invPpn, `ppnNominal(${invPpn}) != round(dpp*ppn%)=${expPpn}`).toBe(expPpn);
    expect(inv.statusBayar).toBe('Belum Lunas');

    // Tandai Lunas → kwitansi otomatis (jumlah = total invoice).
    const paid = await gsCall(page, 'updateStatusBayarInvoice', noInvoice, 'Lunas', {
      buktiFileId: '', buktiFileUrl: 'https://e2e.test/bukti-e2e.pdf', buktiFileName: 'bukti-e2e.pdf',
    });
    expect(paid && paid.success, 'updateStatusBayarInvoice gagal: ' + (paid && paid.message)).toBeTruthy();
    expect(paid.noKwitansi, 'noKwitansi kosong setelah Lunas').toBeTruthy();

    // Kwitansi otomatis dengan jumlah = total invoice.
    const kws = await gsCall(page, 'getKwitansiList');
    const karr = Array.isArray(kws) ? kws : (kws && kws.list) || [];
    const kw = karr.find((k) => k.id === paid.noKwitansi);
    expect(kw, 'kwitansi otomatis tidak ditemukan').toBeTruthy();
    expect(Number(kw.jumlah), `kwitansi.jumlah(${kw.jumlah}) != invoice.total(${invTotal})`).toBe(invTotal);
    expect(kw.noInvoice).toBe(noInvoice);

    // Status invoice kini Lunas.
    const invs2 = await gsCall(page, 'getInvoiceList');
    const inv2 = (Array.isArray(invs2) ? invs2 : invs2.list || []).find((x) => x.id === noInvoice);
    expect(inv2 && inv2.statusBayar).toBe('Lunas');
  });
});
