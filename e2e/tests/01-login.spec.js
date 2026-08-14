const { test, expect } = require('@playwright/test');
const { attachErrorCollectors, login } = require('../helpers/auth');
const { configuredRoles, credsFor } = require('../helpers/roles');

const roles = configuredRoles();

test.describe('Login', () => {
  test.skip(roles.length === 0, 'Tidak ada kredensial peran di .env — isi minimal satu.');

  for (const role of roles) {
    test(`login valid sebagai "${role}"`, async ({ page }) => {
      const errs = attachErrorCollectors(page);
      await login(page, role);
      // Tidak boleh ada exception JS tak tertangkap selama login + halaman awal.
      expect(errs.pageErrors, `pageerror saat login ${role}:\n${errs.pageErrors.join('\n')}`).toHaveLength(0);
    });
  }

  test('login invalid menampilkan pesan error', async ({ page }) => {
    // Ambil satu peran mana pun hanya untuk memastikan BASE_URL benar; pakai
    // password sengaja salah.
    const anyRole = roles[0];
    const creds = credsFor(anyRole);
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();
    await page.fill('#login-username', creds.user);
    await page.fill('#login-password', 'password-sengaja-salah-xyz');
    await page.click('#login-btn');
    // Kotak error harus muncul; layar login tetap tampak.
    await expect(page.locator('#login-error')).toHaveClass(/show/, { timeout: 20_000 });
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});
