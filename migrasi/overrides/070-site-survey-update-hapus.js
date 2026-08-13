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
        var prev = await supa.from(table).select('id_user').eq('no_wo', noWO);   // untuk deteksi engineer BARU
        var prevIds = {}; (prev.data || []).forEach(function (r) { prevIds[(r.id_user || '').toString()] = 1; });
        var d = await supa.from(table).delete().eq('no_wo', noWO); if (d.error) return { success: false, message: d.error.message };
        var seen = {}, rows = [], newIds = [], when = new Date().toISOString();
        for (var j = 0; j < userIds.length; j++) {
          var uid = (userIds[j] || '').toString().trim(); if (!uid || seen[uid]) continue; seen[uid] = true;
          rows.push({ no_wo: noWO, id_user: uid, nama_user: userMap[uid] || uid, assigned_by: (assignedBy || '').toString(), assigned_at: when });
          if (!prevIds[uid]) newIds.push(uid);
        }
        if (rows.length) { var ins = await supa.from(table).insert(rows); if (ins.error) return { success: false, message: ins.error.message }; }
        if (newIds.length && typeof _notifAssignEngineer === 'function') { var _md = table === 'bom_assignment' ? 'BOM' : table === 'ded_assignment' ? 'DED' : 'QC'; _notifAssignEngineer(_md, noWO, newIds); }
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

      // Panggil Edge Function, dan bila gagal (non-2xx) SURFACE pesan asli dari
      // body respons (FunctionsHttpError.context = Response), bukan pesan generik.
      async function _edgeInvoke(fn, body, fallbackMsg) {
        var r;
        try { r = await supa.functions.invoke(fn, { body: body }); }
        catch (e) { return { success: false, message: (e && e.message) || fallbackMsg }; }
        if (!r.error) return r.data;
        var msg = fallbackMsg;
        try {
          var ctx = r.error.context;
          if (ctx && typeof ctx.json === 'function') { var j = await ctx.json(); if (j && j.message) msg = j.message; }
          else if (ctx && typeof ctx.text === 'function') { var t = await ctx.text(); if (t) { try { var jj = JSON.parse(t); msg = (jj && jj.message) || t; } catch (_) { msg = t; } } }
        } catch (e2) {}
        console.error('[' + fn + ']', r.error, msg);
        return { success: false, message: msg };
      }

      // ── Invoice (finansial/multi-tabel) via EDGE FUNCTION invoice-ops ─────
      //  Aktif hanya bila ENABLE_EDGE_INVOICE = true (setelah deploy).
      if (ENABLE_EDGE_INVOICE) {
        window.gsRoute('simpanInvoice', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('invoice-ops', { action: 'create', payload: a[0] || {} }, 'Gagal menyimpan invoice.'); }
        });
        window.gsRoute('updateStatusBayarInvoice', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('invoice-ops', { action: 'setStatus', idInvoice: a[0], statusBaru: a[1], bukti: a[2] || {} }, 'Gagal mengubah status bayar.'); }
        });
        window.gsRoute('editInvoice', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('invoice-ops', { action: 'edit', payload: a[0] || {} }, 'Gagal mengubah invoice.'); }
        });
      }

      // ── Manajemen user (auth admin) via EDGE FUNCTION user-ops ────────────
      //  Aktif hanya bila ENABLE_EDGE_USER = true (setelah deploy user-ops).
      if (ENABLE_EDGE_USER) {
        window.gsRoute('simpanUser', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('user-ops', { action: 'create', payload: { nama: a[0], username: a[1], password: a[2], role: a[3], leadId: a[4], noWa: a[5], email: a[6] } }, 'Gagal menyimpan user.'); }
        });
        window.gsRoute('editUser', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('user-ops', { action: 'edit', payload: { id: a[0], nama: a[1], username: a[2], password: a[3], role: a[4], aktif: a[5], targetBulanan: a[6], leadId: a[7], noWa: a[8], email: a[9] } }, 'Gagal mengubah user.'); }
        });
        window.gsRoute('hapusUser', {
          mode: 'fn',
          handler: function (a) { return _edgeInvoke('user-ops', { action: 'delete', payload: { id: a[0] } }, 'Gagal menghapus user.'); }
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
        return { ok: true, list: all, prevStatus: found ? (found.status || '') : '' };
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
          if (typeof _qcNotifLeadReview === 'function') _qcNotifLeadReview(noWO, kode, oleh, 1, res.prevStatus);
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
          if (typeof _qcNotifLeadReview === 'function') _qcNotifLeadReview(noWO, kode, oleh, added.length, res.prevStatus);
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
          if (typeof _dedNotifLeadReview === 'function') _dedNotifLeadReview(noWO, kode, oleh, added.length, res.prevStatus);
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
