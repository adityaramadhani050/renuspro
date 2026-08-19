      // ── Project Schedule: writes ke Supabase + Baseline/Deviasi (Fase 1) ──
      //  Sebelumnya tulis schedule masih proxy Apps Script; dipindah ke Supabase
      //  agar konsisten dgn baca (getScheduleWOList/ByWO) + siap fitur deviasi.
      var _SCH_FASE_BOBOT_DEFAULT = { 'Hand Over': 2, 'Engineering': 10, 'Pengadaan': 20, 'Pengiriman': 8, 'Kontruksi': 50, 'Finishing': 10 };
      async function _schFaseBobot() {
        try {
          var q = await supa.from('app_config').select('value').eq('key', 'SCHEDULE_FASE_BOBOT').maybeSingle();
          var v = (q.data && q.data.value) || null;
          if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
          if (v && typeof v === 'object' && Object.keys(v).length) return v;
        } catch (e) {}
        return _SCH_FASE_BOBOT_DEFAULT;
      }

      function _schTaskId(i) { return 'TSK-' + Date.now() + (i != null ? '-' + i : ''); }
      function _schClampPct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }

      function _schAddDays(iso, n) { try { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } catch (e) { return iso; } }
      // Progres RENCANA sebuah tugas pada tanggal `today` (linear dari baseline).
      function _schPlannedProgress(t, today) {
        var m = t.baselineMulai || t.mulai, s = t.baselineSelesai || t.selesai;
        if (!m || !s || !today) return 0;
        if (today < m) return 0;
        if (today >= s) return 100;
        var tot = _schDurasi(m, s), el = _schDurasi(m, today);
        return Math.max(0, Math.min(100, Math.round((el / tot) * 100)));
      }
      // % proyek berbobot umum: bobot per fase (dinormalkan ke fase yang ada), dalam
      // fase dibagi proporsional durasi. progFn(t) → 0..100. useBaseline → durasi baseline.
      function _schWeighted(tasks, bobot, useBaseline, progFn) {
        var groups = {}, order = [];
        (tasks || []).forEach(function (t) {
          var f = (t.fase || '').toString().trim() || '(Tanpa Fase)';
          if (!groups[f]) { groups[f] = []; order.push(f); }
          groups[f].push(t);
        });
        if (!order.length) return 0;
        var vals = Object.keys(bobot || {}).map(function (k) { return Number(bobot[k]) || 0; });
        var avg = vals.length ? (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 1;
        var raw = {}, sumRaw = 0;
        order.forEach(function (f) { var r = (bobot && bobot[f] != null) ? (Number(bobot[f]) || 0) : avg; raw[f] = r; sumRaw += r; });
        if (sumRaw <= 0) sumRaw = 1;
        var total = 0;
        order.forEach(function (f) {
          var w = raw[f] / sumRaw, arr = groups[f];
          var durs = arr.map(function (t) {
            var m = (useBaseline && t.baselineMulai) ? t.baselineMulai : t.mulai;
            var s = (useBaseline && t.baselineSelesai) ? t.baselineSelesai : t.selesai;
            return _schDurasi(m, s);
          });
          var sumDur = durs.reduce(function (a, b) { return a + b; }, 0) || arr.length || 1;
          arr.forEach(function (t, i) { total += (w * (durs[i] / sumDur)) * (Number(progFn(t)) || 0); });
        });
        return Math.round(total * 10) / 10;
      }
      function _schWeightedProgress(tasks, bobot, useBaseline) {
        return _schWeighted(tasks, bobot, useBaseline, function (t) { return _schClampPct(t.progress); });
      }
      // Hitung deviasi + kurva rencana + flag per tugas (dipakai getScheduleByWO).
      function _schBuildDeviasi(tasks, bobot, today) {
        tasks = tasks || [];
        var aktual = _schWeighted(tasks, bobot, true, function (t) { return _schClampPct(t.progress); });
        var rencana = _schWeighted(tasks, bobot, true, function (t) { return _schPlannedProgress(t, today); });
        var dev = Math.round((aktual - rencana) * 10) / 10;
        var spi = rencana > 0 ? Math.round((aktual / rencana) * 100) / 100 : null;
        var perTask = {};
        tasks.forEach(function (t) {
          var m = t.baselineMulai || t.mulai, s = t.baselineSelesai || t.selesai, pr = _schClampPct(t.progress), st;
          if (pr >= 100) st = 'done';
          else if (s && today > s) st = 'overdue-finish';
          else if (m && today > m && pr === 0) st = 'overdue-start';
          else { var pp = _schPlannedProgress(t, today); st = (pr + 5 < pp) ? 'behind' : 'ontrack'; }
          perTask[t.id] = st;
        });
        var starts = [], ends = [];
        tasks.forEach(function (t) { var mm = t.baselineMulai || t.mulai, ss = t.baselineSelesai || t.selesai; if (mm) starts.push(mm); if (ss) ends.push(ss); });
        var kurva = [];
        if (starts.length) {
          var gmin = starts.reduce(function (a, b) { return a < b ? a : b; });
          var gmax = ends.reduce(function (a, b) { return a > b ? a : b; });
          var pushPt = function (dd) { kurva.push({ tanggal: dd, persen: _schWeighted(tasks, bobot, true, function (t) { return _schPlannedProgress(t, dd); }) }); };
          var d = gmin, guard = 0;
          while (d <= gmax && guard < 400) { pushPt(d); d = _schAddDays(d, 7); guard++; }
          if (!kurva.length || kurva[kurva.length - 1].tanggal !== gmax) pushPt(gmax);
        }
        return { rencanaPct: rencana, aktualPct: aktual, deviasi: dev, spi: spi, perTask: perTask, kurvaRencana: kurva };
      }

      // Rekam 1 titik progres "hari ini" (upsert per no_wo+tanggal) → kurva S aktual.
      async function _schSnapshotProgress(noWO, oleh) {
        try {
          noWO = (noWO || '').toString().trim(); if (!noWO) return;
          var q = await supa.from('schedule_task').select('*').eq('no_wo', noWO);
          if (q.error) return;
          var tasks = (_schTasksMap(q.data || [])[noWO]) || [];
          if (!tasks.length) return;
          var bobot = await _schFaseBobot();
          var pct = _schWeightedProgress(tasks, bobot, true);
          var today = _todayIso();
          await supa.from('schedule_progress_log').upsert(
            { id: 'PROG-' + noWO + '-' + today, no_wo: noWO, tanggal: today, persen_aktual: pct, dicatat_oleh: (oleh || '').toString(), dicatat_pada: new Date().toISOString() },
            { onConflict: 'no_wo,tanggal' }
          );
        } catch (e) {}
      }

      window.gsRoute('saveScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var noWO = (p.noWO || '').toString().trim();
          var nama = (p.namaTugas || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          if (!nama) return { success: false, message: 'Nama tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var id = _schTaskId();
          var prog = _schClampPct(p.progress);
          var am = _schIso(p.aktualMulai), as = _schIso(p.aktualSelesai);
          if (!am && prog > 0) am = _todayIso();            // auto: mulai saat progres > 0
          if (!as && prog >= 100) as = _todayIso();         // auto: selesai saat 100%
          var row = {
            id: id, no_wo: noWO, nama_tugas: nama, fase: (p.fase || '').toString(),
            tanggal_mulai: mulai, tanggal_selesai: selesai, progress: prog,
            aktual_mulai: am || null, aktual_selesai: as || null,
            warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0,
            catatan: (p.catatan || '').toString(), dibuat_oleh: (p.oleh || '').toString(), dibuat_pada: new Date().toISOString()
          };
          var ins = await supa.from('schedule_task').insert(row);
          if (ins.error) return { success: false, message: ins.error.message };
          await _schSnapshotProgress(noWO, p.oleh);
          return { success: true, message: 'Tugas ditambahkan.', id: id };
        }
      });

      window.gsRoute('saveScheduleTasksBatch', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var noWO = (p.noWO || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var arr = Array.isArray(p.tasks) ? p.tasks : [];
          if (!arr.length) return { success: false, message: 'Tidak ada tugas untuk ditambahkan.' };
          var now = new Date().toISOString(), t0 = Date.now(), rows = [];
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {};
            var nama = (it.namaTugas || '').toString().trim();
            if (!nama) continue;
            var mulai = _schIso(it.mulai), selesai = _schIso(it.selesai);
            if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib untuk "' + nama + '".' };
            if (selesai < mulai) return { success: false, message: 'Tanggal selesai sebelum mulai untuk "' + nama + '".' };
            rows.push({
              id: 'TSK-' + t0 + '-' + i, no_wo: noWO, nama_tugas: nama, fase: (it.fase || '').toString(),
              tanggal_mulai: mulai, tanggal_selesai: selesai, progress: _schClampPct(it.progress),
              warna: (it.warna || '').toString(), urutan: Number(it.urutan) || 0,
              catatan: (it.catatan || '').toString(), dibuat_oleh: (p.oleh || '').toString(), dibuat_pada: now
            });
          }
          if (!rows.length) return { success: false, message: 'Tidak ada tugas valid (nama kosong).' };
          var ins = await supa.from('schedule_task').insert(rows);
          if (ins.error) return { success: false, message: ins.error.message };
          await _schSnapshotProgress(noWO, p.oleh);
          return { success: true, message: rows.length + ' tugas ditambahkan.', count: rows.length };
        }
      });

      window.gsRoute('updateScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var cur = await supa.from('schedule_task').select('no_wo,urutan,aktual_mulai,aktual_selesai').eq('id', id).maybeSingle();
          if (cur.error) return { success: false, message: cur.error.message };
          if (!cur.data) return { success: false, message: 'Tugas tidak ditemukan.' };
          var prog = _schClampPct(p.progress);
          // Aktual: nilai dari modal diutamakan; bila kosong pakai yg lama; auto-isi bila progres menuntut.
          var am = ('aktualMulai' in p) ? _schIso(p.aktualMulai) : _schIso(cur.data.aktual_mulai);
          var as = ('aktualSelesai' in p) ? _schIso(p.aktualSelesai) : _schIso(cur.data.aktual_selesai);
          if (!am && prog > 0) am = _todayIso();
          if (!as && prog >= 100) as = _todayIso();
          var upd = {
            nama_tugas: (p.namaTugas || '').toString(), fase: (p.fase || '').toString(),
            tanggal_mulai: mulai, tanggal_selesai: selesai, progress: prog,
            aktual_mulai: am || null, aktual_selesai: as || null,
            warna: (p.warna || '').toString(), urutan: (p.urutan != null && p.urutan !== '') ? (Number(p.urutan) || 0) : (Number(cur.data.urutan) || 0),
            catatan: (p.catatan || '').toString()
          };
          var r = await supa.from('schedule_task').update(upd).eq('id', id).select('id');
          if (r.error) return { success: false, message: r.error.message };
          if (!r.data || !r.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          await _schSnapshotProgress(cur.data.no_wo, p.oleh);
          return { success: true, message: 'Tugas diperbarui.' };
        }
      });

      window.gsRoute('hapusScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var cur = await supa.from('schedule_task').select('no_wo').eq('id', id).maybeSingle();
          var del = await supa.from('schedule_task').delete().eq('id', id).select('id');
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          if (cur.data && cur.data.no_wo) await _schSnapshotProgress(cur.data.no_wo, '');
          return { success: true, message: 'Tugas dihapus.' };
        }
      });

      window.gsRoute('updateScheduleSiteEngineer', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          var se = (args[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var r = await supa.from('schedule_project').update({ site_engineer: se }).eq('no_wo', noWO).select('no_wo');
          if (r.error) return { success: false, message: r.error.message };
          if (!r.data || !r.data.length) return { success: false, message: 'WO tidak ditemukan.' };
          return { success: true, message: 'Site Engineer diperbarui.' };
        }
      });

      // Set Baseline: bekukan tanggal rencana saat ini sebagai baseline per tugas.
      window.gsRoute('setScheduleBaseline', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          var oleh = (args[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var q = await supa.from('schedule_task').select('id,tanggal_mulai,tanggal_selesai').eq('no_wo', noWO);
          if (q.error) return { success: false, message: q.error.message };
          var tasks = (q.data || []).filter(function (t) { return t.tanggal_mulai && t.tanggal_selesai; });
          if (!tasks.length) return { success: false, message: 'Belum ada tugas berjadwal untuk dibaseline.' };
          var results = await Promise.all(tasks.map(function (t) {
            return supa.from('schedule_task').update({ baseline_mulai: t.tanggal_mulai, baseline_selesai: t.tanggal_selesai }).eq('id', t.id);
          }));
          var errs = results.filter(function (r) { return r.error; });
          if (errs.length) return { success: false, message: errs[0].error.message };
          var stamp = await supa.from('schedule_project').update({ baseline_set_at: new Date().toISOString(), baseline_oleh: oleh }).eq('no_wo', noWO);
          if (stamp.error) return { success: false, message: stamp.error.message };
          await _schSnapshotProgress(noWO, oleh);
          return { success: true, message: 'Baseline diset untuk ' + tasks.length + ' tugas.', count: tasks.length };
        }
      });

      // Susun ulang urutan tugas (drag di dalam fase). ids = urutan baru → urutan = index.
      window.gsRoute('reorderScheduleTasks', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var ids = Array.isArray(p.ids) ? p.ids.filter(Boolean) : [];
          if (!ids.length) return { success: false, message: 'Daftar urutan kosong.' };
          var results = await Promise.all(ids.map(function (id, i) {
            return supa.from('schedule_task').update({ urutan: i }).eq('id', (id || '').toString());
          }));
          var errs = results.filter(function (r) { return r.error; });
          if (errs.length) return { success: false, message: errs[0].error.message };
          return { success: true, message: 'Urutan tugas diperbarui.' };
        }
      });

      // Rekam progres manual ("Rekam progres" di detail WO) → titik kurva S hari ini.
      window.gsRoute('snapshotScheduleProgress', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          var oleh = (args[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          await _schSnapshotProgress(noWO, oleh);
          return { success: true, message: 'Progres hari ini terekam.' };
        }
      });
