      // ── Group #3a: BOM writes (project/item/review) ───────────────────────
      async function _hoRequireSelesai(noWO) {
        var st = await _hoStatus(noWO);
        if (st === 'Selesai') return { ok: true };
        var msg = st === 'Dijadwalkan' ? 'Hand Over WO ini masih Dijadwalkan — selesaikan HO dulu.' : st === 'Diminta' ? 'Hand Over WO ini baru Diminta — jadwalkan & selesaikan HO dulu.' : 'WO ini belum melewati Hand Over. Selesaikan Hand Over dulu sebelum lanjut.';
        return { ok: false, message: msg };
      }
      async function _bomWriteProjectStatus(noWO, status, olehIfFinal) {
        var cur = await supa.from('bom_project').select('status,difinalkan_oleh,difinalkan_pada').eq('no_wo', noWO).maybeSingle();
        if (!cur.data) return;
        var upd = { status: status };
        if (status === 'Final') { if ((cur.data.status || '') !== 'Final') { upd.difinalkan_oleh = olehIfFinal; upd.difinalkan_pada = new Date().toISOString(); } }
        else if ((cur.data.difinalkan_oleh || '') || cur.data.difinalkan_pada) { upd.difinalkan_oleh = ''; upd.difinalkan_pada = null; }
        await supa.from('bom_project').update(upd).eq('no_wo', noWO);
      }
      async function _bomSyncProjectStatus(noWO, oleh) {
        var q = await _all('bom_item', 'status', function (x) { return x.eq('no_wo', noWO); });
        var rows = q.data || [], total = rows.length, approved = rows.filter(function (r) { return (r.status || '') === 'Approved'; }).length;
        await _bomWriteProjectStatus(noWO, (total > 0 && approved === total) ? 'Final' : 'Draft', oleh);
      }
      async function _woJenisEfektif(noWO) {
        var wo = await supa.from('work_order').select('items').eq('no_wo', noWO).maybeSingle();
        if (!wo.data) return '';
        var ov = await supa.from('work_order_jenis_override').select('jenis_manual').eq('no_wo', noWO).maybeSingle();
        var manual = ov.data ? (ov.data.jenis_manual || '').toString().trim() : '';
        if (manual === 'Jasa' || manual === 'Material') return manual;
        var pq = await supa.from('produk').select('id,tipe'); var tipeMap = {}; (pq.data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
        return _woJenisAuto(wo.data.items, tipeMap);
      }
      window.gsRoute('saveBOMItems', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, noWO = (p.noWO || '').toString().trim(), oleh = (p.oleh || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var guard = await _bomEditGuard(noWO); if (!guard.ok) return { success: false, message: guard.message };
          var q = await _all('bom_item', '*', function (x) { return x.eq('no_wo', noWO); });
          var existing = q.data || [], byId = {}; existing.forEach(function (r) { byId[(r.id || '').toString()] = r; });
          var items = Array.isArray(p.items) ? p.items : [], seen = {}; items.forEach(function (it) { if (it.id) seen[(it.id || '').toString()] = true; });
          for (var e = 0; e < existing.length; e++) { var ex = existing[e]; if (!seen[(ex.id || '').toString()] && (ex.status || '') === 'Approved') return { success: false, message: 'Material yang sudah Approved tidak bisa dihapus. Minta Lead batalkan approve dulu.' }; }
          var updated = 0, added = 0, deleted = 0, toAppend = [];
          for (var i = 0; i < items.length; i++) {
            var it = items[i], nama = (it.namaMaterial || '').toString().trim(), qty = Number(it.qty) || 0;
            if (!nama || qty <= 0) continue;
            var core = { kategori: (it.kategori || 'Lainnya').toString(), pricelist_id: (it.pricelistId || '') || null, nama_material: nama, merek: (it.merek || '').toString(), supplier: (it.supplier || '').toString(), satuan: (it.satuan || '').toString(), qty: qty, catatan: (it.catatan || '').toString() };
            var id = (it.id || '').toString();
            if (id && byId[id]) {
              var ex2 = byId[id]; if ((ex2.status || '') === 'Approved') continue;
              var changed = (ex2.kategori || '') !== core.kategori || (ex2.pricelist_id || '') !== (core.pricelist_id || '') || (ex2.nama_material || '') !== core.nama_material || (ex2.merek || '') !== core.merek || (ex2.supplier || '') !== core.supplier || (ex2.satuan || '') !== core.satuan || (Number(ex2.qty) || 0) !== qty || (ex2.catatan || '') !== core.catatan;
              var upd = {}; for (var kk in core) upd[kk] = core[kk];
              if (changed) { upd.status = 'Pending'; upd.catatan_review = ''; upd.direview_oleh = ''; upd.direview_pada = null; }
              await supa.from('bom_item').update(upd).eq('id', id); updated++;
            } else toAppend.push(core);
          }
          var toDelete = existing.filter(function (r) { return !seen[(r.id || '').toString()]; }).map(function (r) { return (r.id || '').toString(); });
          if (toDelete.length) { var d = await supa.from('bom_item').delete().in('id', toDelete); if (!d.error) deleted = toDelete.length; }
          for (var t = 0; t < toAppend.length; t++) { var c = toAppend[t], newId = await _nextSeqId('bom_item', 'id', 'BOM'), row = { id: newId, no_wo: noWO }; for (var k2 in c) row[k2] = c[k2]; row.dibuat_oleh = oleh; row.dibuat_pada = new Date().toISOString(); row.status = 'Pending'; row.catatan_review = ''; row.direview_oleh = ''; row.direview_pada = null; var ins = await supa.from('bom_item').insert(row); if (!ins.error) added++; }
          await _bomSyncProjectStatus(noWO, oleh);
          return { success: true, message: 'BOM disimpan (' + updated + ' diperbarui, ' + added + ' baru' + (deleted ? ', ' + deleted + ' dihapus' : '') + ').', updated: updated, added: added, deleted: deleted };
        }
      });
      window.gsRoute('reviewBOMItem', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), keputusan = (a[1] || '').toString().trim(), catatan = (a[2] || '').toString(), reviewer = (a[3] || '').toString();
          if (!id) return { success: false, message: 'ID item wajib.' };
          if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
          if (keputusan === 'Rejected' && !catatan.trim()) return { success: false, message: 'Catatan revisi wajib diisi untuk menolak.' };
          var r = await supa.from('bom_item').select('no_wo').eq('id', id).maybeSingle();
          if (!r.data) return { success: false, message: 'Item tidak ditemukan.' };
          var noWO = (r.data.no_wo || '').toString();
          if ((await _woStatus(noWO)) === 'Closed') return { success: false, message: 'Work Order sudah Closed.' };
          var up = await supa.from('bom_item').update({ status: keputusan, catatan_review: (keputusan === 'Rejected' ? catatan : ''), direview_oleh: reviewer, direview_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          await _bomSyncProjectStatus(noWO, reviewer);
          return { success: true, message: 'Material ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
        }
      });
      window.gsRoute('addBOMProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), userIds = Array.isArray(a[1]) ? a[1] : [], addedBy = (a[2] || '').toString();
          if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
          var hoG = await _hoRequireSelesai(noWO); if (!hoG.ok) return { success: false, message: hoG.message };
          var exist = await supa.from('bom_project').select('no_wo').eq('no_wo', noWO).maybeSingle();
          if (exist.data) return { success: false, message: 'Work Order sudah ada di daftar BOM.' };
          var wo = await supa.from('work_order').select('nama_project,nama_klien').eq('no_wo', noWO).maybeSingle();
          var ins = await supa.from('bom_project').insert({ no_wo: noWO, nama_project: wo.data ? (wo.data.nama_project || '') : '', nama_klien: wo.data ? (wo.data.nama_klien || '') : '', status: 'Draft', ditambahkan_oleh: addedBy, ditambahkan_pada: new Date().toISOString(), difinalkan_oleh: '', difinalkan_pada: null });
          if (ins.error) return { success: false, message: ins.error.message };
          if (userIds.length) await _setAssignment('bom_assignment', noWO, userIds, addedBy);
          return { success: true, message: 'Work Order ditambahkan ke BOM.' };
        }
      });
      window.gsRoute('removeBOMProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var del = await supa.from('bom_project').delete().eq('no_wo', noWO).select();
          if (del.error) return { success: false, message: del.error.message };
          var removed = !!(del.data && del.data.length);
          return { success: removed, message: removed ? 'Work Order dikeluarkan dari BOM.' : 'Work Order tidak ditemukan.' };
        }
      });
      window.gsRoute('cancelBOMApproval', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
          if (!id) return { success: false, message: 'ID item wajib.' };
          var r = await supa.from('bom_item').select('no_wo,status,qty_reserved,proc_status').eq('id', id).maybeSingle();
          if (!r.data) return { success: false, message: 'Item tidak ditemukan.' };
          if ((r.data.status || '') !== 'Approved') return { success: false, message: 'Material belum di-Approve.' };
          if ((Number(r.data.qty_reserved) || 0) > 0 || (r.data.proc_status || '').toString()) return { success: false, message: 'Material sudah diproses procurement — batalkan proses procurement dulu.' };
          var up = await supa.from('bom_item').update({ status: 'Pending', catatan_review: '', direview_oleh: '', direview_pada: null }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          await _bomSyncProjectStatus((r.data.no_wo || '').toString(), oleh);
          return { success: true, message: 'Approve dibatalkan (Pending).' };
        }
      });

      // ── Group #3b: DED writes (project + master checklist + review) ───────
      window.gsRoute('addDEDProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), userIds = Array.isArray(a[1]) ? a[1] : [], addedBy = (a[2] || '').toString();
          if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
          var hoG = await _hoRequireSelesai(noWO); if (!hoG.ok) return { success: false, message: hoG.message };
          if ((await _woJenisEfektif(noWO)) === 'Material') return { success: false, message: 'WO jenis Material saja tidak memerlukan DED.' };
          var exist = await supa.from('ded_project').select('no_wo').eq('no_wo', noWO).maybeSingle();
          if (exist.data) return { success: false, message: 'Work Order sudah ada di daftar DED.' };
          var wo = await supa.from('work_order').select('nama_project,nama_klien').eq('no_wo', noWO).maybeSingle();
          var ins = await supa.from('ded_project').insert({ no_wo: noWO, nama_project: wo.data ? (wo.data.nama_project || '') : '', nama_klien: wo.data ? (wo.data.nama_klien || '') : '', ditambahkan_oleh: addedBy, ditambahkan_pada: new Date().toISOString(), selesai_manual: false, ditandai_selesai_oleh: null, ditandai_selesai_pada: null });
          if (ins.error) return { success: false, message: ins.error.message };
          if (userIds.length) await _setAssignment('ded_assignment', noWO, userIds, addedBy);
          return { success: true, message: 'Work Order ditambahkan ke DED.' };
        }
      });
      window.gsRoute('removeDEDProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var del = await supa.from('ded_project').delete().eq('no_wo', noWO).select();
          if (del.error) return { success: false, message: del.error.message };
          var removed = !!(del.data && del.data.length);
          return { success: removed, message: removed ? 'Work Order dikeluarkan dari DED.' : 'Work Order tidak ditemukan.' };
        }
      });
      window.gsRoute('tambahDEDItem', {
        mode: 'fn',
        handler: async function (a) {
          var label = (a[0] || '').toString().trim(), wajib = a[1], instruksi = a[2];
          if (!label) return { success: false, message: 'Nama dokumen wajib diisi.' };
          var items = await _all('ded_checklist', 'kode'); var maxNum = 0, cnt = (items.data || []).length;
          (items.data || []).forEach(function (x) { var m = (x.kode || '').toString().match(/^D(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var kode = 'D' + ('00' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('ded_checklist').insert({ kode: kode, label: label, wajib: !!wajib, urutan: cnt + 1, instruksi: (instruksi || '').toString() });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Dokumen "' + label + '" ditambahkan.', kode: kode };
        }
      });
      window.gsRoute('updateDEDItem', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim(), label = (a[1] || '').toString().trim(), wajib = a[2], instruksi = a[3];
          if (!kode) return { success: false, message: 'Kode wajib.' };
          if (!label) return { success: false, message: 'Nama dokumen wajib diisi.' };
          var up = await supa.from('ded_checklist').update({ label: label, wajib: !!wajib, instruksi: (instruksi || '').toString() }).eq('kode', kode).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Dokumen tidak ditemukan.' };
          return { success: true, message: 'Dokumen diperbarui.' };
        }
      });
      window.gsRoute('hapusDEDItem', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim();
          if (!kode) return { success: false, message: 'Kode wajib.' };
          var del = await supa.from('ded_checklist').delete().eq('kode', kode).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Dokumen tidak ditemukan.' };
          return { success: true, message: 'Dokumen dihapus.' };
        }
      });
      window.gsRoute('reviewDEDItem', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), keputusan = (a[2] || '').toString().trim(), catatan = (a[3] || '').toString(), reviewer = (a[4] || '').toString();
          var reviewFile = a[5] || null;   // {fileId, fileUrl, fileName} — lampiran revisi Lead (opsional)
          if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
          if (keputusan === 'Rejected' && !catatan.trim()) return { success: false, message: 'Catatan revisi wajib diisi untuk menolak.' };
          var f = await supa.from('ded_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Belum ada dokumen untuk item ini.' };
          var revFiles = (reviewFile && reviewFile.fileId) ? [{ fileId: (reviewFile.fileId || '').toString(), fileUrl: (reviewFile.fileUrl || '').toString(), fileName: (reviewFile.fileName || 'Revisi.pdf').toString() }] : [];
          var ev = { type: (keputusan === 'Approved' ? 'approve' : 'reject'), by: reviewer, at: _fmtTs(new Date()), note: catatan, files: revFiles };
          var up = await supa.from('ded_item').update({ status: keputusan, catatan_review: catatan, direview_oleh: reviewer, direview_pada: new Date().toISOString(), aktivitas: _arr(f.data.aktivitas).concat([ev]) }).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _dedNotifSiteReview === 'function') _dedNotifSiteReview(noWO, kode, keputusan, catatan);
          return { success: true, message: 'Dokumen ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
        }
      });
      window.gsRoute('cancelDEDApproval', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), oleh = (a[2] || '').toString();
          var f = await supa.from('ded_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Item tidak ditemukan.' };
          if ((f.data.status || '') !== 'Approved') return { success: false, message: 'Hanya dokumen berstatus Approved yang bisa dibatalkan.' };
          var files = _arr(f.data.files);
          var ev = { type: 'cancel', by: oleh, at: _fmtTs(new Date()), note: '' };
          var up = await supa.from('ded_item').update({ status: files.length ? 'Pending' : 'Belum Upload', catatan_review: '', direview_oleh: '', direview_pada: null, aktivitas: _arr(f.data.aktivitas).concat([ev]) }).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Persetujuan dibatalkan — kembali ke Pending.' };
        }
      });

      // ── Group #3c: QC writes (project/review/anotasi) ─────────────────────
      window.gsRoute('addQCProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), userIds = Array.isArray(a[1]) ? a[1] : [], addedBy = (a[2] || '').toString();
          if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
          var hoG = await _hoRequireSelesai(noWO); if (!hoG.ok) return { success: false, message: hoG.message };
          if ((await _woJenisEfektif(noWO)) === 'Material') return { success: false, message: 'WO jenis Material saja tidak memerlukan QC.' };
          var exist = await supa.from('qc_project').select('no_wo').eq('no_wo', noWO).maybeSingle();
          if (exist.data) return { success: false, message: 'Work Order sudah ada di daftar QC.' };
          var wo = await supa.from('work_order').select('nama_project,nama_klien').eq('no_wo', noWO).maybeSingle();
          var ins = await supa.from('qc_project').insert({ no_wo: noWO, nama_project: wo.data ? (wo.data.nama_project || '') : '', nama_klien: wo.data ? (wo.data.nama_klien || '') : '', ditambahkan_oleh: addedBy, ditambahkan_pada: new Date().toISOString(), selesai_manual: false, ditandai_selesai_oleh: null, ditandai_selesai_pada: null });
          if (ins.error) return { success: false, message: ins.error.message };
          if (userIds.length) await _setAssignment('qc_assignment', noWO, userIds, addedBy);
          return { success: true, message: 'Work Order ditambahkan ke QC.' };
        }
      });
      window.gsRoute('removeQCProject', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var del = await supa.from('qc_project').delete().eq('no_wo', noWO).select();
          if (del.error) return { success: false, message: del.error.message };
          var removed = !!(del.data && del.data.length);
          return { success: removed, message: removed ? 'Work Order dikeluarkan dari QC.' : 'Work Order tidak ditemukan.' };
        }
      });
      window.gsRoute('reviewQCItem', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), keputusan = (a[2] || '').toString().trim(), catatan = (a[3] || '').toString(), reviewer = (a[4] || '').toString();
          if (keputusan !== 'Approved' && keputusan !== 'Rejected') return { success: false, message: 'Keputusan tidak valid.' };
          var f = await supa.from('qc_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Belum ada foto untuk item ini.' };
          var ev = { type: (keputusan === 'Approved' ? 'approve' : 'reject'), by: reviewer, at: _fmtTs(new Date()), note: catatan };
          var up = await supa.from('qc_item').update({ status: keputusan, catatan_spv: catatan, direview_oleh: reviewer, direview_pada: new Date().toISOString(), aktivitas: _arr(f.data.aktivitas).concat([ev]) }).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _qcNotifSiteReview === 'function') _qcNotifSiteReview(noWO, kode, keputusan, catatan);
          return { success: true, message: 'Item ' + kode + ' ' + (keputusan === 'Approved' ? 'disetujui' : 'ditolak') + '.' };
        }
      });
      window.gsRoute('cancelQCApproval', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), kode = (a[1] || '').toString().trim(), oleh = (a[2] || '').toString();
          var f = await supa.from('qc_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Item tidak ditemukan.' };
          if ((f.data.status || '') !== 'Approved') return { success: false, message: 'Hanya item berstatus Approved yang bisa dibatalkan.' };
          var arr = _arr(f.data.foto);
          var ev = { type: 'cancel', by: oleh, at: _fmtTs(new Date()), note: '' };
          var up = await supa.from('qc_item').update({ status: arr.length ? 'Pending' : 'Belum Upload', catatan_spv: '', direview_oleh: '', direview_pada: null, aktivitas: _arr(f.data.aktivitas).concat([ev]) }).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Persetujuan item ' + kode + ' dibatalkan — kembali ke Pending.' };
        }
      });
      window.gsRoute('simpanQCFotoAnotasi', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, noWO = (p.noWO || '').toString().trim(), kode = (p.kode || '').toString().trim(), fileId = (p.fileId || '').toString();
          if (!noWO || !kode || !fileId) return { success: false, message: 'Data tidak lengkap.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'Gambar kosong.' };
          var f = await supa.from('qc_item').select('*').eq('no_wo', noWO).eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Item tidak ditemukan.' };
          if ((f.data.status || '') === 'Approved') return { success: false, message: 'Item sudah Approved — foto tidak bisa ditandai.' };
          var arr = _arr(f.data.foto), idx = -1; for (var i = 0; i < arr.length; i++) { if ((arr[i].fileId || '') === fileId) { idx = i; break; } }
          if (idx < 0) return { success: false, message: 'Foto tidak ditemukan.' };
          var r = await _putStorage('qc/' + noWO.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), kode + '-edit-' + (idx + 1) + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          var old = arr[idx], when = _fmtTs(new Date());
          arr[idx] = { fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName, by: old.by || '', at: old.at || when, editedBy: (p.oleh || '').toString(), editedAt: when };
          var up = await supa.from('qc_item').update({ foto: arr }).eq('id', f.data.id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Gambar tersimpan dengan coretan.', foto_list: arr };
        }
      });

      // ── Group #3d: restore revisi, kwitansi, dokumen WO, ganti password ────
      window.gsRoute('restoreRevisiPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var noPen = (a[0] || '').toString(), rev = parseInt(a[1], 10); if (isNaN(rev)) rev = 0; var namaUser = (a[2] || '').toString();
          var rows = await _all('penawaran', '*', function (q) { return q.eq('no_penawaran', noPen); });
          var list = rows.data || []; if (!list.length) return { success: false, message: 'Revisi tidak ditemukan.' };
          list.sort(function (x, y) { return (Number(y.rev) || 0) - (Number(x.rev) || 0); });
          var latest = list[0], maxRev = Number(latest.rev) || 0;
          var target = list.filter(function (r) { return (Number(r.rev) || 0) === rev; })[0];
          if (!target) return { success: false, message: 'Revisi tidak ditemukan.' };
          var currentStatus = (latest.status || '').toString();
          if (currentStatus === 'Deal') {
            if (!_isSameJkMonth(latest.tanggal_deal)) return { success: false, message: 'Penawaran Deal bulan sebelumnya tidak dapat direvisi lagi, agar laporan deal bulan lalu tidak berubah.' };
            if ((await _hoStatus(latest.no_wo)) === 'Selesai') return { success: false, message: 'Penawaran Deal tidak dapat direvisi karena Hand Over WO ' + (latest.no_wo || '') + ' sudah Selesai (project sudah diserahterimakan ke tim project).' };
          }
          if (rev === maxRev) return { success: false, message: 'Revisi ini sudah menjadi revisi terbaru.' };
          var newRev = maxRev + 1, isDeal = currentStatus === 'Deal';
          var ins = await supa.from('penawaran').insert({
            no_penawaran: noPen, rev: newRev, tanggal: target.tanggal, valid_hingga: target.valid_hingga, nama_project: target.nama_project, klien_id: target.klien_id,
            dibuat_oleh: (namaUser || target.dibuat_oleh || ''), subtotal: target.subtotal, diskon: target.diskon, pajak: target.pajak, grand_total: target.grand_total,
            total_hpp: target.total_hpp, estimasi_keuntungan: target.estimasi_keuntungan, margin_persen: target.margin_persen, term_conditions: target.term_conditions, items: target.items,
            status: isDeal ? 'Deal' : 'On-Progress', no_wo: isDeal ? (latest.no_wo || '') : '', tanggal_deal: isDeal ? (latest.tanggal_deal || null) : null, channel_marketing: target.channel_marketing,
            catatan_fail: '', reminder_expired: null, kode_win: isDeal ? (latest.kode_win || '') : '', catatan_win: '', kode_lost: '', tanggal_fail: null,
            lesson_learned: isDeal ? (latest.lesson_learned || '') : '', action: isDeal ? (latest.action || '') : ''
          });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Rev' + rev + ' berhasil dipulihkan sebagai revisi terbaru → Rev' + newRev + '!', newRev: newRev };
        }
      });
      async function _nextKwitansiNumber() {
        var q = await _all('kwitansi', 'no_kwitansi'); var maxId = 0;
        (q.data || []).forEach(function (r) { var m = (r.no_kwitansi || '').toString().match(/^(\d+)\/RGI(?:-KW|\/KWT)/); if (m) { var n = parseInt(m[1], 10); if (n > maxId) maxId = n; } });
        var t = _jkMonthYear(); return ('00' + (maxId + 1)).slice(-3) + '/RGI/KWT/' + _ROMAN_MO[t.mo] + '/' + t.yr;
      }
      window.gsRoute('simpanKwitansi', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, jumlah = parseFloat(p.jumlah) || 0;
          if (jumlah <= 0) return { success: false, message: 'Jumlah kwitansi harus lebih dari 0.' };
          var noK = await _nextKwitansiNumber();
          var ins = await supa.from('kwitansi').insert({ no_kwitansi: noK, no_invoice: (p.noInvoice || '') || null, no_wo: (p.noWO || '').toString(), tanggal: _isoDate(p.tanggal) || _todayIso(), terima_dari: (p.terimaDari || '').toString(), jumlah: jumlah, untuk_pembayaran: (p.untuk || '').toString(), metode: (p.metode || 'Transfer').toString(), catatan: (p.catatan || '').toString(), dibuat_oleh: (p.dibuatOleh || 'Sales Executive').toString() });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Kwitansi ' + noK + ' berhasil dibuat!', noKwitansi: noK };
        }
      });
      window.gsRoute('uploadWODokumen', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, noWO = (p.noWO || '').toString().trim(), jenis = (p.jenis || 'kontrak').toString(), oleh = (p.oleh || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var b64 = (p.base64Data || '').toString(); if (!b64) return { success: false, message: 'File kosong.' };
          var ok = false; try { var head = atob(b64.slice(0, 8)); ok = head.charCodeAt(0) === 0x25 && head.charCodeAt(1) === 0x50 && head.charCodeAt(2) === 0x44 && head.charCodeAt(3) === 0x46; } catch (e) {}
          if (!ok) return { success: false, message: 'Hanya file PDF yang diperbolehkan.' };
          var base = (p.fileName || '').toString().replace(/\.[a-zA-Z0-9]+$/, '') || jenis;
          var r = await _putStorage('wo-dokumen/' + noWO.replace(/[^\w.\-]/g, '_'), b64, 'application/pdf', jenis + '-' + noWO + '-' + base + '.pdf');
          if (!r.ok) return { success: false, message: r.message };
          var ex = await supa.from('wo_dokumen').select('file_id').eq('no_wo', noWO).eq('jenis', jenis).maybeSingle();
          if (ex.data && ex.data.file_id) { try { await supa.storage.from('uploads').remove([ex.data.file_id]); } catch (e) {} }
          var up = await supa.from('wo_dokumen').upsert({ no_wo: noWO, jenis: jenis, file_id: r.fileId, file_url: r.fileUrl, nama_file: r.fileName, diupload_oleh: oleh, diupload_pada: new Date().toISOString() }, { onConflict: 'no_wo,jenis' });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Dokumen tersimpan.', file: { fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName } };
        }
      });
      window.gsRoute('hapusWODokumen', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), jenis = (a[1] || 'kontrak').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var ex = await supa.from('wo_dokumen').select('file_id').eq('no_wo', noWO).eq('jenis', jenis);
          var fids = (ex.data || []).map(function (r) { return r.file_id; }).filter(Boolean);
          if (fids.length) { try { await supa.storage.from('uploads').remove(fids); } catch (e) {} }
          var del = await supa.from('wo_dokumen').delete().eq('no_wo', noWO).eq('jenis', jenis);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Dokumen dihapus.' };
        }
      });
      window.gsRoute('gantiPassword', {
        mode: 'fn',
        handler: async function (a) {
          var passwordLama = (a[1] || '').toString(), passwordBaru = (a[2] || '').toString();
          if (!passwordLama || !passwordBaru) return { success: false, message: 'Password lama dan baru wajib diisi.' };
          if (passwordBaru.length < 6) return { success: false, message: 'Password baru minimal 6 karakter.' };
          var u = await supa.auth.getUser(); var email = (u.data && u.data.user) ? (u.data.user.email || '') : '';
          if (!email) return { success: false, message: 'Sesi tidak ditemukan. Silakan login ulang.' };
          var chk = await supa.auth.signInWithPassword({ email: email, password: passwordLama });
          if (chk.error) return { success: false, message: 'Password lama tidak sesuai.' };
          var up = await supa.auth.updateUser({ password: passwordBaru });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Password berhasil diubah!' };
        }
      });

      // ── QC master checklist: kelola Section & SubItem (qc_section/qc_checklist)
      window.gsRoute('tambahQCSection', {
        mode: 'fn',
        handler: async function (a) {
          var label = (a[0] || '').toString().trim();
          if (!label) return { success: false, message: 'Nama item QC wajib diisi.' };
          var secs = await _all('qc_section', 'kode,urutan');
          var used = {}, maxU = 0; (secs.data || []).forEach(function (s) { if (s.kode) used[s.kode.toString().trim().toUpperCase()] = true; maxU = Math.max(maxU, Number(s.urutan) || 0); });
          var kode = 'S' + ((secs.data || []).length + 1); for (var c = 65; c <= 90; c++) { var L = String.fromCharCode(c); if (!used[L]) { kode = L; break; } }
          var ins = await supa.from('qc_section').insert({ kode: kode, label: label, urutan: maxU + 1 });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Item QC "' + kode + '. ' + label + '" ditambahkan.', kode: kode };
        }
      });
      window.gsRoute('updateQCSection', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim(), label = (a[1] || '').toString().trim();
          if (!label) return { success: false, message: 'Nama item QC wajib diisi.' };
          var up = await supa.from('qc_section').update({ label: label }).eq('kode', kode).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Item QC diperbarui.' };
        }
      });
      window.gsRoute('hapusQCSection', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim();
          var delItems = await supa.from('qc_checklist').delete().eq('section_kode', kode);
          if (delItems.error) return { success: false, message: delItems.error.message };
          var del = await supa.from('qc_section').delete().eq('kode', kode);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Item QC & subitemnya dihapus.' };
        }
      });
      window.gsRoute('tambahQCSubItem', {
        mode: 'fn',
        handler: async function (a) {
          var sectionKode = (a[0] || '').toString().trim(), label = (a[1] || '').toString().trim(), wajib = a[2], instruksi = a[3], tipeUpload = a[4];
          if (!sectionKode) return { success: false, message: 'Item QC induk wajib.' };
          if (!label) return { success: false, message: 'Nama subitem wajib diisi.' };
          var tipe = (tipeUpload === 'file') ? 'file' : 'foto';
          var items = await _all('qc_checklist', 'kode,section_kode,urutan');
          var maxNum = 0, maxU = 0;
          (items.data || []).forEach(function (x) { maxU = Math.max(maxU, Number(x.urutan) || 0); if ((x.section_kode || '').toString().trim() === sectionKode) { var mm = (x.kode || '').toString().match(/(\d+)$/); if (mm) maxNum = Math.max(maxNum, parseInt(mm[1], 10)); } });
          var kode = sectionKode + (maxNum + 1);
          var ins = await supa.from('qc_checklist').insert({ kode: kode, section_kode: sectionKode, label: label, wajib: !!wajib, urutan: maxU + 1, instruksi: (instruksi || '').toString(), contoh_foto: '', tipe_upload: tipe });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Subitem "' + kode + '" ditambahkan.', kode: kode };
        }
      });
      window.gsRoute('updateQCSubItem', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim(), label = (a[1] || '').toString().trim(), wajib = a[2], instruksi = a[3], tipeUpload = a[4];
          if (!label) return { success: false, message: 'Nama subitem wajib diisi.' };
          var upd = { label: label, wajib: !!wajib };
          if (instruksi != null) upd.instruksi = instruksi.toString();
          if (tipeUpload != null) upd.tipe_upload = (tipeUpload === 'file') ? 'file' : 'foto';
          var up = await supa.from('qc_checklist').update(upd).eq('kode', kode).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Subitem tidak ditemukan.' };
          return { success: true, message: 'Subitem diperbarui.' };
        }
      });
      window.gsRoute('hapusQCSubItem', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim();
          var del = await supa.from('qc_checklist').delete().eq('kode', kode).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Subitem tidak ditemukan.' };
          return { success: true, message: 'Subitem dihapus.' };
        }
      });
