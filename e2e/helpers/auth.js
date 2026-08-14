const { expect } = require('@playwright/test');
const { credsFor } = require('./roles');

// Pasang penangkap error konsol & exception halaman. Kembalikan objek {errors}
// yang terisi selama masa hidup page. `pageerror` = exception JS tak tertangkap
// (sinyal bug kuat). `console.error` dikumpulkan terpisah sbg sinyal lunak.
function attachErrorCollectors(page) {
  const bucket = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (err) => bucket.pageErrors.push(err.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.consoleErrors.push(msg.text());
  });
  return bucket;
}

// Login lewat UI. `role` dipakai untuk mengambil kredensial dari env.
async function login(page, role) {
  const creds = credsFor(role);
  if (!creds) throw new Error(`Kredensial untuk peran "${role}" belum di-set di .env`);

  await page.goto('/');
  // Layar login harus tampil.
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.fill('#login-username', creds.user);
  await page.fill('#login-password', creds.pass);
  await page.click('#login-btn');

  // Sukses = layar login ter-hidden (lihat _onLoginSuccess di JS_Auth_Users.html).
  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 20_000 });
  // Nama user muncul di sidebar.
  await expect(page.locator('#active-user-name')).not.toHaveText('', { timeout: 10_000 });
}

// Navigasi ke pageId lewat sidebar; verifikasi page-<id> menjadi aktif.
async function gotoPage(page, pageId) {
  const nav = page.locator(`#nav-${pageId}`);
  await nav.click();
  await expect(page.locator(`#page-${pageId}`)).toHaveClass(/active/, { timeout: 20_000 });
}

module.exports = { attachErrorCollectors, login, gotoPage };
