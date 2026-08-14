const { test, expect } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// ─────────────────────────────────────────────────────────────────────────────
// FLOW RANTAI EKSEKUSI PROJECT (stateful, end-to-end):
//   HandOver (Sales→PC) → assign+BOM → approve (Lead) → procurement (reserve
//   stok) → request pengiriman (PC) → kirim (Warehouse) → terima.
// Mendorong 1 WO existing (Deal, belum di-handover) lewat SELURUH rantai; tiap
// langkah meng-assert transisi status + efek angka (stok turun saat kirim,
// realisasi HPP bertambah). Karena guard urutan ketat, keberhasilan tiap
// langkah otomatis membuktikan prasyaratnya benar.
//
// MENGUBAH DATA PERMANEN. Hanya jalan bila E2E_ALLOW_WRITES=1. Jalankan di DB
// TES. Pilih WO via E2E_CHAIN_WO di .env, atau biarkan test auto-pilih.
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const admin = credsFor('admin');
const today = new Date().toISOString().slice(0, 10);
const Q = 1; // qty material (kecil, agar konsumsi stok minimal)

test.describe('Rantai eksekusi project (E2E stateful)', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati.');
  test.skip(!admin, 'Butuh kredensial admin.');

  test('deal → handover → BOM → approve → reserve → kirim → terima', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, 'admin');
    const arr = (x) => (Array.isArray(x) ? x : (x && x.list) || []);
    const stokAvail = async (idStok) => {
      const s = arr(await gsCall(page, 'getStokList')).find((r) => r.idStok === idStok || r.idProduk === idStok);
      return s ? { avail: Number(s.qtyAvailable) || 0, fisik: Number(s.qtyTersedia) || 0 } : null;
    };
    const realisasi = async (noWO) => {
      const r = await gsCall(page, 'getRealisasiHPP', noWO);
      return Number(r && (r.realisasiHPP != null ? r.realisasiHPP : 0)) || 0;
    };

    // ── Setup: pilih stok tersedia & WO Deal belum-handover ──────────────────
    const stok = arr(await gsCall(page, 'getStokList')).find((s) => (Number(s.qtyAvailable) || 0) >= Q);
    test.skip(!stok, `Tidak ada stok dengan qtyAvailable >= ${Q}.`);
    const idStok = stok.idStok;

    let noWO = (process.env.E2E_CHAIN_WO || '').trim();
    if (!noWO) {
      const wos = arr(await gsCall(page, 'getWorkOrderList'))
        .filter((w) => w.noWO && (w.status || '') === 'Deal' &&
          (w.status || '') !== 'Closed' && !(w.hoStatus || ''));
      test.skip(wos.length === 0, 'Tidak ada WO Deal yang belum di-handover. Set E2E_CHAIN_WO di .env.');
      noWO = wos[0].noWO;
    }
    console.log('[CHAIN] WO =', noWO, '| stok =', idStok, '(' + stok.namaProduk + ')');

    const hppAwal = await realisasi(noWO);
    const stokAwal = await stokAvail(idStok);

    // ── 1. Hand Over: request → schedule → complete ──────────────────────────
    await test.step('handover request→schedule→complete', async () => {
      const r1 = await gsCall(page, 'requestHandOver', noWO, 'E2E');
      expect(r1 && r1.success, 'requestHandOver: ' + (r1 && r1.message)).toBeTruthy();
      let ho = await gsCall(page, 'getHandOverByWO', noWO);
      expect(ho && ho.record && ho.record.status).toBe('Diminta');

      const r2 = await gsCall(page, 'scheduleHandOver', {
        noWO, tanggal: today, waktu: '10:00', mode: 'Online',
        link: 'https://e2e.test/meet', lokasi: '', peserta: 'E2E', catatan: '', oleh: 'E2E',
      });
      expect(r2 && r2.success, 'scheduleHandOver: ' + (r2 && r2.message)).toBeTruthy();
      ho = await gsCall(page, 'getHandOverByWO', noWO);
      expect(ho.record.status).toBe('Dijadwalkan');

      const r3 = await gsCall(page, 'completeHandOver', noWO, 'E2E MoM: siap eksekusi', 'E2E');
      expect(r3 && r3.success, 'completeHandOver: ' + (r3 && r3.message)).toBeTruthy();
      ho = await gsCall(page, 'getHandOverByWO', noWO);
      expect(ho.record.status).toBe('Selesai');
    });

    // ── 2. Daftarkan WO ke BOM (+assign) — guard: HO Selesai ─────────────────
    await test.step('addBOMProject (guard HO Selesai)', async () => {
      const r = await gsCall(page, 'addBOMProject', noWO, [], 'E2E');
      expect(r && r.success, 'addBOMProject: ' + (r && r.message)).toBeTruthy();
    });

    // ── 3. Site engineer tambah material (Pending, BOM Draft) ────────────────
    let idItem;
    await test.step('saveBOMItems → material Pending', async () => {
      const r = await gsCall(page, 'saveBOMItems', {
        noWO, oleh: 'E2E',
        items: [{ namaMaterial: 'E2E Material Chain', qty: Q, satuan: 'unit', kategori: 'Lainnya', merek: '', supplier: '', pricelistId: '', catatan: 'E2E TEST' }],
      });
      expect(r && r.success, 'saveBOMItems: ' + (r && r.message)).toBeTruthy();
      const bom = await gsCall(page, 'getBOMByWO', noWO);
      const it = (bom.items || []).find((x) => x.namaMaterial === 'E2E Material Chain');
      expect(it, 'material E2E tidak ditemukan di BOM').toBeTruthy();
      expect(it.status).toBe('Pending');
      expect(bom.status).toBe('Draft');
      idItem = it.id;
    });

    // ── 4. Lead engineer approve item → BOM Final ────────────────────────────
    await test.step('reviewBOMItem Approved → BOM Final', async () => {
      const r = await gsCall(page, 'reviewBOMItem', idItem, 'Approved', '', 'E2E');
      expect(r && r.success, 'reviewBOMItem: ' + (r && r.message)).toBeTruthy();
      const bom = await gsCall(page, 'getBOMByWO', noWO);
      const it = (bom.items || []).find((x) => x.id === idItem);
      expect(it.status).toBe('Approved');
      expect(bom.status).toBe('Final');
    });

    // ── 5. Procurement reserve dari stok (guard: item Approved) ──────────────
    await test.step('prosesBOMProcurement reserve stok', async () => {
      const r = await gsCall(page, 'prosesBOMProcurement', idItem, { oleh: 'E2E', idStok, qtyReserved: Q });
      expect(r && r.success, 'prosesBOMProcurement: ' + (r && r.message)).toBeTruthy();
      expect(Number(r.qtyReserved)).toBe(Q);
      expect(r.procStatus).toBe('Reserved');
      // Stok available turun Q (hold naik), fisik tetap.
      const s = await stokAvail(idStok);
      expect(s.avail, `available ${s.avail} != ${stokAwal.avail}-${Q}`).toBe(stokAwal.avail - Q);
      expect(s.fisik, 'stok fisik tak boleh berubah saat reserve').toBe(stokAwal.fisik);
    });

    // ── 6. PC request pengiriman (guard: Approved + reserved) ────────────────
    await test.step('requestPengiriman', async () => {
      const r = await gsCall(page, 'requestPengiriman', noWO, 'E2E', [{ bomItemId: idItem, qty: Q }]);
      expect(r && r.success, 'requestPengiriman: ' + (r && r.message)).toBeTruthy();
      const reqs = arr(await gsCall(page, 'getPengirimanRequests')).find((x) => x.noWO === noWO);
      expect(reqs, 'request pengiriman tidak muncul').toBeTruthy();
    });

    // ── 7. Warehouse proses kirim → stok fisik keluar + realisasi HPP naik ───
    let idKirim;
    await test.step('prosesKirim → stok keluar + HPP', async () => {
      const r = await gsCall(page, 'prosesKirim', {
        noWO, items: [{ bomItemId: idItem, qty: Q }], tanggal: today,
        alamat: 'E2E', kendaraan: '-', driver: '-', catatan: 'E2E TEST', oleh: 'E2E',
      });
      expect(r && r.success, 'prosesKirim: ' + (r && r.message)).toBeTruthy();
      expect(r.noSuratJalan, 'noSuratJalan kosong').toBeTruthy();
      idKirim = r.idKirim;
      // Stok fisik turun Q.
      const s = await stokAvail(idStok);
      expect(s.fisik, `stok fisik ${s.fisik} != ${stokAwal.fisik}-${Q}`).toBe(stokAwal.fisik - Q);
      // Realisasi HPP WO bertambah (pengeluaran Penggunaan Stok).
      const hpp = await realisasi(noWO);
      expect(hpp, 'realisasi HPP harus bertambah setelah kirim').toBeGreaterThan(hppAwal);
    });

    // ── 8. Terima di lokasi → SJ Diterima ────────────────────────────────────
    await test.step('terimaPengiriman → Diterima', async () => {
      const r = await gsCall(page, 'terimaPengiriman', { idKirim, oleh: 'E2E', buktiFileId: '', buktiFileUrl: '', buktiFileName: '' });
      expect(r && r.success, 'terimaPengiriman: ' + (r && r.message)).toBeTruthy();
      const sj = arr(await gsCall(page, 'getPengirimanList')).find((x) => x.idKirim === idKirim);
      expect(sj && sj.status).toBe('Diterima');
    });

    console.log('[CHAIN] SELESAI — WO', noWO, 'melewati seluruh rantai handover→kirim→terima.');
  });
});
