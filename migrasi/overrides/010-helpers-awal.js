
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
          if (r.error) {
            // Bedakan kunci API salah (config) dari kredensial salah — jangan
            // menampilkan "password salah" padahal sebenarnya anon key invalid.
            var _em = (r.error.message || '').toLowerCase();
            if (r.error.status === 401 || _em.indexOf('api key') !== -1 || _em.indexOf('invalid api') !== -1) {
              console.error('[login] Supabase menolak API key:', r.error);
              return { success: false, message: 'Konfigurasi Supabase (anon key) tidak valid. Periksa secret SUPABASE_ANON_KEY (harus key "anon public", bukan service_role, dan tersalin penuh).' };
            }
            console.warn('[login] signIn gagal:', r.error.message);
            return { success: false, message: 'Email atau password salah.' };
          }
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
        // Detail klien untuk PDF invoice (perusahaan/alamat/kontak) — peta by id & nama.
        var klienById = {}, klienByNama = {};
        var cq = await _all('klien', 'id,nama_klien,perusahaan,alamat,kontak');
        if (!cq.error) (cq.data || []).forEach(function (k) {
          klienById[k.id] = k;
          if (k.nama_klien) klienByNama[k.nama_klien] = k;
        });
        var list = (q.data || []).map(function (r) {
          var kd = klienById[r.klien_id] || klienByNama[r.nama_klien] || {};
          return {
            id: r.no_invoice || '', noWO: r.no_wo || '', noPenawaran: r.no_penawaran || '',
            tanggal: _fmtTgl(r.tanggal), jenis: r.jenis || 'Penuh',
            persen: parseFloat(r.persen) || 0, noPO: r.no_po || '', tglPO: _fmtTgl(r.tgl_po),
            klienId: r.klien_id || '', namaKlien: r.nama_klien || '', namaProject: r.nama_project || '',
            perusahaanKlien: kd.perusahaan || '', alamatKlien: kd.alamat || '', kontakKlien: kd.kontak || '',
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
