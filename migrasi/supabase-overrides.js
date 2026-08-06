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

      // ═══════════════════════════════════════════════════════════════════════
      //  MASTER DATA (baca) — override sederhana `supa.from(...).select()`.
      //  Semua memetakan kolom Supabase (snake_case) → nama field yang DIHARAPKAN
      //  frontend (camelCase). Bentuk balikan HARUS sama persis dengan Apps Script
      //  lama, kalau tidak UI bisa rusak. Semua balik: { success:true, list:[...] }.
      // ═══════════════════════════════════════════════════════════════════════

      // Helper: bungkus error jadi bentuk seragam.
      function _fail(error) { return { success: false, message: error.message || String(error) }; }

      // Helper: ambil SEMUA baris via pagination (.range) — menembus batas 1000
      // baris default Supabase/PostgREST. apply(qb) untuk .order()/.eq() dsb.
      async function _all(table, sel, apply) {
        var size = 1000, from = 0, out = [], error = null;
        for (;;) {
          var qb = supa.from(table).select(sel || '*');
          if (apply) qb = apply(qb);
          var r = await qb.range(from, from + size - 1);
          if (r.error) { error = r.error; break; }
          var rows = r.data || [];
          out = out.concat(rows);
          if (rows.length < size) break;
          from += size;
        }
        return { data: out, error: error };
      }

      // Helper: format tanggal → 'dd/MM/yyyy' (zona Asia/Jakarta), meniru _fmtTgl
      // Apps Script. Supabase `date` → 'YYYY-MM-DD'; `timestamptz` → ISO ...Z.
      function _fmtTgl(v) {
        if (!v) return '';
        var s = v.toString();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // date-only → langsung, tanpa geser TZ
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        var d = new Date(s);
        if (isNaN(d.getTime())) return s;
        try {
          var p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric'
          }).formatToParts(d);
          var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
          return g('day') + '/' + g('month') + '/' + g('year');
        } catch (e) {
          var z = function (n) { return (n < 10 ? '0' : '') + n; };
          return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
        }
      }

      // Helper: field JSON (jsonb Supabase = objek) → STRING, karena frontend lama
      // mem-`JSON.parse` field ini (mis. invoice.items, po.termConditions).
      function _jsonStr(v, dflt) {
        if (v === null || v === undefined) return dflt;
        if (typeof v === 'string') return v;
        try { return JSON.stringify(v); } catch (e) { return dflt; }
      }

      // Helper: field JSON → OBJEK (kebalikan _jsonStr) untuk baca isinya.
      function _jsonObj(v) {
        if (!v) return {};
        if (typeof v === 'object') return v;
        try { return JSON.parse(v); } catch (e) { return {}; }
      }

      // Helper: timestamp → 'dd/MM/yyyy HH:mm' (Asia/Jakarta), meniru _hoTs.
      function _fmtTs(v) {
        if (!v) return '';
        var d = new Date(v.toString());
        if (isNaN(d.getTime())) return v.toString();
        try {
          var p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
          }).formatToParts(d);
          var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
          return g('day') + '/' + g('month') + '/' + g('year') + ' ' + g('hour') + ':' + g('minute');
        } catch (e) { return _fmtTgl(v); }
      }

      // Helper: filter rentang tanggal (tgl 'dd/MM/yyyy', dari/sampai 'yyyy-MM-dd').
      function _inDateRange(tgl, dari, sampai) {
        if (!dari && !sampai) return true;
        var tp = (tgl || '').split('/');
        if (tp.length !== 3) return true;
        var ms = new Date(parseInt(tp[2]), parseInt(tp[1]) - 1, parseInt(tp[0])).getTime();
        if (dari) { var fd = dari.split('-'); if (ms < new Date(parseInt(fd[0]), parseInt(fd[1]) - 1, parseInt(fd[2])).getTime()) return false; }
        if (sampai) { var td = sampai.split('-'); if (ms > new Date(parseInt(td[0]), parseInt(td[1]) - 1, parseInt(td[2])).getTime()) return false; }
        return true;
      }

      // Helper: deteksi jenis WO (Jasa vs Material) — port dari Apps Script.
      var _WO_JASA_KEYWORDS = ['jasa', 'instalasi', 'komisioning', 'commissioning', 'pemasangan', 'pasang', 'instal', 'install'];
      function _woKeywordHitJasa(text) {
        if (!text) return false;
        for (var i = 0; i < _WO_JASA_KEYWORDS.length; i++) { if (text.indexOf(_WO_JASA_KEYWORDS[i]) !== -1) return true; }
        return false;
      }
      function _woJenisAuto(items, tipeMap) {
        try {
          var kel = Array.isArray(items) ? items : (function () { try { return JSON.parse(items || '[]'); } catch (e) { return []; } })();
          for (var a = 0; a < kel.length; a++) {
            var k = kel[a] || {};
            if (_woKeywordHitJasa((k.namaKelompok || '').toString().toLowerCase())) return 'Jasa';
            var subs = k.subItems || [];
            for (var b = 0; b < subs.length; b++) {
              var s = subs[b] || {};
              var pid = (s.produkId || '').toString().trim();
              var tipe = pid ? (tipeMap[pid] || '') : '';
              if (tipe === 'jasa') return 'Jasa';
              if ((!pid || !tipe) && _woKeywordHitJasa((s.deskripsi || '').toString().toLowerCase())) return 'Jasa';
            }
          }
          return 'Material';
        } catch (e) { return 'Material'; }
      }

      // Helper: normalisasi jsonb → array (files/aktivitas checklist).
      function _arr(v) { if (Array.isArray(v)) return v; try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

      // Helper: ringkasan checklist DED/QC (identik) — port _dedCountSummary.
      function _engCountSummary(list) {
        var s = { total: list.length, approved: 0, pending: 0, rejected: 0, belum: 0, na: 0, wajibTotal: 0, wajibSelesai: 0 };
        list.forEach(function (it) {
          if (it.status === 'Approved') s.approved++;
          else if (it.status === 'Pending') s.pending++;
          else if (it.status === 'Rejected') s.rejected++;
          else if (it.status === 'NA') s.na++;
          else s.belum++;
          if (it.wajib) { s.wajibTotal++; if (it.status === 'Approved') s.wajibSelesai++; }
        });
        s.pct = s.wajibTotal ? Math.round((s.wajibSelesai / s.wajibTotal) * 100) : 0;
        return s;
      }

      // Helper bersama: hitung dashboard DED/QC (struktur identik) dari
      // master + item + project + assignment. Port dari get*Dashboard.
      function _engDashCompute(master, items, projects, assigns, siteUserId) {
        var masterCount = master.length, wajibTotal = 0, wajibKode = {}, labelMap = {};
        master.forEach(function (m) { labelMap[m.kode] = m.label; if (m.wajib) { wajibTotal++; wajibKode[m.kode] = true; } });
        var assignedMap = {};
        (assigns || []).forEach(function (a) { var w = (a.no_wo || '').toString().trim(); if (!w) return; (assignedMap[w] = assignedMap[w] || []).push({ id: (a.id_user || '').toString(), nama: (a.nama_user || '').toString() }); });
        var woList = (projects || []).map(function (r) {
          return { noWO: (r.no_wo || '').toString().trim(), namaProject: r.nama_project || '', namaKlien: r.nama_klien || '', status: '', selesaiManual: r.selesai_manual === true };
        }).filter(function (r) { return r.noWO; });
        if (siteUserId) woList = woList.filter(function (wo) { return (assignedMap[wo.noWO] || []).some(function (a) { return a.id === siteUserId; }); });
        var visible = {}, woName = {};
        woList.forEach(function (wo) { visible[wo.noWO] = true; woName[wo.noWO] = wo.namaProject; });
        var now = new Date();
        var byWO = {}, reviewQueue = [], teamAgg = {};
        (items || []).forEach(function (it) {
          var w = (it.no_wo || '').toString().trim(); if (!w || !visible[w]) return;
          if (!byWO[w]) byWO[w] = { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0, wajibApproved: 0 };
          var st = (it.status || '').toString();
          var kd = (it.kode || '').toString().trim();
          byWO[w].touched++;
          if (st === 'Approved') { byWO[w].approved++; if (wajibKode[kd]) byWO[w].wajibApproved++; }
          else if (st === 'Pending') byWO[w].pending++;
          else if (st === 'Rejected') byWO[w].rejected++;
          else if (st === 'NA') byWO[w].na++;
          var upBy = (it.diupload_oleh || '').toString().trim();
          var upPada = (it.diupload_pada || '').toString().trim();
          var acts = _arr(it.aktivitas);
          if (st === 'Pending') {
            var ts = upPada ? new Date(upPada) : null;
            reviewQueue.push({ noWO: w, namaProject: woName[w] || '', kode: kd, label: labelMap[kd] || kd, uploadedBy: upBy, uploadedPada: upPada, ageDays: (ts && !isNaN(ts.getTime())) ? Math.floor((now - ts) / 86400000) : null });
          }
          if (upBy) {
            var t = teamAgg[upBy] || (teamAgg[upBy] = { nama: upBy, items: 0, approved: 0, pending: 0, rejected: 0, ftr: 0, reviewed: 0, everRejected: 0, wos: {} });
            t.items++; t.wos[w] = true;
            if (st === 'Approved') t.approved++; else if (st === 'Pending') t.pending++; else if (st === 'Rejected') t.rejected++;
            var hasReject = acts.some(function (e) { return e.type === 'reject'; });
            var hasReview = acts.some(function (e) { return e.type === 'reject' || e.type === 'approve'; });
            if (hasReview) t.reviewed++;
            if (hasReject) t.everRejected++;
            if (st === 'Approved' && !hasReject) t.ftr++;
          }
        });
        var global = { totalWO: 0, approved: 0, pending: 0, rejected: 0, belum: 0 };
        var perWO = woList.map(function (wo) {
          var g = byWO[wo.noWO] || { approved: 0, pending: 0, rejected: 0, na: 0, touched: 0, wajibApproved: 0 };
          var belum = Math.max(0, masterCount - g.touched);
          var pct = wajibTotal ? Math.round((g.wajibApproved / wajibTotal) * 100) : 0;
          global.totalWO++; global.approved += g.approved; global.pending += g.pending; global.rejected += g.rejected; global.belum += belum;
          return { noWO: wo.noWO, namaProject: wo.namaProject, namaKlien: wo.namaKlien, status: wo.status, total: masterCount, approved: g.approved, pending: g.pending, rejected: g.rejected, na: g.na, belum: belum, pct: pct, selesaiManual: !!wo.selesaiManual, assigned: assignedMap[wo.noWO] || [] };
        });
        perWO.sort(function (a, b) { return (b.noWO || '').localeCompare((a.noWO || ''), undefined, { numeric: true }); });
        reviewQueue.sort(function (a, b) { return (b.ageDays == null ? -1 : b.ageDays) - (a.ageDays == null ? -1 : a.ageDays); });
        var teamStats = Object.keys(teamAgg).map(function (name) {
          var t = teamAgg[name];
          return { nama: t.nama, items: t.items, approved: t.approved, pending: t.pending, rejected: t.rejected, woCount: Object.keys(t.wos).length, ftrPct: t.approved ? Math.round(t.ftr / t.approved * 100) : null, rejectRatePct: t.reviewed ? Math.round(t.everRejected / t.reviewed * 100) : null };
        }).sort(function (a, b) { return b.items - a.items; });
        return { success: true, global: global, perWO: perWO, reviewQueue: reviewQueue, teamStats: teamStats };
      }

      // Helper bersama: WO yang siap didaftarkan ke modul engineering
      // (belum terdaftar & HO Selesai). regTable = bom/ded/qc_project.
      async function _availableWO(regTable) {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(_all('work_order', 'no_wo,nama_project,nama_klien,status')),
          _safe(supa.from('hand_over').select('no_wo,status')),
          _safe(supa.from(regTable).select('no_wo'))
        ]);
        var hoMap = {}; (res[1].data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });
        var reg = {}; (res[2].data || []).forEach(function (r) { if (r.no_wo) reg[r.no_wo] = true; });
        var list = (res[0].data || []).filter(function (wo) {
          var w = (wo.no_wo || '').toString(); return !reg[w] && (hoMap[w] || '') === 'Selesai';
        }).map(function (wo) { return { noWO: wo.no_wo || '', namaProject: wo.nama_project || '', namaKlien: wo.nama_klien || '', status: wo.status || '' }; });
        return { success: true, list: list };
      }

      // Helper bersama: master checklist QC (section + item) — dipakai
      // getQCChecklist & getQCByWO.
      async function _qcMaster() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('qc_section').select('*')),
          _safe(supa.from('qc_checklist').select('*'))
        ]);
        var sq = res[0], iq = res[1];
        var secMap = {}, sections = [];
        (sq.data || []).forEach(function (s, i) {
          var k = (s.kode || '').toString(); if (!k) return;
          secMap[k] = { label: s.label || '', urutan: Number(s.urutan) || i };
          sections.push({ kode: k, label: secMap[k].label, urutan: secMap[k].urutan });
        });
        sections.sort(function (a, b) { return a.urutan - b.urutan; });
        var list = (iq.data || []).filter(function (r) { return r.kode; }).map(function (r, j) {
          var sc = (r.section_kode || '').toString();
          var s = secMap[sc] || { label: '', urutan: 999 };
          return {
            kode: (r.kode || '').toString(), section: sc, sectionLabel: s.label, label: r.label || '',
            wajib: r.wajib === true, sectionUrutan: s.urutan, urutan: Number(r.urutan) || (j + 1),
            instruksi: r.instruksi || '', contohFoto: _arr(r.contoh_foto),
            tipeUpload: (r.tipe_upload && r.tipe_upload.toString().trim().toLowerCase() === 'file') ? 'file' : 'foto'
          };
        });
        list.sort(function (a, b) { return (a.sectionUrutan - b.sectionUrutan) || (a.urutan - b.urutan); });
        return { list: list, sections: sections };
      }

      // Helper: dokumen WO — konstanta + basis (row WO + alamat klien).
      var _WO_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      var _WO_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      var _WO_ROMAWI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      function _woAnyDate(v) {
        if (!v) return null; var s = v.toString();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        var d = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) return new Date(+d[3], +d[2] - 1, +d[1]);
        var x = new Date(s); return isNaN(x.getTime()) ? null : x;
      }
      function _woSeq(noWO) { var digits = (noWO.match(/\d/g) || []).join(''); return digits.length >= 3 ? digits.slice(-3) : (digits || noWO); }
      async function _woDocBase(noWO) {
        var wq = await supa.from('work_order').select('nama_project,klien_id,nama_klien,subtotal,term_conditions,tanggal_deal').eq('no_wo', noWO).maybeSingle();
        if (wq.error || !wq.data) return null;
        var alamat = '';
        try { var kq = await supa.from('klien').select('alamat').eq('id', wq.data.klien_id || '').maybeSingle(); if (kq.data) alamat = kq.data.alamat || ''; } catch (e) {}
        return { row: wq.data, alamat: alamat };
      }

      // Helper: teks bank dari invoice WO (utamakan DP) + parser rekening.
      async function _woInvoiceBankText(noWO) {
        try {
          var q = await supa.from('invoice').select('jenis,bank_account').eq('no_wo', noWO);
          var dpBank = '', anyBank = '';
          (q.data || []).forEach(function (r) {
            var bank = (r.bank_account || '').toString().trim(); if (!bank) return;
            if ((r.jenis || '').toString() === 'DP' && !dpBank) dpBank = bank;
            if (!anyBank) anyBank = bank;
          });
          return dpBank || anyBank;
        } catch (e) { return ''; }
      }
      function _woParseBank(t) {
        var raw = (t || '').toString();
        var lines = raw.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
        var bank = '', noRek = '', atasNama = '';
        lines.forEach(function (l) {
          if (/^\s*(atas\s*nama|a\.?\s*n\.?|a\/n)\s*:/i.test(l)) atasNama = atasNama || l.replace(/^\s*(atas\s*nama|a\.?\s*n\.?|a\/n)\s*:\s*/i, '').trim();
          else if (/^\s*(no\.?\s*rek(ening)?|rekening)\s*:/i.test(l)) noRek = noRek || l.replace(/^\s*(no\.?\s*rek(ening)?|rekening)\s*:\s*/i, '').trim().replace(/[^\d]/g, '');
          else if (/^\s*bank\s*:/i.test(l)) bank = bank || l.replace(/^\s*bank\s*:\s*/i, '').trim();
        });
        if (!bank && !noRek && !atasNama && (lines.length === 1 || /\(/.test(raw))) {
          var s = raw.replace(/\r?\n/g, ' ').trim();
          var mParen = s.match(/\(([^)]*)\)/);
          if (mParen) { atasNama = mParen[1].trim(); s = (s.slice(0, mParen.index) + ' ' + s.slice(mParen.index + mParen[0].length)).trim(); }
          if (!atasNama) {
            var mAn = s.match(/(?:^|\s)(?:a\.n\.?|a\/n|atas\s+nama)\s*:?\s*(.+)$/i);
            if (mAn) { atasNama = mAn[1].trim(); s = s.slice(0, mAn.index).trim(); }
          }
          var groups = s.match(/\d[\d.\- ]*\d|\d+/g);
          if (groups) {
            var best = '', bestLen = -1;
            groups.forEach(function (g) { var d = (g.match(/\d/g) || []).length; if (d > bestLen) { bestLen = d; best = g; } });
            if (bestLen >= 5) { noRek = best.replace(/[^\d]/g, ''); s = s.replace(best, ' ').trim(); }
          }
          bank = s.replace(/[,;]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        }
        if (!bank && !noRek && !atasNama && lines.length) {
          bank = lines[0] || '';
          var maxi = -1, maxd = -1;
          lines.forEach(function (l, idx) { var dc = (l.match(/\d/g) || []).length; if (dc > maxd) { maxd = dc; maxi = idx; } });
          if (maxi > 0) noRek = lines[maxi].replace(/[^\d]/g, '');
          atasNama = lines.filter(function (l, idx) { return idx !== 0 && idx !== maxi; }).join(' ');
        }
        return { bank: bank, noRek: noRek, atasNama: atasNama, raw: raw };
      }

      // Helper: Schedule — format tanggal, durasi, ringkasan, peta tugas.
      function _schIso(v) {
        if (!v) return '';
        var s = v.toString(); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          if (/[T ]\d{2}:\d{2}/.test(s) || s.indexOf('Z') !== -1) {
            try {
              var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(s));
              var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
              return g('year') + '-' + g('month') + '-' + g('day');
            } catch (e) {}
          }
          return m[1] + '-' + m[2] + '-' + m[3];
        }
        return s;
      }
      function _schDurasi(a, b) {
        try { var x = new Date(a + 'T00:00:00'), y = new Date(b + 'T00:00:00'); if (isNaN(x.getTime()) || isNaN(y.getTime())) return 1; return Math.max(1, Math.round((y - x) / 86400000) + 1); } catch (e) { return 1; }
      }
      function _schSummary(tasks) {
        var minStart = '', maxEnd = '', totDur = 0, wProg = 0;
        (tasks || []).forEach(function (t) {
          if (t.mulai && (!minStart || t.mulai < minStart)) minStart = t.mulai;
          if (t.selesai && (!maxEnd || t.selesai > maxEnd)) maxEnd = t.selesai;
          var d = _schDurasi(t.mulai, t.selesai); totDur += d; wProg += (t.progress || 0) * d;
        });
        return { jumlahTugas: (tasks || []).length, tanggalMulai: minStart, tanggalSelesai: maxEnd, progress: totDur ? Math.round(wProg / totDur) : 0 };
      }
      function _schTasksMap(taskRows) {
        var map = {};
        (taskRows || []).forEach(function (r) {
          if (!r.id) return;
          var noWO = (r.no_wo || '').toString().trim();
          if (!map[noWO]) map[noWO] = [];
          map[noWO].push({
            id: (r.id || '').toString(), noWO: noWO, namaTugas: r.nama_tugas || '', fase: r.fase || '',
            mulai: _schIso(r.tanggal_mulai), selesai: _schIso(r.tanggal_selesai),
            progress: Math.max(0, Math.min(100, Number(r.progress) || 0)), warna: r.warna || '',
            urutan: Number(r.urutan) || 0, catatan: r.catatan || ''
          });
        });
        Object.keys(map).forEach(function (k) { map[k].sort(function (a, b) { return (a.urutan - b.urutan) || (a.mulai < b.mulai ? -1 : a.mulai > b.mulai ? 1 : 0); }); });
        return map;
      }

      // ── Helper Cash Manager (gap ayat_silang/bank/kategori) ───────────────
      async function _ayatArr() {
        var q = await supa.from('ayat_silang').select('*');
        var list = (q.data || []).map(function (r) {
          return { id: r.id || '', tanggal: _fmtTgl(r.tanggal), idAkunAsal: r.id_akun_asal || '', namaAsal: r.nama_asal || '', idAkunTujuan: r.id_akun_tujuan || '', namaTujuan: r.nama_tujuan || '', jumlah: parseFloat(r.jumlah) || 0, catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '' };
        });
        list.reverse(); return list;
      }
      async function _pemArr() {
        var q = await _all('pemasukan', '*');
        var list = (q.data || []).map(function (r) {
          return { id: r.id_pemasukan || '', tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '', kategori: r.kategori || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '', noRef: r.no_invoice_ref || '', idReferensi: r.id_referensi || '', deskripsi: r.deskripsi || '', jumlah: parseFloat(r.jumlah) || 0, catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : '' };
        });
        list.reverse(); return list;
      }
      async function _pengArr() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([_safe(_all('pengeluaran', '*')), _safe(_all('penawaran', 'no_wo,nama_project,klien_id')), _safe(supa.from('klien').select('id,nama_klien'))]);
        var klienMap = {}; (res[2].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
        var woMap = {}; (res[1].data || []).forEach(function (p) { var w = (p.no_wo || '').toString().trim(); if (w && !woMap[w]) woMap[w] = { namaProject: p.nama_project || '', namaKlien: klienMap[p.klien_id] || p.klien_id || '' }; });
        var list = (res[0].data || []).map(function (r) {
          var noWO = r.no_wo || ''; var wi = woMap[noWO] || { namaProject: '', namaKlien: '' };
          return { id: r.id_pengeluaran || '', noWO: noWO, namaProject: wi.namaProject, namaKlien: wi.namaKlien, tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '', noPO: r.no_po || '', idReferensi: r.id_referensi || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '', deskripsi: r.deskripsi || '', qty: parseFloat(r.qty) || 0, satuan: r.satuan || '', hargaSatuan: parseFloat(r.harga_satuan) || 0, total: parseFloat(r.total) || 0, catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : '', kategori: r.kategori || '' };
        });
        list.reverse(); return list;
      }
      async function _saldoAkun() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('akun_pembayaran').select('id,nama_akun,tipe,status').order('id')),
          _safe(_all('pemasukan', 'id_akun,nama_akun,jumlah')),
          _safe(_all('pengeluaran', 'id_akun,nama_akun,total')),
          _safe(supa.from('ayat_silang').select('id_akun_asal,nama_asal,id_akun_tujuan,nama_tujuan,jumlah'))
        ]);
        var akunMap = {}, akunOrder = [], nameMap = {};
        (res[0].data || []).forEach(function (b) {
          var aid = (b.id || '').toString(); if (!aid || akunMap[aid]) return;
          akunMap[aid] = { id: aid, nama: (b.nama_akun || '').toString(), tipe: (b.tipe || 'Bank').toString(), status: (b.status || 'Aktif').toString(), masuk: 0, keluar: 0, saldo: 0 };
          akunOrder.push(aid);
          var nm = (b.nama_akun || '').toString().trim().toLowerCase(); if (nm && !nameMap[nm]) nameMap[nm] = aid;
        });
        // Cocokkan transaksi ke akun by ID, lalu fallback by NAMA (data lama
        // sering menyimpan id_akun beda skema, tapi nama_akun konsisten).
        var _acc = function (id, nama) {
          var a = (id || '').toString(); if (akunMap[a]) return akunMap[a];
          var nm = (nama || '').toString().trim().toLowerCase(); var mid = nameMap[nm]; return mid ? akunMap[mid] : null;
        };
        (res[1].data || []).forEach(function (r) { var acc = _acc(r.id_akun, r.nama_akun); if (acc) acc.masuk += parseFloat(r.jumlah) || 0; });
        (res[2].data || []).forEach(function (r) { var acc = _acc(r.id_akun, r.nama_akun); if (acc) acc.keluar += parseFloat(r.total) || 0; });
        (res[3].data || []).forEach(function (r) {
          var jml = parseFloat(r.jumlah) || 0;
          var as = _acc(r.id_akun_asal, r.nama_asal), tj = _acc(r.id_akun_tujuan, r.nama_tujuan);
          if (as) as.keluar += jml; if (tj) tj.masuk += jml;
        });
        var akunList = [], tm = 0, tk = 0, ts = 0;
        akunOrder.forEach(function (id) { var it = akunMap[id]; it.saldo = it.masuk - it.keluar; tm += it.masuk; tk += it.keluar; ts += it.saldo; akunList.push(it); });
        return { success: true, akun: akunList, totalMasuk: tm, totalKeluar: tk, totalSaldo: ts };
      }
      async function _paymentReqArr() {
        var q = await _all('po_payment_request', '*', function(x){return x.order('id_request');});
        var list = (q.data || []).map(function (r) {
          return { idReq: r.id_request || '', noPO: r.no_po || '', noWO: r.no_wo || '', namaSupplier: r.nama_supplier || '', grandTotalPO: parseFloat(r.grand_total_po) || 0, tanggalRequest: _fmtTgl(r.tanggal_request), jumlah: parseFloat(r.jumlah) || 0, persentase: parseFloat(r.persentase) || 0, catatan: r.catatan || '', status: r.status || '', dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', namaAkun: r.nama_akun || '', diapproveOleh: r.diapprove_oleh || '', tanggalApprove: _fmtTgl(r.tanggal_approve), invoiceFileId: r.invoice_file_id || '', invoiceFileUrl: r.invoice_file_url || '', invoiceFileName: r.invoice_file_nama || '', catatanTolak: r.catatan_tolak || '', buktiFileId: r.bukti_file_id || '', buktiFileUrl: r.bukti_file_url || '', buktiFileName: r.bukti_file_nama || '' };
        });
        list.reverse(); return list;
      }

      // Helper bersama: daftar invoice (dipakai getInvoiceList & getKwitansiInitialData).
      async function _invoiceList() {
        var q = await _all('invoice', '*');
        if (q.error) { console.error('[invoiceList]', q.error); return []; }
        var kwMap = {};
        var kq = await _all('kwitansi', 'no_kwitansi,no_invoice');
        if (!kq.error) (kq.data || []).forEach(function (k) {
          if (k.no_invoice) kwMap[k.no_invoice] = k.no_kwitansi;
        });
        var list = (q.data || []).map(function (r) {
          return {
            id: r.no_invoice || '', noWO: r.no_wo || '', noPenawaran: r.no_penawaran || '',
            tanggal: _fmtTgl(r.tanggal), jenis: r.jenis || 'Penuh',
            persen: parseFloat(r.persen) || 0, noPO: r.no_po || '', tglPO: _fmtTgl(r.tgl_po),
            klienId: r.klien_id || '', namaKlien: r.nama_klien || '', namaProject: r.nama_project || '',
            dpp: parseFloat(r.dpp) || 0, ppnPersen: parseFloat(r.ppn_persen) || 0,
            ppnNominal: parseFloat(r.ppn_nominal) || 0, total: parseFloat(r.total) || 0,
            items: _jsonStr(r.rincian_item, '[]'), statusBayar: r.status_bayar || 'Belum Lunas',
            catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '', bankAccount: r.bank_account || '',
            buktiFileId: r.bukti_file_id || '', buktiFileUrl: r.bukti_file_url || '',
            buktiFileName: r.bukti_file_nama || '', kwitansiId: kwMap[r.no_invoice] || ''
          };
        });
        list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
        return list;
      }

      // Helper bersama: PO menunggu penerimaan gudang (dipakai list & bundle).
      async function _poMenunggu() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('purchase_order').select('no_po,tanggal,nama_supplier,peruntukan,no_wo,ppn_persen,status_po')),
          _safe(supa.from('po_item').select('*')),
          _safe(_all('penawaran', 'no_wo,nama_project'))
        ]);
        var pq = res[0], iq = res[1], nq = res[2];
        var itemsByPO = {};
        (iq.data || []).forEach(function (row) {
          var noPO = (row.no_po || '').toString().trim();
          if (!noPO) return;
          var qtyPesan = Number(row.qty) || 0, qtyDiterima = Number(row.qty_diterima) || 0;
          var qtySisa = qtyPesan - qtyDiterima;
          if (qtySisa <= 0) return;
          if (!itemsByPO[noPO]) itemsByPO[noPO] = [];
          itemsByPO[noPO].push({
            idItem: row.id_item || '', namaItem: row.nama_item || '', satuan: row.satuan || '',
            hargaBeli: Number(row.harga_beli_satuan) || 0, qtyPesan: qtyPesan,
            qtyDiterima: qtyDiterima, qtySisa: qtySisa
          });
        });
        var woNama = {};
        (nq.data || []).forEach(function (p) { var w = (p.no_wo || '').toString().trim(); if (w && p.nama_project) woNama[w] = p.nama_project; });
        var out = [];
        (pq.data || []).forEach(function (r) {
          var status = (r.status_po || '').toString();
          if (status !== 'Menunggu Gudang' && status !== 'Menunggu Penerimaan Gudang') return;
          var noPO = (r.no_po || '').toString().trim();
          var noWO = (r.no_wo || '').toString();
          out.push({
            noPO: noPO, tanggal: _fmtTgl(r.tanggal), namaSupplier: r.nama_supplier || '',
            peruntukan: r.peruntukan || '', noWO: noWO, namaProject: noWO ? (woNama[noWO] || '') : '',
            ppnPersen: parseFloat(r.ppn_persen) || 0,
            jumlahItemPending: (itemsByPO[noPO] || []).length, items: itemsByPO[noPO] || []
          });
        });
        return out;
      }

      // Helper bersama: riwayat penerimaan (dipakai list & bundle & filter noPO).
      async function _riwayatPenerimaan(noPO) {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('purchase_order').select('no_po,nama_supplier,peruntukan,no_wo')),
          _safe(supa.from('penerimaan_po_log').select('*'))
        ]);
        var pq = res[0], lq = res[1];
        var poInfo = {};
        (pq.data || []).forEach(function (p) {
          if (p.no_po) poInfo[p.no_po] = { namaSupplier: p.nama_supplier || '', peruntukan: p.peruntukan || '', noWO: p.no_wo || '' };
        });
        var list = (lq.data || []).map(function (lr) {
          var det = _jsonObj(lr.detail_item); if (!Array.isArray(det)) det = [];
          var info = poInfo[(lr.no_po || '').toString().trim()] || {};
          return {
            idLog: lr.id_log || '', noPO: lr.no_po || '', namaSupplier: info.namaSupplier || '',
            peruntukan: info.peruntukan || '', noWO: info.noWO || '', tanggal: _fmtTgl(lr.tanggal),
            mode: lr.mode || '', jumlahItem: parseFloat(lr.jumlah_item) || 0, items: det,
            dibuatOleh: lr.dibuat_oleh || '', dibuatPada: lr.dibuat_pada ? lr.dibuat_pada.toString() : '',
            buktiFileId: lr.bukti_file_id || '', buktiFileUrl: lr.bukti_file_url || '',
            buktiFileName: lr.bukti_file_nama || ''
          };
        }).filter(function (row) { return noPO ? row.noPO === noPO : true; });
        list.reverse();
        return list;
      }

      // ── Master Klien (Customer.gs → getCustomerList) ──────────────────────
      // Balikan lama: ARRAY [{ id, nama, perusahaan, kontak, alamat }]
      window.gsRoute('getCustomerList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('klien')
            .select('id,nama_klien,perusahaan,kontak,alamat').order('id');
          if (q.error) { console.error('[getCustomerList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id || '', nama: r.nama_klien || '', perusahaan: r.perusahaan || '',
              kontak: r.kontak || '', alamat: r.alamat || ''
            };
          });
        }
      });

      // ── Master Supplier (Supplier.gs → getSupplierList) ───────────────────
      // Balikan lama: ARRAY [{ id, nama, pic, telepon, email, alamat, catatan,
      //                 status, dibuatOleh, dibuatPada, alias }]
      window.gsRoute('getSupplierList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('supplier')
            .select('id_supplier,nama,pic,telepon,email,alamat,catatan,status,dibuat_oleh,dibuat_pada,nama_alias')
            .order('id_supplier');
          if (q.error) { console.error('[getSupplierList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id_supplier || '', nama: r.nama || '', pic: r.pic || '',
              telepon: r.telepon || '', email: r.email || '', alamat: r.alamat || '',
              catatan: r.catatan || '', status: r.status || '',
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
              alias: r.nama_alias || ''
            };
          });
        }
      });

      // ── Master Produk/Jasa (Produk.gs → getProdukList) ────────────────────
      // Balikan lama: ARRAY [{ sku, nama, unit, harga, hpp, tipe, stokId, qtyTersedia }]
      window.gsRoute('getProdukList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('produk')
            .select('id,nama,unit,harga_satuan,hpp,tipe,stok_id,qty_tersedia').order('id');
          if (q.error) { console.error('[getProdukList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              sku: r.id || '', nama: r.nama || '', unit: r.unit || '',
              harga: Number(r.harga_satuan) || 0, hpp: Number(r.hpp) || 0,
              tipe: r.tipe || '', stokId: r.stok_id || '',
              qtyTersedia: Number(r.qty_tersedia) || 0
            };
          });
        }
      });

      // ── Manajemen User (Auth.gs → getUserList) ────────────────────────────
      // Balikan lama: ARRAY [{ id, nama, username, role, aktif, targetBulanan,
      //                 leadId, noWa, email }]
      window.gsRoute('getUserList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user')
            .select('id,nama,username,role,aktif,target_bulanan,lead_id,no_whatsapp,email').order('id');
          if (q.error) { console.error('[getUserList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id || '', nama: r.nama || '', username: r.username || '',
              role: r.role || '', aktif: r.aktif !== false,
              targetBulanan: Number(r.target_bulanan) || 0,
              leadId: r.lead_id || '', noWa: r.no_whatsapp || '', email: r.email || ''
            };
          });
        }
      });

      // ── Akun Pembayaran (Settings.gs → getAkunPembayaranList) ─────────────
      // Balikan lama: { id, namaAkun, tipe, keterangan, status, dibuatOleh,
      //                 dibuatPada, locked }  (locked = id 'AP001')
      window.gsRoute('getAkunPembayaranList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('akun_pembayaran')
            .select('id,nama_akun,tipe,keterangan,status,dibuat_oleh,dibuat_pada,detail').order('id');
          if (q.error) return _fail(q.error);
          return {
            success: true,
            list: (q.data || []).map(function (r) {
              return {
                id: r.id || '', namaAkun: r.nama_akun || '', tipe: r.tipe || '',
                keterangan: r.keterangan || '', status: r.status || '',
                dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
                detail: r.detail || '', locked: (r.id === 'AP001')
              };
            })
          };
        }
      });

      // ── Kategori Pricelist (Pricelist.gs → getKategoriList) ────────────────
      // Balikan lama: { success:true, list:[ "NamaKategori", ... ] } (string2)
      window.gsRoute('getKategoriList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('pricelist_kategori').select('nama').order('nama');
          if (q.error) return _fail(q.error);
          return { success: true, list: (q.data || []).map(function (r) { return r.nama; }) };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BACA (list) tabel-sederhana. Bentuk balikan HARUS persis
      //  seperti Apps Script lama (nama field & tipe). Tanggal → dd/MM/yyyy,
      //  jsonb → string (frontend mem-JSON.parse).
      // ═══════════════════════════════════════════════════════════════════════

      // ── Invoice (Invoice.gs → getInvoiceList) — balik ARRAY ───────────────
      window.gsRoute('getInvoiceList', { mode: 'fn', handler: function () { return _invoiceList(); } });

      // ── Kwitansi (Kwitansi.gs → getKwitansiList) — balik ARRAY ────────────
      window.gsRoute('getKwitansiList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('kwitansi', '*');
          if (q.error) { console.error('[getKwitansiList]', q.error); return []; }
          var list = (q.data || []).map(function (r) {
            return {
              id: r.no_kwitansi || '', noInvoice: r.no_invoice || '', noWO: r.no_wo || '',
              tanggal: _fmtTgl(r.tanggal), terimaDari: r.terima_dari || '',
              jumlah: parseFloat(r.jumlah) || 0, untuk: r.untuk_pembayaran || '',
              metode: r.metode || '', catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return list;
        }
      });

      // ── Purchase Order (PurchaseOrder.gs → getPOList) — balik ARRAY ───────
      window.gsRoute('getPOList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('purchase_order').select('*');
          if (q.error) { console.error('[getPOList]', q.error); return []; }
          // Peta no_wo → nama_project dari penawaran (nama project tidak kritikal).
          var woNama = {};
          var pq = await _all('penawaran', 'no_wo,nama_project');
          if (!pq.error) (pq.data || []).forEach(function (p) {
            var w = (p.no_wo || '').toString().trim();
            if (w && p.nama_project) woNama[w] = p.nama_project;
          });
          return (q.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var subtotal = parseFloat(r.subtotal) || 0;
            var diskonNom = parseFloat(r.diskon_nominal) || 0;
            return {
              noPO: r.no_po || '', tanggal: _fmtTgl(r.tanggal), idSupplier: r.id_supplier || '',
              namaSupplier: r.nama_supplier || '', peruntukan: r.peruntukan || '', noWO: noWO,
              namaProject: noWO ? (woNama[noWO] || '') : '', statusPO: r.status_po || '',
              subtotal: subtotal, nilaiDPP: Math.max(0, subtotal - diskonNom),
              ppnPersen: parseFloat(r.ppn_persen) || 0, ppnNominal: parseFloat(r.ppn_nominal) || 0,
              grandTotal: parseFloat(r.grand_total) || 0, catatan: r.catatan || '',
              statusBayar: r.status_bayar || '', totalDibayar: parseFloat(r.total_dibayar) || 0,
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: _fmtTgl(r.dibuat_pada),
              diskonPersen: parseFloat(r.diskon_persen) || 0, diskonNominal: diskonNom,
              quotNo: r.no_quotation || '', quotTanggal: _fmtTgl(r.tanggal_quotation),
              termConditions: _jsonStr(r.term_conditions, ''), quotFileId: r.quot_file_id || '',
              quotFileUrl: r.quot_file_url || '', quotFileName: r.quot_file_nama || ''
            };
          });
        }
      });

      // ── Mutasi Stok (Inventory.gs → getMutasiStokList) — balik ARRAY ──────
      window.gsRoute('getMutasiStokList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('mutasi_stok', '*', function(x){return x.order('id_mutasi');});
          if (q.error) { console.error('[getMutasiStokList]', q.error); return []; }
          var list = (q.data || []).map(function (r) {
            return {
              idMutasi: r.id_mutasi || '', tanggal: _fmtTgl(r.tanggal), idProduk: r.id_produk || '',
              namaProduk: r.nama_produk || '', jenisMutasi: r.jenis_mutasi || '', referensi: r.referensi || '',
              qtyMasuk: Number(r.qty_masuk) || 0, qtyKeluar: Number(r.qty_keluar) || 0,
              hargaSatuan: Number(r.harga_satuan) || 0, saldoSetelah: Number(r.saldo_setelah) || 0,
              keterangan: r.keterangan || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : ''
            };
          }).filter(function (row) {
            if (params.idProduk && row.idProduk !== params.idProduk) return false;
            if (params.jenisMutasi && row.jenisMutasi !== params.jenisMutasi) return false;
            return true;
          });
          list.reverse(); // terbaru dulu (id menaik → dibalik)
          return list;
        }
      });

      // ── Pricelist (Pricelist.gs → getPricelistAll) — balik {success,list} ─
      window.gsRoute('getPricelistAll', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('pricelist').select('*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          // Peta supplier → alias/nama.
          var supMap = {};
          var sq = await supa.from('supplier').select('id_supplier,nama,nama_alias');
          if (!sq.error) (sq.data || []).forEach(function (s) {
            supMap[s.id_supplier] = (s.nama_alias && s.nama_alias.trim()) ? s.nama_alias : s.nama;
          });
          var list = (q.data || []).map(function (r) {
            var idSup = r.id_supplier || '';
            return {
              id: r.id || '', idSupplier: idSup,
              namaSupplier: supMap[idSup] || idSup || '(supplier terhapus)',
              kategori: r.kategori || '', namaMaterial: r.nama_material || '',
              spesifikasi: r.spesifikasi || '', merek: r.merek || '', satuan: r.satuan || '',
              hargaBeli: Number(r.harga_beli) || 0, termasukPPN: r.termasuk_ppn === true,
              updateTerakhir: r.dibuat_pada ? r.dibuat_pada.toString() : '', ready: r.ready === true
            };
          });
          return { success: true, list: list };
        }
      });

      // ── Site Engineer aktif (BOM/QC/DED → getSiteEngineerList) ────────────
      window.gsRoute('getSiteEngineerList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user').select('id,nama,username,role,aktif')
            .eq('role', 'siteengineer');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).filter(function (u) { return u.aktif !== false; })
            .map(function (u) { return { id: u.id, nama: u.nama, username: u.username }; });
          return { success: true, list: list };
        }
      });

      // ── Opsi user HO (Schedule/HO → getHOUserOptions) ─────────────────────
      window.gsRoute('getHOUserOptions', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user').select('id,nama,role,email,aktif');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).filter(function (u) { return u.aktif !== false; })
            .map(function (u) { return { id: u.id, nama: u.nama, role: u.role, email: u.email || '' }; });
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 2 (site survey, produk per-supplier, hand over)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Site Survey list (SiteSurvey.gs → getSiteSurveyList) ──────────────
      window.gsRoute('getSiteSurveyList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('site_survey').select('*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            var d = _jsonObj(r.data);
            return {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', dibuatOlehId: d.dibuatOlehId || '',
              noWO: r.no_wo || d.noWO || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '',
              latitude: (r.latitude !== null && r.latitude !== undefined) ? Number(r.latitude) : null,
              longitude: (r.longitude !== null && r.longitude !== undefined) ? Number(r.longitude) : null,
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return { success: true, list: list };
        }
      });

      // ── Site Survey per WO (SiteSurvey.gs → getSiteSurveysByWO) ───────────
      window.gsRoute('getSiteSurveysByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: true, list: [] };
          var q = await supa.from('site_survey').select('*').eq('no_wo', noWO);
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            return {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return { success: true, list: list };
        }
      });

      // ── Produk per Supplier (Supplier.gs → getProdukBySupplier) ───────────
      //  = pricelist milik supplier (tanpa filter ready). leadTime di sumber
      //  lama selalu kosong → dipertahankan '' agar sama persis.
      window.gsRoute('getProdukBySupplier', {
        mode: 'fn',
        handler: async function (args) {
          var idSupplier = (args[0] || '').toString().trim();
          var q = await supa.from('pricelist')
            .select('id,nama_material,spesifikasi,satuan,harga_beli').eq('id_supplier', idSupplier);
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (it) {
            var label = (it.nama_material || '') + (it.spesifikasi ? ' - ' + it.spesifikasi : '');
            return {
              id: it.id || '', nama: label, unit: it.satuan || '',
              hargaBeli: Number(it.harga_beli) || 0, leadTime: ''
            };
          }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
          return { success: true, list: list };
        }
      });

      // ── Hand Over per WO (WorkOrder.gs → getHandOverByWO) ─────────────────
      window.gsRoute('getHandOverByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var q = await supa.from('hand_over').select('*').eq('no_wo', noWO).maybeSingle();
          if (q.error) return { success: false, message: q.error.message };
          if (!q.data) return { success: true, record: null };
          var r = q.data;
          return {
            success: true,
            record: {
              noWO: noWO, status: r.status || '', dimintaOleh: r.diminta_oleh || '',
              dimintaPada: _fmtTs(r.diminta_pada),
              tglJadwal: r.tgl_jadwal ? r.tgl_jadwal.toString().slice(0, 10) : '',
              waktu: r.waktu ? r.waktu.toString().slice(0, 5) : '',
              mode: r.mode || '', linkMeet: r.link_meet || '', lokasi: r.lokasi || '',
              peserta: r.peserta || '', catatanUndangan: r.catatan_undangan || '',
              dijadwalkanOleh: r.dijadwalkan_oleh || '', dijadwalkanPada: _fmtTs(r.dijadwalkan_pada),
              mom: r.mom || '', selesaiOleh: r.selesai_oleh || '', selesaiPada: _fmtTs(r.selesai_pada),
              meetEventId: r.meet_event_id || ''
            }
          };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 3 (checklist DED, detail site survey, request bayar)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Checklist DED master (DED.gs → getDEDChecklist) ───────────────────
      window.gsRoute('getDEDChecklist', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('ded_checklist').select('*').order('urutan');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r, i) {
            return {
              kode: r.kode || '', label: r.label || '', wajib: r.wajib === true,
              urutan: Number(r.urutan) || (i + 1), instruksi: r.instruksi || ''
            };
          });
          list.sort(function (a, b) { return a.urutan - b.urutan; });
          return { success: true, list: list };
        }
      });

      // ── Detail Site Survey (SiteSurvey.gs → getSiteSurveyDetail) ──────────
      window.gsRoute('getSiteSurveyDetail', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var q = await supa.from('site_survey').select('*').eq('id', id).maybeSingle();
          if (q.error) return { success: false, message: q.error.message };
          if (!q.data) return { success: false, message: 'Survey tidak ditemukan.' };
          var r = q.data, d = _jsonObj(r.data);
          return {
            success: true,
            survey: {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', dibuatOlehId: d.dibuatOlehId || '',
              noWO: r.no_wo || d.noWO || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '',
              latitude: (r.latitude !== null && r.latitude !== undefined) ? Number(r.latitude) : null,
              longitude: (r.longitude !== null && r.longitude !== undefined) ? Number(r.longitude) : null,
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              arahBangunan: d.arahBangunan || '', tinggiBangunan: d.tinggiBangunan || 0,
              fotoBangunan: d.fotoBangunan || null, kelistrikan: d.kelistrikan || {},
              bos: d.bos || {}, atap: d.atap || {}, jalurKabel: d.jalurKabel || {}
            }
          };
        }
      });

      // ── Request Pembayaran PO (PurchaseOrder.gs → getPaymentRequestList) ──
      window.gsRoute('getPaymentRequestList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('po_payment_request', '*', function(x){return x.order('id_request');});
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            return {
              idReq: r.id_request || '', noPO: r.no_po || '', noWO: r.no_wo || '',
              namaSupplier: r.nama_supplier || '', grandTotalPO: parseFloat(r.grand_total_po) || 0,
              tanggalRequest: _fmtTgl(r.tanggal_request), jumlah: parseFloat(r.jumlah) || 0,
              persentase: parseFloat(r.persentase) || 0, catatan: r.catatan || '',
              status: r.status || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', namaAkun: r.nama_akun || '',
              diapproveOleh: r.diapprove_oleh || '', tanggalApprove: _fmtTgl(r.tanggal_approve),
              invoiceFileId: r.invoice_file_id || '', invoiceFileUrl: r.invoice_file_url || '',
              invoiceFileName: r.invoice_file_nama || '', catatanTolak: r.catatan_tolak || '',
              buktiFileId: r.bukti_file_id || '', buktiFileUrl: r.bukti_file_url || '',
              buktiFileName: r.bukti_file_nama || ''
            };
          }).filter(function (row) { return params.status ? row.status === params.status : true; });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 4 (bootstrap penawaran + Template Paket)
      // ═══════════════════════════════════════════════════════════════════════

      // ── getInitialData: bundle klien + produk + templatePaket + nextNo ────
      //  Dipakai form Penawaran & menu Template Paket. nextNo hanya PETUNJUK
      //  tampilan (nomor asli ditetapkan Apps Script saat simpan) → aman.
      window.gsRoute('getInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            // Jalankan PARALEL & tiap query tahan-error: kegagalan satu tabel
            // (mis. penawaran/template) TIDAK boleh mengosongkan daftar klien.
            var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
            var res = await Promise.all([
              _safe(supa.from('klien').select('id,nama_klien,perusahaan,alamat,kontak').order('id')),
              _safe(supa.from('produk').select('id,nama,unit,harga_satuan,hpp').order('id')),
              _safe(supa.from('template_paket').select('id,nama_paket,daftar_item')),
              _safe(_all('penawaran', 'no_penawaran'))
            ]);
            var kq = res[0], pq = res[1], tq = res[2], nq = res[3];
            if (kq.error) console.error('[getInitialData] klien:', kq.error);
            if (pq.error) console.error('[getInitialData] produk:', pq.error);
            if (tq.error) console.error('[getInitialData] template:', tq.error);
            if (nq.error) console.error('[getInitialData] penawaran:', nq.error);

            var klienList = (kq.data || []).map(function (r) {
              return {
                id: r.id || '', nama: r.nama_klien || '', perusahaan: r.perusahaan || '',
                alamat: r.alamat || '', kontak: r.kontak || ''
              };
            });

            var produkMap = {}, produkList = [];
            (pq.data || []).forEach(function (r) {
              var pid = r.id || '';
              var p = { nama: r.nama || '', unit: r.unit || '', harga: Number(r.harga_satuan) || 0, hpp: Number(r.hpp) || 0 };
              produkMap[pid] = p;
              produkList.push({ id: pid, nama: p.nama, unit: p.unit, harga: p.harga, hpp: p.hpp });
            });

            var templatePaket = {};
            (tq.data || []).forEach(function (r) {
              if (!r.id || !r.nama_paket) return;
              var raw = _jsonObj(r.daftar_item);
              if (!Array.isArray(raw)) { try { raw = JSON.parse(r.daftar_item || '[]'); } catch (e) { raw = []; } }
              if (!Array.isArray(raw)) raw = [];
              var items = raw.map(function (it) {
                var p = produkMap[it.produkId] || {};
                return {
                  produkId: it.produkId, deskripsi: it.deskripsi || p.nama || '',
                  qty: it.qty || 1, unit: p.unit || it.unit || '',
                  harga: p.harga || it.harga || 0, hpp: p.hpp || it.hpp || 0
                };
              });
              templatePaket[r.id.toString()] = { nama: r.nama_paket.toString(), items: items };
            });

            // nextNo — nomor penawaran berikutnya (petunjuk): cari NNN terbesar
            // dari "NNN/QUOT..." lalu +1, format NNN/QUOT/{bulan romawi}/{tahun}.
            var maxId = 0;
            (nq.data || []).forEach(function (r) {
              var m = (r.no_penawaran || '').toString().match(/^(\d+)\/QUOT/);
              if (m) { var n = parseInt(m[1], 10); if (n > maxId) maxId = n; }
            });
            var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
            var now = new Date();
            var mo = now.getMonth(), yr = now.getFullYear();
            try {
              var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' }).formatToParts(now);
              mo = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10) - 1;
              yr = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
            } catch (e) {}
            var nextNo = ('00' + (maxId + 1)).slice(-3) + '/QUOT/' + roman[mo] + '/' + yr;

            // success:true selama tak ada exception fatal — klien tetap tampil
            // walau template/penawaran gagal (mereka hanya memengaruhi menu lain).
            return { klien: klienList, produk: produkList, templatePaket: templatePaket, nextNo: nextNo, success: true };
          } catch (e) {
            console.error('[getInitialData]', e);
            return { klien: [], produk: [], templatePaket: {}, nextNo: '001/QUOT/I/' + (new Date().getFullYear()), success: false, error: String(e) };
          }
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 5 (Penawaran list + bootstrap Kwitansi)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Penawaran list (Penawaran.gs → getPenawaranList) — balik ARRAY ────
      //  Ambil rev TERTINGGI per no_penawaran; kolom nama beda: valid_hingga,
      //  total_hpp, estimasi_keuntungan. hoStatus dari hand_over.
      window.gsRoute('getPenawaranList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('penawaran', '*', function(x){return x.order('no_penawaran').order('rev');});
          if (q.error) { console.error('[getPenawaranList]', q.error); return []; }
          // Peta klien id→nama & hand_over no_wo→status.
          var klienMap = {};
          var kq = await supa.from('klien').select('id,nama_klien');
          if (!kq.error) (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var hoMap = {};
          var hq = await supa.from('hand_over').select('no_wo,status');
          if (!hq.error) (hq.data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });

          var orderMap = {}, latestMap = {}, counter = 0;
          (q.data || []).forEach(function (r) {
            var no = (r.no_penawaran || '').toString();
            if (!no) return;
            var rev = parseInt(r.rev) || 0;
            if (!(no in orderMap)) orderMap[no] = counter++;
            if (!(no in latestMap) || rev > (latestMap[no]._rev || 0)) {
              latestMap[no] = {
                _rev: rev, id: no, rev: rev.toString(),
                tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_hingga),
                namaProject: r.nama_project || '', klienId: r.klien_id || '',
                namaKlien: klienMap[r.klien_id] || r.klien_id || '', dibuatOleh: r.dibuat_oleh || '',
                subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0,
                pajak: parseFloat(r.pajak) || 0, grandTotal: parseFloat(r.grand_total) || 0,
                hpp: parseFloat(r.total_hpp) || 0, profit: parseFloat(r.estimasi_keuntungan) || 0,
                marginPersen: parseFloat(r.margin_persen) || 0,
                termConditions: _jsonStr(r.term_conditions, '{}'), items: _jsonStr(r.items, '[]'),
                status: r.status || 'On-Progress', noWO: r.no_wo || '',
                hoStatus: r.no_wo ? (hoMap[r.no_wo] || '') : '',
                tanggalDeal: _fmtTgl(r.tanggal_deal), channelMarketing: r.channel_marketing || '',
                catatanFail: r.catatan_fail || '', kodeWin: r.kode_win || '', catatanWin: r.catatan_win || '',
                kodeLost: r.kode_lost || '', tanggalFail: _fmtTgl(r.tanggal_fail),
                lessonLearned: r.lesson_learned || '', action: r.action || ''
              };
            }
          });
          return Object.keys(latestMap)
            .sort(function (a, b) { return orderMap[b] - orderMap[a]; })
            .map(function (no) { var it = Object.assign({}, latestMap[no]); delete it._rev; return it; });
        }
      });

      // ── Bootstrap Kwitansi (Kwitansi.gs → getKwitansiInitialData) ─────────
      //  { success, invoiceList, nextNo:'' } — nextNo dibuat saat simpan (Apps Script).
      window.gsRoute('getKwitansiInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            return { success: true, invoiceList: await _invoiceList(), nextNo: '' };
          } catch (e) {
            return { success: false, error: String(e), invoiceList: [], nextNo: '' };
          }
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 6 (Detail Purchase Order — 5 sumber, paralel)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Detail PO (PurchaseOrder.gs → getPODetail) ────────────────────────
      window.gsRoute('getPODetail', {
        mode: 'fn',
        handler: async function (args) {
          var noPO = (args[0] || '').toString().trim();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle()),
            _safe(supa.from('po_item').select('*').eq('no_po', noPO)),
            _safe(supa.from('pembayaran_po').select('*').eq('no_po', noPO)),
            _safe(supa.from('po_payment_request').select('*').eq('no_po', noPO)),
            _safe(supa.from('penerimaan_po_log').select('*').eq('no_po', noPO))
          ]);
          var hq = res[0], iq = res[1], bq = res[2], pq = res[3], lq = res[4];
          if (!hq.data) return { success: false, message: 'No PO tidak ditemukan.' };
          var r = hq.data;
          var header = {
            noPO: r.no_po || '', tanggal: _fmtTgl(r.tanggal), idSupplier: r.id_supplier || '',
            namaSupplier: r.nama_supplier || '', peruntukan: r.peruntukan || '', noWO: r.no_wo || '',
            statusPO: r.status_po || '', subtotal: parseFloat(r.subtotal) || 0,
            ppnPersen: parseFloat(r.ppn_persen) || 0, ppnNominal: parseFloat(r.ppn_nominal) || 0,
            grandTotal: parseFloat(r.grand_total) || 0, catatan: r.catatan || '',
            statusBayar: r.status_bayar || '', totalDibayar: parseFloat(r.total_dibayar) || 0,
            dibuatOleh: r.dibuat_oleh || '', dibuatPada: _fmtTgl(r.dibuat_pada),
            diubahOleh: r.diubah_oleh || '', diubahPada: _fmtTgl(r.diubah_pada),
            diskonPersen: parseFloat(r.diskon_persen) || 0, diskonNominal: parseFloat(r.diskon_nominal) || 0,
            quotNo: r.no_quotation || '', quotTanggal: _fmtTgl(r.tanggal_quotation),
            termConditions: _jsonStr(r.term_conditions, ''), quotFileId: r.quot_file_id || '',
            quotFileUrl: r.quot_file_url || '', quotFileName: r.quot_file_nama || ''
          };
          var items = (iq.data || []).map(function (ir) {
            return {
              idItem: ir.id_item || '', noPO: ir.no_po || '', namaItem: ir.nama_item || '',
              qty: parseFloat(ir.qty) || 0, satuan: ir.satuan || '',
              hargaBeli: parseFloat(ir.harga_beli_satuan) || 0, total: parseFloat(ir.total) || 0,
              catatan: ir.catatan || '', qtyDiterima: parseFloat(ir.qty_diterima) || 0,
              produkId: ir.id_produk || ''
            };
          });
          var pembayaran = (bq.data || []).map(function (br) {
            return {
              idBayar: br.id_bayar || '', noPO: br.no_po || '', tanggalBayar: _fmtTgl(br.tanggal_bayar),
              idAkun: br.id_akun || '', namaAkun: br.nama_akun || '', jumlah: parseFloat(br.jumlah) || 0,
              catatan: br.catatan || '', dibuatOleh: br.dibuat_oleh || '', dibuatPada: _fmtTgl(br.dibuat_pada)
            };
          });
          var paymentRequests = (pq.data || []).map(function (pr) {
            return {
              idReq: pr.id_request || '', tanggalRequest: _fmtTgl(pr.tanggal_request),
              jumlah: parseFloat(pr.jumlah) || 0, persentase: parseFloat(pr.persentase) || 0,
              catatan: pr.catatan || '', status: pr.status || '', dibuatOleh: pr.dibuat_oleh || '',
              namaAkun: pr.nama_akun || '', tanggalApprove: _fmtTgl(pr.tanggal_approve),
              invoiceFileUrl: pr.invoice_file_url || '', invoiceFileName: pr.invoice_file_nama || '',
              catatanTolak: pr.catatan_tolak || '', buktiFileUrl: pr.bukti_file_url || '',
              buktiFileName: pr.bukti_file_nama || ''
            };
          });
          var riwayatPenerimaan = (lq.data || []).map(function (lr) {
            var det = _jsonObj(lr.detail_item); if (!Array.isArray(det)) det = [];
            return {
              idLog: lr.id_log || '', noPO: lr.no_po || '', tanggal: _fmtTgl(lr.tanggal),
              mode: lr.mode || '', jumlahItem: parseFloat(lr.jumlah_item) || 0, items: det,
              dibuatOleh: lr.dibuat_oleh || '', dibuatPada: _fmtTgl(lr.dibuat_pada),
              buktiFileId: lr.bukti_file_id || '', buktiFileUrl: lr.bukti_file_url || '',
              buktiFileName: lr.bukti_file_nama || ''
            };
          });
          return { success: true, po: header, items: items, pembayaran: pembayaran, paymentRequests: paymentRequests, riwayatPenerimaan: riwayatPenerimaan };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 7 (Cash pemasukan/pengeluaran + Pengiriman)
      //  Catatan: getAyatSilangList & getMutasiBundle TETAP Apps Script karena
      //  tabel ayat_silang belum ada di skema Supabase.
      // ═══════════════════════════════════════════════════════════════════════

      // ── Pemasukan (Pengeluaran.gs → getPemasukanList) ─────────────────────
      window.gsRoute('getPemasukanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('pemasukan', '*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            return {
              id: r.id_pemasukan || '', tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '',
              kategori: r.kategori || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '',
              noRef: r.no_invoice_ref || '', idReferensi: r.id_referensi || '', deskripsi: r.deskripsi || '',
              jumlah: parseFloat(r.jumlah) || 0, catatan: r.catatan || '',
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : ''
            };
          }).filter(function (row) {
            if (params.sumber && row.sumber !== params.sumber) return false;
            if (params.kategori && row.kategori !== params.kategori) return false;
            if (params.idAkun && row.idAkun !== params.idAkun.toString()) return false;
            return _inDateRange(row.tanggal, params.tanggalDari, params.tanggalSampai);
          });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ── Pengeluaran (Pengeluaran.gs → getPengeluaranList) ─────────────────
      window.gsRoute('getPengeluaranList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('pengeluaran', '*')),
            _safe(_all('penawaran', 'no_wo,nama_project,klien_id')),
            _safe(supa.from('klien').select('id,nama_klien'))
          ]);
          var eq = res[0], pq = res[1], kq = res[2];
          if (eq.error) return { success: false, list: [], message: eq.error.message };
          var klienMap = {};
          (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var woMap = {};
          (pq.data || []).forEach(function (p) {
            var w = (p.no_wo || '').toString().trim();
            if (w && !woMap[w]) woMap[w] = { namaProject: p.nama_project || '', namaKlien: klienMap[p.klien_id] || p.klien_id || '' };
          });
          var list = (eq.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var wi = woMap[noWO] || { namaProject: '', namaKlien: '' };
            return {
              id: r.id_pengeluaran || '', noWO: noWO, namaProject: wi.namaProject, namaKlien: wi.namaKlien,
              tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '', noPO: r.no_po || '',
              idReferensi: r.id_referensi || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '',
              deskripsi: r.deskripsi || '', qty: parseFloat(r.qty) || 0, satuan: r.satuan || '',
              hargaSatuan: parseFloat(r.harga_satuan) || 0, total: parseFloat(r.total) || 0,
              catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : '',
              kategori: r.kategori || ''
            };
          }).filter(function (row) {
            if (params.noWO && row.noWO !== params.noWO.toString()) return false;
            if (params.sumber && row.sumber !== params.sumber) return false;
            if (params.idAkun && row.idAkun !== params.idAkun.toString()) return false;
            if (params.noPO && row.noPO.toLowerCase().indexOf(params.noPO.toLowerCase()) === -1) return false;
            return _inDateRange(row.tanggal, params.tanggalDari, params.tanggalSampai);
          });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ── Pengiriman / Surat Jalan (Inventory.gs → getPengirimanList) ───────
      window.gsRoute('getPengirimanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var fStatus = (params.status || '').toString();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('pengiriman').select('*')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var gq = res[0], bq = res[1];
          if (gq.error) return { success: false, list: [], message: gq.error.message };
          var projMap = {};
          (bq.data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var list = (gq.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var pj = projMap[noWO] || {};
            var items = _jsonObj(r.items); if (!Array.isArray(items)) items = [];
            return {
              idKirim: r.id_kirim || '', noSuratJalan: r.no_surat_jalan || '', noWO: noWO,
              namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '',
              tanggalKirim: _fmtTgl(r.tanggal_kirim), status: r.status || '',
              dikirimOleh: r.dikirim_oleh || '', alamat: r.alamat || '', kendaraan: r.kendaraan || '',
              driver: r.driver || '', catatan: r.catatan || '', items: items,
              diterimaOleh: r.diterima_oleh || '', diterimaPada: r.diterima_pada ? r.diterima_pada.toString() : '',
              buktiFileUrl: r.bukti_file_url || '', buktiFileName: r.bukti_file_name || ''
            };
          }).filter(function (row) { return fStatus ? row.status === fStatus : true; });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 8 (Penerimaan Barang: PO menunggu + riwayat + bundle)
      // ═══════════════════════════════════════════════════════════════════════

      // ── PO menunggu penerimaan (Inventory.gs → getPOMenungguPenerimaan) ───
      window.gsRoute('getPOMenungguPenerimaan', {
        mode: 'fn',
        handler: async function () { return await _poMenunggu(); }
      });

      // ── Riwayat penerimaan (Inventory.gs → getRiwayatPenerimaanList) ──────
      window.gsRoute('getRiwayatPenerimaanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          return { success: true, list: await _riwayatPenerimaan(params.noPO || null) };
        }
      });

      // ── Bundle Penerimaan Barang (Inventory.gs → getPenerimaanBundle) ─────
      window.gsRoute('getPenerimaanBundle', {
        mode: 'fn',
        handler: async function () {
          var out = { success: true };
          try { out.pending = await _poMenunggu(); } catch (e) { out.pending = []; }
          try { out.riwayat = await _riwayatPenerimaan(null); } catch (e) { out.riwayat = []; }
          return out;
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 9 (Request pengiriman — bikin tab Pengiriman lambat)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Request pengiriman material (Inventory.gs → getPengirimanRequests) ─
      //  Gabung pengiriman_request (status Diminta) + bom_item (reserved-dikirim)
      //  + bom_project (nama). reqMap membatasi qty sesuai target request (parsial).
      window.gsRoute('getPengirimanRequests', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('pengiriman_request').select('*').eq('status', 'Diminta')),
            _safe(_all('bom_item', 'id,no_wo,kategori,nama_material,merek,satuan,stok_id,qty_reserved,qty_dikirim')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var rq = res[0], bq = res[1], pq = res[2];
          if (rq.error) return { success: false, list: [], message: rq.error.message };
          var projMap = {};
          (pq.data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var bomByWO = {};
          (bq.data || []).forEach(function (it) {
            var w = (it.no_wo || '').toString().trim(); if (!w) return;
            (bomByWO[w] = bomByWO[w] || []).push(it);
          });
          var out = [];
          (rq.data || []).forEach(function (req) {
            var noWO = (req.no_wo || '').toString().trim();
            var pj = projMap[noWO] || {};
            // reqMap: null = legacy (semua reserved). Array (termasuk kosong) =
            // material terpilih PC (parsial) — meniru perilaku Apps Script lama.
            var reqMap = null;
            var arr = _jsonObj(req.items);
            if (Array.isArray(arr)) { reqMap = {}; arr.forEach(function (x) { reqMap[(x.bomItemId || '').toString()] = Number(x.target) || 0; }); }
            var mats = [];
            (bomByWO[noWO] || []).forEach(function (it) {
              var reserved = Number(it.qty_reserved) || 0;
              var dikirim = Number(it.qty_dikirim) || 0;
              var sisa = reserved - dikirim;
              if (sisa <= 0) return;
              var bid = (it.id || '').toString();
              if (reqMap) {
                if (!(bid in reqMap)) return;
                var byTarget = reqMap[bid] - dikirim;
                if (byTarget <= 0) return;
                if (byTarget < sisa) sisa = byTarget;
              }
              mats.push({
                id: bid, kategori: it.kategori || '', namaMaterial: it.nama_material || '',
                merek: it.merek || '', satuan: it.satuan || '', idStok: it.stok_id || '',
                qtyReserved: reserved, qtyDikirim: dikirim, qtySisa: sisa
              });
            });
            out.push({
              noWO: noWO, namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '',
              alamat: req.alamat || '', dimintaOleh: req.diminta_oleh || '',
              dimintaPada: req.diminta_pada ? req.diminta_pada.toString() : '', items: mats
            });
          });
          return { success: true, list: out };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 6 — COMPUTE READS (override client, TANPA Edge Function).
      //  Fungsi "berhitung" ternyata cukup dikerjakan di sisi klien: beberapa
      //  query + gabung/olah di JS. Edge Function hanya perlu untuk TULIS
      //  (atomik) atau agregasi sangat berat. Bentuk balikan tetap disamakan.
      // ═══════════════════════════════════════════════════════════════════════

      // ── Work Order list (WorkOrder.gs → getWorkOrderList) — balik ARRAY ───
      //  Sumber: view work_order + produk(tipe) + hand_over + work_order_catatan
      //  + work_order_jenis_override. jenisWO = override || auto(items+tipe+kata).
      async function _woListData() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(_all('work_order', '*')),
          _safe(supa.from('produk').select('id,tipe')),
          _safe(supa.from('hand_over').select('no_wo,status')),
          _safe(supa.from('work_order_catatan').select('no_wo,catatan')),
          _safe(supa.from('work_order_jenis_override').select('no_wo,jenis_manual'))
        ]);
        var wq = res[0], pq = res[1], hq = res[2], cq = res[3], jq = res[4];
        if (wq.error) { console.error('[getWorkOrderList]', wq.error); return []; }
        var tipeMap = {}; (pq.data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
        var hoMap = {}; (hq.data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });
        var catatanMap = {}; (cq.data || []).forEach(function (c) { if (c.no_wo) catatanMap[c.no_wo] = c.catatan || ''; });
        var jenisOverride = {}; (jq.data || []).forEach(function (j) {
          var w = (j.no_wo || '').toString().trim(); var v = (j.jenis_manual || '').toString().trim();
          if (w && (v === 'Jasa' || v === 'Material')) jenisOverride[w] = v;
        });
        var list = (wq.data || []).map(function (r) {
          var noWO = (r.no_wo || '').toString();
          var jenisAuto = _woJenisAuto(r.items, tipeMap);
          var jenisManual = jenisOverride[noWO] || '';
          var jenisEfektif = jenisManual || jenisAuto;
          return {
            noWO: noWO, id: (r.no_penawaran || '').toString(), rev: (r.rev != null ? r.rev : '').toString(),
            tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_until), namaProject: r.nama_project || '',
            klienId: r.klien_id || '', namaKlien: r.nama_klien || '', dibuatOleh: r.dibuat_oleh || '',
            subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0, pajak: parseFloat(r.pajak) || 0,
            grandTotal: parseFloat(r.grand_total) || 0, hpp: parseFloat(r.hpp) || 0, profit: parseFloat(r.profit) || 0,
            marginPersen: parseFloat(r.margin_persen) || 0, termConditions: _jsonStr(r.term_conditions, '{}'),
            items: _jsonStr(r.items, '[]'), status: (r.status || '').toString(), hoStatus: hoMap[noWO] || '',
            catatanCustomer: catatanMap[noWO] || '', jenisWO: jenisEfektif, jenisWOAuto: jenisAuto,
            jenisWOManual: jenisManual, adaJasa: jenisEfektif === 'Jasa'
          };
        });
        list.sort(function (a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });
        return list;
      }
      window.gsRoute('getWorkOrderList', { mode: 'fn', handler: function () { return _woListData(); } });

      // ── Work Order dashboard (WorkOrder.gs → getWorkOrderDashboard) ───────
      //  = _woListData + agregasi invoice/pembayaran per WO (menu Work Order).
      window.gsRoute('getWorkOrderDashboard', {
        mode: 'fn',
        handler: async function () {
          var woList = await _woListData();
          var invList = await _invoiceList();
          var invByWO = {};
          invList.forEach(function (inv) {
            var noWO = inv.noWO || ''; if (!noWO) return;
            (invByWO[noWO] = invByWO[noWO] || []).push({
              id: inv.id, tanggal: inv.tanggal, jenis: inv.jenis, persen: inv.persen,
              dpp: inv.dpp, ppnNominal: inv.ppnNominal, total: inv.total,
              statusBayar: inv.statusBayar, kwitansiId: inv.kwitansiId
            });
          });
          var sumKontrak = 0, sumDitagih = 0, sumLunas = 0;
          var woDashboard = woList.map(function (w) {
            var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
            var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
            var invoices = invByWO[w.noWO] || [];
            var totalDitagihDpp = 0, totalLunasDpp = 0, totalLunasTotal = 0;
            invoices.forEach(function (inv) {
              totalDitagihDpp += inv.dpp;
              if (inv.statusBayar === 'Lunas') { totalLunasDpp += inv.dpp; totalLunasTotal += inv.total; }
            });
            var sisaDpp = Math.max(0, nilaiKontrak - totalDitagihDpp);
            var pctDitagih = nilaiKontrak > 0 ? Math.min(100, Math.round(totalDitagihDpp / nilaiKontrak * 100)) : 0;
            var pctLunas = nilaiKontrak > 0 ? Math.min(100, Math.round(totalLunasDpp / nilaiKontrak * 100)) : 0;
            var paymentStatus;
            if (invoices.length === 0) paymentStatus = 'Belum Ditagih';
            else if (pctLunas >= 100 && pctDitagih >= 100) paymentStatus = 'Lunas';
            else if (totalLunasDpp > 0) paymentStatus = 'Lunas Sebagian';
            else paymentStatus = 'Ditagih';
            sumKontrak += nilaiKontrak;
            sumDitagih += totalDitagihDpp + Math.round(totalDitagihDpp * ppnRate / 100);
            sumLunas += totalLunasTotal;
            return {
              noWO: w.noWO, id: w.id, rev: w.rev, tanggal: w.tanggal, namaProject: w.namaProject,
              namaKlien: w.namaKlien, dibuatOleh: w.dibuatOleh, subtotal: w.subtotal, diskon: w.diskon,
              pajak: w.pajak, grandTotal: w.grandTotal, hpp: w.hpp, profit: w.profit, marginPersen: w.marginPersen,
              items: w.items, termConditions: w.termConditions, catatanCustomer: w.catatanCustomer,
              nilaiKontrak: nilaiKontrak, ppnRate: ppnRate, totalDitagihDpp: totalDitagihDpp,
              totalLunasDpp: totalLunasDpp, totalLunasTotal: totalLunasTotal, sisaDpp: sisaDpp,
              pctDitagih: pctDitagih, pctLunas: pctLunas, paymentStatus: paymentStatus, invoices: invoices,
              hoStatus: w.hoStatus || '', jenisWO: w.jenisWO || 'Material', jenisWOAuto: w.jenisWOAuto || 'Material',
              jenisWOManual: w.jenisWOManual || '', adaJasa: !!w.adaJasa
            };
          });
          return {
            success: true, woList: woDashboard,
            summary: { totalWO: woDashboard.length, totalKontrak: sumKontrak, totalDitagih: sumDitagih, totalLunas: sumLunas }
          };
        }
      });

      // ── Realisasi HPP & Margin per WO (WorkOrder.gs → getRealisasiHPP) ────
      //  Semua sumber difilter per-WO (data kecil) → aman di klien.
      async function _realisasiHPP(noWO) {
          noWO = (noWO || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('penawaran').select('rev,subtotal,diskon,total_hpp,nama_project,klien_id').eq('no_wo', noWO)),
            _safe(supa.from('klien').select('id,nama_klien')),
            _safe(supa.from('pengeluaran').select('*').eq('no_wo', noWO)),
            _safe(supa.from('purchase_order').select('no_po,nama_supplier,status_po,status_bayar,grand_total,total_dibayar').eq('no_wo', noWO))
          ]);
          var penq = res[0], kq = res[1], eq = res[2], poq = res[3];
          var klienMap = {}; (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });

          // Revisi tertinggi penawaran untuk WO ini.
          var nilaiKontrak = 0, estimasiHPP = 0, namaProject = '', namaKlien = '', maxRev = -1;
          (penq.data || []).forEach(function (p) {
            var rev = parseInt(p.rev) || 0;
            if (rev <= maxRev) return;
            maxRev = rev;
            nilaiKontrak = Math.max(0, (parseFloat(p.subtotal) || 0) - (parseFloat(p.diskon) || 0));
            estimasiHPP = parseFloat(p.total_hpp) || 0;
            namaProject = (p.nama_project || '').toString();
            namaKlien = klienMap[p.klien_id] || p.klien_id || '';
          });

          var realisasiHPP = 0, akunMap = {}, sumberMap = { 'Pembayaran PO': 0, 'Penggunaan Stok': 0, 'Langsung': 0 };
          var pengeluaranList = [];
          (eq.data || []).forEach(function (r) {
            var total = parseFloat(r.total) || 0;
            var sumber = (r.sumber || '').toString();
            var namaAkun = (r.nama_akun || '').toString();
            realisasiHPP += total;
            akunMap[namaAkun] = (akunMap[namaAkun] || 0) + total;
            if (sumber in sumberMap) sumberMap[sumber] += total;
            pengeluaranList.push({
              id: r.id_pengeluaran || '', tanggal: _fmtTgl(r.tanggal), sumber: sumber,
              noPO: r.no_po || '', idReferensi: r.id_referensi || '', idAkun: r.id_akun || '',
              namaAkun: namaAkun, deskripsi: r.deskripsi || '', qty: parseFloat(r.qty) || 0,
              satuan: r.satuan || '', hargaSatuan: parseFloat(r.harga_satuan) || 0, total: total,
              catatan: r.catatan || ''
            });
          });

          var selisih = estimasiHPP - realisasiHPP;
          var selisihPersen = estimasiHPP > 0 ? Math.round(selisih / estimasiHPP * 100) : null;
          var marginEstimasi = nilaiKontrak > 0 ? ((nilaiKontrak - estimasiHPP) / nilaiKontrak * 100) : null;
          var marginRealisasi = nilaiKontrak > 0 ? ((nilaiKontrak - realisasiHPP) / nilaiKontrak * 100) : null;
          var breakdownAkun = Object.keys(akunMap).map(function (nama) {
            return { namaAkun: nama, total: akunMap[nama], persen: realisasiHPP > 0 ? Math.round(akunMap[nama] / realisasiHPP * 100) : 0 };
          }).sort(function (a, b) { return b.total - a.total; });
          var breakdownSumber = Object.keys(sumberMap).map(function (s) {
            return { sumber: s, total: sumberMap[s], persen: realisasiHPP > 0 ? Math.round(sumberMap[s] / realisasiHPP * 100) : 0 };
          });
          var poTerkait = (poq.data || []).map(function (r) {
            var gt = parseFloat(r.grand_total) || 0, tb = parseFloat(r.total_dibayar) || 0;
            return {
              noPO: r.no_po || '', namaSupplier: r.nama_supplier || '', statusPO: r.status_po || '',
              statusBayar: r.status_bayar || '', grandTotal: gt, totalDibayar: tb, sisaTagihan: Math.max(0, gt - tb)
            };
          });
          pengeluaranList.reverse();

          return {
            success: true, noWO: noWO, namaProject: namaProject, namaKlien: namaKlien,
            nilaiKontrak: nilaiKontrak, estimasiHPP: estimasiHPP, realisasiHPP: realisasiHPP,
            selisih: selisih, selisihPersen: selisihPersen, marginEstimasi: marginEstimasi,
            marginRealisasi: marginRealisasi, breakdownAkun: breakdownAkun, breakdownSumber: breakdownSumber,
            pengeluaranList: pengeluaranList, poTerkait: poTerkait
          };
      }
      window.gsRoute('getRealisasiHPP', { mode: 'fn', handler: function (args) { return _realisasiHPP(args[0]); } });

      // ── Export pengeluaran per WO (Pengeluaran.gs → getExportPengeluaranWO) ─
      window.gsRoute('getExportPengeluaranWO', {
        mode: 'fn',
        handler: async function (args) {
          var hpp = await _realisasiHPP(args[0]);
          if (!hpp.success) return hpp;
          var akunGroups = {};
          hpp.pengeluaranList.forEach(function (p) { var key = p.namaAkun || '(Tanpa Akun)'; (akunGroups[key] = akunGroups[key] || []).push(p); });
          var detailPerAkun = Object.keys(akunGroups).map(function (nama) {
            var items = akunGroups[nama]; var subtotal = items.reduce(function (s, it) { return s + it.total; }, 0);
            return { namaAkun: nama, items: items, subtotal: subtotal };
          }).sort(function (a, b) { return b.subtotal - a.subtotal; });
          return {
            success: true,
            header: { noWO: hpp.noWO, namaProject: hpp.namaProject, namaKlien: hpp.namaKlien, tanggalCetak: _fmtTgl(new Date()) },
            ringkasan: { nilaiKontrak: hpp.nilaiKontrak, estimasiHPP: hpp.estimasiHPP, realisasiHPP: hpp.realisasiHPP, selisih: hpp.selisih, marginEstimasi: hpp.marginEstimasi, marginRealisasi: hpp.marginRealisasi },
            rekapAkun: hpp.breakdownAkun, detailPerAkun: detailPerAkun
          };
        }
      });

      // ── DED per WO (DED.gs → getDEDByWO) — gabung master + item ───────────
      window.gsRoute('getDEDByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, list: [], message: 'No WO wajib diisi.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('ded_checklist').select('*').order('urutan')),
            _safe(supa.from('ded_item').select('*').eq('no_wo', noWO)),
            _safe(supa.from('ded_project').select('*').eq('no_wo', noWO).maybeSingle())
          ]);
          var cq = res[0], iq = res[1], pq = res[2];
          var master = (cq.data || []).map(function (r, i) {
            return { kode: r.kode || '', label: r.label || '', wajib: r.wajib === true, urutan: Number(r.urutan) || (i + 1), instruksi: r.instruksi || '' };
          }).sort(function (a, b) { return a.urutan - b.urutan; });
          var rowMap = {}; (iq.data || []).forEach(function (r) { rowMap[(r.kode || '').toString().trim()] = r; });
          var list = master.map(function (m) {
            var it = rowMap[m.kode] || null;
            var files = it ? _arr(it.files) : [];
            var status = it && it.status ? it.status.toString() : (files.length ? 'Pending' : 'Belum Upload');
            return {
              kode: m.kode, label: m.label, wajib: m.wajib, urutan: m.urutan, instruksi: m.instruksi,
              files: files, status: status,
              catatanReview: it && it.catatan_review ? it.catatan_review.toString() : '',
              uploadedBy: it && it.diupload_oleh ? it.diupload_oleh.toString() : '',
              uploadedPada: it && it.diupload_pada ? it.diupload_pada.toString() : '',
              reviewedBy: it && it.direview_oleh ? it.direview_oleh.toString() : '',
              reviewedPada: it && it.direview_pada ? it.direview_pada.toString() : '',
              activity: it ? _arr(it.aktivitas) : []
            };
          });
          var proj = pq.data || {};
          return {
            success: true, list: list, summary: _engCountSummary(list),
            selesaiManual: proj.selesai_manual === true,
            ditandaiOleh: proj.ditandai_selesai_oleh || '',
            ditandaiPada: proj.ditandai_selesai_pada ? proj.ditandai_selesai_pada.toString() : ''
          };
        }
      });

      // ── Checklist QC master (QC.gs → getQCChecklist) ──────────────────────
      window.gsRoute('getQCChecklist', {
        mode: 'fn',
        handler: async function () {
          try { var m = await _qcMaster(); return { success: true, list: m.list, sections: m.sections }; }
          catch (e) { return { success: false, list: [], sections: [], message: String(e) }; }
        }
      });

      // ── QC per WO (QC.gs → getQCByWO) — gabung master + item + foto ───────
      window.gsRoute('getQCByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, list: [], message: 'No WO wajib diisi.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var mres = await Promise.all([
            _qcMaster(),
            _safe(supa.from('qc_item').select('*').eq('no_wo', noWO)),
            _safe(supa.from('qc_project').select('*').eq('no_wo', noWO).maybeSingle())
          ]);
          var master = mres[0].list, iq = mres[1], pq = mres[2];
          var rowMap = {}; (iq.data || []).forEach(function (r) { rowMap[(r.kode || '').toString().trim()] = r; });
          var list = master.map(function (m) {
            var it = rowMap[m.kode] || null;
            var foto = it ? _arr(it.foto) : [];
            var status = it && it.status ? it.status.toString() : (foto.length ? 'Pending' : 'Belum Upload');
            return {
              kode: m.kode, section: m.section, sectionLabel: m.sectionLabel, label: m.label,
              wajib: m.wajib, urutan: m.urutan, instruksi: m.instruksi, contohFoto: m.contohFoto || [],
              tipeUpload: m.tipeUpload || 'foto', foto: foto, status: status,
              catatanSPV: it && it.catatan_spv ? it.catatan_spv.toString() : '',
              uploadedBy: it && it.diupload_oleh ? it.diupload_oleh.toString() : '',
              uploadedPada: it && it.diupload_pada ? it.diupload_pada.toString() : '',
              reviewedBy: it && it.direview_oleh ? it.direview_oleh.toString() : '',
              reviewedPada: it && it.direview_pada ? it.direview_pada.toString() : '',
              activity: it ? _arr(it.aktivitas) : []
            };
          });
          var proj = pq.data || {};
          return {
            success: true, list: list, summary: _engCountSummary(list),
            selesaiManual: proj.selesai_manual === true,
            ditandaiOleh: proj.ditandai_selesai_oleh || '',
            ditandaiPada: proj.ditandai_selesai_pada ? proj.ditandai_selesai_pada.toString() : ''
          };
        }
      });

      // ── BOM per WO (BOM.gs → getBOMByWO) — gabung item+status+assign+kirim ─
      window.gsRoute('getBOMByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('bom_item').select('*').eq('no_wo', noWO).order('id')),
            _safe(supa.from('penawaran').select('status').eq('no_wo', noWO).limit(1)),
            _safe(supa.from('bom_assignment').select('id_user,nama_user').eq('no_wo', noWO)),
            _safe(supa.from('bom_project').select('difinalkan_oleh,difinalkan_pada').eq('no_wo', noWO).maybeSingle()),
            _safe(supa.from('pengiriman_request').select('status,items').eq('no_wo', noWO).maybeSingle())
          ]);
          var iq = res[0], wq = res[1], aq = res[2], pq = res[3], rq = res[4];
          var sum = { total: 0, approved: 0, pending: 0, rejected: 0 };
          var items = (iq.data || []).map(function (r) {
            var st = (r.status || '').toString().trim() || 'Pending';
            sum.total++;
            if (st === 'Approved') sum.approved++; else if (st === 'Rejected') sum.rejected++; else sum.pending++;
            return {
              id: (r.id || '').toString(), kategori: (r.kategori || 'Lainnya').toString().trim() || 'Lainnya',
              pricelistId: r.pricelist_id || '', namaMaterial: r.nama_material || '', merek: r.merek || '',
              supplier: r.supplier || '', satuan: r.satuan || '', qty: Number(r.qty) || 0, catatan: r.catatan || '',
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', status: st,
              catatanReview: r.catatan_review || '', reviewedBy: r.direview_oleh || '',
              reviewedAt: r.direview_pada ? r.direview_pada.toString() : '', procStatus: r.proc_status || '',
              idStok: r.stok_id || '', qtyReserved: Number(r.qty_reserved) || 0, mutasiReserved: r.mutasi_reserved || '',
              qtyBeli: Number(r.qty_beli) || 0, diprosesOleh: r.diproses_oleh || '',
              diprosesPada: r.diproses_pada ? r.diproses_pada.toString() : '',
              qtyMenungguBL: Number(r.qty_menunggu_bl) || 0, qtyBeliLangsung: Number(r.qty_beli_langsung) || 0,
              refBeliLangsung: r.ref_beli_langsung || '', qtyDikirim: Number(r.qty_dikirim) || 0,
              qtyDiterima: Number(r.qty_diterima) || 0, kirimRef: r.kirim_ref || ''
            };
          });
          var woStatus = (wq.data && wq.data[0]) ? (wq.data[0].status || '') : '';
          var assigned = (aq.data || []).map(function (a) { return { id: (a.id_user || '').toString(), nama: (a.nama_user || '').toString() }; });
          var proj = pq.data || {};
          var reqRow = rq.data || null;
          var kirimRequest = reqRow ? (reqRow.status || '') : '';
          var kirimReqMap = {};
          if (reqRow && reqRow.status === 'Diminta') {
            var arr = _arr(reqRow.items);
            arr.forEach(function (x) { kirimReqMap[(x.bomItemId || '').toString()] = Number(x.target) || 0; });
          }
          return {
            success: true, status: (sum.total > 0 && sum.approved === sum.total) ? 'Final' : 'Draft',
            summary: sum, woStatus: woStatus, assigned: assigned,
            finalizedBy: proj.difinalkan_oleh || '', finalizedAt: proj.difinalkan_pada ? _fmtTs(proj.difinalkan_pada) : '',
            kirimRequest: kirimRequest, kirimReqMap: kirimReqMap, items: items
          };
        }
      });

      // ── BOM dashboard (BOM.gs → getBOMDashboard) — home BOM ───────────────
      window.gsRoute('getBOMDashboard', {
        mode: 'fn',
        handler: async function (args) {
          var opts = args[0] || {};
          var siteUserId = (opts.siteUserId || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('bom_assignment').select('no_wo,id_user,nama_user')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien')),
            _safe(_all('bom_item', 'no_wo,kategori,status,proc_status'))
          ]);
          var aq = res[0], pq = res[1], iq = res[2];
          var assignedMap = {};
          (aq.data || []).forEach(function (a) {
            var w = (a.no_wo || '').toString().trim(); if (!w) return;
            (assignedMap[w] = assignedMap[w] || []).push({ id: (a.id_user || '').toString(), nama: (a.nama_user || '').toString() });
          });
          var regs = (pq.data || []).map(function (r) {
            return { noWO: (r.no_wo || '').toString().trim(), namaProject: r.nama_project || '', namaKlien: r.nama_klien || '' };
          }).filter(function (r) { return r.noWO; });
          if (siteUserId) regs = regs.filter(function (r) { return (assignedMap[r.noWO] || []).some(function (a) { return a.id === siteUserId; }); });
          var visible = {}; regs.forEach(function (r) { visible[r.noWO] = true; });
          var cnt = {}, katSet = {}, appr = {}, pend = {}, rej = {}, procPend = {}, procDone = {};
          (iq.data || []).forEach(function (it) {
            var w = (it.no_wo || '').toString().trim(); if (!w || !visible[w]) return;
            cnt[w] = (cnt[w] || 0) + 1;
            var kat = (it.kategori || 'Lainnya').toString().trim() || 'Lainnya';
            if (!katSet[w]) katSet[w] = {}; katSet[w][kat] = true;
            var st = (it.status || '').toString().trim() || 'Pending';
            if (st === 'Approved') {
              appr[w] = (appr[w] || 0) + 1;
              if ((it.proc_status || '').toString().trim()) procDone[w] = (procDone[w] || 0) + 1;
              else procPend[w] = (procPend[w] || 0) + 1;
            } else if (st === 'Rejected') rej[w] = (rej[w] || 0) + 1;
            else pend[w] = (pend[w] || 0) + 1;
          });
          var perWO = regs.map(function (r) {
            var total = cnt[r.noWO] || 0, a = appr[r.noWO] || 0;
            return {
              noWO: r.noWO, namaProject: r.namaProject, namaKlien: r.namaKlien,
              status: (total > 0 && a === total) ? 'Final' : 'Draft', jumlahItem: total,
              jumlahKategori: katSet[r.noWO] ? Object.keys(katSet[r.noWO]).length : 0,
              approved: a, pending: pend[r.noWO] || 0, rejected: rej[r.noWO] || 0,
              procPending: procPend[r.noWO] || 0, procDone: procDone[r.noWO] || 0,
              assigned: assignedMap[r.noWO] || []
            };
          });
          var totalItem = 0, totalFinal = 0;
          perWO.forEach(function (w) { totalItem += w.jumlahItem; if (w.status === 'Final') totalFinal++; });
          return {
            success: true, perWO: perWO,
            global: { jumlahWO: perWO.length, jumlahItem: totalItem, jumlahFinal: totalFinal, jumlahDraft: perWO.length - totalFinal }
          };
        }
      });

      // ── DED dashboard (DED.gs → getDEDDashboard) — home DED ───────────────
      window.gsRoute('getDEDDashboard', {
        mode: 'fn',
        handler: async function (args) {
          var siteUserId = (args[0] && args[0].siteUserId) ? args[0].siteUserId.toString().trim() : '';
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('ded_checklist').select('kode,label,wajib')),
            _safe(supa.from('ded_item').select('no_wo,kode,status,diupload_oleh,diupload_pada,aktivitas')),
            _safe(supa.from('ded_project').select('no_wo,nama_project,nama_klien,selesai_manual')),
            _safe(supa.from('ded_assignment').select('no_wo,id_user,nama_user'))
          ]);
          var master = (res[0].data || []).map(function (r) { return { kode: r.kode || '', label: r.label || '', wajib: r.wajib === true }; });
          return _engDashCompute(master, res[1].data || [], res[2].data || [], res[3].data || [], siteUserId);
        }
      });

      // ── QC dashboard (QC.gs → getQCDashboard) — home QC ───────────────────
      window.gsRoute('getQCDashboard', {
        mode: 'fn',
        handler: async function (args) {
          var siteUserId = (args[0] && args[0].siteUserId) ? args[0].siteUserId.toString().trim() : '';
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var mres = await Promise.all([
            _qcMaster(),
            _safe(supa.from('qc_item').select('no_wo,kode,status,diupload_oleh,diupload_pada,aktivitas')),
            _safe(supa.from('qc_project').select('no_wo,nama_project,nama_klien,selesai_manual')),
            _safe(supa.from('qc_assignment').select('no_wo,id_user,nama_user'))
          ]);
          var master = (mres[0].list || []).map(function (m) { return { kode: m.kode, label: m.label, wajib: m.wajib }; });
          return _engDashCompute(master, mres[1].data || [], mres[2].data || [], mres[3].data || [], siteUserId);
        }
      });

      // ── Summary BOM per WO (badge di list WO) ─────────────────────────────
      window.gsRoute('getBOMSummaryByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: true, summary: null };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('bom_project').select('difinalkan_oleh').eq('no_wo', noWO).maybeSingle()),
            _safe(supa.from('bom_item').select('status,qty_reserved,qty_beli,qty_menunggu_bl,qty_beli_langsung,qty_dikirim').eq('no_wo', noWO))
          ]);
          if (!res[0].data) return { success: true, summary: null }; // belum terdaftar BOM
          var items = res[1].data || [];
          var total = items.length, approved = 0, rejected = 0, pending = 0;
          var proc = { base: 0, reserved: 0, direct: 0, perluBeli: 0, tunggu: 0, dikirim: 0, tuntas: 0, pct: 0 };
          items.forEach(function (it) {
            var st = (it.status || '').toString().trim() || 'Pending';
            if (st === 'Approved') approved++; else if (st === 'Rejected') rejected++; else pending++;
            if (st !== 'Approved') return;
            proc.base++;
            var qr = Number(it.qty_reserved) || 0, qb = Number(it.qty_beli) || 0, qm = Number(it.qty_menunggu_bl) || 0, qbl = Number(it.qty_beli_langsung) || 0, qd = Number(it.qty_dikirim) || 0;
            if (qr > 0) proc.reserved++; if (qbl > 0) proc.direct++; if (qb > 0) proc.perluBeli++;
            if (qm > 0) proc.tunggu++; if (qd > 0) proc.dikirim++;
            if (qb === 0 && qm === 0 && (qr > 0 || qbl > 0)) proc.tuntas++;
          });
          proc.pct = proc.base ? Math.round(proc.tuntas / proc.base * 100) : 0;
          return { success: true, summary: {
            total: total, approved: approved, pending: pending, rejected: rejected,
            pct: total ? Math.round(approved / total * 100) : 0,
            bomStatus: res[0].data.difinalkan_oleh ? 'Final' : 'Draft', proc: proc
          } };
        }
      });

      // ── Summary QC per WO ─────────────────────────────────────────────────
      window.gsRoute('getQCSummaryByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: true, summary: null, assigned: [] };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _qcMaster(),
            _safe(supa.from('qc_item').select('kode,status,foto').eq('no_wo', noWO)),
            _safe(supa.from('qc_assignment').select('id_user,nama_user').eq('no_wo', noWO))
          ]);
          var master = res[0].list || [];
          var rowMap = {}; (res[1].data || []).forEach(function (r) { rowMap[(r.kode || '').toString().trim()] = r; });
          var list = master.map(function (m) {
            var it = rowMap[m.kode] || null;
            var foto = it ? _arr(it.foto) : [];
            var status = it && it.status ? it.status.toString() : (foto.length ? 'Pending' : 'Belum Upload');
            return { wajib: m.wajib, status: status };
          });
          var assigned = (res[2].data || []).map(function (a) { return { id: (a.id_user || '').toString(), nama: (a.nama_user || '').toString() }; });
          return { success: true, summary: _engCountSummary(list), assigned: assigned };
        }
      });

      // ── Summary DED per WO (+ dokumen approved) ───────────────────────────
      window.gsRoute('getDEDSummaryByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: true, summary: null };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('ded_project').select('no_wo').eq('no_wo', noWO).maybeSingle()),
            _safe(supa.from('ded_checklist').select('kode,label,wajib').order('urutan')),
            _safe(supa.from('ded_item').select('kode,status,files').eq('no_wo', noWO))
          ]);
          if (!res[0].data) return { success: true, summary: null, approvedDocs: [] };
          var rowMap = {}; (res[2].data || []).forEach(function (r) { rowMap[(r.kode || '').toString().trim()] = r; });
          var list = (res[1].data || []).map(function (m) {
            var it = rowMap[m.kode] || null;
            var files = it ? _arr(it.files) : [];
            var status = it && it.status ? it.status.toString() : (files.length ? 'Pending' : 'Belum Upload');
            return { label: m.label || '', wajib: m.wajib === true, status: status, files: files };
          });
          var approvedDocs = list.filter(function (it) { return it.status === 'Approved' && (it.files || []).length; })
            .map(function (it) { return { label: it.label, files: (it.files || []).map(function (f) { return { fileUrl: f.fileUrl, fileName: f.fileName }; }) }; });
          return { success: true, summary: _engCountSummary(list), approvedDocs: approvedDocs };
        }
      });

      // ── WO tersedia untuk daftar BOM/DED/QC ───────────────────────────────
      window.gsRoute('getAvailableWOForBOM', { mode: 'fn', handler: function () { return _availableWO('bom_project'); } });
      window.gsRoute('getAvailableWOForDED', { mode: 'fn', handler: function () { return _availableWO('ded_project'); } });
      window.gsRoute('getAvailableWOForQC', { mode: 'fn', handler: function () { return _availableWO('qc_project'); } });

      // ── Schedule: daftar WO (Schedule.gs → getScheduleWOList) ─────────────
      window.gsRoute('getScheduleWOList', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('schedule_project').select('*')),
            _safe(supa.from('schedule_task').select('*')),
            _safe(_all('work_order', 'no_wo,items')),
            _safe(supa.from('produk').select('id,tipe')),
            _safe(supa.from('work_order_jenis_override').select('no_wo,jenis_manual'))
          ]);
          var taskMap = _schTasksMap(res[1].data || []);
          var tipeMap = {}; (res[3].data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
          var jenisOverride = {}; (res[4].data || []).forEach(function (j) { var w = (j.no_wo || '').toString().trim(); var v = (j.jenis_manual || '').toString().trim(); if (w && (v === 'Jasa' || v === 'Material')) jenisOverride[w] = v; });
          var jenisMap = {}; (res[2].data || []).forEach(function (w) { var no = (w.no_wo || '').toString(); jenisMap[no] = jenisOverride[no] || _woJenisAuto(w.items, tipeMap); });
          var list = (res[0].data || []).map(function (p) {
            var noWO = (p.no_wo || '').toString().trim();
            var tasks = taskMap[noWO] || [];
            return { noWO: noWO, namaProject: p.nama_project || '', namaKlien: p.nama_klien || '', tambahOleh: p.ditambahkan_oleh || '', siteEngineer: p.site_engineer || '', jenisWO: jenisMap[noWO] || 'Material', tasks: tasks, summary: _schSummary(tasks) };
          }).filter(function (x) { return x.noWO; });
          return { success: true, list: list };
        }
      });

      // ── Schedule: per WO (Schedule.gs → getScheduleByWO) ──────────────────
      window.gsRoute('getScheduleByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('schedule_project').select('*').eq('no_wo', noWO).maybeSingle()),
            _safe(supa.from('schedule_task').select('*').eq('no_wo', noWO)),
            _safe(supa.from('penawaran').select('status').eq('no_wo', noWO).limit(1))
          ]);
          if (!res[0].data) return { success: false, message: 'Proyek belum terdaftar di Schedule.' };
          var p = res[0].data;
          var tasks = (_schTasksMap(res[1].data || [])[noWO]) || [];
          var woStatus = (res[2].data && res[2].data[0]) ? (res[2].data[0].status || '') : '';
          return { success: true, project: { noWO: noWO, namaProject: p.nama_project || '', namaKlien: p.nama_klien || '', siteEngineer: p.site_engineer || '' }, tasks: tasks, summary: _schSummary(tasks), woStatus: woStatus };
        }
      });

      // ── Detail Kas Project per WO (Pengeluaran.gs → getDetailKasProjectWO) ─
      window.gsRoute('getDetailKasProjectWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = args[0] ? args[0].toString().trim() : '';
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('pengeluaran').select('id_pengeluaran,tanggal,sumber,no_po,nama_akun,deskripsi,total').eq('no_wo', noWO)),
            _safe(supa.from('invoice').select('no_invoice').eq('no_wo', noWO)),
            _safe(_all('pemasukan', 'id_pemasukan,tanggal,id_referensi,nama_akun,deskripsi,jumlah'))
          ]);
          var pengeluaran = [], totalKeluar = 0;
          (res[0].data || []).forEach(function (r) {
            var t = parseFloat(r.total) || 0; totalKeluar += t;
            pengeluaran.push({ id: r.id_pengeluaran || '', tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '', noPO: r.no_po || '', namaAkun: r.nama_akun || '', deskripsi: r.deskripsi || '', total: t });
          });
          var invSet = {}; (res[1].data || []).forEach(function (r) { if (r.no_invoice) invSet[r.no_invoice.toString().trim()] = true; });
          var pemasukan = [], totalMasuk = 0;
          (res[2].data || []).forEach(function (p) {
            var ref = (p.id_referensi || '').toString().trim(); if (!ref || !invSet[ref]) return;
            var jml = parseFloat(p.jumlah) || 0; totalMasuk += jml;
            pemasukan.push({ id: p.id_pemasukan || '', tanggal: _fmtTgl(p.tanggal), noInvoice: ref, namaAkun: p.nama_akun || '', deskripsi: p.deskripsi || '', jumlah: jml });
          });
          return { success: true, noWO: noWO, pemasukan: pemasukan, pengeluaran: pengeluaran, totalMasuk: totalMasuk, totalKeluar: totalKeluar };
        }
      });

      // ── Dokumen Project per WO (WorkOrder.gs → getWODokumen) ──────────────
      window.gsRoute('getWODokumen', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('wo_dokumen').select('*').eq('no_wo', noWO).eq('jenis', 'kontrak').maybeSingle()),
            _safe(supa.from('qc_item').select('kode,foto,status,diupload_oleh,diupload_pada').eq('no_wo', noWO))
          ]);
          var kr = res[0].data;
          var kontrak = kr ? { fileId: kr.file_id || '', fileUrl: kr.file_url || '', fileName: kr.nama_file || '', by: kr.diupload_oleh || '', at: kr.diupload_pada ? kr.diupload_pada.toString() : '' } : null;
          var byKode = {}; (res[1].data || []).forEach(function (r) { byKode[(r.kode || '').toString().trim()] = r; });
          var docMap = [{ key: 'bast', kode: 'H1', label: 'BAST' }, { key: 'garansi', kode: 'H2', label: 'Surat Garansi' }, { key: 'commissioning', kode: 'H3', label: 'Hasil Commissioning' }];
          var qc = {};
          docMap.forEach(function (m) {
            var doc = { kode: m.kode, label: m.label, status: 'Belum Upload', file: null, by: '', at: '' };
            var row = byKode[m.kode];
            if (row) {
              doc.status = (row.status || '').toString() || 'Belum Upload';
              var foto = _arr(row.foto);
              if (foto.length) {
                var f = foto[foto.length - 1];
                doc.file = { fileId: f.fileId, fileUrl: f.fileUrl, fileName: f.fileName || '' };
                doc.by = f.by || (row.diupload_oleh || '');
                doc.at = f.at || (row.diupload_pada ? row.diupload_pada.toString() : '');
              }
            }
            qc[m.key] = doc;
          });
          return { success: true, kontrak: kontrak, qc: qc };
        }
      });

      // ── Data BAST per WO (WorkOrder.gs → getBASTData) ─────────────────────
      window.gsRoute('getBASTData', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var base = await _woDocBase(noWO);
          if (!base) return { success: false, message: 'Work Order tidak ditemukan.' };
          var row = base.row, d = new Date();
          var bast = _woSeq(noWO) + '/RGI/BAST/' + _WO_ROMAWI[d.getMonth() + 1] + '/' + d.getFullYear();
          return {
            success: true, noWO: noWO, namaProject: row.nama_project || '', bastNomor: bast,
            klien: { nama: row.nama_klien || '', alamat: base.alamat }, lokasi: base.alamat,
            tanggal: { hari: _WO_HARI[d.getDay()], tgl: d.getDate(), bulan: _WO_BULAN[d.getMonth()], tahun: d.getFullYear() }
          };
        }
      });

      // ── Data Garansi per WO (WorkOrder.gs → getGaransiData) ───────────────
      window.gsRoute('getGaransiData', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var base = await _woDocBase(noWO);
          if (!base) return { success: false, message: 'Work Order tidak ditemukan.' };
          var row = base.row;
          var tc = _jsonObj(row.term_conditions); var k = tc.kontrak || {};
          var dealD = _woAnyDate(row.tanggal_deal) || new Date();
          var spk = _woSeq(noWO) + '/RGI/SPK/' + _WO_ROMAWI[dealD.getMonth() + 1] + '/' + dealD.getFullYear();
          var t = new Date();
          return {
            success: true, noWO: noWO, namaProject: row.nama_project || '', spkNomor: spk,
            klien: { nama: row.nama_klien || '', alamat: base.alamat }, lokasi: base.alamat,
            tanggal: { hari: _WO_HARI[t.getDay()], tgl: t.getDate(), bulan: _WO_BULAN[t.getMonth()], tahun: t.getFullYear() },
            garansi: { panel: Number(k.garansiPanel) || 0, inverter: Number(k.garansiInverter) || 0, baterai: Number(k.garansiBaterai) || 0, instalasi: Number(k.garansiInstalasi) || 0 }
          };
        }
      });

      // ── Data Kontrak/SPK per WO (WorkOrder.gs → getKontrakData) ───────────
      window.gsRoute('getKontrakData', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var base = await _woDocBase(noWO);
          if (!base) return { success: false, message: 'Work Order tidak ditemukan.' };
          var row = base.row;
          var nilaiKontrak = parseFloat(row.subtotal) || 0;
          var tc = _jsonObj(row.term_conditions); var k = tc.kontrak || {};
          var d = _woAnyDate(row.tanggal_deal) || new Date();
          var spk = _woSeq(noWO) + '/RGI/SPK/' + _WO_ROMAWI[d.getMonth() + 1] + '/' + d.getFullYear();
          var termins;
          if (Array.isArray(k.termins) && k.termins.length) {
            termins = k.termins.map(function (t) { return { persen: Number(t.persen) || 0, ket: String(t.ket || '') }; });
          } else {
            termins = [
              { persen: Number(k.terminDP) || 0, ket: 'From PO' },
              { persen: Number(k.terminTermin) || 0, ket: 'Material On Site' },
              { persen: Number(k.terminPelunasan) || 0, ket: 'After BAST' }
            ];
          }
          return {
            success: true, noWO: noWO, namaProject: row.nama_project || '', spkNomor: spk,
            klien: { nama: row.nama_klien || '', alamat: base.alamat }, nilaiKontrak: nilaiKontrak,
            tanggal: { hari: _WO_HARI[d.getDay()], tgl: d.getDate(), bulan: _WO_BULAN[d.getMonth()], tahun: d.getFullYear() },
            termins: termins, leadTimeHari: Number(k.leadTimeHari) || 0,
            garansi: { instalasi: Number(k.garansiInstalasi) || 0, panel: Number(k.garansiPanel) || 0, inverter: Number(k.garansiInverter) || 0, baterai: Number(k.garansiBaterai) || 0 },
            rekening: _woParseBank(await _woInvoiceBankText(noWO))
          };
        }
      });

      // ── Bootstrap Invoice (Invoice.gs → getInvoiceInitialData) ────────────
      //  woList (dari _woListData) diperkaya nilai tagihan + daftar penawaran
      //  pre-deal (untuk invoice DP sebelum deal). nextNo dibuat saat simpan.
      window.gsRoute('getInvoiceInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
            var woList = await _woListData();
            var res = await Promise.all([
              _safe(_all('invoice', 'no_wo,no_penawaran,dpp')),
              _safe(_all('penawaran', 'no_penawaran,rev,tanggal,nama_project,klien_id,subtotal,diskon,pajak,grand_total,items,status,no_wo')),
              _safe(supa.from('klien').select('id,nama_klien'))
            ]);
            var tagihMap = {}, tagihByPen = {};
            (res[0].data || []).forEach(function (r) {
              var dpp = parseFloat(r.dpp) || 0;
              if (r.no_wo) tagihMap[r.no_wo] = (tagihMap[r.no_wo] || 0) + dpp;
              if (r.no_penawaran) tagihByPen[r.no_penawaran] = (tagihByPen[r.no_penawaran] || 0) + dpp;
            });
            var klienMap = {}; (res[2].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });

            var woEnriched = woList.map(function (w) {
              var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
              var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
              var ditagihDpp = tagihMap[w.noWO] || 0;
              return {
                noWO: w.noWO, isPredeal: false, id: w.id, rev: w.rev, tanggal: w.tanggal,
                namaProject: w.namaProject, namaKlien: w.namaKlien, klienId: w.klienId,
                subtotal: w.subtotal, diskon: w.diskon, pajak: w.pajak, grandTotal: w.grandTotal,
                items: w.items, nilaiKontrak: nilaiKontrak, ppnRate: ppnRate,
                ditagihDpp: ditagihDpp, sisaDpp: Math.max(0, nilaiKontrak - ditagihDpp)
              };
            });

            // Penawaran pre-deal: bukan status Deal & belum punya WO, rev tertinggi.
            var latestRev = {};
            (res[1].data || []).forEach(function (r, i) {
              var id = (r.no_penawaran || '').toString(); if (!id) return;
              var status = (r.status || '').toString(); var noWO = (r.no_wo || '').toString();
              if (status === 'Deal' || noWO) return;
              var rev = parseInt(r.rev) || 0;
              if (!latestRev[id] || rev > latestRev[id].rev) latestRev[id] = { rev: rev, row: r };
            });
            var penawaranPreDeal = Object.keys(latestRev).map(function (id) {
              var r = latestRev[id].row;
              var subtotal = parseFloat(r.subtotal) || 0, diskon = parseFloat(r.diskon) || 0, pajak = parseFloat(r.pajak) || 0;
              var nilaiKontrak = Math.max(0, subtotal - diskon);
              var ppnRate = nilaiKontrak > 0 ? Math.round(pajak / nilaiKontrak * 100) : 0;
              var ditagihDpp = tagihByPen[id] || 0;
              return {
                noWO: '', isPredeal: true, id: id, rev: (r.rev != null ? r.rev : '0').toString(),
                tanggal: _fmtTgl(r.tanggal), namaProject: r.nama_project || '',
                namaKlien: klienMap[r.klien_id] || r.klien_id || '', klienId: r.klien_id || '',
                subtotal: subtotal, diskon: diskon, pajak: pajak, grandTotal: parseFloat(r.grand_total) || 0,
                items: _jsonStr(r.items, '[]'), nilaiKontrak: nilaiKontrak, ppnRate: ppnRate,
                ditagihDpp: ditagihDpp, sisaDpp: Math.max(0, nilaiKontrak - ditagihDpp), status: r.status || ''
              };
            }).sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });

            return { success: true, woList: woEnriched, penawaranPreDeal: penawaranPreDeal, nextNo: '' };
          } catch (e) {
            return { success: false, error: String(e), woList: [], penawaranPreDeal: [], nextNo: '' };
          }
        }
      });

      // ── Laporan Profitabilitas (Pengeluaran.gs → getLaporanProfitabilitas) ─
      window.gsRoute('getLaporanProfitabilitas', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('pengeluaran', 'no_wo,nama_akun,total')),
            _safe(_all('penawaran', 'no_penawaran,rev,tanggal,nama_project,dibuat_oleh,klien_id,subtotal,diskon,total_hpp,status,no_wo')),
            _safe(supa.from('klien').select('id,nama_klien'))
          ]);
          var expByWO = {}, expByAkun = {};
          (res[0].data || []).forEach(function (r) {
            var noWO = (r.no_wo || '').toString().trim(); var total = parseFloat(r.total) || 0; var akun = (r.nama_akun || '').toString();
            expByWO[noWO] = (expByWO[noWO] || 0) + total; expByAkun[akun] = (expByAkun[akun] || 0) + total;
          });
          var klienMap = {}; (res[2].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var latestRev = {};
          (res[1].data || []).forEach(function (r) { var noPen = (r.no_penawaran || '').toString(); if (!noPen) return; var rev = parseInt(r.rev) || 0; if (!latestRev[noPen] || rev > latestRev[noPen].rev) latestRev[noPen] = { rev: rev, row: r }; });
          var rows = [];
          Object.keys(latestRev).forEach(function (noPen) {
            var r = latestRev[noPen].row;
            var status = (r.status || '').toString();
            var noWO = (r.no_wo || '').toString().trim();
            if (!noWO || (status !== 'Deal' && status !== 'Closed')) return;
            if (params.status && params.status !== status) return;
            var tanggal = _fmtTgl(r.tanggal);
            if (!_inDateRange(tanggal, params.tanggalDari, params.tanggalSampai)) return;
            var nilaiKontrak = Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0));
            var estimasiHPP = parseFloat(r.total_hpp) || 0;
            var realisasiHPP = expByWO[noWO] || 0;
            var margEst = nilaiKontrak > 0 ? (nilaiKontrak - estimasiHPP) / nilaiKontrak * 100 : null;
            var margReal = nilaiKontrak > 0 ? (nilaiKontrak - realisasiHPP) / nilaiKontrak * 100 : null;
            rows.push({
              noWO: noWO, namaProject: r.nama_project || '', namaKlien: klienMap[r.klien_id] || r.klien_id || '',
              namaSales: r.dibuat_oleh || '', tanggal: tanggal, status: status, nilaiKontrak: nilaiKontrak,
              estimasiHPP: estimasiHPP, realisasiHPP: realisasiHPP, selisih: estimasiHPP - realisasiHPP,
              marginEstimasi: margEst, marginRealisasi: margReal,
              isOverBudget: margReal !== null && margEst !== null && margReal < margEst
            });
          });
          rows.sort(function (a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });
          var totalKontrak = 0, totalRealisasi = 0, sumMargReal = 0, countMarg = 0;
          rows.forEach(function (r2) { totalKontrak += r2.nilaiKontrak; totalRealisasi += r2.realisasiHPP; if (r2.marginRealisasi !== null) { sumMargReal += r2.marginRealisasi; countMarg++; } });
          var rekapAkun = Object.keys(expByAkun).map(function (nama) { return { namaAkun: nama, total: expByAkun[nama] }; }).sort(function (a, b) { return b.total - a.total; });
          return { success: true, rows: rows, summary: { totalKontrak: totalKontrak, totalRealisasiHPP: totalRealisasi, rataMarginRealisasi: countMarg > 0 ? sumMargReal / countMarg : null }, rekapAkun: rekapAkun };
        }
      });

      // ── Laporan Keuntungan Bulanan (Pengeluaran.gs → getLaporanKeuntunganBulanan) ─
      window.gsRoute('getLaporanKeuntunganBulanan', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var tahun = parseInt(params.tahun, 10) || new Date().getFullYear();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('invoice', 'tanggal,dpp')),
            _safe(_all('pengeluaran', 'tanggal,no_wo,total,kategori')),
            _safe(_all('penawaran', 'no_wo,nama_project'))
          ]);
          var woMap = {}; (res[2].data || []).forEach(function (p) { var w = (p.no_wo || '').toString().trim(); if (w && !woMap[w]) woMap[w] = { namaProject: p.nama_project || '' }; });
          var bulanData = []; for (var b = 0; b < 12; b++) bulanData.push({ bulan: _WO_BULAN[b], bulanIdx: b + 1, invoiceDPP: 0, pengeluaranProject: 0, pengeluaranNonProject: 0, kategoriProjectTotal: {}, kategoriNonProjectTotal: {} });
          (res[0].data || []).forEach(function (r) { var tp = _fmtTgl(r.tanggal).split('/'); if (tp.length !== 3) return; if (parseInt(tp[2], 10) !== tahun) return; bulanData[parseInt(tp[1], 10) - 1].invoiceDPP += parseFloat(r.dpp) || 0; });
          (res[1].data || []).forEach(function (r) {
            var tp = _fmtTgl(r.tanggal).split('/'); if (tp.length !== 3) return; if (parseInt(tp[2], 10) !== tahun) return;
            var total = parseFloat(r.total) || 0; var noWO = (r.no_wo || '').toString().trim(); var d = bulanData[parseInt(tp[1], 10) - 1];
            if (noWO) { d.pengeluaranProject += total; var wi = woMap[noWO] || { namaProject: '' }; var label = noWO + (wi.namaProject ? ' - ' + wi.namaProject : ''); d.kategoriProjectTotal[label] = (d.kategoriProjectTotal[label] || 0) + total; }
            else { d.pengeluaranNonProject += total; var kat = (r.kategori || 'Lainnya').toString(); d.kategoriNonProjectTotal[kat] = (d.kategoriNonProjectTotal[kat] || 0) + total; }
          });
          var _sortKat = function (m) { return Object.keys(m).map(function (k) { return { kategori: k, total: m[k] }; }).sort(function (a, b) { return b.total - a.total; }); };
          var kpTahun = {}, knpTahun = {};
          bulanData.forEach(function (d) { Object.keys(d.kategoriProjectTotal).forEach(function (k) { kpTahun[k] = (kpTahun[k] || 0) + d.kategoriProjectTotal[k]; }); Object.keys(d.kategoriNonProjectTotal).forEach(function (k) { knpTahun[k] = (knpTahun[k] || 0) + d.kategoriNonProjectTotal[k]; }); });
          var totInv = 0, totPP = 0, totPNP = 0;
          var rows = bulanData.map(function (d) {
            var keuntungan = d.invoiceDPP - d.pengeluaranProject - d.pengeluaranNonProject;
            var margin = d.invoiceDPP > 0 ? (keuntungan / d.invoiceDPP * 100) : null;
            totInv += d.invoiceDPP; totPP += d.pengeluaranProject; totPNP += d.pengeluaranNonProject;
            return { bulan: d.bulan, bulanIdx: d.bulanIdx, invoiceDPP: d.invoiceDPP, pengeluaranProject: d.pengeluaranProject, pengeluaranNonProject: d.pengeluaranNonProject, keuntungan: keuntungan, margin: margin, kategoriProject: _sortKat(d.kategoriProjectTotal), kategoriNonProject: _sortKat(d.kategoriNonProjectTotal) };
          });
          var totalKeuntungan = totInv - totPP - totPNP; var totalMargin = totInv > 0 ? (totalKeuntungan / totInv * 100) : null;
          return {
            success: true, tahun: tahun, rows: rows,
            summary: { totalInvoiceDPP: totInv, totalPengeluaranProject: totPP, totalPengeluaranNonProject: totPNP, totalPengeluaran: totPP + totPNP, totalKeuntungan: totalKeuntungan, totalMargin: totalMargin },
            kategoriProjectTahunan: _sortKat(kpTahun), kategoriNonProjectTahunan: _sortKat(knpTahun)
          };
        }
      });

      // ── Laporan Keuangan (Invoice.gs → getFinanceReportData) ──────────────
      window.gsRoute('getFinanceReportData', {
        mode: 'fn',
        handler: async function (args) {
          var filter = args[0] || {};
          var _frParse = function (s) { if (!s) return null; var p = s.split('-'); if (p.length !== 3) return null; return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); };
          var _aging = function (t) { if (!t) return null; var pr = t.split('/'); if (pr.length !== 3) return null; var d = new Date(parseInt(pr[2]), parseInt(pr[1]) - 1, parseInt(pr[0])); if (isNaN(d.getTime())) return null; return Math.floor((new Date() - d) / 86400000); };
          var dateFrom = filter.from ? _frParse(filter.from) : null;
          var dateTo = filter.to ? _frParse(filter.to) : null;
          if (dateTo) dateTo.setHours(23, 59, 59);
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var woList = await _woListData();
          var iq = await _safe(_all('invoice', 'no_invoice,no_wo,no_penawaran,tanggal,jenis,dpp,ppn_persen,ppn_nominal,total,status_bayar,tanggal_bayar,bukti_file_id'));
          var invByWO = {}, invByPen = {};
          var aging = { current: 0, gte30: 0, gte60: 0, gte90: 0 };
          var totalTagihan = 0, totalTerbayar = 0, totalTagihanDpp = 0, totalTerbayarDpp = 0;
          (iq.data || []).forEach(function (r) {
            var noInv = (r.no_invoice || '').toString(); if (!noInv) return;
            var noWO = (r.no_wo || '').toString(); var noPen = (r.no_penawaran || '').toString();
            var tgl = _fmtTgl(r.tanggal); var jenis = (r.jenis || '').toString();
            var dpp = parseFloat(r.dpp) || 0, ppnPct = parseFloat(r.ppn_persen) || 0, ppnNom = parseFloat(r.ppn_nominal) || 0, total = parseFloat(r.total) || 0;
            var status = (r.status_bayar || 'Belum Lunas').toString();
            var tglBayar = r.tanggal_bayar ? _fmtTgl(r.tanggal_bayar) : '';
            if (!tglBayar) { var legacy = (r.bukti_file_id || '').toString(); if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(legacy)) tglBayar = _fmtTgl(legacy); }
            if (dateFrom || dateTo) {
              var invDate = null; var s = (r.tanggal || '').toString();
              if (s.indexOf('T') > 0) invDate = new Date(s);
              else { var dp = s.split('-'); if (dp.length === 3) invDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2])); }
              if (invDate) { if (dateFrom && invDate < dateFrom) return; if (dateTo && invDate > dateTo) return; } else return;
            }
            var inv = { noInv: noInv, noWO: noWO, noPen: noPen, tgl: tgl, jenis: jenis, dpp: dpp, ppnPct: ppnPct, ppnNom: ppnNom, total: total, status: status, tglBayar: tglBayar };
            totalTagihan += total; totalTagihanDpp += dpp;
            if (status === 'Lunas') { totalTerbayar += total; totalTerbayarDpp += dpp; }
            if (status !== 'Lunas') { var days = _aging(tgl); if (days !== null) { if (days >= 90) aging.gte90 += total; else if (days >= 60) aging.gte60 += total; else if (days >= 30) aging.gte30 += total; else aging.current += total; } }
            if (noWO) { (invByWO[noWO] = invByWO[noWO] || []).push(inv); } else if (noPen) { (invByPen[noPen] = invByPen[noPen] || []).push(inv); }
          });
          var woRows = woList.map(function (w) {
            var invoices = invByWO[w.noWO] || [];
            invoices.sort(function (a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
            var tagihan = 0, terbayar = 0; invoices.forEach(function (inv) { tagihan += inv.total; if (inv.status === 'Lunas') terbayar += inv.total; });
            var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
            var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
            var bruto = nilaiKontrak + (w.pajak || 0);
            return { noWO: w.noWO, noPenawaran: w.id, namaKlien: w.namaKlien, namaProject: w.namaProject, nilaiKontrak: nilaiKontrak, ppnRate: ppnRate, invoices: invoices, tagihan: tagihan, terbayar: terbayar, outstanding: tagihan - terbayar, belumDitagih: Math.max(0, bruto - tagihan) };
          });
          var preDealRows = [];
          Object.keys(invByPen).forEach(function (noPen) {
            var invList = invByPen[noPen].filter(function (inv) { return !inv.noWO; });
            if (!invList.length) return;
            invList.sort(function (a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
            var tagihan = 0, terbayar = 0; invList.forEach(function (inv) { tagihan += inv.total; if (inv.status === 'Lunas') terbayar += inv.total; });
            preDealRows.push({ noWO: '', noPenawaran: noPen, namaKlien: invList[0].namaKlien || '', namaProject: invList[0].namaProject || '', nilaiKontrak: 0, ppnRate: 0, invoices: invList, tagihan: tagihan, terbayar: terbayar, outstanding: tagihan - terbayar, belumDitagih: 0, isPredeal: true });
          });
          return {
            success: true,
            summary: { totalTagihanDpp: totalTagihanDpp, totalTerbayarDpp: totalTerbayarDpp, totalOutstandingDpp: totalTagihanDpp - totalTerbayarDpp, totalTagihan: totalTagihan, totalTerbayar: totalTerbayar, totalOutstanding: totalTagihan - totalTerbayar, aging: aging },
            rows: woRows.concat(preDealRows)
          };
        }
      });

      // ── Detail reserve stok per WO (Inventory.gs → getReserveDetailByStok) ─
      window.gsRoute('getReserveDetailByStok', {
        mode: 'fn',
        handler: async function (args) {
          var idStok = (args[0] || '').toString().trim();
          if (!idStok) return { success: false, list: [], total: 0, message: 'ID Stok wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('bom_item').select('no_wo,nama_material,satuan,qty_reserved,qty_dikirim').eq('stok_id', idStok)),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var byWO = {};
          (res[0].data || []).forEach(function (r) {
            var held = (Number(r.qty_reserved) || 0) - (Number(r.qty_dikirim) || 0);
            if (held <= 0) return;
            var noWO = (r.no_wo || '').toString().trim();
            if (!byWO[noWO]) byWO[noWO] = { qty: 0, items: [] };
            byWO[noWO].qty += held;
            byWO[noWO].items.push({ namaMaterial: (r.nama_material || '').toString(), satuan: (r.satuan || '').toString(), qty: held });
          });
          var list = [], total = 0;
          Object.keys(byWO).forEach(function (w) {
            var pj = projMap[w] || {};
            list.push({ noWO: w, namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '', qty: byWO[w].qty, items: byWO[w].items });
            total += byWO[w].qty;
          });
          list.sort(function (a, b) { return b.qty - a.qty; });
          return { success: true, list: list, total: total };
        }
      });

      // ── Rincian lot produk (Inventory.gs → getRincianLotProduk) — FIFO ────
      window.gsRoute('getRincianLotProduk', {
        mode: 'fn',
        handler: async function (args) {
          var idProduk = (args[0] || '').toString().trim();
          var q = await supa.from('mutasi_stok').select('qty_masuk,qty_keluar,harga_satuan').eq('id_produk', idProduk).order('id_mutasi');
          if (q.error) return { success: false, message: q.error.message };
          // Replay FIFO lots (port _replayLotsFromRows).
          var lots = [];
          (q.data || []).forEach(function (r) {
            var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, harga = Number(r.harga_satuan) || 0;
            if (masuk > 0) { lots.push({ qty: masuk, harga: harga }); }
            else if (keluar > 0) {
              var sisa = keluar;
              while (sisa > 0 && lots.length > 0) {
                var lot = lots[0];
                if (lot.qty <= sisa) { sisa -= lot.qty; lots.shift(); } else { lot.qty -= sisa; sisa = 0; }
              }
            }
          });
          var qtyTotal = 0, nilaiTotal = 0;
          var rincian = lots.map(function (lot) { qtyTotal += lot.qty; nilaiTotal += lot.qty * lot.harga; return { qty: lot.qty, harga: lot.harga, nilai: lot.qty * lot.harga }; });
          return { success: true, lots: rincian, qtyTotal: qtyTotal, nilaiTotal: nilaiTotal };
        }
      });

      // ── ID Site Survey berikutnya (SiteSurvey.gs → getNextSiteSurveyId) ───
      window.gsRoute('getNextSiteSurveyId', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('site_survey').select('id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0;
          (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^SVY(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          return { success: true, id: 'SVY' + ('000' + (maxNum + 1)).slice(-3) };
        }
      });

      // ── Konteks WO untuk engineering (BOM.gs → getWOContextByWO) ──────────
      window.gsRoute('getWOContextByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var woList = await _woListData();
          var wo = woList.filter(function (w) { return w.noWO === noWO; })[0];
          if (!wo) return { success: false, message: 'Work Order tidak ditemukan.' };
          var res = await Promise.all([
            _safe(supa.from('produk').select('id,tipe')),
            _safe(supa.from('hand_over').select('*').eq('no_wo', noWO).maybeSingle()),
            _safe(supa.from('site_survey').select('*').eq('no_wo', noWO))
          ]);
          var tipeMap = {}; (res[0].data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
          var kelompokList = []; try { kelompokList = JSON.parse(wo.items || '[]'); } catch (e) {}
          var budMaterial = 0, budJasa = 0, kelompok = [];
          kelompokList.forEach(function (k) {
            var disp = { nama: (k.namaKelompok || '').toString(), items: [] };
            (k.subItems || []).forEach(function (s) {
              var pid = (s.produkId || '').toString().trim();
              var tipe = pid ? (tipeMap[pid] || '') : '';
              var isJasa = (tipe === 'jasa') || ((!pid || !tipe) && _woKeywordHitJasa((s.deskripsi || '').toString().toLowerCase()));
              var qty = Number(s.qty) || 0, hpp = Number(s.hpp) || 0;
              if (isJasa) budJasa += qty * hpp; else budMaterial += qty * hpp;
              disp.items.push({ deskripsi: (s.deskripsi || '').toString(), qty: qty, unit: (s.unit || '').toString(), hpp: hpp, totalHpp: qty * hpp });
            });
            kelompok.push(disp);
          });
          var ho = null;
          var hr = res[1].data;
          if (hr) ho = { status: hr.status || '', mom: hr.mom || '', tglJadwal: hr.tgl_jadwal ? hr.tgl_jadwal.toString().slice(0, 10) : '', waktu: hr.waktu ? hr.waktu.toString().slice(0, 5) : '', mode: hr.mode || '', selesaiOleh: hr.selesai_oleh || '', selesaiPada: _fmtTs(hr.selesai_pada) };
          var surveys = (res[2].data || []).map(function (r) {
            return { id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey), dibuatOleh: r.dibuat_oleh || '', namaSite: r.nama_site || '', namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '' };
          }).sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return {
            success: true, noWO: noWO, id: wo.id || '', rev: wo.rev != null ? wo.rev : '', tanggal: wo.tanggal || '',
            dibuatOleh: wo.dibuatOleh || '', namaProject: wo.namaProject || '', namaKlien: wo.namaKlien || '',
            jenisWO: wo.jenisWO || 'Material', status: wo.status || '', catatanCustomer: wo.catatanCustomer || '',
            kelompok: kelompok, budget: { material: budMaterial, jasa: budJasa, total: budMaterial + budJasa }, ho: ho, surveys: surveys
          };
        }
      });

      // ── Helper bersama: peta pricelist id → {idSupplier, hargaBeli} ────────
      async function _priceMap() {
        var q = await supa.from('pricelist').select('id,id_supplier,harga_beli');
        var m = {}; (q.data || []).forEach(function (p) { m[(p.id || '').toString()] = { idSupplier: (p.id_supplier || '').toString(), hargaBeli: Number(p.harga_beli) || 0 }; });
        return m;
      }

      // ── BOM perlu dibeli (BOM.gs → getBOMNeedPurchase) ────────────────────
      window.gsRoute('getBOMNeedPurchase', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('bom_item', 'id,no_wo,kategori,pricelist_id,nama_material,merek,supplier,satuan,qty,stok_id,qty_reserved,qty_beli,qty_menunggu_bl')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien')),
            _priceMap()
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = { namaProject: r.nama_project || '', namaKlien: r.nama_klien || '' }; });
          var priceMap = res[2];
          var list = [];
          (res[0].data || []).forEach(function (r) {
            var qtyBeli = Number(r.qty_beli) || 0, qtyMenunggu = Number(r.qty_menunggu_bl) || 0;
            if (qtyBeli <= 0 && qtyMenunggu <= 0) return;
            var noWO = (r.no_wo || '').toString().trim(); var pj = projMap[noWO] || {};
            var plId = (r.pricelist_id || '').toString(); var pm = priceMap[plId] || {};
            list.push({
              id: (r.id || '').toString(), noWO: noWO, namaProject: pj.namaProject || '', namaKlien: pj.namaKlien || '',
              kategori: (r.kategori || 'Lainnya').toString(), namaMaterial: r.nama_material || '', merek: r.merek || '',
              supplier: (r.supplier || '').toString() || '(tanpa supplier)', satuan: r.satuan || '', qty: Number(r.qty) || 0,
              qtyReserved: Number(r.qty_reserved) || 0, idStok: (r.stok_id || '').toString(), qtyBeli: qtyBeli, qtyMenunggu: qtyMenunggu,
              pricelistId: plId, idSupplier: pm.idSupplier || '', hargaBeli: pm.hargaBeli || 0
            });
          });
          return { success: true, list: list };
        }
      });

      // ── BOM menunggu beli langsung (BOM.gs → getBOMMenungguBL) ────────────
      window.gsRoute('getBOMMenungguBL', {
        mode: 'fn',
        handler: async function (args) {
          var fSup = (args[0] && args[0].idSupplier) ? args[0].idSupplier.toString().trim() : '';
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('bom_item', 'id,no_wo,kategori,pricelist_id,nama_material,merek,supplier,satuan,qty_menunggu_bl')),
            _safe(supa.from('bom_project').select('no_wo,nama_project')),
            _priceMap()
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r.nama_project || ''; });
          var priceMap = res[2];
          var list = [];
          (res[0].data || []).forEach(function (r) {
            var qMen = Number(r.qty_menunggu_bl) || 0; if (qMen <= 0) return;
            var plId = (r.pricelist_id || '').toString(); var pm = priceMap[plId] || {};
            if (fSup && (pm.idSupplier || '') !== fSup) return;
            var noWO = (r.no_wo || '').toString().trim();
            list.push({
              id: (r.id || '').toString(), noWO: noWO, namaProject: projMap[noWO] || '', kategori: (r.kategori || 'Lainnya').toString(),
              namaMaterial: r.nama_material || '', merek: r.merek || '', supplier: r.supplier || '', satuan: r.satuan || '',
              qtyMenunggu: qMen, pricelistId: plId, idSupplier: pm.idSupplier || '', hargaBeli: pm.hargaBeli || 0
            });
          });
          return { success: true, list: list };
        }
      });

      // ── Riwayat revisi penawaran (Penawaran.gs → getRiwayatRevisi) ────────
      window.gsRoute('getRiwayatRevisi', {
        mode: 'fn',
        handler: async function (args) {
          var noPen = (args[0] || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('penawaran').select('*').eq('no_penawaran', noPen)),
            _safe(supa.from('klien').select('id,nama_klien'))
          ]);
          var klienMap = {}; (res[1].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var list = (res[0].data || []).map(function (r) {
            return {
              id: (r.no_penawaran || '').toString(), rev: (parseInt(r.rev) || 0).toString(),
              tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_hingga), namaProject: r.nama_project || '',
              klienId: (r.klien_id || '').toString(), namaKlien: klienMap[r.klien_id] || r.klien_id || '',
              dibuatOleh: r.dibuat_oleh || '', subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0,
              pajak: parseFloat(r.pajak) || 0, grandTotal: parseFloat(r.grand_total) || 0, hpp: parseFloat(r.total_hpp) || 0,
              profit: parseFloat(r.estimasi_keuntungan) || 0, marginPersen: parseFloat(r.margin_persen) || 0,
              termConditions: _jsonStr(r.term_conditions, '{}'), items: _jsonStr(r.items, '[]'),
              status: r.status || 'On-Progress', noWO: r.no_wo || '', channelMarketing: r.channel_marketing || ''
            };
          });
          list.sort(function (a, b) { return parseInt(b.rev) - parseInt(a.rev); });
          return list;
        }
      });

      // ── Item PO untuk penerimaan (PurchaseOrder.gs → getPOItemsUntukPenerimaan) ─
      window.gsRoute('getPOItemsUntukPenerimaan', {
        mode: 'fn',
        handler: async function (args) {
          var noPO = (args[0] || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle()),
            _safe(supa.from('po_item').select('id_item,nama_item,satuan,harga_beli_satuan,qty,qty_diterima,id_produk').eq('no_po', noPO))
          ]);
          if (!res[0].data) return { success: false, message: 'PO tidak ditemukan.' };
          var statusPO = (res[0].data.status_po || '').toString();
          var ok = ['Aktif', 'Diterima Sebagian', 'Menunggu Gudang', 'Menunggu Penerimaan Gudang'];
          if (ok.indexOf(statusPO) === -1) return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
          var items = (res[1].data || []).map(function (r) {
            var qty = Number(r.qty) || 0, qtyDiterima = Number(r.qty_diterima) || 0;
            return {
              idItem: (r.id_item || '').toString(), namaItem: (r.nama_item || '').toString(), satuan: (r.satuan || '').toString(),
              hargaBeli: Number(r.harga_beli_satuan) || 0, qtyPesan: qty, qtyDiterima: qtyDiterima,
              qtySisa: Math.max(0, qty - qtyDiterima), idProduk: (r.id_produk || '').toString()
            };
          });
          return { success: true, items: items, statusPO: statusPO };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  GAP CASH MANAGER (perlu 00-ddl-gap-cashmanager.sql dijalankan dulu)
      //  Ayat silang, bank account, kategori, saldo akun, bundle, bootstrap.
      // ═══════════════════════════════════════════════════════════════════════
      window.gsRoute('getAyatSilangList', { mode: 'fn', handler: async function () { return { success: true, list: await _ayatArr() }; } });
      // getBankAccounts kini bersumber dari akun_pembayaran (SATU master).
      // label = nama_akun, detail = detail rekening. Dipakai dropdown Invoice.
      async function _bankFromAkun() {
        var q = await supa.from('akun_pembayaran').select('id,nama_akun,detail,status').order('id');
        return (q.data || []).filter(function (r) { return (r.id || '').toString() !== 'AP001'; }) // Stok bukan bank
          .map(function (r) { return { id: (r.id || '').toString(), label: r.nama_akun || '', detail: r.detail || '' }; });
      }
      window.gsRoute('getBankAccounts', {
        mode: 'fn',
        handler: async function () { return { success: true, accounts: await _bankFromAkun() }; }
      });
      window.gsRoute('getKategoriPengeluaran', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('kategori_pengeluaran').select('nama').order('urutan');
          if (q.error) return { success: false, list: [], message: q.error.message };
          return { success: true, list: (q.data || []).map(function (r) { return r.nama; }) };
        }
      });
      window.gsRoute('getSaldoAkun', { mode: 'fn', handler: function () { return _saldoAkun(); } });
      window.gsRoute('getMutasiBundle', {
        mode: 'fn',
        handler: async function () {
          var r = await Promise.all([_pemArr(), _pengArr(), _ayatArr()]);
          return { success: true, pemasukan: r[0], pengeluaran: r[1], ayatSilang: r[2] };
        }
      });
      window.gsRoute('getCashManagerBootstrap', {
        mode: 'fn',
        handler: async function () {
          var out = { success: true };
          try { out.paymentRequests = await _paymentReqArr(); } catch (e) { out.paymentRequests = []; }
          try { out.workOrders = await _woListData(); } catch (e) { out.workOrders = []; }
          try { out.bankAccounts = await _bankFromAkun(); } catch (e) { out.bankAccounts = []; }
          try { var kt = await supa.from('kategori_pengeluaran').select('nama').order('urutan'); out.kategori = (kt.data || []).map(function (r) { return r.nama; }); } catch (e) { out.kategori = []; }
          try { out.saldo = await _saldoAkun(); } catch (e) { out.saldo = { success: false }; }
          try { out.pemasukan = await _pemArr(); } catch (e) { out.pemasukan = []; }
          try { out.pengeluaran = await _pengArr(); } catch (e) { out.pengeluaran = []; }
          try { out.ayatSilang = await _ayatArr(); } catch (e) { out.ayatSilang = []; }
          return out;
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 7 — TULIS (write). Data BARU kini masuk Supabase, BUKAN Sheets.
      //  ⚠ Setelah ini, tambah/ubah data lewat aplikasi Vercel = ke Supabase.
      //  Jangan input data yang sama lewat app lama (Sheets) → nanti berbeda.
      //  Pilot: Master Customer (klien).
      // ═══════════════════════════════════════════════════════════════════════

      // ── Tambah customer (Customer.gs → simpanCustomer) ────────────────────
      window.gsRoute('simpanCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString(), perusahaan = (args[1] || '').toString(), telepon = (args[2] || '').toString(), alamat = (args[3] || '').toString();
          if (!nama) return { success: false, message: 'Nama klien tidak boleh kosong.' };
          var q = await _all('klien', 'id');   // ambil semua id → cari nomor terbesar
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^K(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var nextId = 'K' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('klien').insert({ id: nextId, nama_klien: nama, perusahaan: perusahaan, alamat: alamat, kontak: telepon });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Klien (' + nextId + ') berhasil ditambahkan!', newId: nextId };
        }
      });

      // ── Ubah customer (Customer.gs → editCustomer) ────────────────────────
      window.gsRoute('editCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), perusahaan = (args[2] || '').toString(), telepon = (args[3] || '').toString(), alamat = (args[4] || '').toString();
          if (!id) return { success: false, message: 'ID klien wajib.' };
          var up = await supa.from('klien').update({ nama_klien: nama, perusahaan: perusahaan, alamat: alamat, kontak: telepon }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID klien tidak ditemukan.' };
          return { success: true, message: 'Klien ' + id + ' berhasil diperbarui!' };
        }
      });

      // ── Hapus customer (Customer.gs → hapusCustomer) ──────────────────────
      window.gsRoute('hapusCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var del = await supa.from('klien').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID tidak ditemukan.' };
          return { success: true, message: 'Klien ' + id + ' berhasil dihapus.' };
        }
      });

      // Helper: info stok (qty + harga beli terakhir) untuk produk terkait stok.
      async function _stokInfo(stokId) {
        if (!stokId) return { qty: 0, harga: 0 };
        var q = await supa.from('stok').select('qty_tersedia,harga_beli_terakhir').eq('id_produk', stokId).maybeSingle();
        if (q.error || !q.data) return { qty: 0, harga: 0 };
        return { qty: Number(q.data.qty_tersedia) || 0, harga: Number(q.data.harga_beli_terakhir) || 0 };
      }

      // ── Supplier: simpan / edit / hapus ───────────────────────────────────
      window.gsRoute('simpanSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.nama) return { success: false, message: 'Nama supplier tidak boleh kosong.' };
          var q = await _all('supplier', 'id_supplier');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id_supplier || '').toString().match(/^S(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'S' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('supplier').insert({ id_supplier: id, nama: p.nama || '', pic: p.pic || '', telepon: p.telepon || '', email: p.email || '', alamat: p.alamat || '', catatan: p.catatan || '', status: 'Aktif', dibuat_oleh: p.dibuatOleh || '', dibuat_pada: new Date().toISOString(), nama_alias: p.alias || '' });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Supplier (' + id + ') berhasil ditambahkan!', newId: id };
        }
      });
      window.gsRoute('editSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID supplier wajib.' };
          var up = await supa.from('supplier').update({ nama: p.nama || '', pic: p.pic || '', telepon: p.telepon || '', email: p.email || '', alamat: p.alamat || '', catatan: p.catatan || '', status: p.status || '', diubah_oleh: p.diubahOleh || '', diubah_pada: new Date().toISOString(), nama_alias: p.alias || '' }).eq('id_supplier', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID supplier tidak ditemukan.' };
          return { success: true, message: 'Supplier ' + id + ' berhasil diperbarui!' };
        }
      });
      window.gsRoute('hapusSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var ref = await supa.from('purchase_order').select('no_po').eq('id_supplier', id).limit(1);
          if (!ref.error && ref.data && ref.data.length) return { success: false, message: 'Supplier ' + id + ' tidak dapat dihapus karena masih digunakan di Purchase Order.' };
          var del = await supa.from('supplier').delete().eq('id_supplier', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID supplier tidak ditemukan.' };
          return { success: true, message: 'Supplier ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Akun Pembayaran: simpan / edit / hapus ────────────────────────────
      window.gsRoute('simpanAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.namaAkun) return { success: false, message: 'Nama akun wajib diisi.' };
          var q = await _all('akun_pembayaran', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^AP(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'AP' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('akun_pembayaran').insert({ id: id, nama_akun: p.namaAkun, tipe: p.tipe || 'Bank', keterangan: p.keterangan || '', status: 'Aktif', dibuat_oleh: p.dibuatOleh || '', dibuat_pada: new Date().toISOString(), detail: p.detail || '' });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Akun ' + id + ' berhasil ditambahkan.', newId: id };
        }
      });
      window.gsRoute('editAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString();
          if (id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa diubah.' };
          var up = await supa.from('akun_pembayaran').update({ nama_akun: p.namaAkun, tipe: p.tipe || 'Bank', keterangan: p.keterangan || '', status: p.status || 'Aktif', detail: p.detail || '' }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID akun tidak ditemukan.' };
          return { success: true, message: 'Akun berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          if (id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa dihapus.' };
          var ref = await supa.from('pembayaran_po').select('id_bayar').eq('id_akun', id).limit(1);
          if (!ref.error && ref.data && ref.data.length) return { success: false, message: 'Akun sudah digunakan di riwayat pembayaran PO.' };
          var del = await supa.from('akun_pembayaran').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID akun tidak ditemukan.' };
          return { success: true, message: 'Akun berhasil dihapus.' };
        }
      });

      // ── Produk/Jasa: simpan / edit / hapus ────────────────────────────────
      window.gsRoute('simpanProduk', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString(), unit = (args[1] || '').toString(), harga = args[2], hpp = args[3], tipe = (args[4] || '').toString(), stokId = (args[5] || '').toString();
          if (!nama || !unit) return { success: false, message: 'Data nama/unit tidak boleh kosong.' };
          var q = await _all('produk', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^P(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'P' + ('000' + (maxNum + 1)).slice(-3);
          var hppFinal = Number(hpp) || 0, qty = 0;
          if (stokId) { var si = await _stokInfo(stokId); qty = si.qty; if (!hppFinal) hppFinal = si.harga; }
          var ins = await supa.from('produk').insert({ id: id, nama: nama, unit: unit, harga_satuan: Number(harga) || 0, hpp: hppFinal, tipe: tipe || '', stok_id: stokId || '', qty_tersedia: qty });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Produk ' + id + ' berhasil ditambahkan!', id: id };
        }
      });
      window.gsRoute('editProduk', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), unit = (args[2] || '').toString(), harga = args[3], hpp = args[4], tipe = (args[5] || '').toString(), stokId = (args[6] || '').toString();
          if (!id) return { success: false, message: 'ID produk wajib.' };
          var hppFinal = Number(hpp) || 0, qty = 0;
          if (stokId) { var si = await _stokInfo(stokId); qty = si.qty; if (!hppFinal) hppFinal = si.harga; }
          var up = await supa.from('produk').update({ nama: nama, unit: unit, harga_satuan: Number(harga) || 0, hpp: hppFinal, tipe: tipe || '', stok_id: stokId || '', qty_tersedia: qty }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID produk tidak ditemukan.' };
          return { success: true, message: 'Produk ' + id + ' berhasil diperbarui!' };
        }
      });
      // updateProdukKatalog = fungsi EDIT produk yang DIPAKAI form master
      // (editProduk di atas tak dipanggil frontend). Args: id,nama,unit,tipe,harga,hpp.
      window.gsRoute('updateProdukKatalog', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), unit = (args[2] || '').toString(), tipe = (args[3] || '').toString(), hargaJual = args[4], hpp = args[5];
          if (!nama || !unit) return { success: false, message: 'Nama/unit tidak boleh kosong.' };
          var up = await supa.from('produk').update({ nama: nama, unit: unit, harga_satuan: Number(hargaJual) || 0, hpp: Number(hpp) || 0, tipe: tipe || '' }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID produk tidak ditemukan.' };
          return { success: true, message: 'Item ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusProduk', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var del = await supa.from('produk').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID tidak ditemukan.' };
          return { success: true, message: 'Produk ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Simpan Bank Account (Settings.gs → saveBankAccounts) ──────────────
      //  Frontend kirim SELURUH daftar → sinkronkan tabel bank_account
      //  (upsert semua yang dikirim + hapus yang tak ada lagi).
      //  Simpan ke SATU master akun_pembayaran (Bank Account = akun kas).
      //  id baru → AP###. AP001 (Stok) & akun yang dipakai transaksi TIDAK dihapus.
      window.gsRoute('saveBankAccounts', {
        mode: 'fn',
        handler: async function (args) {
          var payload = Array.isArray(args[0]) ? args[0] : [];
          var cur = await _all('akun_pembayaran', 'id');
          if (cur.error) return { success: false, message: cur.error.message };
          var curIds = {}, maxNum = 0;
          (cur.data || []).forEach(function (r) { var id = (r.id || '').toString(); curIds[id] = true; var m = id.match(/^AP(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var keep = {};
          for (var i = 0; i < payload.length; i++) {
            var a = payload[i] || {};
            var id = (a.id || '').toString();
            if (!id || !/^AP\d+/i.test(id)) { maxNum++; id = 'AP' + ('000' + maxNum).slice(-3); } // id baru
            keep[id] = true;
            var label = (a.label || '').toString(), detail = (a.detail || '').toString();
            if (curIds[id]) { var u = await supa.from('akun_pembayaran').update({ nama_akun: label, detail: detail }).eq('id', id); if (u.error) return { success: false, message: u.error.message }; }
            else { var ins = await supa.from('akun_pembayaran').insert({ id: id, nama_akun: label, detail: detail, tipe: 'Bank', status: 'Aktif', dibuat_pada: new Date().toISOString() }); if (ins.error) return { success: false, message: ins.error.message }; }
          }
          // Hapus akun yang dibuang — lindungi AP001 & yang dipakai transaksi.
          var toCheck = (cur.data || []).map(function (r) { return (r.id || '').toString(); }).filter(function (id) { return id && id !== 'AP001' && !keep[id]; });
          for (var j = 0; j < toCheck.length; j++) {
            var idc = toCheck[j], used = false;
            var u1 = await supa.from('pemasukan').select('id_pemasukan').eq('id_akun', idc).limit(1); if (!u1.error && u1.data && u1.data.length) used = true;
            if (!used) { var u2 = await supa.from('pengeluaran').select('id_pengeluaran').eq('id_akun', idc).limit(1); if (!u2.error && u2.data && u2.data.length) used = true; }
            if (!used) { var u3 = await supa.from('pembayaran_po').select('id_bayar').eq('id_akun', idc).limit(1); if (!u3.error && u3.data && u3.data.length) used = true; }
            if (!used) await supa.from('akun_pembayaran').delete().eq('id', idc);
          }
          return { success: true, message: 'Bank Account berhasil disimpan.' };
        }
      });

      // ── Kategori pricelist: tambah / update / hapus ───────────────────────
      window.gsRoute('tambahKategori', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString().trim();
          if (!nama) return { success: false, message: 'Nama kategori wajib diisi.' };
          var ex = await supa.from('pricelist_kategori').select('nama').ilike('nama', nama).limit(1);
          if (!ex.error && ex.data && ex.data.length) return { success: false, message: 'Kategori "' + nama + '" sudah ada.' };
          var ins = await supa.from('pricelist_kategori').insert({ nama: nama });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Kategori "' + nama + '" ditambahkan.' };
        }
      });
      window.gsRoute('updateKategori', {
        mode: 'fn',
        handler: async function (args) {
          var oldNama = (args[0] || '').toString().trim(), newNama = (args[1] || '').toString().trim();
          if (!oldNama || !newNama) return { success: false, message: 'Nama kategori wajib.' };
          if (oldNama.toLowerCase() !== newNama.toLowerCase()) {
            var ex = await supa.from('pricelist_kategori').select('nama').ilike('nama', newNama).limit(1);
            if (!ex.error && ex.data && ex.data.length) return { success: false, message: 'Kategori "' + newNama + '" sudah ada.' };
          }
          var chk = await supa.from('pricelist_kategori').select('nama').eq('nama', oldNama).maybeSingle();
          if (!chk.data) return { success: false, message: 'Kategori tidak ditemukan.' };
          await supa.from('pricelist_kategori').insert({ nama: newNama });          // buat baru
          await supa.from('pricelist').update({ kategori: newNama }).eq('kategori', oldNama); // pindahkan item
          if (oldNama !== newNama) await supa.from('pricelist_kategori').delete().eq('nama', oldNama);
          return { success: true, message: 'Kategori diperbarui.' };
        }
      });
      window.gsRoute('hapusKategori', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString().trim();
          if (!nama) return { success: false, message: 'Nama kategori wajib.' };
          var used = await supa.from('pricelist').select('id').eq('kategori', nama);
          if (!used.error && used.data && used.data.length) return { success: false, message: 'Kategori dipakai ' + used.data.length + ' item pricelist — ubah item tersebut dulu.' };
          var del = await supa.from('pricelist_kategori').delete().eq('nama', nama);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Kategori "' + nama + '" dihapus.' };
        }
      });

      // ── Kategori Pengeluaran (Pengeluaran.gs → saveKategoriPengeluaran) ────
      window.gsRoute('saveKategoriPengeluaran', {
        mode: 'fn',
        handler: async function (args) {
          var list = Array.isArray(args[0]) ? args[0] : null;
          if (!list) return { success: false, message: 'Format kategori tidak valid.' };
          var seen = {}, clean = [];
          list.forEach(function (k) { var v = (k || '').toString().trim(); if (!v) return; var low = v.toLowerCase(); if (seen[low]) return; seen[low] = true; clean.push(v); });
          if (!clean.length) return { success: false, message: 'Minimal satu kategori harus diisi.' };
          await supa.from('kategori_pengeluaran').delete().neq('nama', ' '); // kosongkan
          var rows = clean.map(function (n, i) { return { nama: n, urutan: i + 1 }; });
          var ins = await supa.from('kategori_pengeluaran').insert(rows);
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Kategori pengeluaran berhasil disimpan.', list: clean };
        }
      });

      // ── Catatan WO (WorkOrder.gs → simpanCatatanWO) ───────────────────────
      window.gsRoute('simpanCatatanWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString(), catatan = (args[1] || '').toString(), who = (args[2] || 'Sales Executive').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var up = await supa.from('work_order_catatan').upsert({ no_wo: noWO, catatan: catatan, diupdate_oleh: who, diupdate_pada: new Date().toISOString() }, { onConflict: 'no_wo' });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Catatan tersimpan.' };
        }
      });

      // ── Jenis WO manual (WorkOrder.gs → setWorkOrderJenis) ────────────────
      window.gsRoute('setWorkOrderJenis', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim(), jenis = (args[1] || '').toString().trim(), oleh = (args[2] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          if (jenis && jenis !== 'Jasa' && jenis !== 'Material') return { success: false, message: 'Jenis tidak valid.' };
          if (!jenis) {
            var del = await supa.from('work_order_jenis_override').delete().eq('no_wo', noWO); // kembali Auto
            if (del.error) return { success: false, message: del.error.message };
          } else {
            var up = await supa.from('work_order_jenis_override').upsert({ no_wo: noWO, jenis_manual: jenis, diubah_oleh: oleh || '', diubah_pada: new Date().toISOString() }, { onConflict: 'no_wo' });
            if (up.error) return { success: false, message: up.error.message };
          }
          return { success: true, message: 'Jenis WO diperbarui menjadi ' + (jenis || 'Otomatis') + '.' };
        }
      });

      // Helper: normalisasi tanggal → 'YYYY-MM-DD' (untuk kolom date).
      function _isoDate(v) {
        var s = (v || '').toString().trim();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
        var d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) return d[3] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[1]).slice(-2);
        return null;
      }
      function _todayIso() {
        try { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; }; return g('year') + '-' + g('month') + '-' + g('day'); } catch (e) { return new Date().toISOString().slice(0, 10); }
      }

      // ── Pricelist item: tambah / update / hapus / set ready ────────────────
      window.gsRoute('tambahPricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.idSupplier) return { success: false, message: 'Supplier wajib dipilih.' };
          if (!p.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
          var q = await _all('pricelist', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^PL(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'PL' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('pricelist').insert({ id: id, id_supplier: p.idSupplier, kategori: p.kategori || '', nama_material: p.namaMaterial || '', spesifikasi: p.spesifikasi || '', merek: p.merek || '', satuan: p.satuan || '', harga_beli: Number(p.hargaBeli) || 0, termasuk_ppn: !!p.termasukPPN, lead_time: '', masa_berlaku_harga: '', dibuat_pada: new Date().toISOString(), ready: !!p.ready });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Item pricelist ' + id + ' ditambahkan.', id: id };
        }
      });
      window.gsRoute('updatePricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(); var p = args[1] || {};
          if (!id) return { success: false, message: 'ID item wajib.' };
          if (!p.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
          var upd = { kategori: p.kategori || '', nama_material: p.namaMaterial || '', spesifikasi: p.spesifikasi || '', merek: p.merek || '', satuan: p.satuan || '', harga_beli: Number(p.hargaBeli) || 0, dibuat_pada: new Date().toISOString() };
          if (p.idSupplier) upd.id_supplier = p.idSupplier;
          if (p.ready != null) upd.ready = !!p.ready;
          var up = await supa.from('pricelist').update(upd).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Item ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusPricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID item wajib.' };
          var del = await supa.from('pricelist').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Item pricelist dihapus.' };
        }
      });
      window.gsRoute('setPricelistReady', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), ready = !!args[1];
          if (!id) return { success: false, message: 'ID item wajib.' };
          var up = await supa.from('pricelist').update({ ready: ready }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Status ready diperbarui.' };
        }
      });

      // ── Ayat Silang: simpan / hapus ───────────────────────────────────────
      window.gsRoute('simpanAyatSilang', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var idAsal = (p.idAkunAsal || '').toString(), idTujuan = (p.idAkunTujuan || '').toString();
          if (!idAsal || !idTujuan) return { success: false, message: 'Akun asal & tujuan wajib dipilih.' };
          if (idAsal === idTujuan) return { success: false, message: 'Akun asal dan tujuan tidak boleh sama.' };
          if (idAsal === 'AP001' || idTujuan === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipakai untuk ayat silang.' };
          var jumlah = parseFloat(p.jumlah) || 0;
          if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          var ym = _todayIso().slice(0, 7).replace('-', ''); // yyyyMM
          var prefix = 'TF-' + ym + '-';
          var q = await _all('ayat_silang', 'id');
          var maxSeq = 0; (q.data || []).forEach(function (r) { var id = (r.id || '').toString(); if (id.indexOf(prefix) === 0) { var s = parseInt(id.slice(prefix.length), 10) || 0; if (s > maxSeq) maxSeq = s; } });
          var id = prefix + ('000' + (maxSeq + 1)).slice(-3);
          var ins = await supa.from('ayat_silang').insert({ id: id, tanggal: _isoDate(p.tanggal) || _todayIso(), id_akun_asal: idAsal, nama_asal: (p.namaAkunAsal || idAsal).toString(), id_akun_tujuan: idTujuan, nama_tujuan: (p.namaAkunTujuan || idTujuan).toString(), jumlah: jumlah, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString() });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Ayat silang ' + id + ' berhasil dicatat.', id: id };
        }
      });
      window.gsRoute('hapusAyatSilang', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID ayat silang wajib diisi.' };
          var del = await supa.from('ayat_silang').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Ayat silang tidak ditemukan.' };
          return { success: true, message: 'Ayat silang ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Template Paket: simpan / hapus ────────────────────────────────────
      window.gsRoute('simpanTemplatePaket', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), itemsJson = args[2], editId = (args[3] || '').toString().trim();
          if (!id) return { success: false, message: 'ID template wajib.' };
          var items; try { items = typeof itemsJson === 'string' ? JSON.parse(itemsJson || '[]') : (itemsJson || []); } catch (e) { items = []; }
          if (editId) {
            var up = await supa.from('template_paket').update({ id: id, nama_paket: nama, daftar_item: items }).eq('id', editId).select();
            if (up.error) return { success: false, message: up.error.message };
            if (up.data && up.data.length) return { success: true, message: 'Template ' + id + ' berhasil diperbarui!' };
            // editId tak ditemukan → lanjut tambah
          }
          var dup = await supa.from('template_paket').select('id').eq('id', id).maybeSingle();
          if (dup.data) return { success: false, message: 'ID Template ' + id + ' sudah digunakan.' };
          var ins = await supa.from('template_paket').insert({ id: id, nama_paket: nama, daftar_item: items });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Template ' + id + ' berhasil ditambahkan!' };
        }
      });
      window.gsRoute('hapusTemplatePaket', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          var del = await supa.from('template_paket').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Template tidak ditemukan.' };
          return { success: true, message: 'Template ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Schedule: tugas (tambah/edit/hapus/batch) + site engineer ─────────
      function _schTaskRow(p, id) {
        return { id: id, no_wo: (p.noWO || '').toString().trim(), nama_tugas: (p.namaTugas || '').toString().trim(), fase: (p.fase || '').toString(), tanggal_mulai: _schIso(p.mulai), tanggal_selesai: _schIso(p.selesai), progress: Math.max(0, Math.min(100, Number(p.progress) || 0)), warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.oleh || '').toString(), dibuat_pada: new Date().toISOString() };
      }
      window.gsRoute('saveScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!(p.noWO || '').toString().trim()) return { success: false, message: 'No WO wajib.' };
          if (!(p.namaTugas || '').toString().trim()) return { success: false, message: 'Nama tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var id = 'TSK-' + new Date().getTime();
          var ins = await supa.from('schedule_task').insert(_schTaskRow(p, id));
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Tugas ditambahkan.', id: id };
        }
      });
      window.gsRoute('updateScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var up = await supa.from('schedule_task').update({ nama_tugas: (p.namaTugas || '').toString(), fase: (p.fase || '').toString(), tanggal_mulai: mulai, tanggal_selesai: selesai, progress: Math.max(0, Math.min(100, Number(p.progress) || 0)), warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0, catatan: (p.catatan || '').toString() }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          return { success: true, message: 'Tugas diperbarui.' };
        }
      });
      window.gsRoute('saveScheduleTasksBatch', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!(p.noWO || '').toString().trim()) return { success: false, message: 'No WO wajib.' };
          var arr = p.tasks || []; if (!arr.length) return { success: false, message: 'Tidak ada tugas untuk ditambahkan.' };
          var t0 = new Date().getTime(), rows = [];
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {}; var nama = (it.namaTugas || '').toString().trim(); if (!nama) continue;
            var mulai = _schIso(it.mulai), selesai = _schIso(it.selesai);
            if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib untuk "' + nama + '".' };
            if (selesai < mulai) return { success: false, message: 'Tanggal selesai sebelum mulai untuk "' + nama + '".' };
            rows.push(_schTaskRow({ noWO: p.noWO, namaTugas: nama, fase: it.fase, mulai: it.mulai, selesai: it.selesai, progress: it.progress, warna: it.warna, urutan: it.urutan, catatan: it.catatan, oleh: p.oleh }, 'TSK-' + t0 + '-' + i));
          }
          if (!rows.length) return { success: false, message: 'Tidak ada tugas valid (nama kosong).' };
          var ins = await supa.from('schedule_task').insert(rows);
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: rows.length + ' tugas ditambahkan.', count: rows.length };
        }
      });
      window.gsRoute('hapusScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var del = await supa.from('schedule_task').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          return { success: true, message: 'Tugas dihapus.' };
        }
      });
      window.gsRoute('updateScheduleSiteEngineer', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim(), se = (args[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var up = await supa.from('schedule_project').update({ site_engineer: se }).eq('no_wo', noWO).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'WO tidak ditemukan.' };
          return { success: true, message: 'Site Engineer diperbarui.' };
        }
      });

      // ── Site Survey: update / hapus ───────────────────────────────────────
      window.gsRoute('updateSiteSurvey', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim(); var namaSite = (p.namaSite || '').toString().trim();
          if (!id) return { success: false, message: 'ID survey wajib.' };
          if (!namaSite) return { success: false, message: 'Nama Site wajib diisi.' };
          var cur = await supa.from('site_survey').select('no_wo,data').eq('id', id).maybeSingle();
          if (cur.error) return { success: false, message: cur.error.message };
          if (!cur.data) return { success: false, message: 'Survey tidak ditemukan.' };
          var ex = _jsonObj(cur.data.data);
          var dataObj = {
            dibuatOlehId: ex.dibuatOlehId || '', noWO: ex.noWO || cur.data.no_wo || '',
            arahBangunan: p.arahBangunan || '', tinggiBangunan: Number(p.tinggiBangunan) || 0,
            fotoBangunan: p.fotoBangunan || null, kelistrikan: p.kelistrikan || {},
            bos: p.bos || {}, atap: p.atap || {}, jalurKabel: p.jalurKabel || {}
          };
          var upd = { nama_site: namaSite, nama_pic: (p.namaPIC || '').toString(), no_telepon: (p.telepon || '').toString(), alamat: (p.alamat || '').toString(), latitude: (p.latitude != null ? Number(p.latitude) : null), longitude: (p.longitude != null ? Number(p.longitude) : null), data: dataObj };
          if (p.tanggalSurvey) { var t = _isoDate(p.tanggalSurvey); if (t) upd.tanggal_survey = t; }
          var up = await supa.from('site_survey').update(upd).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Survey tidak ditemukan.' };
          return { success: true, message: 'Site Survey ' + id + ' berhasil diperbarui.', id: id };
        }
      });
      window.gsRoute('hapusSiteSurvey', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var del = await supa.from('site_survey').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Survey tidak ditemukan.' };
          return { success: true, message: 'Site Survey ' + id + ' dihapus.' };
        }
      });

      // ── Schedule: daftar / keluarkan WO (project) ─────────────────────────
      window.gsRoute('addScheduleProject', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim(), addedBy = (args[1] || '').toString(), se = (args[2] || '').toString();
          if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
          var ex = await supa.from('schedule_project').select('no_wo').eq('no_wo', noWO).maybeSingle();
          if (ex.data) return { success: false, message: 'Work Order sudah ada di Schedule.' };
          var proj = '', klien = '';
          try { var wl = await _woListData(); var wo = wl.filter(function (w) { return w.noWO === noWO; })[0]; if (wo) { proj = wo.namaProject || ''; klien = wo.namaKlien || ''; } } catch (e) {}
          var ins = await supa.from('schedule_project').insert({ no_wo: noWO, nama_project: proj, nama_klien: klien, ditambahkan_oleh: addedBy, ditambahkan_pada: new Date().toISOString(), site_engineer: se });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Work Order ditambahkan ke Schedule.' };
        }
      });
      window.gsRoute('removeScheduleProject', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var del = await supa.from('schedule_project').delete().eq('no_wo', noWO).select();
          if (del.error) return { success: false, message: del.error.message };
          var removed = del.data && del.data.length > 0;
          return { success: removed, message: removed ? 'Dikeluarkan dari Schedule (tugas tidak dihapus).' : 'WO tidak ditemukan.' };
        }
      });

      // ── Assignment engineer (BOM/DED/QC) — ganti seluruh set penugasan ────
      //  CATATAN: notifikasi WA penugasan TIDAK ikut (itu integrasi Apps Script).
      async function _setAssignment(table, noWO, userIds, assignedBy) {
        noWO = (noWO || '').toString().trim();
        if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
        userIds = userIds || [];
        var uq = await supa.from('app_user').select('id,nama');
        var userMap = {}; (uq.data || []).forEach(function (u) { userMap[u.id] = u.nama; });
        var d = await supa.from(table).delete().eq('no_wo', noWO); if (d.error) return { success: false, message: d.error.message };
        var seen = {}, rows = [], when = new Date().toISOString();
        for (var j = 0; j < userIds.length; j++) {
          var uid = (userIds[j] || '').toString().trim(); if (!uid || seen[uid]) continue; seen[uid] = true;
          rows.push({ no_wo: noWO, id_user: uid, nama_user: userMap[uid] || uid, assigned_by: (assignedBy || '').toString(), assigned_at: when });
        }
        if (rows.length) { var ins = await supa.from(table).insert(rows); if (ins.error) return { success: false, message: ins.error.message }; }
        return { success: true, message: 'Penugasan diperbarui (' + Object.keys(seen).length + ' engineer).' };
      }
      window.gsRoute('setBOMAssignment', { mode: 'fn', handler: function (a) { return _setAssignment('bom_assignment', a[0], a[1], a[2]); } });
      window.gsRoute('setDEDAssignment', { mode: 'fn', handler: function (a) { return _setAssignment('ded_assignment', a[0], a[1], a[2]); } });
      window.gsRoute('setQCAssignment', { mode: 'fn', handler: function (a) { return _setAssignment('qc_assignment', a[0], a[1], a[2]); } });

      // ── DED: set wajib checklist ──────────────────────────────────────────
      window.gsRoute('setDEDWajib', {
        mode: 'fn',
        handler: async function (args) {
          var kode = (args[0] || '').toString().trim(), wajib = !!args[1];
          if (!kode) return { success: false, message: 'Kode wajib.' };
          var up = await supa.from('ded_checklist').update({ wajib: wajib }).eq('kode', kode).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Dokumen tidak ditemukan.' };
          return { success: true, message: 'Diperbarui.' };
        }
      });

      // ── DED/QC: tandai / batalkan selesai (project) ───────────────────────
      async function _tandaiSelesai(table, noWO, oleh, val) {
        noWO = (noWO || '').toString().trim();
        if (!noWO) return { success: false, message: 'No WO wajib.' };
        var upd = val
          ? { selesai_manual: true, ditandai_selesai_oleh: (oleh || '').toString(), ditandai_selesai_pada: new Date().toISOString() }
          : { selesai_manual: false, ditandai_selesai_oleh: '', ditandai_selesai_pada: null };
        var up = await supa.from(table).update(upd).eq('no_wo', noWO).select();
        if (up.error) return { success: false, message: up.error.message };
        if (!up.data || !up.data.length) return { success: false, message: 'WO tidak terdaftar.' };
        return { success: true };
      }
      window.gsRoute('tandaiDEDSelesai', { mode: 'fn', handler: async function (a) { var r = await _tandaiSelesai('ded_project', a[0], a[1], true); if (r.success) r.message = 'DED ' + (a[0] || '') + ' ditandai Approved.'; return r; } });
      window.gsRoute('batalkanDEDSelesai', { mode: 'fn', handler: async function (a) { var r = await _tandaiSelesai('ded_project', a[0], a[1], false); if (r.success) r.message = 'Status Approved DED dibatalkan.'; return r; } });
      window.gsRoute('tandaiQCSelesai', { mode: 'fn', handler: async function (a) { var r = await _tandaiSelesai('qc_project', a[0], a[1], true); if (r.success) r.message = 'QC ' + (a[0] || '') + ' ditandai selesai.'; return r; } });
      window.gsRoute('batalkanQCSelesai', { mode: 'fn', handler: async function (a) { var r = await _tandaiSelesai('qc_project', a[0], a[1], false); if (r.success) r.message = 'Status selesai QC dibatalkan.'; return r; } });

      // ── Tandai item N/A (DED/QC) — set status NA + aktivitas ──────────────
      async function _setItemNA(itemTable, filesCol, idPrefix, noWO, kode, isNA, oleh, okMsg) {
        noWO = (noWO || '').toString().trim(); kode = (kode || '').toString().trim();
        var f = await supa.from(itemTable).select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
        if (f.error) return { success: false, message: f.error.message };
        var found = f.data, whenIso = new Date().toISOString();
        if (isNA) {
          var naEv = { type: 'na', by: (oleh || '').toString(), at: _fmtTs(new Date()), note: '' };
          if (found) {
            var akt = _arr(found.aktivitas); akt.push(naEv);
            var up = await supa.from(itemTable).update({ status: 'NA', diupload_oleh: (oleh || '').toString(), diupload_pada: whenIso, aktivitas: akt }).eq('id', found.id);
            if (up.error) return { success: false, message: up.error.message };
          } else {
            var q = await _all(itemTable, 'id'); var maxNum = 0;
            var re = new RegExp('^' + idPrefix + '(\\d+)', 'i');
            (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(re); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
            var id = idPrefix + ('000' + (maxNum + 1)).slice(-3);
            var row = { id: id, no_wo: noWO, kode: kode, status: 'NA', diupload_oleh: (oleh || '').toString(), diupload_pada: whenIso, aktivitas: [naEv] };
            row[filesCol] = [];
            var ins = await supa.from(itemTable).insert(row);
            if (ins.error) return { success: false, message: ins.error.message };
          }
        } else if (found) {
          var files = _arr(found[filesCol]);
          var up2 = await supa.from(itemTable).update({ status: files.length ? 'Pending' : 'Belum Upload' }).eq('id', found.id);
          if (up2.error) return { success: false, message: up2.error.message };
        }
        return { success: true, message: okMsg };
      }
      window.gsRoute('setDEDItemNA', { mode: 'fn', handler: function (a) { return _setItemNA('ded_item', 'files', 'DEDI', a[0], a[1], a[2], a[3], 'Status dokumen diperbarui.'); } });
      window.gsRoute('setQCItemNA', { mode: 'fn', handler: function (a) { return _setItemNA('qc_item', 'foto', 'QCI', a[0], a[1], a[2], a[3], 'Status item diperbarui.'); } });

      // Helper: id berurut per-bulan (prefix-YYYYMM-###).
      async function _nextSeqId(table, idField, prefix) {
        var q = await _all(table, idField); var maxSeq = 0;
        (q.data || []).forEach(function (r) { var id = (r[idField] || '').toString(); if (id.indexOf(prefix) === 0) { var s = parseInt(id.slice(prefix.length), 10) || 0; if (s > maxSeq) maxSeq = s; } });
        return prefix + ('000' + (maxSeq + 1)).slice(-3);
      }

      // ── Cash: Pemasukan langsung (simpan/edit/hapus) ──────────────────────
      window.gsRoute('simpanPemasukanLangsung', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.kategori) return { success: false, message: 'Kategori pemasukan wajib dipilih.' };
          if (!p.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
          if (!p.idAkun) return { success: false, message: 'Akun penerima wajib dipilih.' };
          if (p.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pemasukan.' };
          var jumlah = parseFloat(p.jumlah) || 0; if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          var id = await _nextSeqId('pemasukan', 'id_pemasukan', 'IN-' + _todayIso().slice(0, 7).replace('-', '') + '-');
          var ins = await supa.from('pemasukan').insert({ id_pemasukan: id, tanggal: _isoDate(p.tanggal) || _todayIso(), sumber: 'Langsung', kategori: (p.kategori || '').toString(), id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), no_invoice_ref: (p.noRef || '').toString(), id_referensi: '', deskripsi: (p.deskripsi || '').toString(), jumlah: jumlah, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString(), diubah_oleh: '', diubah_pada: null });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Pemasukan ' + id + ' berhasil disimpan.', id: id };
        }
      });
      window.gsRoute('editPemasukanLangsung', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID Pemasukan wajib diisi.' };
          if (!p.kategori) return { success: false, message: 'Kategori pemasukan wajib dipilih.' };
          if (!p.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
          if (!p.idAkun) return { success: false, message: 'Akun penerima wajib dipilih.' };
          if (p.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pemasukan.' };
          var jumlah = parseFloat(p.jumlah) || 0; if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          var chk = await supa.from('pemasukan').select('sumber').eq('id_pemasukan', id).maybeSingle();
          if (!chk.data) return { success: false, message: 'Pemasukan tidak ditemukan.' };
          if ((chk.data.sumber || '') !== 'Langsung') return { success: false, message: 'Pemasukan bersumber "' + chk.data.sumber + '" tidak bisa diedit. Kelola dari sumbernya (mis. status invoice).' };
          var upd = { kategori: (p.kategori || '').toString(), id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), no_invoice_ref: (p.noRef || '').toString(), deskripsi: (p.deskripsi || '').toString(), jumlah: jumlah, catatan: (p.catatan || '').toString(), diubah_oleh: (p.dibuatOleh || '').toString(), diubah_pada: new Date().toISOString() };
          if (p.tanggal) { var t = _isoDate(p.tanggal); if (t) upd.tanggal = t; }
          var up = await supa.from('pemasukan').update(upd).eq('id_pemasukan', id).select();
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Pemasukan ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusPemasukan', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          var chk = await supa.from('pemasukan').select('sumber').eq('id_pemasukan', id).maybeSingle();
          if (!chk.data) return { success: false, message: 'Pemasukan tidak ditemukan.' };
          if ((chk.data.sumber || '') !== 'Langsung') return { success: false, message: 'Pemasukan bersumber "' + chk.data.sumber + '" tidak bisa dihapus di sini — batalkan dari sumbernya (mis. ubah status invoice ke Belum Lunas).' };
          var del = await supa.from('pemasukan').delete().eq('id_pemasukan', id);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Pemasukan ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Cash: Pengeluaran langsung (simpan/edit/hapus) ────────────────────
      window.gsRoute('simpanPengeluaranLangsung', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var noWO = (p.noWO || '').toString().trim(), kategori = (p.kategori || '').toString().trim();
          if (!noWO && !kategori) return { success: false, message: 'Kategori pengeluaran wajib dipilih untuk pengeluaran non-project.' };
          if (!p.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
          if (!p.idAkun) return { success: false, message: 'Akun pembayaran wajib dipilih.' };
          if (p.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih untuk pengeluaran langsung.' };
          var qty = parseFloat(p.qty) || 0, hs = parseFloat(p.hargaSatuan) || 0;
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (hs <= 0) return { success: false, message: 'Harga satuan harus lebih dari 0.' };
          if (noWO) {
            var wq = await supa.from('penawaran').select('status').eq('no_wo', noWO).limit(1);
            var st = (wq.data && wq.data[0]) ? (wq.data[0].status || '') : '';
            if (!st) return { success: false, message: 'Work Order tidak ditemukan.' };
            if (st === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa menambah pengeluaran.' };
          }
          var id = await _nextSeqId('pengeluaran', 'id_pengeluaran', 'EXP-' + _todayIso().slice(0, 7).replace('-', '') + '-');
          var ins = await supa.from('pengeluaran').insert({ id_pengeluaran: id, no_wo: noWO, tanggal: _isoDate(p.tanggal) || _todayIso(), sumber: 'Langsung', no_po: (p.noPO || '').toString(), id_referensi: '', id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), deskripsi: (p.deskripsi || '').toString(), qty: qty, satuan: (p.satuan || '').toString(), harga_satuan: hs, total: qty * hs, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString(), diubah_oleh: '', diubah_pada: null, kategori: (noWO ? '' : kategori) });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Pengeluaran ' + id + ' berhasil disimpan.', id: id };
        }
      });
      window.gsRoute('editPengeluaranLangsung', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID Pengeluaran wajib diisi.' };
          if (!p.deskripsi) return { success: false, message: 'Deskripsi wajib diisi.' };
          if (!p.idAkun) return { success: false, message: 'Akun pembayaran wajib dipilih.' };
          if (p.idAkun === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipilih.' };
          var qty = parseFloat(p.qty) || 0, hs = parseFloat(p.hargaSatuan) || 0;
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (hs <= 0) return { success: false, message: 'Harga satuan harus lebih dari 0.' };
          var chk = await supa.from('pengeluaran').select('sumber,no_wo').eq('id_pengeluaran', id).maybeSingle();
          if (!chk.data) return { success: false, message: 'Pengeluaran tidak ditemukan.' };
          if ((chk.data.sumber || '') !== 'Langsung') return { success: false, message: 'Pengeluaran bersumber "' + chk.data.sumber + '" tidak bisa diedit di sini.' };
          var noWO = (chk.data.no_wo || '').toString();
          var upd = { no_po: (p.noPO || '').toString(), id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), deskripsi: (p.deskripsi || '').toString(), qty: qty, satuan: (p.satuan || '').toString(), harga_satuan: hs, total: qty * hs, catatan: (p.catatan || '').toString(), kategori: (noWO ? '' : (p.kategori || '').toString()), diubah_oleh: (p.dibuatOleh || '').toString(), diubah_pada: new Date().toISOString() };
          if (p.tanggal) { var t = _isoDate(p.tanggal); if (t) upd.tanggal = t; }
          var up = await supa.from('pengeluaran').update(upd).eq('id_pengeluaran', id).select();
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Pengeluaran ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusPengeluaran', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          var chk = await supa.from('pengeluaran').select('sumber').eq('id_pengeluaran', id).maybeSingle();
          if (!chk.data) return { success: false, message: 'Pengeluaran tidak ditemukan.' };
          var sumber = (chk.data.sumber || '');
          if (sumber === 'Pembayaran PO') return { success: false, message: 'Pengeluaran bersumber Pembayaran PO tidak bisa dihapus di sini — hapus pembayarannya di detail PO.' };
          if (sumber === 'Penggunaan Stok') return { success: false, message: 'Pengeluaran bersumber Penggunaan Stok — batalkan penggunaan stoknya (belum bisa dari sini).' };
          var del = await supa.from('pengeluaran').delete().eq('id_pengeluaran', id);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Pengeluaran ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Invoice (finansial/multi-tabel) via EDGE FUNCTION invoice-ops ─────
      //  Aktif hanya bila ENABLE_EDGE_INVOICE = true (setelah deploy).
      if (ENABLE_EDGE_INVOICE) {
        window.gsRoute('simpanInvoice', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('invoice-ops', { body: { action: 'create', payload: a[0] || {} } });
            if (r.error) { console.error('[invoice-ops]', r.error); return { success: false, message: 'Gagal menyimpan invoice.' }; }
            return r.data;
          }
        });
        window.gsRoute('updateStatusBayarInvoice', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('invoice-ops', { body: { action: 'setStatus', idInvoice: a[0], statusBaru: a[1], bukti: a[2] || {} } });
            if (r.error) { console.error('[invoice-ops]', r.error); return { success: false, message: 'Gagal mengubah status bayar.' }; }
            return r.data;
          }
        });
        window.gsRoute('editInvoice', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('invoice-ops', { body: { action: 'edit', payload: a[0] || {} } });
            if (r.error) { console.error('[invoice-ops]', r.error); return { success: false, message: 'Gagal mengubah invoice.' }; }
            return r.data;
          }
        });
      }

      // ── Manajemen user (auth admin) via EDGE FUNCTION user-ops ────────────
      //  Aktif hanya bila ENABLE_EDGE_USER = true (setelah deploy user-ops).
      if (ENABLE_EDGE_USER) {
        window.gsRoute('simpanUser', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('user-ops', { body: { action: 'create', payload: { nama: a[0], username: a[1], password: a[2], role: a[3], leadId: a[4], noWa: a[5], email: a[6] } } });
            if (r.error) { console.error('[user-ops]', r.error); return { success: false, message: 'Gagal menyimpan user.' }; }
            return r.data;
          }
        });
        window.gsRoute('editUser', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('user-ops', { body: { action: 'edit', payload: { id: a[0], nama: a[1], username: a[2], password: a[3], role: a[4], aktif: a[5], targetBulanan: a[6], leadId: a[7], noWa: a[8], email: a[9] } } });
            if (r.error) { console.error('[user-ops]', r.error); return { success: false, message: 'Gagal mengubah user.' }; }
            return r.data;
          }
        });
        window.gsRoute('hapusUser', {
          mode: 'fn',
          handler: async function (a) {
            var r = await supa.functions.invoke('user-ops', { body: { action: 'delete', payload: { id: a[0] } } });
            if (r.error) { console.error('[user-ops]', r.error); return { success: false, message: 'Gagal menghapus user.' }; }
            return r.data;
          }
        });
      }

      // ── Upload file → Supabase Storage (ganti Google Drive) ───────────────
      //  Perlu bucket PUBLIK 'uploads' (lihat panduan). Kembalikan {fileId,
      //  fileUrl, fileName} sama seperti versi Drive.
      // Kompres gambar di browser (resize maks 1600px + JPEG 0.82) → hemat
      // storage 80-90%. Non-gambar dibiarkan. Kembalikan {base64, mime, name}.
      function _compressImage(base64, mime, name) {
        return new Promise(function (resolve) {
          if (!/^image\/(jpe?g|png|webp)/i.test(mime)) return resolve({ base64: base64, mime: mime, name: name });
          try {
            var img = new Image();
            img.onload = function () {
              try {
                var maxDim = 1600, w = img.width, h = img.height, scale = Math.min(1, maxDim / Math.max(w, h));
                var nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
                var c = document.createElement('canvas'); c.width = nw; c.height = nh;
                c.getContext('2d').drawImage(img, 0, 0, nw, nh);
                var durl = c.toDataURL('image/jpeg', 0.82);
                var b64 = durl.split(',')[1];
                if (b64 && b64.length < base64.length) { var nm = name.replace(/\.[^.]+$/, '') + '.jpg'; return resolve({ base64: b64, mime: 'image/jpeg', name: nm }); }
                resolve({ base64: base64, mime: mime, name: name }); // hasil lebih besar → pakai asli
              } catch (e) { resolve({ base64: base64, mime: mime, name: name }); }
            };
            img.onerror = function () { resolve({ base64: base64, mime: mime, name: name }); };
            img.src = 'data:' + mime + ';base64,' + base64;
          } catch (e) { resolve({ base64: base64, mime: mime, name: name }); }
        });
      }
      // Core: kompres (bila gambar) → unggah ke Storage → {ok,fileId,fileUrl,fileName}.
      async function _putStorage(folder, base64, mime, fileName) {
        var comp = await _compressImage(base64, mime, fileName);
        var bytes;
        try { var bin = atob(comp.base64); bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
        catch (e) { return { ok: false, message: 'Data file tidak valid.' }; }
        var safe = comp.name.replace(/[^\w.\-]/g, '_');
        var path = folder + '/' + Date.now() + '-' + Math.floor(Math.random() * 1e9) + '-' + safe;
        var up = await supa.storage.from('uploads').upload(path, bytes, { contentType: comp.mime, upsert: false });
        if (up.error) return { ok: false, message: 'Gagal unggah: ' + up.error.message };
        var pub = supa.storage.from('uploads').getPublicUrl(path);
        return { ok: true, fileId: path, fileUrl: (pub.data && pub.data.publicUrl) || '', fileName: comp.name };
      }
      async function _storageUpload(folder, args) {
        var p = args[0] || {};
        if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
        var r = await _putStorage(folder, p.base64Data.toString(), (p.mimeType || 'application/octet-stream').toString(), (p.fileName || 'file').toString());
        if (!r.ok) return { success: false, message: r.message };
        return { success: true, fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName };
      }
      window.gsRoute('uploadFileBuktiBayarInvoice', { mode: 'fn', handler: function (a) { return _storageUpload('bukti-bayar-invoice', a); } });
      window.gsRoute('uploadFileBuktiBayarPO', { mode: 'fn', handler: function (a) { return _storageUpload('bukti-bayar-po', a); } });
      window.gsRoute('uploadFileBuktiPenerimaanPO', { mode: 'fn', handler: function (a) { return _storageUpload('penerimaan-po', a); } });
      window.gsRoute('uploadFileInvoiceSupplierPO', { mode: 'fn', handler: function (a) { return _storageUpload('invoice-supplier-po', a); } });
      window.gsRoute('uploadFilePOQuotationSupplier', { mode: 'fn', handler: function (a) { return _storageUpload('quotation-supplier', a); } });

      // Site Survey foto: PURE upload (return {foto:{fileId,fileUrl}}) — disimpan
      // saat survey di-save (updateSiteSurvey).
      window.gsRoute('uploadSiteSurveyFoto', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var sid = (p.surveyId || '').toString().trim();
          if (!sid) return { success: false, message: 'ID survey wajib.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
          var field = (p.fieldKey || 'foto').toString().replace(/[^a-zA-Z0-9_-]/g, '');
          var r = await _putStorage('site-survey/' + sid.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), field + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          return { success: true, foto: { fileId: r.fileId, fileUrl: r.fileUrl } };
        }
      });

      // Helper: tambahkan file terunggah ke item DED/QC (foto/files) + aktivitas.
      async function _engAppendFiles(table, filesCol, idPrefix, noWO, kode, added, oleh) {
        var f = await supa.from(table).select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
        var found = f.data;
        var all = (found ? _arr(found[filesCol]) : []).concat(added);
        var evts = added.map(function (x) { return { type: 'upload', by: oleh, at: x.at, note: x.fileName }; });
        var whenIso = new Date().toISOString();
        if (found) {
          var upd = { status: 'Pending', diupload_oleh: oleh, diupload_pada: whenIso, aktivitas: _arr(found.aktivitas).concat(evts) };
          upd[filesCol] = all;
          var up = await supa.from(table).update(upd).eq('id', found.id);
          if (up.error) return { ok: false, message: up.error.message };
        } else {
          var q = await _all(table, 'id'); var mx = 0; var re = new RegExp('^' + idPrefix + '(\\d+)', 'i');
          (q.data || []).forEach(function (x) { var m = (x.id || '').toString().match(re); if (m) mx = Math.max(mx, parseInt(m[1], 10)); });
          var row = { id: idPrefix + ('000' + (mx + 1)).slice(-3), no_wo: noWO, kode: kode, status: 'Pending', diupload_oleh: oleh, diupload_pada: whenIso, aktivitas: evts };
          row[filesCol] = all;
          var ins = await supa.from(table).insert(row);
          if (ins.error) return { ok: false, message: ins.error.message };
        }
        return { ok: true, list: all };
      }

      // QC foto: single + batch
      window.gsRoute('uploadQCFoto', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noWO = (p.noWO || '').toString().trim(), kode = (p.kode || '').toString().trim(), oleh = (p.oleh || '').toString();
          if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
          var r = await _putStorage('qc/' + noWO.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), kode + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          var foto = { fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName, by: oleh, at: _fmtTs(new Date()) };
          var res = await _engAppendFiles('qc_item', 'foto', 'QCI', noWO, kode, [foto], oleh);
          if (!res.ok) return { success: false, message: res.message };
          return { success: true, message: 'Foto tersimpan.', foto: foto, status: 'Pending', foto_list: res.list };
        }
      });
      window.gsRoute('uploadQCFotoBatch', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noWO = (p.noWO || '').toString().trim(), kode = (p.kode || '').toString().trim(), oleh = (p.oleh || '').toString();
          var files = (p.files && p.files.length) ? p.files : [];
          if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
          if (!files.length) return { success: false, message: 'Tidak ada file untuk diupload.' };
          var added = [];
          for (var i = 0; i < files.length; i++) {
            var fl = files[i] || {}; if (!(fl.base64Data || '').toString()) continue;
            var r = await _putStorage('qc/' + noWO.replace(/[^\w.\-]/g, '_'), fl.base64Data.toString(), (fl.mimeType || 'image/jpeg').toString(), kode + '.jpg');
            if (!r.ok) return { success: false, message: r.message };
            added.push({ fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName, by: oleh, at: _fmtTs(new Date()) });
          }
          if (!added.length) return { success: false, message: 'Tidak ada file valid.' };
          var res = await _engAppendFiles('qc_item', 'foto', 'QCI', noWO, kode, added, oleh);
          if (!res.ok) return { success: false, message: res.message };
          return { success: true, message: added.length + ' foto tersimpan.', status: 'Pending', foto_list: res.list };
        }
      });
      window.gsRoute('hapusQCFoto', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), fileId = (a[2] || '').toString();
          var f = await supa.from('qc_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Item tidak ditemukan.' };
          var arr = _arr(f.data.foto).filter(function (x) { return x.fileId !== fileId; });
          var upd = { foto: arr }; if (!arr.length) upd.status = 'Belum Upload';
          var up = await supa.from('qc_item').update(upd).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true, message: 'Foto dihapus.', foto_list: arr };
        }
      });

      // DED dokumen: batch upload (WAJIB PDF) + hapus
      window.gsRoute('uploadDEDBatch', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noWO = (p.noWO || '').toString().trim(), kode = (p.kode || '').toString().trim(), oleh = (p.oleh || '').toString();
          var files = (p.files && p.files.length) ? p.files : [];
          if (!noWO || !kode) return { success: false, message: 'No WO & kode item wajib.' };
          if (!files.length) return { success: false, message: 'Tidak ada file untuk diupload.' };
          var added = [];
          for (var i = 0; i < files.length; i++) {
            var fl = files[i] || {}; var b64 = (fl.base64Data || '').toString(); if (!b64) continue;
            // Validasi PDF (magic %PDF) dari isi file.
            var ok = false; try { var head = atob(b64.slice(0, 8)); ok = head.charCodeAt(0) === 0x25 && head.charCodeAt(1) === 0x50 && head.charCodeAt(2) === 0x44 && head.charCodeAt(3) === 0x46; } catch (e) {}
            if (!ok) return { success: false, message: 'Hanya file PDF yang diperbolehkan (' + (fl.fileName || 'file') + ').' };
            var base = (fl.fileName || kode).toString().replace(/\.[a-zA-Z0-9]+$/, '');
            var r = await _putStorage('ded/' + noWO.replace(/[^\w.\-]/g, '_'), b64, 'application/pdf', kode + '-' + base + '.pdf');
            if (!r.ok) return { success: false, message: r.message };
            added.push({ fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName, by: oleh, at: _fmtTs(new Date()) });
          }
          if (!added.length) return { success: false, message: 'Tidak ada file valid.' };
          var res = await _engAppendFiles('ded_item', 'files', 'DEDI', noWO, kode, added, oleh);
          if (!res.ok) return { success: false, message: res.message };
          return { success: true, message: added.length + ' dokumen tersimpan.', status: 'Pending', file_list: res.list };
        }
      });
      window.gsRoute('hapusDEDFile', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), fileId = (a[2] || '').toString();
          var f = await supa.from('ded_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Item tidak ditemukan.' };
          var arr = _arr(f.data.files).filter(function (x) { return x.fileId !== fileId; });
          var upd = { files: arr }; if (!arr.length) upd.status = 'Belum Upload';
          var up = await supa.from('ded_item').update(upd).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true, message: 'Dokumen dihapus.', file_list: arr };
        }
      });

      // ── QC master: foto contoh subitem checklist (qc_checklist.contoh_foto) ─
      //  Kolom contoh_foto bertipe TEXT (JSON string) → tulis via JSON.stringify.
      window.gsRoute('uploadQCContohFoto', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var kode = (p.kode || '').toString().trim();
          if (!kode) return { success: false, message: 'Kode subitem wajib.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
          var f = await supa.from('qc_checklist').select('kode,contoh_foto').eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Subitem tidak ditemukan.' };
          var existing = _arr(f.data.contoh_foto);
          var r = await _putStorage('qc-contoh/' + kode.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), kode + '-contoh-' + (existing.length + 1) + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          existing.push({ fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName });
          var up = await supa.from('qc_checklist').update({ contoh_foto: JSON.stringify(existing) }).eq('kode', kode);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Foto contoh tersimpan.', contohFoto: existing };
        }
      });
      window.gsRoute('hapusQCContohFoto', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim(), fileId = (a[1] || '').toString().trim();
          var f = await supa.from('qc_checklist').select('kode,contoh_foto').eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Subitem tidak ditemukan.' };
          var arr = _arr(f.data.contoh_foto).filter(function (x) { return x.fileId !== fileId; });
          var up = await supa.from('qc_checklist').update({ contoh_foto: JSON.stringify(arr) }).eq('kode', kode);
          if (up.error) return { success: false, message: up.error.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true, message: 'Foto contoh dihapus.', contohFoto: arr };
        }
      });

      // Site Survey: hapus 1 foto terunggah (retake sebelum submit). fileId =
      //  path objek Storage (dari uploadSiteSurveyFoto). Data lama = id Drive →
      //  remove() gagal diam-diam (try/catch), sesuai perilaku lama.
      window.gsRoute('hapusSiteSurveyFoto', {
        mode: 'fn',
        handler: async function (a) {
          var fileId = (a[0] || '').toString().trim();
          if (!fileId) return { success: false, message: 'fileId wajib.' };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true };
        }
      });

      // ── Invoice/Kwitansi: hapus & edit sederhana (aman client) ────────────
      //  simpanInvoice / updateStatusBayarInvoice → Edge Function (finansial).
      window.gsRoute('hapusInvoice', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          var del = await supa.from('invoice').delete().eq('no_invoice', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Invoice tidak ditemukan.' };
          return { success: true, message: 'Invoice ' + id + ' dihapus.' };
        }
      });
      window.gsRoute('hapusKwitansi', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          var del = await supa.from('kwitansi').delete().eq('no_kwitansi', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Kwitansi tidak ditemukan.' };
          return { success: true, message: 'Kwitansi ' + id + ' dihapus.' };
        }
      });
      window.gsRoute('editKwitansi', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString();
          if (!id) return { success: false, message: 'ID kwitansi wajib.' };
          var jumlah = parseFloat(p.jumlah) || 0;
          if (jumlah <= 0) return { success: false, message: 'Jumlah kwitansi harus lebih dari 0.' };
          var upd = { terima_dari: (p.terimaDari || '').toString(), jumlah: jumlah, untuk_pembayaran: (p.untuk || '').toString(), metode: (p.metode || 'Transfer').toString(), catatan: (p.catatan || '').toString() };
          var t = _isoDate(p.tanggal); if (t) upd.tanggal = t;
          var up = await supa.from('kwitansi').update(upd).eq('no_kwitansi', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Kwitansi tidak ditemukan.' };
          return { success: true, message: 'Kwitansi ' + id + ' berhasil diperbarui!' };
        }
      });

      // ── Stok/Inventory (Inventory.gs → getStokList) via EDGE FUNCTION ─────
      //  qtyHold/qtyAvailable DIHITUNG di server (bukan kolom) → pakai Edge
      //  Function 'get-stok-list'. Aktif hanya bila ENABLE_EDGE_STOK = true.
      //  Balikan lama = ARRAY objek langsung (bukan {success,list}).
      if (ENABLE_EDGE_STOK) {
        window.gsRoute('getStokList', {
          mode: 'fn',
          handler: async function () {
            var r = await supa.functions.invoke('get-stok-list', { body: {} });
            if (r.error) { console.error('[get-stok-list]', r.error); return []; }
            return Array.isArray(r.data) ? r.data : []; // setia: array langsung
          }
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      //  M8 — TULIS transaksi: Penawaran, Stok, PO, BOM procurement, Pengiriman,
      //  Hand Over. Meniru logika Apps Script (efek samping stok/HPP/pengeluaran).
      //  CATATAN: setelah aktif, data tak lagi tersinkron ke Google Sheets lama.
      // ═══════════════════════════════════════════════════════════════════════
      var _ROMAN_MO = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      function _ym() { return _todayIso().slice(0, 7).replace('-', ''); }         // 'YYYYMM' (Asia/Jakarta)
      function _jkMonthYear() {
        var now = new Date(), mo = now.getMonth(), yr = now.getFullYear();
        try {
          var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' }).formatToParts(now);
          mo = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10) - 1;
          yr = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
        } catch (e) {}
        return { mo: mo, yr: yr };
      }
      // ID NNN/<mid>/<Roman>/<Year> per-bulan (mis. pembayaran PO, surat jalan).
      async function _nextRomanSeq(table, idField, mid) {
        var t = _jkMonthYear(), roman = _ROMAN_MO[t.mo], yr = t.yr;
        var q = await _all(table, idField), maxSeq = 0;
        var re = new RegExp('^(\\d+)/' + mid + '/' + roman + '/' + yr + '$');
        (q.data || []).forEach(function (r) { var m = (r[idField] || '').toString().match(re); if (m) { var n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; } });
        return ('00' + (maxSeq + 1)).slice(-3) + '/' + mid + '/' + roman + '/' + yr;
      }
      // Status WO (dari penawaran; '' bila WO tak ada).
      async function _woStatus(noWO) {
        if (!noWO) return '';
        var q = await supa.from('penawaran').select('status').eq('no_wo', noWO).limit(1);
        return (q.data && q.data[0]) ? (q.data[0].status || '') : '';
      }
      // Update/insert baris stok. hargaBeli=null → pertahankan harga lama.
      async function _updateStokEntry(idProduk, nama, satuan, qtyDelta, hargaBeli, nilaiDelta) {
        var g = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
        var nowIso = new Date().toISOString();
        if (g.data) {
          var newQty = (Number(g.data.qty_tersedia) || 0) + qtyDelta;
          var newHarga = (hargaBeli !== null && hargaBeli !== undefined) ? hargaBeli : (Number(g.data.harga_beli_terakhir) || 0);
          var nilai = Math.max(0, (Number(g.data.nilai_stok) || 0) + nilaiDelta);
          await supa.from('stok').update({ qty_tersedia: newQty, harga_beli_terakhir: newHarga, nilai_stok: nilai, terakhir_diubah_pada: nowIso }).eq('id_produk', idProduk);
          return newQty;
        }
        await supa.from('stok').insert({ id_produk: idProduk, nama_produk: nama, satuan: satuan, qty_tersedia: qtyDelta, harga_beli_terakhir: (hargaBeli || 0), nilai_stok: Math.max(0, nilaiDelta), terakhir_diubah_pada: nowIso });
        return qtyDelta;
      }
      async function _syncProdukQty(stokId, qtyBaru) { await supa.from('produk').update({ qty_tersedia: qtyBaru }).eq('stok_id', stokId); }
      async function _syncProdukHPP(idProduk, harga) { await supa.from('produk').update({ hpp: harga }).or('id.eq.' + idProduk + ',stok_id.eq.' + idProduk); }
      async function _ensureProdukStokLink(idProduk, stokId) { await supa.from('produk').update({ stok_id: stokId }).eq('id', idProduk).or('stok_id.is.null,stok_id.eq.'); }
      async function _getProdukStokId(idProduk) { var q = await supa.from('produk').select('stok_id').eq('id', idProduk).maybeSingle(); return q.data ? (q.data.stok_id || '') : ''; }
      // FIFO: bangun lot dari mutasi_stok (urut id_mutasi).
      async function _deriveLots(idProduk) {
        var q = await supa.from('mutasi_stok').select('qty_masuk,qty_keluar,harga_satuan').eq('id_produk', idProduk).order('id_mutasi');
        var lots = [];
        (q.data || []).forEach(function (r) {
          var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, h = Number(r.harga_satuan) || 0;
          if (masuk > 0) lots.push({ qty: masuk, harga: h });
          else if (keluar > 0) { var sisa = keluar; while (sisa > 0 && lots.length) { if (lots[0].qty <= sisa) { sisa -= lots[0].qty; lots.shift(); } else { lots[0].qty -= sisa; sisa = 0; } } }
        });
        return lots;
      }
      function _fifoCost(lots, qtyButuh) {
        var avail = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        if (avail < qtyButuh) return null;
        var sisa = qtyButuh, cost = 0;
        for (var i = 0; i < lots.length && sisa > 0; i++) { var ambil = Math.min(lots[i].qty, sisa); cost += ambil * lots[i].harga; sisa -= ambil; }
        return { totalQty: qtyButuh, totalCost: cost, hargaRataRata: qtyButuh > 0 ? cost / qtyButuh : 0 };
      }
      // Buat 1 baris pengeluaran → {ok, message, id}.
      async function _buatPengeluaran(o) {
        var id = await _nextSeqId('pengeluaran', 'id_pengeluaran', 'EXP-' + _ym() + '-');
        var qty = Number(o.qty) || 1, hs = Number(o.hargaSatuan) || 0;
        var total = (o.total != null) ? Number(o.total) : qty * hs;
        var ins = await supa.from('pengeluaran').insert({ id_pengeluaran: id, no_wo: (o.noWO || ''), tanggal: o.tanggal || _todayIso(), sumber: o.sumber || 'Langsung', no_po: (o.noPO || ''), id_referensi: (o.idReferensi || ''), id_akun: (o.idAkun || ''), nama_akun: (o.namaAkun || ''), deskripsi: (o.deskripsi || ''), qty: qty, satuan: (o.satuan || ''), harga_satuan: hs, total: total, catatan: (o.catatan || ''), dibuat_oleh: (o.dibuatOleh || ''), dibuat_pada: new Date().toISOString(), diubah_oleh: '', diubah_pada: null, kategori: (o.kategori || '') });
        return { ok: !ins.error, message: ins.error ? ins.error.message : '', id: id };
      }
      // Keluarkan stok (FIFO) → mutasi 'Penggunaan[ WO]' + (bila WO) pengeluaran otomatis akun Stok.
      async function _gunakanStokCore(noWO, idProduk, qty, tanggalIso, keterangan, namaUser) {
        qty = Number(qty) || 0;
        if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
        var g = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
        if (!g.data) return { success: false, message: 'Item stok "' + idProduk + '" tidak ditemukan.' };
        var saldoSaat = Number(g.data.qty_tersedia) || 0, namaProduk = g.data.nama_produk || idProduk;
        if (qty > saldoSaat) return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup. Tersedia: ' + saldoSaat };
        if (noWO && (await _woStatus(noWO)) === 'Closed') return { success: false, message: 'Work Order sudah Closed — stok tidak bisa digunakan.' };
        var lots = await _deriveLots(idProduk), biaya = _fifoCost(lots, qty);
        if (!biaya) return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup untuk penggunaan.' };
        var hargaPakai = Math.round(biaya.hargaRataRata);
        var saldoBaru = await _updateStokEntry(idProduk, namaProduk, g.data.satuan || '', -qty, null, -biaya.totalCost);
        var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
        await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: tanggalIso, id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: (noWO ? 'Penggunaan WO' : 'Penggunaan'), referensi: (noWO || ''), qty_masuk: 0, qty_keluar: qty, harga_satuan: hargaPakai, saldo_setelah: saldoBaru, keterangan: (keterangan || ''), dibuat_oleh: (namaUser || ''), dibuat_pada: new Date().toISOString() });
        await _syncProdukQty(idProduk, saldoBaru);
        if (noWO) { try { await _buatPengeluaran({ noWO: noWO, tanggal: tanggalIso, sumber: 'Penggunaan Stok', noPO: '', idReferensi: idMutasi, idAkun: 'AP001', namaAkun: 'Stok', deskripsi: 'Penggunaan stok: ' + namaProduk, qty: qty, satuan: (g.data.satuan || ''), hargaSatuan: hargaPakai, total: biaya.totalCost, catatan: (keterangan || ''), dibuatOleh: namaUser }); } catch (e) {} }
        return { success: true, idMutasi: idMutasi, hargaSatuan: hargaPakai, total: biaya.totalCost, message: 'Stok keluar.' };
      }
      // Rebuild seluruh stok dari mutasi (FIFO). Aman-FK: baris tanpa mutasi di-nol-kan, bukan dihapus.
      async function _rekalkulasiStokDariMutasi() {
        var mq = await _all('mutasi_stok', 'id_mutasi,id_produk,nama_produk,qty_masuk,qty_keluar,harga_satuan', function (q) { return q.order('id_mutasi'); });
        var sq = await _all('stok', 'id_produk,satuan'); var satuanMap = {}; (sq.data || []).forEach(function (r) { satuanMap[(r.id_produk || '').toString()] = r.satuan || ''; });
        var pq = await _all('produk', 'stok_id,unit'); (pq.data || []).forEach(function (r) { var sid = (r.stok_id || '').toString(); if (sid && !satuanMap[sid]) satuanMap[sid] = r.unit || ''; });
        var map = {};
        (mq.data || []).forEach(function (r) {
          var id = (r.id_produk || '').toString(); if (!id) return;
          if (!map[id]) map[id] = { lots: [], hargaTerakhir: 0, nama: '' };
          var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, h = Number(r.harga_satuan) || 0;
          if (r.nama_produk) map[id].nama = r.nama_produk;
          if (masuk > 0) { map[id].lots.push({ qty: masuk, harga: h }); if (h > 0) map[id].hargaTerakhir = h; }
          else if (keluar > 0) { var sisa = keluar; while (sisa > 0 && map[id].lots.length) { if (map[id].lots[0].qty <= sisa) { sisa -= map[id].lots[0].qty; map[id].lots.shift(); } else { map[id].lots[0].qty -= sisa; sisa = 0; } } }
        });
        var nowIso = new Date().toISOString(), ids = Object.keys(map).sort();
        var upserts = ids.map(function (id) { var info = map[id], qtyTotal = 0, nilaiTotal = 0; info.lots.forEach(function (l) { qtyTotal += l.qty; nilaiTotal += l.qty * l.harga; }); return { id_produk: id, nama_produk: info.nama || id, satuan: satuanMap[id] || '', qty_tersedia: qtyTotal, harga_beli_terakhir: info.hargaTerakhir, nilai_stok: nilaiTotal, terakhir_diubah_pada: nowIso }; });
        if (upserts.length) { var u = await supa.from('stok').upsert(upserts, { onConflict: 'id_produk' }); if (u.error) return { success: false, message: u.error.message }; }
        var allStok = await _all('stok', 'id_produk');
        var toZero = (allStok.data || []).map(function (r) { return (r.id_produk || '').toString(); }).filter(function (id) { return id && !map[id]; });
        if (toZero.length) await supa.from('stok').update({ qty_tersedia: 0, nilai_stok: 0, terakhir_diubah_pada: nowIso }).in('id_produk', toZero);
        return { success: true, message: 'Rekalkulasi selesai. ' + ids.length + ' produk diproses.' };
      }
      // Ketersediaan stok = qty − Σ(reserved − dikirim) atas semua bom_item.
      async function _stokAvailable(stokId) {
        var s = await supa.from('stok').select('qty_tersedia').eq('id_produk', stokId).maybeSingle();
        var qty = s.data ? (Number(s.data.qty_tersedia) || 0) : 0;
        var b = await _all('bom_item', 'qty_reserved,qty_dikirim', function (q) { return q.eq('stok_id', stokId); });
        var hold = 0; (b.data || []).forEach(function (r) { hold += Math.max(0, (Number(r.qty_reserved) || 0) - (Number(r.qty_dikirim) || 0)); });
        return { qty: qty, hold: hold, available: Math.max(0, qty - hold) };
      }
      function _bomDeriveProcStatus(qR, qBeli, qMenunggu, qBL) {
        var active = (qR > 0 ? 1 : 0) + (qBeli > 0 ? 1 : 0) + (qMenunggu > 0 ? 1 : 0) + (qBL > 0 ? 1 : 0);
        if (active === 0) return '';
        if (active > 1) return 'Sebagian';
        if (qR > 0) return 'Reserved';
        if (qBeli > 0) return 'Need Purchase';
        if (qMenunggu > 0) return 'Tunggu Beli';
        return 'Beli Langsung';
      }
      async function _bomEditGuard(noWO) {
        if (!noWO) return { ok: false, message: 'No WO wajib.' };
        var st = await _woStatus(noWO);
        if (!st) return { ok: false, message: 'Work Order tidak ditemukan.' };
        if (st === 'Closed') return { ok: false, message: 'Work Order sudah Closed — BOM terkunci.' };
        return { ok: true };
      }
      async function _kirimAlamatByWO(noWO) {
        try { var w = await supa.from('penawaran').select('klien_id').eq('no_wo', noWO).limit(1); var kid = (w.data && w.data[0]) ? w.data[0].klien_id : ''; if (!kid) return ''; var k = await supa.from('klien').select('alamat').eq('id', kid).maybeSingle(); return k.data ? (k.data.alamat || '') : ''; } catch (e) { return ''; }
      }
      async function _kirimCekRequestSelesai(noWO) {
        try {
          var rq = await supa.from('pengiriman_request').select('*').eq('no_wo', noWO).maybeSingle();
          if (!rq.data || (rq.data.status || '') !== 'Diminta') return;
          var reqItems = _arr(rq.data.items);
          var bq = await _all('bom_item', 'id,qty_reserved,qty_dikirim', function (q) { return q.eq('no_wo', noWO); });
          var bmap = {}; (bq.data || []).forEach(function (b) { bmap[(b.id || '').toString()] = { reserved: Number(b.qty_reserved) || 0, dikirim: Number(b.qty_dikirim) || 0 }; });
          var allDone = true;
          if (reqItems.length) reqItems.forEach(function (li) { var b = bmap[(li.bomItemId || '').toString()] || { reserved: 0, dikirim: 0 }; var target = Number(li.target) || 0; if (Math.min(target - b.dikirim, b.reserved - b.dikirim) > 0) allDone = false; });
          else (bq.data || []).forEach(function (b) { if (((Number(b.qty_reserved) || 0) - (Number(b.qty_dikirim) || 0)) > 0) allDone = false; });
          if (allDone) await supa.from('pengiriman_request').update({ status: 'Selesai' }).eq('no_wo', noWO);
        } catch (e) {}
      }
      async function _simpanPembayaranPO(pp) {
        var noPO = (pp.noPO || '').toString();
        var po = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
        if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
        var grandTotal = Number(po.data.grand_total) || 0, ppnNominal = Number(po.data.ppn_nominal) || 0;
        var noWOPO = (po.data.no_wo || '').toString(), namaSupplier = (po.data.nama_supplier || '').toString();
        if (noWOPO && (await _woStatus(noWOPO)) === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa mencatat pembayaran.' };
        var idBayar = await _nextRomanSeq('pembayaran_po', 'id_bayar', 'RGI/POP');
        var jumlah = parseFloat(pp.jumlah) || 0, tglIso = _isoDate(pp.tanggalBayar) || _todayIso();
        var insB = await supa.from('pembayaran_po').insert({ id_bayar: idBayar, no_po: noPO, tanggal_bayar: tglIso, id_akun: (pp.idAkun || ''), nama_akun: (pp.namaAkun || ''), jumlah: jumlah, catatan: (pp.catatan || ''), dibuat_oleh: (pp.dibuatOleh || ''), dibuat_pada: new Date().toISOString() });
        if (insB.error) return { success: false, message: insB.error.message };
        var allB = await _all('pembayaran_po', 'jumlah', function (q) { return q.eq('no_po', noPO); });
        var totalDibayar = 0; (allB.data || []).forEach(function (r) { totalDibayar += Number(r.jumlah) || 0; });
        var statusBayar = totalDibayar <= 0 ? 'Belum Dibayar' : (totalDibayar >= grandTotal ? 'Lunas' : 'Dibayar Sebagian');
        await supa.from('purchase_order').update({ status_bayar: statusBayar, total_dibayar: totalDibayar }).eq('no_po', noPO);
        if (noWOPO) {
          var ppnRatio = grandTotal > 0 ? ppnNominal / grandTotal : 0;
          var ppnPortion = Math.round(jumlah * ppnRatio), dppPortion = jumlah - ppnPortion;
          try {
            await _buatPengeluaran({ noWO: noWOPO, tanggal: tglIso, sumber: 'Pembayaran PO', noPO: noPO, idReferensi: idBayar, idAkun: (pp.idAkun || ''), namaAkun: (pp.namaAkun || ''), deskripsi: 'Pembayaran PO ' + noPO + ' — ' + namaSupplier + ' (DPP)', qty: 1, satuan: '', hargaSatuan: dppPortion, total: dppPortion, catatan: (pp.catatan || ''), dibuatOleh: (pp.dibuatOleh || ''), kategori: '' });
            if (ppnPortion > 0) await _buatPengeluaran({ noWO: '', tanggal: tglIso, sumber: 'Pembayaran PO', noPO: noPO, idReferensi: idBayar, idAkun: (pp.idAkun || ''), namaAkun: (pp.namaAkun || ''), deskripsi: 'PPN Pembayaran PO ' + noPO + ' — ' + namaSupplier, kategori: 'Pajak', qty: 1, satuan: '', hargaSatuan: ppnPortion, total: ppnPortion, catatan: (pp.catatan || ''), dibuatOleh: (pp.dibuatOleh || '') });
          } catch (e) {}
        }
        return { success: true, message: 'Pembayaran PO ' + idBayar + ' berhasil disimpan.', idBayar: idBayar };
      }

      // ── Group E: Penawaran ────────────────────────────────────────────────
      async function _nextWONumber() {
        var t = _jkMonthYear(), yy = String(t.yr).slice(-2);
        var q = await _all('penawaran', 'no_wo'); var maxSeq = 0;
        (q.data || []).forEach(function (r) { var val = (r.no_wo == null ? '' : r.no_wo).toString().trim(); if (val.length >= 4 && val.slice(0, 2) === yy) { var seq = parseInt(val.slice(2), 10); if (!isNaN(seq) && seq > maxSeq) maxSeq = seq; } });
        return yy + String(maxSeq + 1).padStart(3, '0');
      }
      window.gsRoute('hapusPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var noPen = (a[0] || '').toString();
          var del = await supa.from('penawaran').delete().eq('no_penawaran', noPen).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Penawaran tidak ditemukan.' };
          return { success: true, message: 'Penawaran ' + noPen + ' beserta ' + del.data.length + ' revisi berhasil dihapus.' };
        }
      });
      window.gsRoute('updateStatusPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var noPen = (a[0] || '').toString(); var rev = parseInt(a[1], 10); if (isNaN(rev)) rev = 0;
          var statusBaru = (a[2] || '').toString(); var extra = a[4] || {};
          var cur = await supa.from('penawaran').select('*').eq('no_penawaran', noPen).eq('rev', rev).maybeSingle();
          if (!cur.data) return { success: false, message: 'Penawaran tidak ditemukan.' };
          var row = cur.data, statusLama = (row.status || '').toString(), isWinLoss = (statusBaru === 'Deal' || statusBaru === 'Fail');
          var upd = { status: statusBaru, kode_lost: statusBaru === 'Fail' ? (extra.kodeLost || '') : '', kode_win: statusBaru === 'Deal' ? (extra.kodeWin || '') : '', lesson_learned: isWinLoss ? (extra.lessonLearned || '') : '', action: isWinLoss ? (extra.action || '') : '', catatan_fail: '', catatan_win: '' };
          var noWO = (row.no_wo || '').toString();
          if (statusBaru === 'Deal') {
            if (statusLama !== 'Deal') {
              if (!noWO) { noWO = await _nextWONumber(); upd.no_wo = noWO; }
              if (!row.tanggal_deal) upd.tanggal_deal = _todayIso();
              var invs = await _all('invoice', 'no_invoice,no_wo,no_penawaran', function (q) { return q.eq('no_penawaran', noPen); });
              var predeal = (invs.data || []).filter(function (x) { return !(x.no_wo || '').toString(); }).map(function (x) { return x.no_invoice; });
              if (predeal.length) await supa.from('invoice').update({ no_wo: noWO }).in('no_invoice', predeal);
            }
          } else {
            if (noWO) { upd.no_wo = ''; noWO = ''; }
            upd.tanggal_deal = null;
          }
          if (statusBaru === 'Fail') { if (statusLama !== 'Fail' && !row.tanggal_fail) upd.tanggal_fail = _todayIso(); }
          else upd.tanggal_fail = null;
          var up = await supa.from('penawaran').update(upd).eq('no_penawaran', noPen).eq('rev', rev);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Status diperbarui menjadi: ' + statusBaru, noWO: noWO };
        }
      });

      // ── Group B: Stok langsung ────────────────────────────────────────────
      window.gsRoute('editItemStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idStok = (p.idStok || '').toString().trim(), nama = (p.nama || '').toString().trim(), satuan = (p.satuan || '').toString().trim();
          if (!idStok) return { success: false, message: 'ID Stok wajib diisi.' };
          if (!nama) return { success: false, message: 'Nama item wajib diisi.' };
          if (!satuan) return { success: false, message: 'Satuan wajib diisi.' };
          var up = await supa.from('stok').update({ nama_produk: nama, satuan: satuan }).eq('id_produk', idStok).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID Stok tidak ditemukan.' };
          return { success: true, message: 'Item stok ' + idStok + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('editMutasiStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idMutasi = (p.idMutasi || '').toString().trim(), ket = (p.keterangan == null ? '' : p.keterangan).toString();
          if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
          var up = await supa.from('mutasi_stok').update({ keterangan: ket }).eq('id_mutasi', idMutasi).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
          return { success: true, message: 'Keterangan mutasi ' + idMutasi + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusMutasiStok', {
        mode: 'fn',
        handler: async function (a) {
          var idMutasi = (a[0] || '').toString().trim();
          if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
          var f = await supa.from('mutasi_stok').select('id_produk').eq('id_mutasi', idMutasi).maybeSingle();
          if (!f.data) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
          var idProduk = (f.data.id_produk || '').toString();
          var del = await supa.from('mutasi_stok').delete().eq('id_mutasi', idMutasi);
          if (del.error) return { success: false, message: del.error.message };
          var rk = await _rekalkulasiStokDariMutasi();
          if (!rk.success) return rk;
          if (idProduk) { var s = await supa.from('stok').select('qty_tersedia').eq('id_produk', idProduk).maybeSingle(); await _syncProdukQty(idProduk, s.data ? (Number(s.data.qty_tersedia) || 0) : 0); }
          return { success: true, message: 'Riwayat mutasi ' + idMutasi + ' berhasil dihapus & saldo stok disesuaikan.' };
        }
      });
      window.gsRoute('simpanPenerimaanTanpaPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var qty = Number(p.qty) || 0, harga = Number(p.hargaSatuan) || 0, tgl = _isoDate(p.tanggal), namaUser = (p.namaUser || '').toString();
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (!tgl) return { success: false, message: 'Tanggal wajib diisi.' };
          var idProduk = (p.idStok || p.idProduk || '').toString().trim();
          if (!idProduk && (p.namaBaru || '').toString().trim()) {
            idProduk = await _nextSeqId('stok', 'id_produk', 'STK-');
            await supa.from('stok').insert({ id_produk: idProduk, nama_produk: (p.namaBaru || '').toString().trim(), satuan: ((p.satuanBaru || '').toString().trim() || 'unit'), qty_tersedia: 0, harga_beli_terakhir: 0, nilai_stok: 0, terakhir_diubah_pada: new Date().toISOString() });
          }
          if (!idProduk) return { success: false, message: 'Item stok wajib dipilih atau nama item baru wajib diisi.' };
          var s = await supa.from('stok').select('nama_produk,satuan').eq('id_produk', idProduk).maybeSingle();
          if (!s.data) return { success: false, message: 'Item stok tidak ditemukan.' };
          var namaProduk = s.data.nama_produk || idProduk, satuanProduk = s.data.satuan || '';
          var updateHarga = !p.janganhUpdateHarga, hargaUntukStok = updateHarga ? harga : null;
          var saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, qty, hargaUntukStok, qty * harga);
          var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
          await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: tgl, id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: 'Penerimaan Non-PO', referensi: (p.referensi || '').toString(), qty_masuk: qty, qty_keluar: 0, harga_satuan: harga, saldo_setelah: saldoBaru, keterangan: (p.keterangan || '').toString(), dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          var idPT = await _nextSeqId('penerimaan_tanpa_po', 'id', 'PTNPO-' + _ym() + '-');
          await supa.from('penerimaan_tanpa_po').insert({ id: idPT, tanggal: tgl, id_produk: idProduk, nama_produk: namaProduk, qty: qty, harga_satuan: harga, id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), keterangan: (p.keterangan || '').toString(), update_harga: updateHarga, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          await _syncProdukQty(idProduk, saldoBaru);
          return { success: true, message: 'Penerimaan berhasil. Saldo: ' + saldoBaru + ' ' + satuanProduk };
        }
      });
      window.gsRoute('simpanPenyesuaianStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idProduk = (p.idStok || p.idProduk || '').toString().trim(), jenis = (p.jenis || '').toString(), qty = Number(p.qty) || 0, keterangan = (p.keterangan || '').toString().trim(), namaUser = (p.namaUser || '').toString();
          if (!idProduk) return { success: false, message: 'Produk wajib dipilih.' };
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (!keterangan) return { success: false, message: 'Keterangan wajib diisi untuk penyesuaian stok.' };
          if (jenis !== '+' && jenis !== '-') return { success: false, message: 'Jenis tidak valid.' };
          var s = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
          var saldoSaat = s.data ? (Number(s.data.qty_tersedia) || 0) : 0, hargaTerakhir = s.data ? (Number(s.data.harga_beli_terakhir) || 0) : 0;
          var namaProduk = s.data ? (s.data.nama_produk || idProduk) : idProduk, satuanProduk = s.data ? (s.data.satuan || '') : '';
          if (jenis === '-' && qty > saldoSaat) return { success: false, message: 'Stok tidak cukup. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk };
          var saldoBaru, hargaMutasi = hargaTerakhir;
          if (jenis === '+') saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, qty, null, qty * hargaTerakhir);
          else { var lots = await _deriveLots(idProduk), biaya = _fifoCost(lots, qty); if (!biaya) return { success: false, message: 'Stok tidak cukup untuk penyesuaian. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk }; hargaMutasi = Math.round(biaya.hargaRataRata); saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, -qty, null, -biaya.totalCost); }
          var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
          await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: _todayIso(), id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: (jenis === '+' ? 'Penyesuaian +' : 'Penyesuaian -'), referensi: '', qty_masuk: (jenis === '+' ? qty : 0), qty_keluar: (jenis === '-' ? qty : 0), harga_satuan: hargaMutasi, saldo_setelah: saldoBaru, keterangan: keterangan, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          await _syncProdukQty(idProduk, saldoBaru);
          return { success: true, message: 'Penyesuaian berhasil. Saldo baru: ' + saldoBaru + ' ' + satuanProduk };
        }
      });
      window.gsRoute('gunakanStok', {
        mode: 'fn',
        handler: async function (a) {
          return await _gunakanStokCore((a[0] || '').toString().trim(), (a[1] || '').toString().trim(), Number(a[2]) || 0, _isoDate(a[3]) || _todayIso(), (a[4] || '').toString(), (a[5] || '').toString());
        }
      });

      // ── Group A: Purchase Order (penerimaan + pembayaran) ─────────────────
      window.gsRoute('terimaPOItems', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noPO = (p.noPO || '').toString().trim(), items = Array.isArray(p.items) ? p.items : [], namaUser = (p.namaUser || '').toString();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var po = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (['Aktif', 'Diterima Sebagian', 'Menunggu Gudang', 'Menunggu Penerimaan Gudang'].indexOf(statusPO) < 0) return { success: false, message: 'Status PO (' + statusPO + ') tidak menerima penerimaan gudang.' };
          if (!items.length) return { success: false, message: 'Tidak ada item yang diterima.' };
          var poItemsQ = await _all('po_item', '*', function (q) { return q.eq('no_po', noPO); });
          var byId = {}; (poItemsQ.data || []).forEach(function (it) { byId[(it.id_item || '').toString()] = it; });
          for (var i = 0; i < items.length; i++) {
            var it = items[i], q = Number(it.qty) || 0; if (q <= 0) continue;
            var poi = byId[(it.idItem || '').toString()]; if (!poi) return { success: false, message: 'Item PO tidak ditemukan: ' + (it.idItem || '') };
            if (q > ((Number(poi.qty) || 0) - (Number(poi.qty_diterima) || 0))) return { success: false, message: 'Qty terima melebihi sisa untuk ' + (it.namaItem || poi.nama_item || '') };
          }
          var diterimaMap = {}, detailLog = [];
          for (var j = 0; j < items.length; j++) {
            var itm = items[j], qt = Number(itm.qty) || 0; if (qt <= 0) continue;
            var harga2 = Math.round(Number(itm.hargaBeli) || 0), idProduk2 = (itm.idProduk || '').toString();
            var idStokItem = (itm.idStok || '').toString(), namaProduk = (itm.namaItem || '').toString(), satuanProduk = (itm.satuan || '').toString();
            if (idProduk2) { var pr = await supa.from('produk').select('nama,unit').eq('id', idProduk2).maybeSingle(); if (pr.data) { namaProduk = pr.data.nama || namaProduk; satuanProduk = pr.data.unit || satuanProduk; } }
            if (!idStokItem) {
              if (idProduk2) { idStokItem = (await _getProdukStokId(idProduk2)) || ''; }
              if (!idStokItem) { idStokItem = await _nextSeqId('stok', 'id_produk', 'STK-'); await supa.from('stok').insert({ id_produk: idStokItem, nama_produk: (namaProduk || ('Item PO ' + (itm.idItem || ''))), satuan: (satuanProduk || 'unit'), qty_tersedia: 0, harga_beli_terakhir: 0, nilai_stok: 0, terakhir_diubah_pada: new Date().toISOString() }); }
            }
            var saldoBaru = await _updateStokEntry(idStokItem, namaProduk || idStokItem, satuanProduk, qt, harga2, qt * harga2);
            var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
            await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: _todayIso(), id_produk: idStokItem, nama_produk: (namaProduk || idStokItem), jenis_mutasi: 'Penerimaan PO', referensi: noPO, qty_masuk: qt, qty_keluar: 0, harga_satuan: harga2, saldo_setelah: saldoBaru, keterangan: 'Penerimaan dari PO ' + noPO + ' (harga DPP excl. PPN)', dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
            if (idProduk2) { await _ensureProdukStokLink(idProduk2, idStokItem); await _syncProdukHPP(idProduk2, harga2); }
            await _syncProdukQty(idStokItem, saldoBaru);
            var old = byId[(itm.idItem || '').toString()];
            diterimaMap[(itm.idItem || '').toString()] = (Number((old && old.qty_diterima) || 0)) + qt;
            detailLog.push({ namaItem: (itm.namaItem || (old && old.nama_item) || ''), qty: qt, satuan: satuanProduk, catatan: (itm.catatan || '') });
          }
          for (var idItem in diterimaMap) { if (!diterimaMap.hasOwnProperty(idItem)) continue; await supa.from('po_item').update({ qty_diterima: diterimaMap[idItem] }).eq('id_item', idItem); }
          var refreshed = await _all('po_item', 'qty,qty_diterima', function (q) { return q.eq('no_po', noPO); });
          var rows = refreshed.data || [];
          var allDiterima = rows.length > 0 && rows.every(function (r) { return (Number(r.qty_diterima) || 0) >= (Number(r.qty) || 0); });
          var adaDiterima = rows.some(function (r) { return (Number(r.qty_diterima) || 0) > 0; });
          var newStatus = allDiterima ? 'Diterima' : (adaDiterima ? 'Diterima Sebagian' : statusPO);
          await supa.from('purchase_order').update({ status_po: newStatus, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (detailLog.length) { var idLog = 'RCV-' + Date.now() + '-' + Math.floor(Math.random() * 1000); await supa.from('penerimaan_po_log').insert({ id_log: idLog, no_po: noPO, tanggal: _todayIso(), mode: 'Gudang', jumlah_item: detailLog.length, detail_item: detailLog, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString(), bukti_file_id: (p.buktiFileId || ''), bukti_file_url: (p.buktiFileUrl || ''), bukti_file_nama: (p.buktiFileName || '') }); }
          return { success: true, message: 'Penerimaan berhasil. Status PO: ' + newStatus };
        }
      });
      window.gsRoute('terimaPOKirimLangsung', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noPO = (p.noPO || '').toString().trim(), items = Array.isArray(p.items) ? p.items : [], namaUser = (p.namaUser || '').toString();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var po = await supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (['Aktif', 'Diterima Sebagian'].indexOf(statusPO) < 0) return { success: false, message: 'Status PO (' + statusPO + ') tidak bisa terima kirim langsung.' };
          var poItemsQ = await _all('po_item', '*', function (q) { return q.eq('no_po', noPO); });
          var byId = {}; (poItemsQ.data || []).forEach(function (it) { byId[(it.id_item || '').toString()] = it; });
          for (var i = 0; i < items.length; i++) { var it = items[i], q = Number(it.qty) || 0; if (q <= 0) continue; var poi = byId[(it.idItem || '').toString()]; if (!poi) return { success: false, message: 'Item PO tidak ditemukan: ' + (it.idItem || '') }; if (q > ((Number(poi.qty) || 0) - (Number(poi.qty_diterima) || 0))) return { success: false, message: 'Qty terima melebihi sisa untuk ' + (it.namaItem || poi.nama_item || '') }; }
          var detailLog = [];
          for (var j = 0; j < items.length; j++) {
            var itm = items[j], qt = Number(itm.qty) || 0;
            if (qt <= 0) { if ((itm.catatan || '')) detailLog.push({ namaItem: (itm.namaItem || ''), qty: 0, satuan: '', catatan: (itm.catatan || '') }); continue; }
            var poi2 = byId[(itm.idItem || '').toString()], baru = (Number(poi2.qty_diterima) || 0) + qt;
            await supa.from('po_item').update({ qty_diterima: baru }).eq('id_item', (itm.idItem || '').toString());
            byId[(itm.idItem || '').toString()].qty_diterima = baru;
            detailLog.push({ namaItem: (itm.namaItem || poi2.nama_item || ''), qty: qt, satuan: (itm.satuan || ''), catatan: (itm.catatan || '') });
          }
          var refreshed = await _all('po_item', 'qty,qty_diterima', function (q) { return q.eq('no_po', noPO); });
          var rows = refreshed.data || [];
          var statusBaru = (rows.length > 0 && rows.every(function (r) { return (Number(r.qty_diterima) || 0) >= (Number(r.qty) || 0); })) ? 'Diterima' : 'Diterima Sebagian';
          await supa.from('purchase_order').update({ status_po: statusBaru, diubah_oleh: namaUser, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (detailLog.length) { var idLog = 'RCV-' + Date.now() + '-' + Math.floor(Math.random() * 1000); await supa.from('penerimaan_po_log').insert({ id_log: idLog, no_po: noPO, tanggal: _todayIso(), mode: 'Langsung', jumlah_item: detailLog.length, detail_item: detailLog, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString(), bukti_file_id: (p.buktiFileId || ''), bukti_file_url: (p.buktiFileUrl || ''), bukti_file_nama: (p.buktiFileName || '') }); }
          return { success: true, message: 'Penerimaan langsung berhasil. Status PO: ' + statusBaru + '.' };
        }
      });
      window.gsRoute('approvePembayaranPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var idReq = (p.idReq || '').toString().trim(), namaAkun = (p.namaAkun || '').toString(), idAkun = (p.idAkun || '').toString(), buktiUrl = (p.buktiFileUrl || '').toString();
          if (!idReq) return { success: false, message: 'ID request wajib.' };
          if (!namaAkun) return { success: false, message: 'Akun pembayaran wajib dipilih.' };
          if (!buktiUrl) return { success: false, message: 'Bukti pembayaran wajib diunggah.' };
          var rq = await supa.from('po_payment_request').select('*').eq('id_request', idReq).maybeSingle();
          if (!rq.data) return { success: false, message: 'Request tidak ditemukan.' };
          if ((rq.data.status || '') !== 'Menunggu') return { success: false, message: 'Request sudah diproses (status: ' + (rq.data.status || '') + ').' };
          var noPO = (rq.data.no_po || '').toString(), reqNoWO = (rq.data.no_wo || '').toString(), reqKeterangan = (rq.data.nama_supplier || '').toString(), jumlah = Number(rq.data.jumlah) || 0, reqKategori = (rq.data.kategori_non_po || '').toString();
          var approvedBy = (p.approvedBy || '').toString(), tglIso = _isoDate(p.tanggalBayar) || _todayIso(), catatanExtra = (p.catatan || '').toString();
          var up = await supa.from('po_payment_request').update({ status: 'Disetujui', nama_akun: namaAkun, diapprove_oleh: approvedBy, tanggal_approve: tglIso, bukti_file_id: (p.buktiFileId || ''), bukti_file_url: buktiUrl, bukti_file_nama: (p.buktiFileName || '') }).eq('id_request', idReq);
          if (up.error) return { success: false, message: up.error.message };
          var catatanPay = 'Approved dari request ' + idReq + (catatanExtra ? (' — ' + catatanExtra) : '');
          var rollback = async function () { await supa.from('po_payment_request').update({ status: 'Menunggu', nama_akun: '', diapprove_oleh: '', tanggal_approve: null, bukti_file_id: '', bukti_file_url: '', bukti_file_nama: '' }).eq('id_request', idReq); };
          var res;
          if (!noPO) {
            if (!idAkun || idAkun === 'AP001') { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Akun pembayaran tidak valid.' }; }
            if (jumlah <= 0) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Jumlah harus lebih dari 0.' }; }
            if (reqNoWO) { var st = await _woStatus(reqNoWO); if (!st) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Work Order tidak ditemukan.' }; } if (st === 'Closed') { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Work Order sudah Closed.' }; } }
            var exp = await _buatPengeluaran({ noWO: reqNoWO, tanggal: tglIso, sumber: 'Langsung', noPO: '', idReferensi: '', idAkun: idAkun, namaAkun: namaAkun, deskripsi: reqKeterangan || ('Pembayaran tanpa PO ' + idReq), qty: 1, satuan: 'paket', hargaSatuan: jumlah, total: jumlah, catatan: catatanPay, dibuatOleh: approvedBy, kategori: (reqNoWO ? '' : reqKategori) });
            res = exp.ok ? { success: true } : { success: false, message: exp.message };
          } else {
            res = await _simpanPembayaranPO({ noPO: noPO, tanggalBayar: tglIso, idAkun: idAkun, namaAkun: namaAkun, jumlah: jumlah, catatan: catatanPay, dibuatOleh: approvedBy });
          }
          if (!res.success) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: ' + (res.message || '') }; }
          return { success: true, message: (noPO ? ('Pembayaran PO ' + noPO) : 'Pembayaran (tanpa PO)') + ' sebesar Rp ' + jumlah.toLocaleString('id-ID') + ' berhasil disetujui dan dicatat.' };
        }
      });
      window.gsRoute('tolakRequestPembayaranPO', {
        mode: 'fn',
        handler: async function (a) {
          var idReq = (a[0] || '').toString().trim(), namaUser = (a[1] || '').toString(), catatanTolak = (a[2] || '').toString().trim();
          if (!catatanTolak) return { success: false, message: 'Catatan penolakan wajib diisi.' };
          var rq = await supa.from('po_payment_request').select('status').eq('id_request', idReq).maybeSingle();
          if (!rq.data) return { success: false, message: 'Request tidak ditemukan.' };
          if ((rq.data.status || '') !== 'Menunggu') return { success: false, message: 'Request sudah diproses (status: ' + (rq.data.status || '') + ').' };
          var up = await supa.from('po_payment_request').update({ status: 'Ditolak', diapprove_oleh: namaUser, tanggal_approve: _todayIso(), catatan_tolak: catatanTolak }).eq('id_request', idReq);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Request ' + idReq + ' ditolak.' };
        }
      });
      window.gsRoute('hapusPO', {
        mode: 'fn',
        handler: async function (a) {
          var noPO = (a[0] || '').toString().trim();
          var po = await supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          if ((po.data.status_po || '') !== 'Aktif') return { success: false, message: 'Hanya PO berstatus Aktif yang dapat dihapus.' };
          var pay = await supa.from('pembayaran_po').select('id_bayar').eq('no_po', noPO).limit(1);
          if (pay.data && pay.data.length) return { success: false, message: 'PO tidak dapat dihapus karena sudah memiliki data pembayaran.' };
          var delI = await supa.from('po_item').delete().eq('no_po', noPO);
          if (delI.error) return { success: false, message: delI.error.message };
          var delP = await supa.from('purchase_order').delete().eq('no_po', noPO);
          if (delP.error) return { success: false, message: delP.error.message };
          return { success: true, message: 'Purchase Order ' + noPO + ' berhasil dihapus.' };
        }
      });

      // ── Group C: BOM procurement (hold logis; tanpa mutasi stok fisik) ─────
      window.gsRoute('prosesBOMProcurement', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), p = a[1] || {};
          if (!id) return { success: false, message: 'ID material wajib.' };
          var row = await supa.from('bom_item').select('*').eq('id', id).maybeSingle();
          if (!row.data) return { success: false, message: 'Material tidak ditemukan.' };
          var it = row.data, noWO = (it.no_wo || '').toString();
          if ((it.status || '') !== 'Approved') return { success: false, message: 'Hanya material yang sudah di-Approve Lead yang bisa diproses procurement.' };
          var guard = await _bomEditGuard(noWO); if (!guard.ok) return { success: false, message: guard.message };
          if ((Number(it.qty_dikirim) || 0) > 0 || (it.kirim_ref || '').toString()) return { success: false, message: 'Material sudah dalam proses pengiriman — tidak bisa mengubah reserve.' };
          var Q = Number(it.qty) || 0, qMenunggu = Number(it.qty_menunggu_bl) || 0, qBL = Number(it.qty_beli_langsung) || 0;
          var effQ = Math.max(0, Q - qMenunggu - qBL), oleh = (p.oleh || '').toString(), idStok = (p.idStok || '').toString().trim();
          var qtyReserved = Number(p.qtyReserved) || 0; if (qtyReserved < 0) qtyReserved = 0; if (qtyReserved > effQ) qtyReserved = effQ;
          if (qtyReserved > 0) {
            if (!idStok) return { success: false, message: 'Pilih item stok untuk qty yang di-reserve.' };
            var av = await _stokAvailable(idStok);
            var ownHold = ((it.stok_id || '') === idStok) ? Math.max(0, (Number(it.qty_reserved) || 0) - (Number(it.qty_dikirim) || 0)) : 0;
            var availForThis = av.available + ownHold;
            if (qtyReserved > availForThis) return { success: false, message: 'Stok "' + idStok + '" tidak cukup untuk dialokasikan. Tersedia: ' + availForThis + '.' };
          }
          var qtyBeli = Math.max(0, effQ - qtyReserved), procStatus = _bomDeriveProcStatus(qtyReserved, qtyBeli, qMenunggu, qBL);
          var up = await supa.from('bom_item').update({ proc_status: procStatus, stok_id: (qtyReserved > 0 ? idStok : ''), qty_reserved: qtyReserved, mutasi_reserved: '', qty_beli: qtyBeli, diproses_oleh: oleh, diproses_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          var msg = 'Dialokasikan: ' + procStatus + (qtyReserved > 0 ? (' · reserve ' + qtyReserved) : '') + (qtyBeli > 0 ? (' · perlu beli ' + qtyBeli) : '');
          return { success: true, message: msg, procStatus: procStatus, qtyReserved: qtyReserved, qtyBeli: qtyBeli, idStok: (qtyReserved > 0 ? idStok : '') };
        }
      });
      window.gsRoute('tandaiBeliLangsung', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
          if (!id) return { success: false, message: 'ID material wajib.' };
          var row = await supa.from('bom_item').select('*').eq('id', id).maybeSingle();
          if (!row.data) return { success: false, message: 'Material tidak ditemukan.' };
          var it = row.data;
          if ((it.status || '') !== 'Approved') return { success: false, message: 'Hanya material Approved yang bisa diproses.' };
          var guard = await _bomEditGuard((it.no_wo || '').toString()); if (!guard.ok) return { success: false, message: guard.message };
          var qtyBeli = Number(it.qty_beli) || 0;
          if (qtyBeli <= 0) return { success: false, message: 'Tidak ada sisa yang perlu dibeli.' };
          var qR = Number(it.qty_reserved) || 0, qBL = Number(it.qty_beli_langsung) || 0, qMenunggu = (Number(it.qty_menunggu_bl) || 0) + qtyBeli;
          var st = _bomDeriveProcStatus(qR, 0, qMenunggu, qBL);
          var up = await supa.from('bom_item').update({ proc_status: st, qty_beli: 0, qty_menunggu_bl: qMenunggu, diproses_oleh: oleh, diproses_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Ditandai beli langsung: ' + qtyBeli + '. Menunggu penerimaan PO.' };
        }
      });
      window.gsRoute('batalkanBOMProcurement', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
          if (!id) return { success: false, message: 'ID material wajib.' };
          var row = await supa.from('bom_item').select('*').eq('id', id).maybeSingle();
          if (!row.data) return { success: false, message: 'Material tidak ditemukan.' };
          var it = row.data;
          if (!(it.proc_status || '').toString() && (Number(it.qty_reserved) || 0) === 0) return { success: false, message: 'Material belum diproses procurement.' };
          if ((Number(it.qty_dikirim) || 0) > 0 || (it.kirim_ref || '').toString()) return { success: false, message: 'Material sudah dalam proses pengiriman — tidak bisa membatalkan reserve.' };
          var Qb = Number(it.qty) || 0, qMen = Number(it.qty_menunggu_bl) || 0, qBLg = Number(it.qty_beli_langsung) || 0, sisaBeli = Math.max(0, Qb - qMen - qBLg);
          var st = _bomDeriveProcStatus(0, sisaBeli, qMen, qBLg);
          var up = await supa.from('bom_item').update({ proc_status: st, stok_id: '', qty_reserved: 0, mutasi_reserved: '', qty_beli: sisaBeli, diproses_oleh: oleh, diproses_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Reserve (alokasi) dibatalkan.' };
        }
      });
      window.gsRoute('batalTandaiBeliLangsung', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
          if (!id) return { success: false, message: 'ID material wajib.' };
          var row = await supa.from('bom_item').select('*').eq('id', id).maybeSingle();
          if (!row.data) return { success: false, message: 'Material tidak ditemukan.' };
          var it = row.data;
          var guard = await _bomEditGuard((it.no_wo || '').toString()); if (!guard.ok) return { success: false, message: guard.message };
          var qMenunggu = Number(it.qty_menunggu_bl) || 0;
          if (qMenunggu <= 0) return { success: false, message: 'Tidak ada qty menunggu pembelian langsung.' };
          var qR = Number(it.qty_reserved) || 0, qBL = Number(it.qty_beli_langsung) || 0, qtyBeli = (Number(it.qty_beli) || 0) + qMenunggu;
          var st = _bomDeriveProcStatus(qR, qtyBeli, 0, qBL);
          var up = await supa.from('bom_item').update({ proc_status: st, qty_beli: qtyBeli, qty_menunggu_bl: 0, diproses_oleh: oleh, diproses_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Tanda beli langsung dibatalkan.' };
        }
      });

      // ── Group D: Pengiriman + Hand Over ───────────────────────────────────
      window.gsRoute('prosesKirim', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noWO = (p.noWO || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var reqQ = await supa.from('pengiriman_request').select('status').eq('no_wo', noWO).maybeSingle();
          if (!reqQ.data || (reqQ.data.status || '') !== 'Diminta') return { success: false, message: 'Tidak ada request pengiriman aktif untuk WO ini.' };
          var guard = await _bomEditGuard(noWO); if (!guard.ok) return { success: false, message: guard.message };
          var reqItems = Array.isArray(p.items) ? p.items : [];
          if (!reqItems.length) return { success: false, message: 'Pilih item & qty yang dikirim.' };
          var noSJ = await _nextRomanSeq('pengiriman', 'no_surat_jalan', 'RGI/SJ'), tgl = _isoDate(p.tanggal) || _todayIso(), lines = [];
          for (var i = 0; i < reqItems.length; i++) {
            var ri = reqItems[i], bomId = (ri.bomItemId || '').toString(), qty = Number(ri.qty) || 0;
            var br = await supa.from('bom_item').select('*').eq('id', bomId).maybeSingle(); if (!br.data) continue;
            var b = br.data, reserved = Number(b.qty_reserved) || 0, dikirim = Number(b.qty_dikirim) || 0, sisa = reserved - dikirim; if (sisa <= 0) continue;
            if (qty > sisa) qty = sisa;
            var idStok = (b.stok_id || '').toString(); if (!idStok) continue;
            var res = await _gunakanStokCore(noWO, idStok, qty, tgl, 'Pengiriman ' + noSJ + ' — ' + (b.nama_material || ''), (p.oleh || '').toString());
            if (!res || res.success === false) return { success: false, message: 'Gagal keluarkan stok "' + idStok + '": ' + ((res && res.message) || '') };
            var refOld = (b.kirim_ref || '').toString();
            await supa.from('bom_item').update({ qty_dikirim: dikirim + qty, kirim_ref: (refOld ? refOld + ';' + noSJ : noSJ) }).eq('id', bomId);
            lines.push({ bomItemId: bomId, namaMaterial: (b.nama_material || ''), merek: (b.merek || ''), satuan: (b.satuan || ''), qty: qty, idStok: idStok, hargaSatuan: res.hargaSatuan, total: res.total, mutasiId: res.idMutasi });
          }
          if (!lines.length) return { success: false, message: 'Tidak ada item valid untuk dikirim.' };
          var alamat = (p.alamat || '').toString() || (await _kirimAlamatByWO(noWO)), idKirim = 'SJ-' + Date.now();
          var insK = await supa.from('pengiriman').insert({ id_kirim: idKirim, no_surat_jalan: noSJ, no_wo: noWO, tanggal_kirim: tgl, status: 'Dikirim', dikirim_oleh: (p.oleh || '').toString(), dikirim_pada: new Date().toISOString(), alamat: alamat, kendaraan: (p.kendaraan || '').toString(), driver: (p.driver || '').toString(), catatan: (p.catatan || '').toString(), items: lines, diterima_oleh: '', diterima_pada: null, bukti_file_id: '', bukti_file_url: '', bukti_file_name: '' });
          if (insK.error) return { success: false, message: insK.error.message };
          await _kirimCekRequestSelesai(noWO);
          return { success: true, message: 'Surat Jalan ' + noSJ + ' dibuat. Stok keluar & HPP tercatat.', noSuratJalan: noSJ, idKirim: idKirim };
        }
      });
      window.gsRoute('terimaPengiriman', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idKirim = (p.idKirim || '').toString().trim();
          if (!idKirim) return { success: false, message: 'ID Kirim wajib.' };
          var k = await supa.from('pengiriman').select('*').eq('id_kirim', idKirim).maybeSingle();
          if (!k.data) return { success: false, message: 'Surat jalan tidak ditemukan.' };
          if ((k.data.status || '') !== 'Dikirim') return { success: false, message: 'Surat jalan tidak berstatus Dikirim.' };
          var up = await supa.from('pengiriman').update({ status: 'Diterima', diterima_oleh: (p.oleh || '').toString(), diterima_pada: new Date().toISOString(), bukti_file_id: (p.buktiFileId || '').toString(), bukti_file_url: (p.buktiFileUrl || '').toString().trim(), bukti_file_name: (p.buktiFileName || '').toString() }).eq('id_kirim', idKirim);
          if (up.error) return { success: false, message: up.error.message };
          var lines = _arr(k.data.items);
          for (var i = 0; i < lines.length; i++) { var li = lines[i], bomId = (li.bomItemId || '').toString(); if (!bomId) continue; var qtyL = Number(li.qty) || 0; var br = await supa.from('bom_item').select('qty_diterima').eq('id', bomId).maybeSingle(); if (!br.data) continue; await supa.from('bom_item').update({ qty_diterima: (Number(br.data.qty_diterima) || 0) + qtyL }).eq('id', bomId); }
          return { success: true, message: 'Surat Jalan ' + (k.data.no_surat_jalan || '') + ' ditandai Diterima di lokasi.' };
        }
      });
      window.gsRoute('batalRequestPengiriman', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          var sj = await supa.from('pengiriman').select('id_kirim').eq('no_wo', noWO).limit(1);
          if (sj.data && sj.data.length) return { success: false, message: 'Sudah ada surat jalan untuk WO ini — request tidak bisa dibatalkan.' };
          var rq = await supa.from('pengiriman_request').select('no_wo').eq('no_wo', noWO).maybeSingle();
          if (!rq.data) return { success: false, message: 'Request tidak ditemukan.' };
          var up = await supa.from('pengiriman_request').update({ status: 'Dibatalkan' }).eq('no_wo', noWO);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Request pengiriman dibatalkan.' };
        }
      });
      window.gsRoute('scheduleHandOver', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noWO = (p.noWO || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var tanggal = _isoDate(p.tanggal); if (!tanggal) return { success: false, message: 'Tanggal jadwal wajib.' };
          var waktu = (p.waktu || '').toString().trim(); if (!waktu) return { success: false, message: 'Waktu jadwal wajib diisi.' };
          var mode = (p.mode || '').toString(); if (mode !== 'Online' && mode !== 'Offline') return { success: false, message: 'Pilih mode Online/Offline.' };
          var link = (p.link || '').toString().trim(), lokasi = (p.lokasi || '').toString().trim();
          if (mode === 'Online' && !link) return { success: false, message: 'Isi link meeting untuk mode Online.' };
          if (mode === 'Offline' && !lokasi) return { success: false, message: 'Isi lokasi hand over.' };
          var ho = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
          if (!ho.data) return { success: false, message: 'Request Hand Over belum ada untuk WO ini.' };
          var st = (ho.data.status || ''); if (st !== 'Diminta' && st !== 'Dijadwalkan') return { success: false, message: 'Hand Over tidak bisa dijadwalkan (status ' + st + ').' };
          var upd = { status: 'Dijadwalkan', tgl_jadwal: tanggal, waktu: waktu, mode: mode, link_meet: (mode === 'Online' ? link : ''), lokasi: (mode === 'Offline' ? lokasi : ''), peserta: (p.peserta || '').toString(), catatan_undangan: (p.catatan || '').toString(), dijadwalkan_oleh: (p.oleh || '').toString(), dijadwalkan_pada: new Date().toISOString() };
          if ((p.meetEventId || '').toString()) upd.meet_event_id = (p.meetEventId || '').toString();
          var up = await supa.from('hand_over').update(upd).eq('no_wo', noWO);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Hand Over WO ' + noWO + ' dijadwalkan.' };
        }
      });
      window.gsRoute('batalHandOver', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var ho = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
          if (!ho.data) return { success: false, message: 'Hand Over tidak ditemukan.' };
          if ((ho.data.status || '') === 'Selesai') return { success: false, message: 'Hand Over sudah Selesai, tidak bisa dibatalkan.' };
          var up = await supa.from('hand_over').update({ status: 'Batal' }).eq('no_wo', noWO);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Hand Over WO ' + noWO + ' dibatalkan.' };
        }
      });

      // ── Group G: Config Syarat & Ketentuan (app_config) ───────────────────
      //  Aman dimigrasi karena hanya memengaruhi DEFAULT form penawaran (TC per
      //  dokumen tersimpan di kolomnya sendiri). WA & tanda tangan/DocSign TIDAK
      //  dimigrasi di sini — pengirim WA & generator PDF masih di Apps Script
      //  (memindah tulisnya saja → config di Supabase tapi konsumen baca lama).
      var _TC_FIELDS = [
        { key: 'material_status', label: 'Status Material' },
        { key: 'dp_status', label: 'Down Payment' },
        { key: 'term_pay', label: 'Term 2 Payment' },
        { key: 'final_pay', label: 'Final Payment' },
        { key: 'delivery_time', label: 'Pengiriman' },
        { key: 'delivery_cond', label: 'Kondisi Pengiriman' },
        { key: 'warranty', label: 'Garansi Material' },
        { key: 'bonus', label: 'Paket Bonus' }
      ];
      var _TC_DEFAULTS = {
        material_status: ['Ready Stock', 'Indent', '-'],
        dp_status: ['From PO', 'Cover GIRO 30 days', '-'],
        term_pay: ['Material On Site', 'Before Shipping', '-'],
        final_pay: ['After BAST', 'Before Shipping', '-'],
        delivery_time: ['Days After PO', 'Weeks After PO', '-'],
        delivery_cond: ['Franco SBY/JKT', 'DDP Site', '-'],
        warranty: ['Back to Back from Manufacture', 'Exclude', '-'],
        bonus: ['-', 'Free Packing', 'Free Shipping Cost']
      };
      window.gsRoute('getTCOptions', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_config').select('value').eq('key', 'TC_OPTIONS').maybeSingle();
          var opts = (q.data && q.data.value) ? q.data.value : {};
          if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = {}; } }
          if (!opts || typeof opts !== 'object') opts = {};
          _TC_FIELDS.forEach(function (f) { if (!opts[f.key]) opts[f.key] = _TC_DEFAULTS[f.key] || ['-']; });
          return { success: true, fields: _TC_FIELDS, options: opts };
        }
      });
      window.gsRoute('saveTCOptions', {
        mode: 'fn',
        handler: async function (a) {
          var payload = a[0] || {};
          var up = await supa.from('app_config').upsert({ key: 'TC_OPTIONS', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Syarat & Ketentuan berhasil disimpan.' };
        }
      });

      // ── CATATAN untuk modul berikutnya (BELUM di-override) ─────────────────
      //  Fungsi berikut punya FIELD HITUNGAN / agregasi / logika multi-tabel,
      //  JANGAN dibuat `supa.from(...)` mentah — pindahkan sebagai EDGE FUNCTION
      //  / RPC (milestone berikutnya). Sementara tetap lewat Apps Script:
      //   • getWorkOrderList / getWorkOrderDashboard → gabung penawaran+klien+WO,
      //     hitung jenisWO/hpp/margin
      //   • get*Dashboard (BOM/DED/QC), get*SummaryByWO → agregasi
      //   • getFinanceReportData, getSalesReportData, getLaporanProfitabilitas,
      //     getLaporanKeuntunganBulanan, getRealisasiHPP → laporan/agregasi
      //   • getCashManagerBootstrap, getSaldoAkun, getDetailKasProjectWO → hitung
      //   • get*Bundle / get*InitialData → gabungan banyak tabel (bootstrap)
      //   • getKategoriPengeluaran, getBankAccounts, getWAConfig, *PdfB64, dll →
      //     dari ScriptProperties / Drive (bukan tabel) → tetap di Apps Script
      //  Lihat migrasi/edge-functions/ + PANDUAN-EDGE-FUNCTIONS.md.

      console.log('[supabase-overrides] aktif — login + master data + baca (M5 b1-b9 + M6 WO+HPP+BOM+QC+DED+dashboards) memakai Supabase.');
    })
    .catch(function (e) { console.error('[supabase-overrides] gagal memuat supabase-js:', e); });
})();
