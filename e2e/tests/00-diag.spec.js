const { test } = require('@playwright/test');
const { login } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');
const { gsCall } = require('../helpers/gs');

// Diagnostik READ-ONLY: cetak kondisi data untuk memahami kenapa flow numerik
// ter-skip. Tidak mengubah apa pun. Jalankan:
//   npx playwright test tests/00-diag.spec.js --reporter=list
const admin = credsFor('admin');

test.describe('Diagnostik data (read-only)', () => {
  test.skip(!admin, 'Butuh kredensial admin.');

  test('kondisi PO / stok / WO', async ({ page }) => {
    await login(page, 'admin');
    const arr = (x) => (Array.isArray(x) ? x : (x && x.list) || []);
    const L = (...a) => console.log('[DIAG]', ...a);

    // 1) PO menunggu penerimaan gudang
    const pos = arr(await gsCall(page, 'getPOMenungguPenerimaan'));
    L('getPOMenungguPenerimaan count =', pos.length);
    for (const po of pos.slice(0, 5)) {
      L('  PO', po.noPO, '| supplier:', po.namaSupplier, '| itemPending:', po.jumlahItemPending);
      const det = await gsCall(page, 'getPOItemsUntukPenerimaan', po.noPO);
      L('    statusPO:', det && det.statusPO, '| items:', ((det && det.items) || []).length);
      for (const it of ((det && det.items) || []).slice(0, 5)) {
        L('      item idItem=', it.idItem, 'idProduk=', JSON.stringify(it.idProduk),
          'qtySisa=', it.qtySisa, 'hargaBeli=', it.hargaBeli, 'nama=', it.namaItem);
      }
    }

    // 2) Semua PO (status apa pun) — untuk lihat status yang dipakai
    const allPO = arr(await gsCall(page, 'getPOList'));
    L('getPOList count =', allPO.length, '| contoh status:',
      allPO.slice(0, 8).map((p) => (p.noPO || p.id) + ':' + (p.statusPO || p.status)).join(', '));

    // 3) Stok — sampel key idProduk/idStok
    const stok = arr(await gsCall(page, 'getStokList'));
    L('getStokList count =', stok.length);
    for (const s of stok.slice(0, 8)) {
      L('  stok idProduk=', JSON.stringify(s.idProduk), 'idStok=', JSON.stringify(s.idStok),
        'nama=', s.namaProduk, 'qty=', s.qtyTersedia, 'hrgTerakhir=', s.hargaBeliTerakhir);
    }

    // 4) WO + nilai kontrak
    const wos = arr(await gsCall(page, 'getWorkOrderList'));
    L('getWorkOrderList count =', wos.length);
    for (const w of wos.slice(0, 12)) {
      L('  WO', w.noWO, '| nilaiKontrak=', w.nilaiKontrak, '| status=', w.status, '| hoStatus=', w.hoStatus);
    }
  });
});
