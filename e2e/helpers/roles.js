// Cermin dari _ROLE_NAV di JS_Auth_Users.html — peran → daftar pageId yang boleh
// diakses. Dipakai nav-smoke untuk menelusuri semua menu tiap peran.
// Jika _ROLE_NAV di aplikasi berubah, samakan di sini.
const ROLE_NAV = {
  admin: ['dashboard', 'sitesurvey', 'penawaran', 'workorder', 'invoice', 'kwitansi', 'produk', 'template', 'customer', 'users', 'laporanfinance', 'settings', 'supplier', 'pricelist', 'purchaseorder', 'inventory', 'pengeluaran', 'laporanprofitabilitas', 'laporankeuangan', 'qc', 'bom', 'ded', 'schedule'],
  finance: ['workorder', 'invoice', 'kwitansi', 'laporanfinance', 'pengeluaran', 'laporanprofitabilitas', 'laporankeuangan'],
  sales: ['dashboard', 'sitesurvey', 'penawaran', 'workorder', 'produk', 'template', 'customer'],
  procurement: ['workorder', 'purchaseorder', 'supplier', 'pricelist', 'bom'],
  warehouse: ['workorder', 'inventory'],
  siteengineer: ['qc', 'bom', 'ded', 'schedule'],
  leadengineer: ['workorder', 'qc', 'bom', 'ded', 'schedule'],
};

// Peran → variabel env kredensial.
const ROLE_ENV = {
  admin: ['E2E_ADMIN_USER', 'E2E_ADMIN_PASS'],
  sales: ['E2E_SALES_USER', 'E2E_SALES_PASS'],
  finance: ['E2E_FINANCE_USER', 'E2E_FINANCE_PASS'],
  procurement: ['E2E_PROCUREMENT_USER', 'E2E_PROCUREMENT_PASS'],
  warehouse: ['E2E_WAREHOUSE_USER', 'E2E_WAREHOUSE_PASS'],
  siteengineer: ['E2E_SITEENGINEER_USER', 'E2E_SITEENGINEER_PASS'],
  leadengineer: ['E2E_LEADENGINEER_USER', 'E2E_LEADENGINEER_PASS'],
};

// Kembalikan {user, pass} untuk peran jika kredensialnya ada di env, else null.
function credsFor(role) {
  const pair = ROLE_ENV[role];
  if (!pair) return null;
  const user = process.env[pair[0]];
  const pass = process.env[pair[1]];
  if (!user || !pass) return null;
  return { user, pass };
}

// Peran yang punya kredensial terisi.
function configuredRoles() {
  return Object.keys(ROLE_ENV).filter((r) => credsFor(r) !== null);
}

module.exports = { ROLE_NAV, ROLE_ENV, credsFor, configuredRoles };
