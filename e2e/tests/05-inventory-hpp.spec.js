const { test, expect } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// ─────────────────────────────────────────────────────────────────────────────
// FLOW NUMERIK — INVENTORY & REALISASI HPP.
// Memanggil fungsi backend langsung (via shim google.script.run) dengan input
// deterministik, lalu membaca ulang efeknya untuk assert ANGKA. Menguji aturan
// inti roadmap: stok bertambah/berkurang, harga beli terakhir, sinkron HPP
// master, dan realisasi HPP project.
//
// MEMBUAT/MENGUBAH DATA di DB. Hanya jalan bila E2E_ALLOW_WRITES=1. Jalankan di
// environment/DB TES. Entri ditandai "E2E TEST" + timestamp agar mudah dilacak.
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const admin = credsFor('admin');
const today = new Date().toISOString().slice(0, 10);

test.describe('Inventory & Realisasi HPP (numerik)', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati.');
  test.skip(!admin, 'Butuh kredensial admin.');

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  // Ambil satu produk bertipe stok (punya stokId & qtyTersedia numerik).
  async function pickStokProduk(page) {
    const list = await gsCall(page, 'getProdukList');
    const arr = Array.isArray(list) ? list : (list && list.list) || [];
    return arr.find((p) => p && p.stokId && typeof p.qtyTersedia === 'number');
  }

  // ── 5.1 Penerimaan NON-PO: stok bertambah + mutasi tercatat ────────────────
  test('penerimaan non-PO menambah stok & mencatat mutasi dgn harga benar', async ({ page }) => {
    const prod = await pickStokProduk(page);
    test.skip(!prod, 'Tidak ada produk bertipe stok di DB tes.');

    const q0 = prod.qtyTersedia;
    const hpp0 = Number(prod.hpp) || 0;
    const Q = 2;
    const newPrice = hpp0 + 13579;               // harga khas agar mudah dikenali
    const tag = 'E2E TEST non-PO ' + Date.now();

    const res = await gsCall(page, 'simpanPenerimaanTanpaPO', {
      idStok: prod.stokId, idProduk: prod.stokId, qty: Q, hargaSatuan: newPrice,
      tanggal: today, keterangan: tag, namaUser: 'E2E',
    });
    expect(res && res.success, 'simpanPenerimaanTanpaPO gagal: ' + (res && res.message)).toBeTruthy();

    // Stok bertambah tepat Q.
    const after = await pickByStok(page, prod.stokId);
    expect(after, 'produk hilang setelah penerimaan').toBeTruthy();
    expect(after.qtyTersedia, `qtyTersedia ${after.qtyTersedia} != ${q0}+${Q}`).toBe(q0 + Q);

    // Mutasi tercatat dengan qty & harga benar (dicari via keterangan unik).
    const muts = await gsCall(page, 'getMutasiStokList', { idProduk: prod.stokId });
    const marr = Array.isArray(muts) ? muts : (muts && muts.list) || [];
    const m = marr.find((x) => (x.keterangan || '') === tag);
    expect(m, 'mutasi penerimaan non-PO tidak ditemukan').toBeTruthy();
    expect(m.qtyMasuk).toBe(Q);
    expect(Number(m.hargaSatuan)).toBe(newPrice);
    expect(Number(m.saldoSetelah)).toBe(q0 + Q);

    // BY DESIGN: penerimaan non-PO TIDAK menyinkron produk.hpp — warehouse tidak
    // berwenang menetapkan harga material. HPP master hanya tersinkron dari
    // penerimaan PO (harga ditetapkan di PO oleh finance/procurement). Jadi di
    // sini HPP master HARUS tetap = hpp0 (tidak berubah oleh penerimaan non-PO).
    const hppAfter = Number(after.hpp) || 0;
    expect(hppAfter, 'penerimaan non-PO seharusnya tidak mengubah HPP master').toBe(hpp0);

    // Kompensasi: kurangi lagi Q agar stok kembali (best-effort).
    await gsCall(page, 'simpanPenyesuaianStok', {
      idStok: prod.stokId, idProduk: prod.stokId, jenis: '-', qty: Q,
      keterangan: tag + ' (revert)', namaUser: 'E2E',
    }).catch(() => {});
  });

  // ── 5.2 Penerimaan PO: stok + harga beli terakhir + SINKRON HPP MASTER ─────
  test('penerimaan PO menambah stok, set harga beli terakhir & sinkron HPP master', async ({ page }) => {
    const pos = await gsCall(page, 'getPOMenungguPenerimaan');
    const parr = Array.isArray(pos) ? pos : (pos && pos.list) || [];
    test.skip(parr.length === 0, 'Tidak ada PO menunggu penerimaan gudang di DB tes.');

    // Cari PO + item yang punya idProduk (agar sinkron HPP berlaku) & qtySisa>0.
    let chosen = null;
    for (const po of parr) {
      const det = await gsCall(page, 'getPOItemsUntukPenerimaan', po.noPO);
      const items = (det && det.items) || [];
      const it = items.find((x) => x.idProduk && (x.qtySisa || 0) > 0);
      if (it) { chosen = { noPO: po.noPO, it }; break; }
    }
    test.skip(!chosen, 'Tidak ada item PO ber-idProduk dengan sisa qty.');

    const { noPO, it } = chosen;
    const recvQty = Math.min(it.qtySisa, 1);
    const hargaBeli = Math.round(Number(it.hargaBeli) || 0);

    const before = await pickByStok(page, it.idProduk);
    const q0 = before ? before.qtyTersedia : 0;

    const res = await gsCall(page, 'terimaPOItems', {
      noPO, namaUser: 'E2E',
      items: [{
        idItem: it.idItem, qty: recvQty, hargaBeli, idProduk: it.idProduk, idStok: it.idProduk,
        namaItem: it.namaItem, satuan: it.satuan || '', catatan: 'E2E TEST terima PO',
      }],
    });
    expect(res && res.success, 'terimaPOItems gagal: ' + (res && res.message)).toBeTruthy();

    // Stok bertambah tepat recvQty.
    const after = await pickByStok(page, it.idProduk);
    expect(after, 'produk hilang setelah terima PO').toBeTruthy();
    expect(after.qtyTersedia, `qty ${after.qtyTersedia} != ${q0}+${recvQty}`).toBe(q0 + recvQty);

    // SINKRON HPP MASTER: produk.hpp == harga beli (DPP, dibulatkan).
    expect(Number(after.hpp), `HPP master ${after.hpp} != hargaBeli ${hargaBeli}`).toBe(hargaBeli);

    // Harga beli terakhir di stok = hargaBeli.
    const stok = await gsCall(page, 'getStokList');
    const sarr = Array.isArray(stok) ? stok : (stok && stok.list) || [];
    const srow = sarr.find((s) => s.idProduk === it.idProduk || s.idStok === it.idProduk);
    if (srow) {
      expect(Number(srow.hargaBeliTerakhir), 'harga beli terakhir salah').toBe(hargaBeli);
    }
  });

  // ── 5.3 Penggunaan stok utk WO: stok berkurang + masuk realisasi HPP ───────
  test('penggunaan stok mengurangi stok & menambah realisasi HPP WO', async ({ page }) => {
    // WO yang belum closed.
    const wos = await gsCall(page, 'getWorkOrderList');
    const warr = Array.isArray(wos) ? wos : (wos && wos.list) || [];
    const wo = warr.find((w) => w.noWO && (w.status || '').toLowerCase() !== 'closed' && (w.hoStatus || '') !== 'Selesai');
    test.skip(!wo, 'Tidak ada Work Order aktif (non-closed) di DB tes.');

    // Produk dengan stok >= 1.
    const prod = (await gsCall(page, 'getProdukList'))
      .filter((p) => p && p.stokId)
      .find((p) => (p.qtyTersedia || 0) >= 1);
    test.skip(!prod, 'Tidak ada produk dengan stok tersedia >= 1.');

    const q0 = prod.qtyTersedia;
    const hpp0 = await realisasiTotal(page, wo.noWO);
    const Q = 1;

    // gunakanStok = POSITIONAL: (noWO, idStok, qty, tanggal, keterangan, namaUser)
    const res = await gsCall(page, 'gunakanStok', wo.noWO, prod.stokId, Q, today, 'E2E TEST pakai stok', 'E2E');
    expect(res && res.success, 'gunakanStok gagal: ' + (res && res.message)).toBeTruthy();
    expect(Number(res.total), 'total FIFO harus > 0').toBeGreaterThan(0);

    // Stok berkurang tepat Q.
    const after = await pickByStok(page, prod.stokId);
    expect(after.qtyTersedia, `qty ${after.qtyTersedia} != ${q0}-${Q}`).toBe(q0 - Q);

    // Realisasi HPP WO bertambah sebesar total FIFO.
    const hpp1 = await realisasiTotal(page, wo.noWO);
    expect(hpp1, `realisasiHPP ${hpp1} != ${hpp0}+${res.total}`).toBe(hpp0 + Number(res.total));
  });
});

// Helper: ambil objek produk (dari getProdukList) berdasarkan stokId/sku.
async function pickByStok(page, stokId) {
  const list = await gsCall(page, 'getProdukList');
  const arr = Array.isArray(list) ? list : (list && list.list) || [];
  return arr.find((p) => p && (p.stokId === stokId || p.sku === stokId));
}

// Helper: total realisasi HPP satu WO.
async function realisasiTotal(page, noWO) {
  const r = await gsCall(page, 'getRealisasiHPP', noWO);
  return Number(r && (r.realisasiHPP != null ? r.realisasiHPP : 0)) || 0;
}
