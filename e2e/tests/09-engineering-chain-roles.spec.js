const { test, expect } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// ─────────────────────────────────────────────────────────────────────────────
// RANTAI EKSEKUSI — DENGAN PERAN ASLI (bukan admin untuk semua).
// Tiap langkah dijalankan oleh sesi login peran yang seharusnya:
//   Sales → request handover; Project Coordinator → jadwalkan/selesai + assign +
//   request kirim; Site Engineer → tambah material; Lead Engineer → approve;
//   WAREHOUSE → reserve stok (INTI PERUBAHAN) + proses kirim + terima.
// Membuktikan RLS/izin tiap peran mengizinkan langkahnya — khususnya bahwa
// warehouse kini benar bisa me-reserve (fungsi yang dipindah dari procurement).
// Peran tanpa kredensial → fallback admin (dicatat sbg anotasi).
//
// MENGUBAH DATA PERMANEN. Gated E2E_ALLOW_WRITES. Pilih WO via E2E_CHAIN_WO.
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const today = new Date().toISOString().slice(0, 10);
const Q = 1;

test.describe('Rantai eksekusi project — per peran', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati.');
  test.skip(!credsFor('admin'), 'Butuh kredensial admin (fallback peran).');
  test.skip(!credsFor('warehouse'), 'Butuh kredensial warehouse (inti uji: reserve).');

  test('chain per peran: sales→PC→site→lead→warehouse', async ({ browser }) => {
    test.setTimeout(240_000);

    const pageByRole = {};
    const fellBack = new Set();
    // Kembalikan page ter-login untuk `role`; fallback ke admin bila kredensial
    // peran tsb belum diisi (dicatat). Satu context per peran (sesi Supabase-nya
    // sendiri → RLS diuji sesuai peran).
    async function as(role) {
      const useRole = credsFor(role) ? role : 'admin';
      if (useRole !== role) fellBack.add(role);
      if (!pageByRole[useRole]) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await login(page, useRole);
        pageByRole[useRole] = page;
      }
      return pageByRole[useRole];
    }
    const arr = (x) => (Array.isArray(x) ? x : (x && x.list) || []);
    const stokAvail = async (page, idStok) => {
      const s = arr(await gsCall(page, 'getStokList')).find((r) => r.idStok === idStok || r.idProduk === idStok);
      return s ? { avail: Number(s.qtyAvailable) || 0, fisik: Number(s.qtyTersedia) || 0 } : null;
    };
    const realisasi = async (page, noWO) => {
      const r = await gsCall(page, 'getRealisasiHPP', noWO);
      return Number(r && (r.realisasiHPP != null ? r.realisasiHPP : 0)) || 0;
    };

    // Setup (pakai admin): pilih stok tersedia & WO Deal belum-handover.
    const adminPage = await as('admin');
    const stok = arr(await gsCall(adminPage, 'getStokList')).find((s) => (Number(s.qtyAvailable) || 0) >= Q);
    test.skip(!stok, `Tidak ada stok dengan qtyAvailable >= ${Q}.`);
    const idStok = stok.idStok;

    let noWO = (process.env.E2E_CHAIN_WO || '').trim();
    if (!noWO) {
      const wos = arr(await gsCall(adminPage, 'getWorkOrderList'))
        .filter((w) => w.noWO && (w.status || '') === 'Deal' && !(w.hoStatus || ''));
      test.skip(wos.length === 0, 'Tidak ada WO Deal belum di-handover. Set E2E_CHAIN_WO.');
      noWO = wos[0].noWO;
    }
    console.log('[CHAIN-ROLES] WO =', noWO, '| stok =', idStok);

    const stokAwal = await stokAvail(adminPage, idStok);
    const hppAwal = await realisasi(adminPage, noWO);

    // 1. Sales → request handover.
    await test.step('SALES requestHandOver', async () => {
      const p = await as('sales');
      const r = await gsCall(p, 'requestHandOver', noWO, 'E2E-Sales');
      expect(r && r.success, 'requestHandOver: ' + (r && r.message)).toBeTruthy();
    });

    // 2. Project Coordinator → schedule + complete.
    await test.step('PC schedule+complete handover', async () => {
      const p = await as('projectcoordinator');
      const r2 = await gsCall(p, 'scheduleHandOver', {
        noWO, tanggal: today, waktu: '10:00', mode: 'Online',
        link: 'https://e2e.test/meet', lokasi: '', peserta: 'E2E', catatan: '', oleh: 'E2E-PC',
      });
      expect(r2 && r2.success, 'scheduleHandOver: ' + (r2 && r2.message)).toBeTruthy();
      const r3 = await gsCall(p, 'completeHandOver', noWO, 'E2E MoM', 'E2E-PC');
      expect(r3 && r3.success, 'completeHandOver: ' + (r3 && r3.message)).toBeTruthy();
      const ho = await gsCall(p, 'getHandOverByWO', noWO);
      expect(ho.record.status).toBe('Selesai');
    });

    // 3. Lead Engineer → daftarkan WO ke BOM.
    await test.step('LEAD addBOMProject', async () => {
      const p = await as('leadengineer');
      const r = await gsCall(p, 'addBOMProject', noWO, [], 'E2E-Lead');
      expect(r && r.success, 'addBOMProject: ' + (r && r.message)).toBeTruthy();
    });

    // 4. Site Engineer → tambah material.
    let idItem;
    await test.step('SITE saveBOMItems', async () => {
      const p = await as('siteengineer');
      const r = await gsCall(p, 'saveBOMItems', {
        noWO, oleh: 'E2E-Site',
        items: [{ namaMaterial: 'E2E Material Roles', qty: Q, satuan: 'unit', kategori: 'Lainnya', merek: '', supplier: '', pricelistId: '', catatan: 'E2E' }],
      });
      expect(r && r.success, 'saveBOMItems: ' + (r && r.message)).toBeTruthy();
      const bom = await gsCall(p, 'getBOMByWO', noWO);
      const it = (bom.items || []).find((x) => x.namaMaterial === 'E2E Material Roles');
      expect(it, 'material tidak ditemukan').toBeTruthy();
      idItem = it.id;
    });

    // 5. Lead Engineer → approve.
    await test.step('LEAD reviewBOMItem Approved', async () => {
      const p = await as('leadengineer');
      const r = await gsCall(p, 'reviewBOMItem', idItem, 'Approved', '', 'E2E-Lead');
      expect(r && r.success, 'reviewBOMItem: ' + (r && r.message)).toBeTruthy();
    });

    // 6. WAREHOUSE → reserve stok (INTI PERUBAHAN: dulu procurement).
    await test.step('WAREHOUSE prosesBOMProcurement (reserve)', async () => {
      const p = await as('warehouse');
      const r = await gsCall(p, 'prosesBOMProcurement', idItem, { oleh: 'E2E-WH', idStok, qtyReserved: Q });
      expect(r && r.success, 'WAREHOUSE reserve gagal: ' + (r && r.message)).toBeTruthy();
      expect(r.procStatus).toBe('Reserved');
      const s = await stokAvail(p, idStok);
      expect(s.avail, `available ${s.avail} != ${stokAwal.avail}-${Q}`).toBe(stokAwal.avail - Q);
    });

    // 7. Project Coordinator → request pengiriman.
    await test.step('PC requestPengiriman', async () => {
      const p = await as('projectcoordinator');
      const r = await gsCall(p, 'requestPengiriman', noWO, 'E2E-PC', [{ bomItemId: idItem, qty: Q }]);
      expect(r && r.success, 'requestPengiriman: ' + (r && r.message)).toBeTruthy();
    });

    // 8. Warehouse → proses kirim (stok fisik keluar + realisasi HPP naik).
    let idKirim;
    await test.step('WAREHOUSE prosesKirim', async () => {
      const p = await as('warehouse');
      const r = await gsCall(p, 'prosesKirim', {
        noWO, items: [{ bomItemId: idItem, qty: Q }], tanggal: today,
        alamat: 'E2E', kendaraan: '-', driver: '-', catatan: 'E2E', oleh: 'E2E-WH',
      });
      expect(r && r.success, 'prosesKirim: ' + (r && r.message)).toBeTruthy();
      idKirim = r.idKirim;
      const s = await stokAvail(p, idStok);
      expect(s.fisik, `stok fisik ${s.fisik} != ${stokAwal.fisik}-${Q}`).toBe(stokAwal.fisik - Q);
      const hpp = await realisasi(p, noWO);
      expect(hpp, 'realisasi HPP harus naik setelah kirim').toBeGreaterThan(hppAwal);
    });

    // 9. Warehouse → terima.
    await test.step('WAREHOUSE terimaPengiriman', async () => {
      const p = await as('warehouse');
      const r = await gsCall(p, 'terimaPengiriman', { idKirim, oleh: 'E2E-WH', buktiFileId: '', buktiFileUrl: '', buktiFileName: '' });
      expect(r && r.success, 'terimaPengiriman: ' + (r && r.message)).toBeTruthy();
      const sj = arr(await gsCall(p, 'getPengirimanList')).find((x) => x.idKirim === idKirim);
      expect(sj && sj.status).toBe('Diterima');
    });

    if (fellBack.size) {
      test.info().annotations.push({
        type: 'fallback-admin',
        description: 'Peran tanpa kredensial (pakai admin): ' + [...fellBack].join(', ') +
          '. Isi E2E_<ROLE>_USER/PASS di .env untuk menguji peran nyatanya.',
      });
    }
    console.log('[CHAIN-ROLES] SELESAI. Fallback admin utk:', [...fellBack].join(', ') || '(tidak ada)');

    for (const p of Object.values(pageByRole)) { await p.context().close(); }
  });
});
