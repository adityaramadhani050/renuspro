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
          var row = {
            id: id, no_wo: noWO, nama_tugas: nama, fase: (p.fase || '').toString(),
            tanggal_mulai: mulai, tanggal_selesai: selesai, progress: _schClampPct(p.progress),
            warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0,
            catatan: (p.catatan || '').toString(), dibuat_oleh: (p.oleh || '').toString(), dibuat_pada: new Date().toISOString()
          };
          var ins = await supa.from('schedule_task').insert(row);
          if (ins.error) return { success: false, message: ins.error.message };
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
          var upd = {
            nama_tugas: (p.namaTugas || '').toString(), fase: (p.fase || '').toString(),
            tanggal_mulai: mulai, tanggal_selesai: selesai, progress: _schClampPct(p.progress),
            warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0, catatan: (p.catatan || '').toString()
          };
          var r = await supa.from('schedule_task').update(upd).eq('id', id).select('id');
          if (r.error) return { success: false, message: r.error.message };
          if (!r.data || !r.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          return { success: true, message: 'Tugas diperbarui.' };
        }
      });

      window.gsRoute('hapusScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var del = await supa.from('schedule_task').delete().eq('id', id).select('id');
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
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
          return { success: true, message: 'Baseline diset untuk ' + tasks.length + ' tugas.', count: tasks.length };
        }
      });
