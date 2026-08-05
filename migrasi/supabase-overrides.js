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

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('ISI_') === 0 ||
      !SUPABASE_ANON || SUPABASE_ANON.indexOf('ISI_') === 0) {
    return; // belum dikonfigurasi → biarkan login lama (Apps Script) tetap jalan
  }

  import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(function (mod) {
      var supa = mod.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
      window.supa = supa; // dipakai override modul berikutnya

      if (typeof window.gsRoute !== 'function') {
        console.error('[supabase-overrides] gs-run-shim belum dimuat.');
        return;
      }

      // ── LOGIN → Supabase Auth (email + password), profil dari app_user ──
      window.gsRoute('loginUser', {
        mode: 'fn',
        handler: async function (args) {
          var email = (args[0] || '').toString().trim();
          var password = (args[1] || '').toString();
          if (!email || !password) return { success: false, message: 'Email dan password wajib diisi.' };
          if (email.indexOf('@') === -1) return { success: false, message: 'Masukkan EMAIL (bukan username) untuk login.' };

          var r = await supa.auth.signInWithPassword({ email: email, password: password });
          if (r.error) return { success: false, message: 'Email atau password salah.' };
          window.__RENUS_TOKEN__ = (r.data && r.data.session) ? r.data.session.access_token : '';

          var uid = r.data.user.id;
          var p = await supa.from('app_user')
            .select('id,nama,username,role,lead_id,aktif').eq('auth_uid', uid).maybeSingle();
          if (p.error || !p.data) return { success: false, message: 'Profil user tidak ditemukan di app_user.' };
          if (p.data.aktif === false) return { success: false, message: 'Akun ini tidak aktif. Hubungi administrator.' };

          return {
            success: true,
            message: 'Selamat datang, ' + (p.data.nama || '') + '!',
            user: {
              id: p.data.id, nama: p.data.nama, username: p.data.username,
              role: (p.data.role || 'sales').toLowerCase(), leadId: p.data.lead_id || ''
            }
          };
        }
      });

      // ── (NANTI) tambah override modul lain di sini, mis:
      // window.gsRoute('getProdukList', { mode:'fn', handler: async () => {
      //   var { data, error } = await supa.from('produk').select('*').order('id');
      //   return error ? { success:false, message:error.message } : { success:true, list:data };
      // }});

      console.log('[supabase-overrides] aktif — login memakai Supabase.');
    })
    .catch(function (e) { console.error('[supabase-overrides] gagal memuat supabase-js:', e); });
})();
