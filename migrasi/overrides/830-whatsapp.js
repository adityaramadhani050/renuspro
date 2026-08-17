      // ── WhatsApp: config + notifikasi (via Edge Function wa-send) ─────────
      //  Token & endpoint hidup di server (app_config 'WA_CONFIG', dibaca Edge
      //  Function wa-send). Frontend menyusun pesan + nomor, lalu memanggil
      //  wa-send. Notifikasi best-effort — TAK memblok/menggagalkan aksi utama.
      //
      //  GATE: Edge Function wa-send & wa-reminder sudah ter-deploy → seluruh
      //  WA (config, notifikasi, reminder QC/DED, review BOM) via Supabase.
      //  Pastikan WA_CONFIG di app_config terisi (endpoint/token/target).
      var ENABLE_WA = true;

      function _normalizePhone(v) {
        var s = (v == null ? '' : v).toString().trim().replace(/[^0-9]/g, '');
        if (!s) return '';
        if (s.charAt(0) === '0') s = '62' + s.slice(1);
        else if (s.charAt(0) === '8') s = '62' + s;
        return s;
      }
      function _waFmtRp(n) { return 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID'); }
      async function _waCfg() { var q = await supa.from('app_config').select('value').eq('key', 'WA_CONFIG').maybeSingle(); var v = (q.data && q.data.value) || {}; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } } return v || {}; }
      async function _waCfgMerge(patch) { var cur = await _waCfg(); var next = {}; for (var k in cur) next[k] = cur[k]; for (var k2 in patch) next[k2] = patch[k2]; var up = await supa.from('app_config').upsert({ key: 'WA_CONFIG', value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' }); return { error: up.error, value: next }; }
      // Kirim best-effort. phones: array nomor | true (grup target) | string.
      function _waSend(phones, message) {
        try {
          if (!ENABLE_WA || !message) return;
          var body = Array.isArray(phones) ? { phones: phones, message: message } : (phones === true ? { toTarget: true, message: message } : { phones: [phones], message: message });
          if (Array.isArray(body.phones)) { body.phones = body.phones.filter(Boolean); if (!body.phones.length) return; }
          supa.functions.invoke('wa-send', { body: body }).catch(function () {});
        } catch (e) {}
      }
      async function _waUsers() { var q = await supa.from('app_user').select('id,nama,role,aktif,no_whatsapp'); return q.data || []; }
      function _waPhonesByRoleList(users, role) { return users.filter(function (u) { return u.role === role && u.aktif !== false && u.no_whatsapp; }).map(function (u) { return _normalizePhone(u.no_whatsapp); }).filter(Boolean); }
      async function _waPhonesByRole(role) { return _waPhonesByRoleList(await _waUsers(), role); }
      async function _waPhonesForAssign(table, noWO) {
        var aq = await supa.from(table).select('id_user').eq('no_wo', noWO);
        var ids = (aq.data || []).map(function (a) { return a.id_user; }).filter(Boolean);
        if (!ids.length) return [];
        var uq = await supa.from('app_user').select('id,aktif,no_whatsapp').in('id', ids);
        return (uq.data || []).filter(function (u) { return u.aktif !== false && u.no_whatsapp; }).map(function (u) { return _normalizePhone(u.no_whatsapp); }).filter(Boolean);
      }
      async function _waProjName(noWO) { try { var q = await supa.from('work_order').select('nama_project').eq('no_wo', noWO).maybeSingle(); return q.data ? (q.data.nama_project || '') : ''; } catch (e) { return ''; } }
      async function _waLabelMap(table) { var q = await supa.from(table).select('kode,label'); var m = {}; (q.data || []).forEach(function (r) { m[(r.kode || '').toString()] = (r.label || '').toString(); }); return m; }
      // Ringkasan status item QC/DED (belum/pending/rejected/approved) untuk reminder.
      async function _engSummaryForWO(masterTable, itemTable, noWO) {
        var mq = await supa.from(masterTable).select('kode,wajib');
        var iq = await supa.from(itemTable).select('kode,status,foto,files').eq('no_wo', noWO);
        var im = {}; (iq.data || []).forEach(function (r) { im[(r.kode || '').toString()] = r; });
        var s = { total: 0, approved: 0, pending: 0, rejected: 0, belum: 0, na: 0 };
        (mq.data || []).forEach(function (m) {
          s.total++; var it = im[(m.kode || '').toString()];
          var files = it ? (_arr(it.foto).length || _arr(it.files).length) : 0;
          var st = it && it.status ? it.status.toString() : (files ? 'Pending' : 'Belum Upload');
          if (st === 'Approved') s.approved++; else if (st === 'Pending') s.pending++; else if (st === 'Rejected') s.rejected++; else if (st === 'NA') s.na++; else s.belum++;
        });
        return s;
      }
      // Cooldown reminder manual (30 mnt/tipe/WO) via localStorage.
      function _waCdCheck(key) { try { var t = parseInt(localStorage.getItem('WACD_' + key) || '0', 10); var rem = 1800000 - (Date.now() - t); return rem > 0 ? Math.max(1, Math.ceil(rem / 60000)) : 0; } catch (e) { return 0; } }
      function _waCdStamp(key) { try { localStorage.setItem('WACD_' + key, Date.now().toString()); } catch (e) {} }

      // ── Komposer notifikasi (self-guard ENABLE_WA) ────────────────────────
      async function _qcNotifLeadReview(noWO, kode, oleh, count, wasStatus) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.qcNotif === false) return; if ((wasStatus || '') === 'Pending') return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('qc_checklist'))[kode] || '';
        _waSend(await _waPhonesByRole('leadengineer'), '🔔 *QC Baru Perlu Direview*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nItem: ' + kode + (lbl ? ' · ' + lbl : '') + '\n' + (count ? count + ' file' : 'Foto') + ' diunggah oleh ' + (oleh || '-') + '.\n\nMohon segera direview di RenusPro.');
      }
      async function _qcNotifSiteReview(noWO, kode, keputusan, catatan) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.qcNotif === false) return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('qc_checklist'))[kode] || '';
        var head = 'WO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nItem: ' + kode + (lbl ? ' · ' + lbl : '') + (catatan ? '\n📝 Catatan: ' + catatan : '');
        var msg = keputusan === 'Approved' ? ('✅ *QC Disetujui*\n' + head + '\n\nKerja bagus! Item ini sudah di-approve.') : ('❌ *QC Ditolak — Perlu Revisi*\n' + head + '\n\nMohon segera perbaiki & upload ulang.');
        _waSend(await _waPhonesForAssign('qc_assignment', noWO), msg);
      }
      async function _dedNotifLeadReview(noWO, kode, oleh, count, wasStatus) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.dedNotif === false) return; if ((wasStatus || '') === 'Pending') return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('ded_checklist'))[kode] || kode;
        _waSend(await _waPhonesByRole('leadengineer'), '📐 *Dokumen DED Baru Perlu Direview*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nDokumen: ' + lbl + '\n' + (count ? count + ' file PDF' : 'Dokumen') + ' diunggah oleh ' + (oleh || '-') + '.\n\nMohon segera direview di RenusPro.');
      }
      async function _dedNotifSiteReview(noWO, kode, keputusan, catatan) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.dedNotif === false) return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('ded_checklist'))[kode] || kode;
        var head = 'WO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nDokumen: ' + lbl + (catatan ? '\n📝 Catatan: ' + catatan : '');
        var msg = keputusan === 'Approved' ? ('✅ *DED Disetujui*\n' + head + '\n\nDokumen ini sudah di-approve.') : ('❌ *DED Ditolak — Perlu Revisi*\n' + head + '\n\nMohon perbaiki & upload ulang.');
        _waSend(await _waPhonesForAssign('ded_assignment', noWO), msg);
      }
      async function _notifAssignEngineer(modul, noWO, userIds) {
        if (!ENABLE_WA || !userIds || !userIds.length) return;
        var proj = await _waProjName(noWO);
        var uq = await supa.from('app_user').select('id,aktif,no_whatsapp').in('id', userIds);
        var phones = (uq.data || []).filter(function (u) { return u.aktif !== false && u.no_whatsapp; }).map(function (u) { return _normalizePhone(u.no_whatsapp); }).filter(Boolean);
        _waSend(phones, '🧑‍🔧 *Penugasan ' + modul + '*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nAnda ditugaskan menangani ' + modul + ' untuk WO ini.\n\nSilakan buka menu ' + modul + ' di RenusPro.');
      }
      async function _notifPOKeGudang(noPO, noWO, supplier, oleh) {
        if (!ENABLE_WA) return; var proj = noWO ? await _waProjName(noWO) : '';
        var lines = ['📦 *Permintaan Penerimaan Barang*', 'PO: *' + noPO + '*', (noWO ? 'WO: ' + noWO + (proj ? ' — ' + proj : '') : 'Peruntukan: Stok'), (supplier ? 'Supplier: ' + supplier : ''), 'Dikirim ke gudang oleh: ' + (oleh || '-'), '', 'Mohon proses di menu Inventory → Penerimaan Barang.'];
        _waSend(await _waPhonesByRole('warehouse'), lines.filter(function (s) { return s !== ''; }).join('\n'));
      }
      async function _notifBarangDiterima(noPO, noWO, statusPO, oleh, catatanList) {
        if (!ENABLE_WA) return; var proj = noWO ? await _waProjName(noWO) : '';
        var lines = [(statusPO === 'Diterima' ? '✅ *Barang Diterima Lengkap*' : '📥 *Barang Diterima Sebagian*'), 'PO: *' + noPO + '*', (noWO ? 'WO: ' + noWO + (proj ? ' — ' + proj : '') : 'Peruntukan: Stok'), 'Status PO: ' + statusPO, 'Diterima oleh: ' + (oleh || '-')];
        if (catatanList && catatanList.length) { lines.push(''); lines.push('📝 Catatan:'); catatanList.forEach(function (c) { lines.push('• ' + c); }); }
        _waSend(await _waPhonesByRole('procurement'), lines.join('\n'));
      }
      async function _notifRequestPembayaran(idReq, ref, jumlah, oleh, catatan) {
        if (!ENABLE_WA) return;
        var lines = ['💰 *Request Pembayaran Baru*', 'ID: *' + idReq + '*', (ref || ''), 'Nominal: ' + _waFmtRp(jumlah), 'Diminta oleh: ' + (oleh || '-'), (catatan ? '📝 ' + catatan : ''), '', 'Mohon direview di menu Purchase Order → Request Pembayaran.'];
        _waSend(await _waPhonesByRole('finance'), lines.filter(function (s) { return s !== ''; }).join('\n'));
      }
      async function _notifHasilPembayaran(idReq, ref, jumlah, disetujui, oleh, catatanTolak) {
        if (!ENABLE_WA) return;
        var lines = [(disetujui ? '✅ *Pembayaran Disetujui*' : '❌ *Pembayaran Ditolak*'), 'ID: *' + idReq + '*', (ref || ''), 'Nominal: ' + _waFmtRp(jumlah), (disetujui ? 'Disetujui' : 'Ditolak') + ' oleh: ' + (oleh || '-'), (!disetujui && catatanTolak ? '📝 Alasan: ' + catatanTolak : '')];
        _waSend(await _waPhonesByRole('procurement'), lines.filter(function (s) { return s !== ''; }).join('\n'));
      }

      // ── Reminder penawaran expired (grup) — dipakai manual & pg_cron ───────
      async function _waReminderExpiredList(intervalHari, forceAll) {
        var todayISO = _todayIso();
        var pq = await _all('penawaran', 'no_penawaran,rev,valid_hingga,nama_project,klien_id,dibuat_oleh,status,reminder_expired');
        var kq = await supa.from('klien').select('id,nama_klien'); var km = {}; (kq.data || []).forEach(function (k) { if (k.id != null) km[k.id.toString()] = k.nama_klien || ''; });
        var latest = {}; (pq.data || []).forEach(function (r) { var no = (r.no_penawaran || '').toString(); if (!no) return; var rev = parseInt(r.rev, 10) || 0; if (!latest[no] || rev > latest[no]._rev) { r._rev = rev; latest[no] = r; } });
        var out = [];
        Object.keys(latest).forEach(function (no) {
          var r = latest[no]; if ((r.status || 'On-Progress') !== 'On-Progress') return;
          var vh = _isoDate(r.valid_hingga); if (!vh) return;
          var mulai = _dDaysISO(todayISO, vh); if (mulai > 1) return;   // reminderMulai = valid-1hari; skip bila valid_hingga > besok
          if (!forceAll) { var last = _isoDate(r.reminder_expired); if (last) { var gap = _dDaysISO(last, todayISO); if (gap != null && gap < (intervalHari || 3)) return; } }
          out.push({ noPenawaran: no, namaProject: (r.nama_project || '').toString(), namaKlien: km[(r.klien_id || '').toString()] || (r.klien_id || '').toString(), dibuatOleh: (r.dibuat_oleh || '').toString(), validHingga: _fmtTgl(vh) });
        });
        return out;
      }
      function _waMsgReminderExpired(list) {
        var lines = ['⏰ *Reminder Follow-up Penawaran*', 'Penawaran berikut akan/sudah lewat tanggal berlaku, mohon segera follow-up ke customer:', '', '📊 Total: *' + list.length + '* penawaran perlu di-follow-up', ''];
        var groups = {}, urut = []; list.forEach(function (it) { var s = it.dibuatOleh || 'Tanpa Sales'; if (!groups[s]) { groups[s] = []; urut.push(s); } groups[s].push(it); });
        urut.forEach(function (s, gi) { lines.push('👤 *' + s + '* (' + groups[s].length + ' penawaran)'); groups[s].forEach(function (it, i) { lines.push((i + 1) + '. ' + it.noPenawaran + ' - ' + it.namaProject + ' (' + it.namaKlien + ') #Exp. ' + it.validHingga); }); if (gi < urut.length - 1) lines.push(''); });
        return lines.join('\n');
      }

      // ── Route WA (aktif hanya bila ENABLE_WA) ─────────────────────────────
      if (ENABLE_WA) {
        window.gsRoute('getWAConfig', { mode: 'fn', handler: async function () { var c = await _waCfg(); return { success: true, enabled: c.enabled === true, endpoint: (c.endpoint || '').toString(), target: (c.target || '').toString(), token: (c.token || '').toString(), qcNotif: c.qcNotif !== false, testNumber: (c.testNumber || '').toString(), testGroup: (c.testGroup || '').toString() }; } });
        window.gsRoute('saveWAConfig', { mode: 'fn', handler: async function (a) { var p = a[0] || {}; var patch = { enabled: !!p.enabled, endpoint: (p.endpoint || '').toString().trim().replace(/\/$/, ''), target: (p.target || '').toString().trim(), token: (p.token || '').toString().trim() }; if (p.qcNotif !== undefined) patch.qcNotif = !!p.qcNotif; if (p.testNumber !== undefined) patch.testNumber = (p.testNumber || '').toString().trim(); if (p.testGroup !== undefined) patch.testGroup = (p.testGroup || '').toString().trim(); var r = await _waCfgMerge(patch); return r.error ? { success: false, message: r.error.message } : { success: true, message: 'Konfigurasi WA Bot berhasil disimpan.' }; } });
        window.gsRoute('testWANotifSample', {
          mode: 'fn',
          handler: async function (a) {
            var p = a[0] || {}, jenis = (p.jenis || '').toString();
            var nomor = (p.nomor || '').toString().trim(), grup = (p.grupId || '').toString().trim();
            var targets = [];
            if (nomor) targets.push(_normalizePhone(nomor) || nomor);   // 08.. → 62..
            if (grup) targets.push(grup);                               // grup JID apa adanya
            if (!targets.length) return { success: false, message: 'Isi nomor atau grup ID pengujian dulu.' };
            var rp = function (n) { return 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID'); };
            var W = 'WO-UJI', P = 'Proyek Uji Coba';
            var M = {
              qc_lead: '🔔 *QC Baru Perlu Direview*\nWO: *' + W + '* — ' + P + '\nItem: A1 · Contoh Item QC\n3 file diunggah oleh Site Engineer.\n\nMohon segera direview di RenusPro.',
              qc_site: '✅ *QC Disetujui*\nWO: *' + W + '* — ' + P + '\nItem: A1 · Contoh Item QC\n\nKerja bagus! Item ini sudah di-approve.',
              ded_lead: '📐 *Dokumen DED Baru Perlu Direview*\nWO: *' + W + '* — ' + P + '\nDokumen: Gambar Kerja\n2 file PDF diunggah oleh Site Engineer.\n\nMohon segera direview di RenusPro.',
              ded_site: '✅ *DED Disetujui*\nWO: *' + W + '* — ' + P + '\nDokumen: Gambar Kerja\n\nDokumen ini sudah di-approve.',
              bom_ajukan: '📋 *BOM Diajukan untuk Review*\nWO: *' + W + '* — ' + P + '\nDiajukan oleh: Site Engineer\n\nRingkasan material:\n• Total: 8 item (3 kategori)\n• Menunggu review: 8\n\nMohon segera direview di menu BOM RenusPro.',
              bom_hasil: '📋 *Hasil Review BOM*\nWO: *' + W + '* — ' + P + '\n✅ Approved: 6\n❌ Rejected: 2\n\nSilakan cek & perbaiki material yang ditolak di menu BOM.',
              assign: '🧑‍🔧 *Penugasan BOM*\nWO: *' + W + '* — ' + P + '\nAnda ditugaskan menangani BOM untuk WO ini.\n\nSilakan buka menu BOM di RenusPro.',
              po_gudang: '📦 *Permintaan Penerimaan Barang*\nPO: *PO-UJI*\nWO: ' + W + ' — ' + P + '\nSupplier: PT Contoh Supplier\nDikirim ke gudang oleh: Procurement\n\nMohon proses di menu Inventory → Penerimaan Barang.',
              barang_diterima: '✅ *Barang Diterima Lengkap*\nPO: *PO-UJI*\nWO: ' + W + ' — ' + P + '\nStatus PO: Diterima\nDiterima oleh: Warehouse',
              req_bayar: '💰 *Request Pembayaran Baru*\nID: *REQ-UJI*\nPO: PO-UJI · WO: ' + W + '\nNominal: ' + rp(5000000) + '\nDiminta oleh: Procurement\n\nMohon direview di menu Purchase Order → Request Pembayaran.',
              hasil_bayar: '✅ *Pembayaran Disetujui*\nID: *REQ-UJI*\nPO: PO-UJI\nNominal: ' + rp(5000000) + '\nDisetujui oleh: Finance',
              reminder_expired: '⏰ *Reminder Penawaran Akan Expired*\n\n• 001/QUOT/UJI — ' + P + ' (Valid s/d besok)\n\nMohon segera follow-up ke klien.',
              remind_engineer: '🔔 *Pengingat Tugas Engineering*\nWO: *' + W + '* — ' + P + '\nMohon segera selesaikan tugas QC/DED/BOM yang masih pending di RenusPro.'
            };
            var base = M[jenis];
            if (!base) return { success: false, message: 'Jenis notifikasi tidak dikenal.' };
            var msg = base + '\n\n_(Pesan uji coba dari Pengaturan RenusPro)_';
            var r = await supa.functions.invoke('wa-send', { body: { phones: targets, message: msg } });
            if (r.error) return { success: false, message: 'Gagal kirim: ' + r.error.message };
            var d = r.data || {}; if (d.skipped) return { success: false, message: 'Tidak terkirim (' + (d.reason || 'WA nonaktif/endpoint kosong') + ').' };
            return { success: (d.sent || 0) > 0, message: (d.sent || 0) > 0 ? 'Pesan uji terkirim ke ' + (d.sent || 0) + ' tujuan.' : 'Tidak terkirim ke tujuan.' };
          }
        });
        window.gsRoute('getWAReminderScheduleConfig', { mode: 'fn', handler: async function () { var c = await _waCfg(); return { success: true, jam: parseInt(c.reminderHour, 10) || 8, intervalHari: parseInt(c.reminderInterval, 10) || 3 }; } });
        window.gsRoute('saveWAReminderScheduleConfig', { mode: 'fn', handler: async function (a) { var p = a[0] || {}; var jam = parseInt(p.jam, 10); if (isNaN(jam) || jam < 0 || jam > 23) jam = 8; var iv = parseInt(p.intervalHari, 10); if (isNaN(iv) || iv < 1) iv = 1; var r = await _waCfgMerge({ reminderHour: jam, reminderInterval: iv }); return r.error ? { success: false, message: r.error.message } : { success: true, message: 'Jadwal reminder disimpan: jam ' + jam + ':00, diulang tiap ' + iv + ' hari.' }; } });
        window.gsRoute('testWANotif', {
          mode: 'fn', handler: async function (a) {
            var p = a[0] || {}, patch = {};
            if (p.endpoint !== undefined) patch.endpoint = (p.endpoint || '').toString().trim().replace(/\/$/, '');
            if (p.target !== undefined) patch.target = (p.target || '').toString().trim();
            if (p.token !== undefined) patch.token = (p.token || '').toString().trim();
            patch.enabled = (p.enabled !== undefined) ? !!p.enabled : true;
            await _waCfgMerge(patch);
            var r = await supa.functions.invoke('wa-send', { body: { toTarget: true, message: '✅ *Test Notifikasi RenusPro*\nKonfigurasi WA Bot berhasil terhubung!' } });
            if (r.error) return { success: false, message: 'Gagal kirim: ' + r.error.message };
            var d = r.data || {}; if (d.skipped) return { success: false, message: 'Tidak terkirim (' + (d.reason || 'nonaktif/endpoint kosong') + ').' };
            return { success: (d.sent || 0) > 0, message: (d.sent || 0) > 0 ? 'Pesan tes terkirim.' : 'Tidak terkirim ke tujuan.' };
          }
        });
        window.gsRoute('ajukanReviewBOM', {
          mode: 'fn', handler: async function (a) {
            var noWO = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
            if (!noWO) return { success: false, message: 'No WO wajib.' };
            var bq = await _all('bom_item', 'kategori,status', function (q) { return q.eq('no_wo', noWO); });
            var items = bq.data || []; if (!items.length) return { success: false, message: 'Belum ada material di BOM.' };
            var pending = items.filter(function (x) { return (x.status || '') === 'Pending'; }).length;
            if (!pending) return { success: false, message: 'Tidak ada material Pending yang perlu diajukan.' };
            var phones = await _waPhonesByRole('leadengineer'); if (!phones.length) return { success: false, message: 'Tidak ada Lead Engineer dengan No. WhatsApp.' };
            var kat = {}; items.forEach(function (x) { kat[(x.kategori || 'Lainnya')] = 1; });
            var proj = await _waProjName(noWO);
            _waSend(phones, '📋 *BOM Diajukan untuk Review*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nDiajukan oleh: ' + (oleh || '-') + '\n\nRingkasan material:\n• Total: ' + items.length + ' item (' + Object.keys(kat).length + ' kategori)\n• Menunggu review: ' + pending + '\n\nMohon segera direview di menu BOM RenusPro.');
            return { success: true, message: 'Pengajuan review terkirim ke ' + phones.length + ' Lead Engineer (' + pending + ' material menunggu review).' };
          }
        });
        window.gsRoute('kirimHasilReviewBOM', {
          mode: 'fn', handler: async function (a) {
            var noWO = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
            if (!noWO) return { success: false, message: 'No WO wajib.' };
            var bq = await _all('bom_item', 'nama_material,status,catatan_review', function (q) { return q.eq('no_wo', noWO); });
            var items = bq.data || [];
            var approved = items.filter(function (x) { return (x.status || '') === 'Approved'; }).length;
            var rejected = items.filter(function (x) { return (x.status || '') === 'Rejected'; });
            var pending = items.filter(function (x) { return (x.status || '') === 'Pending'; }).length;
            if (approved + rejected.length === 0) return { success: false, message: 'Belum ada material yang direview (approve/reject).' };
            var phones = await _waPhonesForAssign('bom_assignment', noWO);
            var proj = await _waProjName(noWO);
            var lines = ['📋 *Hasil Review BOM*', 'WO: *' + noWO + '*' + (proj ? ' — ' + proj : ''), 'Direview oleh: ' + (oleh || '-'), '', '✅ Disetujui: ' + approved, '❌ Ditolak: ' + rejected.length];
            if (pending > 0) lines.push('⏳ Belum direview: ' + pending);
            if (rejected.length) { lines.push(''); lines.push('📝 Material ditolak:'); rejected.slice(0, 15).forEach(function (it) { lines.push('• ' + (it.nama_material || '-') + (it.catatan_review ? ' — ' + it.catatan_review : '')); }); if (rejected.length > 15) lines.push('• …dan ' + (rejected.length - 15) + ' lainnya'); }
            lines.push(''); lines.push('Buka menu BOM untuk detail.');
            _waSend(phones, lines.join('\n'));
            return { success: true, message: 'Hasil review terkirim ke ' + phones.length + ' Site Engineer.' };
          }
        });
        // Reminder manual QC/DED (cooldown 30 mnt/tipe/WO via localStorage)
        function _mkRemind(fnName, cdType, masterTable, itemTable, assignTable, target, isLead) {
          window.gsRoute(fnName, {
            mode: 'fn', handler: async function (a) {
              var noWO = (a[0] || '').toString().trim(); if (!noWO) return { success: false, message: 'No WO wajib.' };
              var rem = _waCdCheck(cdType + '_' + noWO); if (rem > 0) return { success: false, message: 'Reminder baru dikirim. Coba lagi dalam ' + rem + ' menit.' };
              var s = await _engSummaryForWO(masterTable, itemTable, noWO);
              var proj = await _waProjName(noWO);
              var isDED = masterTable.indexOf('ded') === 0, kata = isDED ? 'dokumen' : 'item', modul = isDED ? 'DED' : 'QC';
              var msg, phones;
              if (isLead) {
                if (!s.pending) return { success: false, message: 'Tidak ada ' + kata + ' menunggu review.' };
                phones = await _waPhonesByRole('leadengineer');
                msg = '🔔 *Reminder Review ' + modul + '*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\n' + s.pending + ' ' + kata + ' menunggu direview.\n\nMohon segera direview di RenusPro.';
              } else {
                if (s.belum + s.rejected === 0) return { success: false, message: 'Tidak ada yang perlu dilengkapi.' };
                phones = await _waPhonesForAssign(assignTable, noWO);
                var parts = []; if (s.belum) parts.push(s.belum + ' ' + kata + ' belum diupload'); if (s.rejected) parts.push(s.rejected + ' ' + kata + ' ditolak (perlu revisi)');
                msg = '🔔 *Reminder ' + modul + '*\nWO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nMohon segera lengkapi: ' + parts.join(' & ') + '.\n\nSilakan upload di RenusPro.';
              }
              if (!phones.length) return { success: false, message: 'Tidak ada penerima dengan No. WhatsApp.' };
              _waSend(phones, msg); _waCdStamp(cdType + '_' + noWO);
              return { success: true, message: 'Reminder terkirim.' };
            }
          });
        }
        _mkRemind('qcRemindSiteEngineer', 'site', 'qc_checklist', 'qc_item', 'qc_assignment', 'site', false);
        _mkRemind('qcRemindLeadEngineer', 'lead', 'qc_checklist', 'qc_item', 'qc_assignment', 'lead', true);
        _mkRemind('dedRemindSiteEngineer', 'dedsite', 'ded_checklist', 'ded_item', 'ded_assignment', 'site', false);
        _mkRemind('dedRemindLeadEngineer', 'dedlead', 'ded_checklist', 'ded_item', 'ded_assignment', 'lead', true);
        window.gsRoute('kirimReminderExpiredManual', {
          mode: 'fn', handler: async function () {
            var c = await _waCfg(); if (!c.enabled || !c.endpoint || !c.target) return { success: false, message: 'WA Bot belum aktif / endpoint / target kosong.' };
            var list = await _waReminderExpiredList(parseInt(c.reminderInterval, 10) || 3, true);
            if (!list.length) return { success: true, message: 'Tidak ada penawaran yang perlu di-reminder.', count: 0 };
            _waSend(true, _waMsgReminderExpired(list));
            var nowIso = new Date().toISOString();
            for (var i = 0; i < list.length; i++) { await supa.from('penawaran').update({ reminder_expired: nowIso }).eq('no_penawaran', list[i].noPenawaran); }
            return { success: true, message: 'Reminder terkirim untuk ' + list.length + ' penawaran.', count: list.length };
          }
        });
      }
