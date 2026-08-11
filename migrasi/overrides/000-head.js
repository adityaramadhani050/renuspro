/* =============================================================================
 *  RenusPro — Override modul ke Supabase (Milestone 4)
 *  Dimuat SETELAH gs-run-shim.js. Meng-override fungsi tertentu (mulai: login)
 *  agar memakai Supabase, tanpa mengubah tampilan. Fungsi lain yang BELUM
 *  di-override tetap jalan lewat backend Apps Script lama.
 *
 *  CARA PAKAI: isi 2 nilai di bawah (Project URL & anon key dari Supabase →
 *  Settings → API). Bila belum diisi, file ini TIDAK berbuat apa-apa (login
 *  lama tetap dipakai).
 * ========================================================================== */
(function () {
  'use strict';

  // ── ISI DUA NILAI INI ──────────────────────────────────────────────────────
  var SUPABASE_URL  = 'ISI_PROJECT_URL';   // contoh: https://abcd1234.supabase.co
  var SUPABASE_ANON = 'ISI_ANON_KEY';      // anon public key (aman untuk frontend)
  // ───────────────────────────────────────────────────────────────────────────

  // Nyalakan jadi `true` HANYA SETELAH Edge Function 'get-stok-list' ter-deploy
  // (lihat migrasi/PANDUAN-EDGE-FUNCTIONS.md). Selama false, getStokList tetap
  // memakai Apps Script lama supaya Inventory tidak rusak.
  var ENABLE_EDGE_STOK = false;

  // Nyalakan `true` HANYA SETELAH Edge Function 'invoice-ops' ter-deploy
  // (lihat PANDUAN-EDGE-FUNCTIONS.md). Selama false, simpan invoice & ubah
  // status bayar tetap lewat Apps Script (aman).
  var ENABLE_EDGE_INVOICE = false;

  // Nyalakan `true` HANYA SETELAH Edge Function 'user-ops' ter-deploy. Selama
  // false, tambah/edit/hapus user tetap lewat Apps Script (aman). Manajemen user
  // butuh Supabase Auth admin (service_role) → wajib di server.
  var ENABLE_EDGE_USER = false;

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('ISI_') === 0 ||
      !SUPABASE_ANON || SUPABASE_ANON.indexOf('ISI_') === 0) {
    return; // belum dikonfigurasi → biarkan login lama (Apps Script) tetap jalan
  }

  import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(function (mod) {
      var supa = mod.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
      window.supa = supa; // dipakai override modul berikutnya