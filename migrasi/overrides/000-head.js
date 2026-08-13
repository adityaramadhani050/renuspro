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

  // Edge Function 'get-stok-list' sudah ter-deploy → getStokList via Supabase.
  var ENABLE_EDGE_STOK = true;

  // Edge Function 'invoice-ops' sudah ter-deploy → simpan/edit invoice & ubah
  // status bayar via Supabase.
  var ENABLE_EDGE_INVOICE = true;

  // Edge Function 'user-ops' sudah ter-deploy → tambah/edit/hapus user via
  // Supabase Auth admin (service_role di server).
  var ENABLE_EDGE_USER = true;

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('ISI_') === 0 ||
      !SUPABASE_ANON || SUPABASE_ANON.indexOf('ISI_') === 0) {
    return; // belum dikonfigurasi → biarkan login lama (Apps Script) tetap jalan
  }

  import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(function (mod) {
      var supa = mod.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
      window.supa = supa; // dipakai override modul berikutnya