/* =============================================================================
 *  RenusPro — Konfigurasi Supabase (LOKAL, tidak ikut git)
 *
 *  CARA PAKAI (sekali saja):
 *    cp migrasi/config.local.example.js migrasi/config.local.js
 *  lalu isi `url` & `anon` di migrasi/config.local.js (Supabase → Settings → API).
 *
 *  config.local.js di-gitignore → `git pull` TIDAK akan pernah bentrok lagi.
 *  Nilai di sini AMAN untuk frontend (anon key memang publik). Dimuat SEBELUM
 *  supabase-overrides.js oleh build.mjs.
 * ========================================================================== */
window.__SUPA_CFG__ = {
  url:  'https://ISI-PROJECT-REF.supabase.co', // Project URL
  anon: 'ISI_ANON_KEY',                        // anon public key

  // Nyalakan `true` HANYA setelah Edge Function terkait ter-deploy
  // (lihat migrasi/PANDUAN-EDGE-FUNCTIONS.md):
  enableEdgeStok:    false, // get-stok-list
  enableEdgeInvoice: false, // invoice-ops
  enableEdgeUser:    false  // user-ops (tambah/edit/hapus user)
};
