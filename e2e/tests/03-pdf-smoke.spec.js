const { test, expect } = require('@playwright/test');
const { attachErrorCollectors, login, gotoPage } = require('../helpers/auth');
const { credsFor } = require('../helpers/roles');

// Export PDF memicu jsPDF + autotable (lib CDN) atas hasil agregasi client-side.
// Bug umum yang tertangkap: lib undefined, autotable hilang, atau crash karena
// bentuk data. Kita klik tombol export lalu pastikan TIDAK ada exception JS.
const PDF_TARGETS = [
  { page: 'dashboard', button: '#db-export-btn' },
  { page: 'laporanfinance', button: 'button[onclick="exportFinanceReportPDF()"]' },
  { page: 'laporankeuangan', button: 'button[onclick="exportLaporanKeuanganPDF()"]' },
  { page: 'laporanprofitabilitas', button: 'button[onclick="exportLaporanProfitPDF()"]' },
];

test.describe('Export PDF (laporan) — tidak melempar exception', () => {
  const admin = credsFor('admin');
  test.skip(!admin, 'Butuh kredensial admin (E2E_ADMIN_USER/PASS) untuk mengakses semua laporan.');

  test('semua tombol export laporan aman', async ({ page }) => {
    const errs = attachErrorCollectors(page);
    await login(page, 'admin');

    const failures = [];
    for (const t of PDF_TARGETS) {
      try {
        await gotoPage(page, t.page);
        await page.waitForTimeout(1000); // biarkan agregasi selesai
        const btn = page.locator(t.button).first();
        if (await btn.count() === 0) {
          failures.push(`  ✗ [${t.page}] tombol export tidak ditemukan (${t.button})`);
          continue;
        }
        const before = errs.pageErrors.length;
        // Export bisa memicu download atau membuka preview; keduanya OK.
        await btn.click();
        await page.waitForTimeout(1500);
        const newErrs = errs.pageErrors.slice(before);
        if (newErrs.length) failures.push(`  ✗ [${t.page}] pageerror saat export: ${newErrs.join(' | ')}`);
      } catch (e) {
        failures.push(`  ✗ [${t.page}] ${e.message.split('\n')[0]}`);
      }
    }
    expect(failures, `Export PDF bermasalah:\n${failures.join('\n')}`).toHaveLength(0);
  });
});
