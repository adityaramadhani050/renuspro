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

      // Helper bersama: daftar invoice (dipakai getInvoiceList & getKwitansiInitialData).
      async function _invoiceList() {
        var q = await supa.from('invoice').select('*');
        if (q.error) { console.error('[invoiceList]', q.error); return []; }
        var kwMap = {};
        var kq = await supa.from('kwitansi').select('no_kwitansi,no_invoice');
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
          _safe(supa.from('penawaran').select('no_wo,nama_project'))
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
            .select('id,nama_akun,tipe,keterangan,status,dibuat_oleh,dibuat_pada').order('id');
          if (q.error) return _fail(q.error);
          return {
            success: true,
            list: (q.data || []).map(function (r) {
              return {
                id: r.id || '', namaAkun: r.nama_akun || '', tipe: r.tipe || '',
                keterangan: r.keterangan || '', status: r.status || '',
                dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
                locked: (r.id === 'AP001')
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
          var q = await supa.from('kwitansi').select('*');
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
          var pq = await supa.from('penawaran').select('no_wo,nama_project');
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
          var q = await supa.from('mutasi_stok').select('*').order('id_mutasi');
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
          var q = await supa.from('po_payment_request').select('*').order('id_request');
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
              _safe(supa.from('penawaran').select('no_penawaran'))
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
          var q = await supa.from('penawaran').select('*').order('no_penawaran').order('rev');
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
          var q = await supa.from('pemasukan').select('*');
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
            _safe(supa.from('pengeluaran').select('*')),
            _safe(supa.from('penawaran').select('no_wo,nama_project,klien_id')),
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
            _safe(supa.from('bom_item').select('id,no_wo,kategori,nama_material,merek,satuan,stok_id,qty_reserved,qty_dikirim')),
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
      window.gsRoute('getWorkOrderList', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('work_order').select('*')),
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
      });

      // ── Realisasi HPP & Margin per WO (WorkOrder.gs → getRealisasiHPP) ────
      //  Semua sumber difilter per-WO (data kecil) → aman di klien.
      window.gsRoute('getRealisasiHPP', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = args[0] ? args[0].toString().trim() : '';
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
            _safe(supa.from('bom_item').select('no_wo,kategori,status,proc_status'))
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
