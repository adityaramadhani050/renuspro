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

      // ══════════════════════════════════════════════════════════════════════
      //  TEKS PESAN NOTIFIKASI WA — TERPUSAT (edit di sini bila ingin ubah teks)
      //  Semua notifikasi WA memakai builder di _WA_MSG. Logika penerima &
      //  pemicu tetap di composer masing-masing; HANYA teks yang di sini.
      //  Placeholder = properti objek `d` yang dikirim composer (mis. d.noWO).
      // ══════════════════════════════════════════════════════════════════════
      function _waNonEmpty(s) { return s !== ''; }
      var _WA_MSG = {
        // QC — perlu review (ke Lead Engineer)
        qcLead: function (d) {
          return '🔔 *QC Baru Perlu Direview*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nItem: ' + d.kode + (d.label ? ' · ' + d.label : '') + '\n' + (d.count ? d.count + ' file' : 'Foto') + ' diunggah oleh ' + (d.oleh || '-') + '.\n\nMohon segera direview di RenusPro.';
        },
        // QC — hasil review (ke pelaksana). d.approved = true/false
        qcSite: function (d) {
          var head = 'WO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nItem: ' + d.kode + (d.label ? ' · ' + d.label : '') + (d.catatan ? '\n📝 Catatan: ' + d.catatan : '');
          return d.approved ? ('✅ *QC Disetujui*\n' + head + '\n\nKerja bagus! Item ini sudah di-approve.') : ('❌ *QC Ditolak — Perlu Revisi*\n' + head + '\n\nMohon segera perbaiki & upload ulang.');
        },
        // DED — perlu review (ke Lead Engineer)
        dedLead: function (d) {
          return '📐 *Dokumen DED Baru Perlu Direview*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nDokumen: ' + d.label + '\n' + (d.count ? d.count + ' file PDF' : 'Dokumen') + ' diunggah oleh ' + (d.oleh || '-') + '.\n\nMohon segera direview di RenusPro.';
        },
        // DED — hasil review (ke pelaksana). d.approved = true/false
        dedSite: function (d) {
          var head = 'WO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nDokumen: ' + d.label + (d.catatan ? '\n📝 Catatan: ' + d.catatan : '');
          return d.approved ? ('✅ *DED Disetujui*\n' + head + '\n\nDokumen ini sudah di-approve.') : ('❌ *DED Ditolak — Perlu Revisi*\n' + head + '\n\nMohon perbaiki & upload ulang.');
        },
        // Penugasan engineer (BOM/QC/DED). d.modul = 'BOM'|'QC'|'DED'
        assignEngineer: function (d) {
          return '🧑‍🔧 *Penugasan ' + d.modul + '*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nAnda ditugaskan menangani ' + d.modul + ' untuk WO ini.\n\nSilakan buka menu ' + d.modul + ' di RenusPro.';
        },
        // PO dikirim ke gudang (ke Warehouse)
        poKeGudang: function (d) {
          return ['📦 *Permintaan Penerimaan Barang*', 'PO: *' + d.noPO + '*', (d.noWO ? 'WO: ' + d.noWO + (d.proj ? ' — ' + d.proj : '') : 'Peruntukan: Stok'), (d.supplier ? 'Supplier: ' + d.supplier : ''), 'Dikirim ke gudang oleh: ' + (d.oleh || '-'), '', 'Mohon proses di menu Inventory → Penerimaan Barang.'].filter(_waNonEmpty).join('\n');
        },
        // Barang PO diterima (ke Procurement). d.lengkap = true/false; d.catatanList = []
        barangDiterima: function (d) {
          var lines = [(d.lengkap ? '✅ *Barang Diterima Lengkap*' : '📥 *Barang Diterima Sebagian*'), 'PO: *' + d.noPO + '*', (d.noWO ? 'WO: ' + d.noWO + (d.proj ? ' — ' + d.proj : '') : 'Peruntukan: Stok'), 'Status PO: ' + d.statusPO, 'Diterima oleh: ' + (d.oleh || '-')];
          if (d.catatanList && d.catatanList.length) { lines.push(''); lines.push('📝 Catatan:'); d.catatanList.forEach(function (c) { lines.push('• ' + c); }); }
          return lines.join('\n');
        },
        // Request pembayaran PO/Non-PO (ke Finance)
        requestPembayaran: function (d) {
          return ['💰 *Request Pembayaran Baru*', 'ID: *' + d.idReq + '*', (d.ref || ''), 'Nominal: ' + _waFmtRp(d.jumlah), 'Diminta oleh: ' + (d.oleh || '-'), (d.catatan ? '📝 ' + d.catatan : ''), '', 'Mohon direview di menu Cash Manager → tab Permintaan Pembayaran PO.'].filter(_waNonEmpty).join('\n');
        },
        // Hasil pembayaran (ke Procurement). d.disetujui = true/false
        hasilPembayaran: function (d) {
          return [(d.disetujui ? '✅ *Pembayaran Disetujui*' : '❌ *Pembayaran Ditolak*'), 'ID: *' + d.idReq + '*', (d.ref || ''), 'Nominal: ' + _waFmtRp(d.jumlah), (d.disetujui ? 'Disetujui' : 'Ditolak') + ' oleh: ' + (d.oleh || '-'), (!d.disetujui && d.catatanTolak ? '📝 Alasan: ' + d.catatanTolak : '')].filter(_waNonEmpty).join('\n');
        },
        // Request penambahan stok (ke Procurement)
        requestStok: function (d) {
          return ['📦 *Permintaan Penambahan Stok*', 'ID: *' + d.id + '*', 'Item: ' + (d.namaItem || '-') + ' — ' + (Number(d.qty) || 0) + ' ' + (d.satuan || ''), 'Diminta oleh: ' + (d.oleh || '-') + ' (Warehouse)', (d.catatan ? '📝 ' + d.catatan : ''), '', '\nMohon ditindaklanjuti di menu Purchase Order → tab Request Stok.'].filter(_waNonEmpty).join('\n');
        },
        // Maintenance baru diajukan (ke Project Coordinator)
        maintenanceBaru: function (d) {
          return ['🛠️ *Pengajuan Maintenance Baru*', 'ID: *' + d.id + '*', 'Site/Project: ' + (d.project || '-'), (d.lokasi ? 'Lokasi: ' + d.lokasi : ''), (d.jenis ? 'Jenis: ' + d.jenis : ''), 'Prioritas: ' + (d.prioritas || 'Normal'), 'Diajukan oleh: ' + (d.oleh || '-'), '', '\nMohon dijadwalkan di menu Maintenance.'].filter(_waNonEmpty).join('\n');
        },
        // Maintenance ditugaskan ke teknisi
        maintenanceDitugaskan: function (d) {
          return ['🛠️ *Penugasan Maintenance*', 'ID: *' + d.id + '*', 'Site/Project: ' + (d.project || '-'), (d.jadwal ? 'Jadwal: ' + d.jadwal : ''), '', '\nAnda ditugaskan menangani maintenance ini. Lihat di menu Maintenance.'].filter(_waNonEmpty).join('\n');
        },
        // Hand Over dijadwalkan (ke peserta)
        handOverDijadwalkan: function (d) {
          return ['📅 *Hand Over Dijadwalkan*', 'WO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : ''),
            'Jadwal: ' + (d.tanggal || '-') + (d.waktu ? ' · ' + d.waktu : ''), 'Mode: ' + (d.mode || '-'),
            (d.mode !== 'Offline' && d.link ? 'Link: ' + d.link : ''), (d.mode !== 'Online' && d.lokasi ? 'Lokasi: ' + d.lokasi : ''),
            'Pembayaran: ' + d.bayarStr, 'Dijadwalkan oleh: ' + (d.oleh || '-'), ''].filter(_waNonEmpty).join('\n');
        },
        // BOM diajukan untuk review (ke Lead Engineer)
        bomAjukan: function (d) {
          return '📋 *BOM Diajukan untuk Review*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nDiajukan oleh: ' + (d.oleh || '-') + '\n\nRingkasan material:\n• Total: ' + d.total + ' item (' + d.kategori + ' kategori)\n• Menunggu review: ' + d.pending + '\n\nMohon segera direview di menu BOM RenusPro.';
        },
        // BOM hasil review (ke pelaksana). d.rejectedList = [{nama_material,catatan_review}]
        bomHasil: function (d) {
          var lines = ['📋 *Hasil Review BOM*', 'WO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : ''), 'Direview oleh: ' + (d.oleh || '-'), '', '✅ Disetujui: ' + d.approved, '❌ Ditolak: ' + d.rejectedCount];
          if (d.pending > 0) lines.push('⏳ Belum direview: ' + d.pending);
          if (d.rejectedList && d.rejectedList.length) { lines.push(''); lines.push('📝 Material ditolak:'); d.rejectedList.slice(0, 15).forEach(function (it) { lines.push('• ' + (it.nama_material || '-') + (it.catatan_review ? ' — ' + it.catatan_review : '')); }); if (d.rejectedList.length > 15) lines.push('• …dan ' + (d.rejectedList.length - 15) + ' lainnya'); }
          lines.push(''); lines.push('Buka menu BOM untuk detail.');
          return lines.join('\n');
        },
        // Reminder review QC/DED (ke Lead Engineer). d.modul, d.kata
        reminderReviewLead: function (d) {
          return '🔔 *Reminder Review ' + d.modul + '*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\n' + d.pending + ' ' + d.kata + ' menunggu direview.\n\nMohon segera direview di RenusPro.';
        },
        // Reminder lengkapi QC/DED (ke pelaksana). d.modul, d.parts (string gabungan)
        reminderPelaksana: function (d) {
          return '🔔 *Reminder ' + d.modul + '*\nWO: *' + d.noWO + '*' + (d.proj ? ' — ' + d.proj : '') + '\nMohon segera lengkapi: ' + d.parts + '.\n\nSilakan upload di RenusPro.';
        },
        // Reminder follow-up penawaran expired (grup). arg = list penawaran
        reminderExpired: function (list) {
          var lines = ['⏰ *Reminder Follow-up Penawaran*', 'Penawaran berikut akan/sudah lewat tanggal berlaku, mohon segera follow-up ke customer:', '', '📊 Total: *' + list.length + '* penawaran perlu di-follow-up', ''];
          var groups = {}, urut = []; list.forEach(function (it) { var s = it.dibuatOleh || 'Tanpa Sales'; if (!groups[s]) { groups[s] = []; urut.push(s); } groups[s].push(it); });
          urut.forEach(function (s, gi) { lines.push('👤 *' + s + '* (' + groups[s].length + ' penawaran)'); groups[s].forEach(function (it, i) { lines.push((i + 1) + '. ' + it.noPenawaran + ' - ' + it.namaProject + ' (' + it.namaKlien + ') #Exp. ' + it.validHingga); }); if (gi < urut.length - 1) lines.push(''); });
          return lines.join('\n');
        }
      };

      // ── Komposer notifikasi (self-guard ENABLE_WA) ────────────────────────
      async function _qcNotifLeadReview(noWO, kode, oleh, count, wasStatus) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.qcNotif === false) return; if ((wasStatus || '') === 'Pending') return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('qc_checklist'))[kode] || '';
        _waSend(await _waPhonesByRole('leadengineer'), _WA_MSG.qcLead({ noWO: noWO, proj: proj, kode: kode, label: lbl, count: count, oleh: oleh }));
      }
      async function _qcNotifSiteReview(noWO, kode, keputusan, catatan) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.qcNotif === false) return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('qc_checklist'))[kode] || '';
        _waSend(await _waPhonesForAssign('qc_assignment', noWO), _WA_MSG.qcSite({ noWO: noWO, proj: proj, kode: kode, label: lbl, catatan: catatan, approved: keputusan === 'Approved' }));
      }
      async function _dedNotifLeadReview(noWO, kode, oleh, count, wasStatus) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.dedNotif === false) return; if ((wasStatus || '') === 'Pending') return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('ded_checklist'))[kode] || kode;
        _waSend(await _waPhonesByRole('leadengineer'), _WA_MSG.dedLead({ noWO: noWO, proj: proj, label: lbl, count: count, oleh: oleh }));
      }
      async function _dedNotifSiteReview(noWO, kode, keputusan, catatan) {
        if (!ENABLE_WA) return; var c = await _waCfg(); if (c.dedNotif === false) return;
        var proj = await _waProjName(noWO), lbl = (await _waLabelMap('ded_checklist'))[kode] || kode;
        _waSend(await _waPhonesForAssign('ded_assignment', noWO), _WA_MSG.dedSite({ noWO: noWO, proj: proj, label: lbl, catatan: catatan, approved: keputusan === 'Approved' }));
      }
      async function _notifAssignEngineer(modul, noWO, userIds) {
        if (!ENABLE_WA || !userIds || !userIds.length) return;
        var proj = await _waProjName(noWO);
        var uq = await supa.from('app_user').select('id,aktif,no_whatsapp').in('id', userIds);
        var phones = (uq.data || []).filter(function (u) { return u.aktif !== false && u.no_whatsapp; }).map(function (u) { return _normalizePhone(u.no_whatsapp); }).filter(Boolean);
        _waSend(phones, _WA_MSG.assignEngineer({ modul: modul, noWO: noWO, proj: proj }));
      }
      async function _notifPOKeGudang(noPO, noWO, supplier, oleh) {
        if (!ENABLE_WA) return; var proj = noWO ? await _waProjName(noWO) : '';
        _waSend(await _waPhonesByRole('warehouse'), _WA_MSG.poKeGudang({ noPO: noPO, noWO: noWO, proj: proj, supplier: supplier, oleh: oleh }));
      }
      async function _notifHandOverDijadwalkan(noWO, tanggal, waktu, mode, link, lokasi, oleh, peserta) {
        if (!ENABLE_WA) return;
        // Kirim ke peserta yang dipilih Project Coordinator (daftar user id;
        // fallback nama untuk kompat data lama).
        var toks = (peserta || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!toks.length) return;
        var idSet = {}, nameSet = {};
        toks.forEach(function (t) { idSet[t] = 1; nameSet[t.toLowerCase()] = 1; });
        var users = await _waUsers();
        var seen = {}, phones = [];
        users.forEach(function (u) {
          if (u.aktif === false || !u.no_whatsapp) return;
          var match = idSet[(u.id != null ? u.id.toString() : '')] || nameSet[(u.nama || '').toLowerCase()];
          if (!match) return;
          var ph = _normalizePhone(u.no_whatsapp);
          if (ph && !seen[ph]) { seen[ph] = 1; phones.push(ph); }
        });
        if (!phones.length) return;
        var proj = await _waProjName(noWO);
        var bayar = (typeof _woPembayaranLunas === 'function') ? await _woPembayaranLunas(noWO) : { count: 0, total: 0 };
        var bayarStr = bayar.count ? ('Lunas ' + bayar.count + ' invoice · ' + _waFmtRp(bayar.total)) : 'Belum ada pembayaran lunas';
        _waSend(phones, _WA_MSG.handOverDijadwalkan({ noWO: noWO, proj: proj, tanggal: tanggal, waktu: waktu, mode: mode, link: link, lokasi: lokasi, bayarStr: bayarStr, oleh: oleh }));
      }
      async function _notifMaintenanceBaru(id, project, lokasi, oleh, jenis, prioritas) {
        if (!ENABLE_WA) return;
        _waSend(await _waPhonesByRole('projectcoordinator'), _WA_MSG.maintenanceBaru({ id: id, project: project, lokasi: lokasi, jenis: jenis, prioritas: prioritas, oleh: oleh }));
      }
      async function _notifMaintenanceDitugaskan(teknisiId, id, project, tglJadwal) {
        if (!ENABLE_WA || !teknisiId) return;
        var uq = await supa.from('app_user').select('id,aktif,no_whatsapp').eq('id', teknisiId).maybeSingle();
        if (!uq.data || uq.data.aktif === false || !uq.data.no_whatsapp) return;
        var phone = _normalizePhone(uq.data.no_whatsapp); if (!phone) return;
        _waSend([phone], _WA_MSG.maintenanceDitugaskan({ id: id, project: project, jadwal: tglJadwal }));
      }
      async function _notifRequestStok(id, namaItem, qty, satuan, oleh, catatan) {
        if (!ENABLE_WA) return;
        _waSend(await _waPhonesByRole('procurement'), _WA_MSG.requestStok({ id: id, namaItem: namaItem, qty: qty, satuan: satuan, oleh: oleh, catatan: catatan }));
      }
      async function _notifBarangDiterima(noPO, noWO, statusPO, oleh, catatanList) {
        if (!ENABLE_WA) return; var proj = noWO ? await _waProjName(noWO) : '';
        _waSend(await _waPhonesByRole('procurement'), _WA_MSG.barangDiterima({ noPO: noPO, noWO: noWO, proj: proj, statusPO: statusPO, oleh: oleh, lengkap: statusPO === 'Diterima', catatanList: catatanList }));
      }
      async function _notifRequestPembayaran(idReq, ref, jumlah, oleh, catatan) {
        if (!ENABLE_WA) return;
        _waSend(await _waPhonesByRole('finance'), _WA_MSG.requestPembayaran({ idReq: idReq, ref: ref, jumlah: jumlah, oleh: oleh, catatan: catatan }));
      }
      async function _notifHasilPembayaran(idReq, ref, jumlah, disetujui, oleh, catatanTolak) {
        if (!ENABLE_WA) return;
        _waSend(await _waPhonesByRole('procurement'), _WA_MSG.hasilPembayaran({ idReq: idReq, ref: ref, jumlah: jumlah, disetujui: disetujui, oleh: oleh, catatanTolak: catatanTolak }));
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
        return _WA_MSG.reminderExpired(list);
      }

      // ── Route WA (aktif hanya bila ENABLE_WA) ─────────────────────────────
      if (ENABLE_WA) {
        window.gsRoute('getWAConfig', { mode: 'fn', handler: async function () { var c = await _waCfg(); return { success: true, enabled: c.enabled === true, endpoint: (c.endpoint || '').toString(), target: (c.target || '').toString(), token: (c.token || '').toString(), qcNotif: c.qcNotif !== false, testNumber: (c.testNumber || '').toString(), testGroup: (c.testGroup || '').toString() }; } });
        window.gsRoute('saveWAConfig', { mode: 'fn', handler: async function (a) { var p = a[0] || {}; var patch = { enabled: !!p.enabled, endpoint: (p.endpoint || '').toString().trim().replace(/\/$/, ''), target: (p.target || '').toString().trim(), token: (p.token || '').toString().trim() }; if (p.qcNotif !== undefined) patch.qcNotif = !!p.qcNotif; if (p.testNumber !== undefined) patch.testNumber = (p.testNumber || '').toString().trim(); if (p.testGroup !== undefined) patch.testGroup = (p.testGroup || '').toString().trim(); if (p.reminderHour !== undefined) { var _jam = parseInt(p.reminderHour, 10); if (!isNaN(_jam) && _jam >= 0 && _jam <= 23) patch.reminderHour = _jam; } if (p.reminderInterval !== undefined) { var _iv = parseInt(p.reminderInterval, 10); if (!isNaN(_iv) && _iv >= 1) patch.reminderInterval = _iv; } var r = await _waCfgMerge(patch); return r.error ? { success: false, message: r.error.message } : { success: true, message: 'Konfigurasi WA Bot berhasil disimpan.' }; } });
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
            // Contoh preview memakai builder terpusat _WA_MSG (satu sumber teks).
            var M = {
              qc_lead: _WA_MSG.qcLead({ noWO: W, proj: P, kode: 'A1', label: 'Contoh Item QC', count: 3, oleh: 'Site Engineer' }),
              qc_site: _WA_MSG.qcSite({ noWO: W, proj: P, kode: 'A1', label: 'Contoh Item QC', catatan: '', approved: true }),
              ded_lead: _WA_MSG.dedLead({ noWO: W, proj: P, label: 'Gambar Kerja', count: 2, oleh: 'Site Engineer' }),
              ded_site: _WA_MSG.dedSite({ noWO: W, proj: P, label: 'Gambar Kerja', catatan: '', approved: true }),
              bom_ajukan: _WA_MSG.bomAjukan({ noWO: W, proj: P, oleh: 'Site Engineer', total: 8, kategori: 3, pending: 8 }),
              bom_hasil: _WA_MSG.bomHasil({ noWO: W, proj: P, oleh: 'Lead Engineer', approved: 6, rejectedCount: 2, pending: 0, rejectedList: [{ nama_material: 'Kabel NYY 3x2.5', catatan_review: 'Merek tidak sesuai' }, { nama_material: 'MCB 32A', catatan_review: '' }] }),
              assign: _WA_MSG.assignEngineer({ modul: 'BOM', noWO: W, proj: P }),
              po_gudang: _WA_MSG.poKeGudang({ noPO: 'PO-UJI', noWO: W, proj: P, supplier: 'PT Contoh Supplier', oleh: 'Procurement' }),
              barang_diterima: _WA_MSG.barangDiterima({ noPO: 'PO-UJI', noWO: W, proj: P, statusPO: 'Diterima', oleh: 'Warehouse', lengkap: true, catatanList: [] }),
              req_bayar: _WA_MSG.requestPembayaran({ idReq: 'REQ-UJI', ref: 'PO: PO-UJI · WO: ' + W + ' — ' + P, jumlah: 5000000, oleh: 'Procurement', catatan: '' }),
              hasil_bayar: _WA_MSG.hasilPembayaran({ idReq: 'REQ-UJI', ref: 'PO: PO-UJI', jumlah: 5000000, disetujui: true, oleh: 'Finance' }),
              req_stok: _WA_MSG.requestStok({ id: 'REQ-STK-UJI', namaItem: 'Panel Surya 550Wp', qty: 10, satuan: 'pcs', oleh: 'Warehouse', catatan: 'Stok menipis' }),
              maintenance_baru: _WA_MSG.maintenanceBaru({ id: 'MTN-UJI', project: P, lokasi: 'Surabaya', jenis: 'Perbaikan', prioritas: 'Tinggi', oleh: 'Sales' }),
              maintenance_tugas: _WA_MSG.maintenanceDitugaskan({ id: 'MTN-UJI', project: P, jadwal: 'besok' }),
              ho_dijadwalkan: _WA_MSG.handOverDijadwalkan({ noWO: W, proj: P, tanggal: '20/08/2026', waktu: '10:00', mode: 'Offline', link: '', lokasi: 'Kantor Klien', bayarStr: 'Lunas 1 invoice · ' + rp(12000000), oleh: 'Project Coordinator' }),
              reminder_expired: _WA_MSG.reminderExpired([{ noPenawaran: '001/QUOT/UJI', namaProject: P, namaKlien: 'Klien Uji', dibuatOleh: 'Sales', validHingga: 'besok' }]),
              remind_engineer: _WA_MSG.reminderReviewLead({ modul: 'QC', noWO: W, proj: P, pending: 3, kata: 'item' })
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
            _waSend(phones, _WA_MSG.bomAjukan({ noWO: noWO, proj: proj, oleh: oleh, total: items.length, kategori: Object.keys(kat).length, pending: pending }));
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
            _waSend(phones, _WA_MSG.bomHasil({ noWO: noWO, proj: proj, oleh: oleh, approved: approved, rejectedCount: rejected.length, pending: pending, rejectedList: rejected }));
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
                msg = _WA_MSG.reminderReviewLead({ modul: modul, noWO: noWO, proj: proj, pending: s.pending, kata: kata });
              } else {
                if (s.belum + s.rejected === 0) return { success: false, message: 'Tidak ada yang perlu dilengkapi.' };
                phones = await _waPhonesForAssign(assignTable, noWO);
                var parts = []; if (s.belum) parts.push(s.belum + ' ' + kata + ' belum diupload'); if (s.rejected) parts.push(s.rejected + ' ' + kata + ' ditolak (perlu revisi)');
                msg = _WA_MSG.reminderPelaksana({ modul: modul, noWO: noWO, proj: proj, parts: parts.join(' & ') });
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
