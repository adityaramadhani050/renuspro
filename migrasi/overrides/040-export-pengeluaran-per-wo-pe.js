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
