/* =============================================================================
 *  RenusPro — Shim `google.script.run`  (Fase 1 migrasi ke Vercel)
 *  Meniru API Apps Script client-side, tapi menerjemahkan tiap panggilan jadi
 *  fetch() ke backend. Punya TABEL ROUTING per-fungsi: default ke proxy Apps
 *  Script lama; override per fungsi saat modul dimigrasi ke Supabase/API baru.
 *
 *  Muat file ini PALING AWAL (sebelum semua JS_*), agar `google.script.run`
 *  tersedia saat kode UI dipanggil. Frontend TIDAK perlu diubah.
 *
 *  Pola yang didukung:
 *    google.script.run
 *      .withSuccessHandler(res => ...)
 *      .withFailureHandler(err => ...)
 *      .namaFungsiServer(arg1, arg2);
 * ========================================================================== */
(function () {
  'use strict';

  // ── Konfigurasi ──────────────────────────────────────────────────────────
  var CONFIG = {
    // Endpoint proxy (same-origin Vercel) yang meneruskan ke Apps Script lama.
    proxyUrl: '/api/gs',
    // Ambil token auth (mis. Supabase JWT) untuk header Authorization. Ganti
    // sesuai implementasi Auth Anda; kembalikan '' bila belum ada.
    getAuthToken: function () {
      try { return window.__RENUS_TOKEN__ || ''; } catch (e) { return ''; }
    }
  };

  // ── Tabel routing per-fungsi ─────────────────────────────────────────────
  // __default__ dipakai bila nama fungsi tak ada di sini.
  // mode:
  //   'proxy' → POST {fn, args} ke CONFIG.proxyUrl (Apps Script lama)
  //   'api'   → POST args (array) ke `url` (endpoint baru Supabase/Vercel)
  //   'fn'    → panggil handler(args) lokal (mock/adaptor supabase-js langsung)
  var ROUTES = {
    __default__: { mode: 'proxy' }

    // Contoh override saat modul WO dimigrasi:
    // getWorkOrderDashboard: { mode: 'api', url: '/api/wo/dashboard' },
    // getPenawaranList:      { mode: 'api', url: '/api/penawaran/list' },
    // simpanPenawaran:       { mode: 'fn',  handler: async (args) => { /* supabase-js */ } },
  };

  // API publik agar mudah menambah override dari luar (mis. per modul):
  //   window.gsRoute('getWorkOrderDashboard', { mode:'api', url:'/api/wo/dashboard' })
  window.gsRoute = function (fnName, route) { ROUTES[fnName] = route; };
  window.gsConfig = CONFIG;

  // ── Transport ────────────────────────────────────────────────────────────
  function fail(state, message) {
    if (state.onFailure) {
      var err = new Error(message || 'Terjadi kesalahan.');
      err.name = 'ScriptError';
      state.onFailure(err, state.userObject);
    } else {
      console.error('[gs-run-shim] gagal (tanpa failure handler):', message);
    }
  }
  function ok(state, result) {
    if (state.onSuccess) state.onSuccess(result === undefined ? null : result, state.userObject);
  }

  function httpJson(url, bodyObj) {
    var headers = { 'Content-Type': 'application/json' };
    var tok = '';
    try { tok = CONFIG.getAuthToken(); } catch (e) {}
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyObj)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { return t; }
    });
  }

  function invoke(fnName, args, state) {
    var route = ROUTES[fnName] || ROUTES.__default__;
    try {
      if (route.mode === 'fn') {
        Promise.resolve(route.handler(args, fnName))
          .then(function (res) { ok(state, res); })
          .catch(function (e) { fail(state, (e && e.message) || String(e)); });
        return;
      }
      if (route.mode === 'api') {
        httpJson(route.url, args)
          .then(function (res) { ok(state, res); })
          .catch(function (e) { fail(state, (e && e.message) || String(e)); });
        return;
      }
      // default: proxy Apps Script lama
      httpJson(CONFIG.proxyUrl, { fn: fnName, args: args })
        .then(function (res) { ok(state, res); })
        .catch(function (e) { fail(state, (e && e.message) || String(e)); });
    } catch (e) {
      fail(state, (e && e.message) || String(e));
    }
  }

  // ── Runner (Proxy) — fresh tiap akses google.script.run ───────────────────
  function createRunner() {
    var state = { onSuccess: null, onFailure: null, userObject: undefined };
    var proxy = new Proxy(function () {}, {
      get: function (_t, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { state.onSuccess = fn; return proxy; };
        if (prop === 'withFailureHandler') return function (fn) { state.onFailure = fn; return proxy; };
        if (prop === 'withUserObject')     return function (o)  { state.userObject = o; return proxy; };
        // properti lain = nama fungsi server → kembalikan pemanggil
        return function () { invoke(String(prop), Array.prototype.slice.call(arguments), state); };
      }
    });
    return proxy;
  }

  // Pasang google.script.run (getter → runner baru tiap akses, seperti Apps Script)
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  try {
    Object.defineProperty(window.google.script, 'run', {
      configurable: true,
      get: createRunner
    });
  } catch (e) {
    window.google.script.run = createRunner(); // fallback (handler bisa bocor antar-chain)
  }

  // Stub ringan untuk API Apps Script lain yang kadang dipakai UI.
  window.google.script.host = window.google.script.host || {
    close: function () {}, setHeight: function () {}, setWidth: function () {},
    origin: '', editor: { focus: function () {} }
  };
  window.google.script.history = window.google.script.history || {
    push: function () {}, replace: function () {}, setChangeHandler: function () {}
  };
  window.google.script.url = window.google.script.url || {
    getLocation: function (cb) { cb && cb({ parameter: {}, hash: '' }); }
  };
})();
