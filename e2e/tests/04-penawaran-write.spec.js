const { test, expect } = require('@playwright/test');
const { attachErrorCollectors, login, gotoPage } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');

// ─────────────────────────────────────────────────────────────────────────────
// FLOW TULIS — MEMBUAT DATA. Hanya jalan bila E2E_ALLOW_WRITES=1 di .env DAN
// kredensial sales tersedia. Jalankan pada environment/data TES.
//
// Tujuan: buka form penawaran baru, isi header, verifikasi INVARIAN perhitungan
// finansial di DOM (grandTotal == round(netSub + pajak)), lalu (opsional) simpan.
//
// CATATAN: penambahan baris item memakai UI kelompok/item yang dinamis. Bagian
// "isi item" ditandai TODO — sesuaikan dengan DOM build Anda bila perlu. Bagian
// header + pembacaan span total sudah sesuai Page_Penawaran.html.
// ─────────────────────────────────────────────────────────────────────────────
const allowWrites = process.env.E2E_ALLOW_WRITES === '1';
const sales = credsFor('sales') || credsFor('admin');

test.describe('Penawaran — buat & verifikasi invarian total', () => {
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES != 1 — flow tulis dilewati (default aman).');
  test.skip(!sales, 'Butuh kredensial sales atau admin.');

  test('form penawaran baru: header terisi & span total konsisten', async ({ page }) => {
    test.setTimeout(90_000);
    const errs = attachErrorCollectors(page);
    await login(page, credsFor('sales') ? 'sales' : 'admin');
    await gotoPage(page, 'penawaran');

    // Buka form "penawaran baru".
    await page.evaluate(() => window.toggleFormPenawaran(true));
    await expect(page.locator('#mainQuotationForm')).toBeVisible();

    // Isi header.
    await page.fill('#namaProject', 'E2E TEST — hapus setelah verifikasi');
    // Pilih klien pertama (best-effort, non-fatal). Aplikasi membungkus <select>
    // native dengan searchable-dropdown custom (class sd-native, tersembunyi),
    // jadi selectOption biasa gagal. Set nilai via JS + picu event 'change'
    // supaya onKlienChanged() tetap jalan. Tidak menggagalkan test bila gagal —
    // invarian total di bawah adalah assertion utamanya.
    await page.evaluate(() => {
      const s = document.getElementById('klienSelect');
      if (s && s.options.length > 1) {
        s.selectedIndex = 1;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // TODO(anda): tambahkan minimal 1 baris item + qty + harga jual + HPP di sini
    // memakai tombol "Tambah Item" / "Tambah Kelompok" sesuai DOM Anda, agar
    // invarian di bawah teruji dengan angka riil. Tanpa item, semua span = 0
    // (invarian tetap benar: 0 == 0).

    // Verifikasi invarian: grandTotal == round(netSub + pajak).
    // netSub = subtotal - diskon; pajak = round(netSub * ppn%).
    const nums = await page.evaluate(() => {
      const val = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        return Number((el.innerText || '0').replace(/[^\d-]/g, '')) || 0;
      };
      return {
        subtotal: val('txtSubtotalSemua'),
        pajak: val('txtPajakNominal'),
        grand: val('txtGrandTotalSemua'),
        hpp: val('txtHppSemua'),
        jualBersih: val('txtJualBersihInternal'),
        profit: val('txtProfitInternal'),
      };
    });

    // grandTotal harus = jualBersih (netSub) + pajak.
    expect(
      Math.abs(nums.grand - (nums.jualBersih + nums.pajak)),
      `grandTotal(${nums.grand}) != jualBersih(${nums.jualBersih}) + pajak(${nums.pajak})`
    ).toBeLessThanOrEqual(1);

    // profit = jualBersih - hpp (exclude PPN).
    expect(
      Math.abs(nums.profit - (nums.jualBersih - nums.hpp)),
      `profit(${nums.profit}) != jualBersih(${nums.jualBersih}) - hpp(${nums.hpp})`
    ).toBeLessThanOrEqual(1);

    expect(errs.pageErrors, errs.pageErrors.join('\n')).toHaveLength(0);

    // Simpan sengaja TIDAK dijalankan otomatis agar tidak menumpuk data tes.
    // Untuk menguji simpan end-to-end, hapus komentar berikut:
    // await page.click('#btnSubmitForm');
    // await expect(page.locator('#mainQuotationForm')).toBeHidden({ timeout: 20000 });
  });
});
