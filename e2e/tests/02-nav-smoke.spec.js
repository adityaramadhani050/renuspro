const { test, expect } = require('@playwright/test');
const { attachErrorCollectors, login, gotoPage } = require('../helpers/auth');
const { configuredRoles, ROLE_NAV } = require('../helpers/roles');

// Untuk tiap peran yang punya kredensial: login lalu telusuri SEMUA menu yang
// diizinkan peran itu. Tiap navigasi memicu load<X>() yang query Supabase asli,
// sehingga query rusak / RLS / exception render akan tersurface di sini.
const roles = configuredRoles();

test.describe('Navigasi smoke per peran', () => {
  test.skip(roles.length === 0, 'Tidak ada kredensial peran di .env.');

  for (const role of roles) {
    test(`peran "${role}" — semua menu render tanpa exception`, async ({ page }) => {
      const errs = attachErrorCollectors(page);
      await login(page, role);

      const pages = ROLE_NAV[role] || [];
      const failures = [];

      for (const pageId of pages) {
        const before = errs.pageErrors.length;
        try {
          await gotoPage(page, pageId);
          // Beri jeda singkat agar load async sempat melempar bila akan melempar.
          await page.waitForTimeout(800);
        } catch (e) {
          failures.push(`  ✗ [${pageId}] gagal navigasi/aktif: ${e.message.split('\n')[0]}`);
          continue;
        }
        const newErrs = errs.pageErrors.slice(before);
        if (newErrs.length) {
          failures.push(`  ✗ [${pageId}] pageerror: ${newErrs.join(' | ')}`);
        }
      }

      // Laporkan semua kegagalan sekaligus (bukan gagal di menu pertama).
      expect(failures, `Menu bermasalah untuk peran ${role}:\n${failures.join('\n')}`).toHaveLength(0);

      if (errs.consoleErrors.length) {
        // Sinyal lunak: tidak menggagalkan test, hanya menempel di laporan.
        test.info().annotations.push({
          type: 'console.error',
          description: `${errs.consoleErrors.length} console.error selama sesi ${role}:\n` +
            errs.consoleErrors.slice(0, 30).join('\n'),
        });
      }
    });
  }
});
