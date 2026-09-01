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
          var mode = (p.mode || '').toString(); if (mode !== 'Online' && mode !== 'Offline' && mode !== 'Hybrid') return { success: false, message: 'Pilih mode Online/Offline/Hybrid.' };
          var link = (p.link || '').toString().trim(), lokasi = (p.lokasi || '').toString().trim();
          var needLink = (mode === 'Online' || mode === 'Hybrid'), needLokasi = (mode === 'Offline' || mode === 'Hybrid');
          if (needLink && !link) return { success: false, message: 'Isi link meeting.' };
          if (needLokasi && !lokasi) return { success: false, message: 'Isi lokasi hand over.' };
          var ho = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
          if (!ho.data) return { success: false, message: 'Request Hand Over belum ada untuk WO ini.' };
          var st = (ho.data.status || ''); if (st !== 'Diminta' && st !== 'Dijadwalkan') return { success: false, message: 'Hand Over tidak bisa dijadwalkan (status ' + st + ').' };
          var upd = { status: 'Dijadwalkan', tgl_jadwal: tanggal, waktu: waktu, mode: mode, link_meet: (needLink ? link : ''), lokasi: (needLokasi ? lokasi : ''), peserta: (p.peserta || '').toString(), catatan_undangan: (p.catatan || '').toString(), dijadwalkan_oleh: (p.oleh || '').toString(), dijadwalkan_pada: new Date().toISOString() };
          if ((p.meetEventId || '').toString()) upd.meet_event_id = (p.meetEventId || '').toString();
          var up = await supa.from('hand_over').update(upd).eq('no_wo', noWO);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _notifHandOverDijadwalkan === 'function') _notifHandOverDijadwalkan(noWO, tanggal, waktu, mode, (needLink ? link : ''), (needLokasi ? lokasi : ''), (p.oleh || ''), (p.peserta || ''));
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

      // ── Buat/Edit Penawaran & PO (fungsi inti yang sebelumnya belum ada) ──
      async function _hoStatus(noWO) {
        if (!noWO) return '';
        var q = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
        return q.data ? (q.data.status || '') : '';
      }
      function _isSameJkMonth(v) {
        if (!v) return false; var s = v.toString(); var m = s.match(/^(\d{4})-(\d{2})/); if (!m) { var d = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) { var t2 = _jkMonthYear(); return parseInt(d[3], 10) === t2.yr && parseInt(d[2], 10) === (t2.mo + 1); } return false; }
        var t = _jkMonthYear(); return parseInt(m[1], 10) === t.yr && parseInt(m[2], 10) === (t.mo + 1);
      }
      // Nomor urut penawaran GLOBAL. Pakai padStart (min 3 digit) — JANGAN slice(-3)
      // karena akan memotong ke 3 digit & wrap ke '000' setelah >999 → bentrok PK.
      async function _maxQuotationSeq() {
        var q = await _all('penawaran', 'no_penawaran'); var maxId = 0;
        (q.data || []).forEach(function (r) { var m = (r.no_penawaran || '').toString().match(/^(\d+)\/QUOT/); if (m) { var n = parseInt(m[1], 10); if (n > maxId) maxId = n; } });
        return maxId;
      }
      function _fmtQuotationNo(seq) {
        var t = _jkMonthYear();
        return String(seq).padStart(3, '0') + '/QUOT/' + _ROMAN_MO[t.mo] + '/' + t.yr;
      }
      async function _nextQuotationNumber() {
        return _fmtQuotationNo((await _maxQuotationSeq()) + 1);
      }
      // term_conditions penawaran: buang 7 field angka internal, sisipkan catatan.
      function _cleanTC(tc, catatan) {
        var c = {}; tc = tc || {}; for (var k in tc) { if (Object.prototype.hasOwnProperty.call(tc, k)) c[k] = tc[k]; }
        c.catatan = catatan || '';
        ['hppTotalGabungan', 'estimasiProfitBersih', 'marginPersenInternal', 'diskonPersen', 'diskonNominal', 'pajakPersen', 'pajakNominal'].forEach(function (kk) { delete c[kk]; });
        return c;
      }
      function _poTC(v) { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
      function _hitungPO(items, diskonPersenIn, diskonNominalIn, ppnPersenIn) {
        var subtotal = 0; items.forEach(function (it) { subtotal += (parseFloat(it.qty) || 0) * (parseFloat(it.hargaBeli) || 0); });
        var diskonPersen = parseFloat(diskonPersenIn) || 0;
        var diskonNominal = parseFloat(diskonNominalIn) || Math.round(subtotal * diskonPersen / 100);
        if (diskonNominal > subtotal) diskonNominal = subtotal;
        var setelahDiskon = subtotal - diskonNominal;
        var ppnPersen = parseFloat(ppnPersenIn) || 0;
        var ppnNominal = Math.round(setelahDiskon * ppnPersen / 100);
        return { subtotal: subtotal, diskonPersen: diskonPersen, diskonNominal: diskonNominal, ppnPersen: ppnPersen, ppnNominal: ppnNominal, grandTotal: setelahDiskon + ppnNominal };
      }
      function _poItemRows(items, noPO) {
        var ts = Date.now();
        return items.map(function (it, idx) { var qty = Number(it.qty) || 0, hb = Number(it.hargaBeli) || 0; return { id_item: 'POI-' + ts + '-' + idx, no_po: noPO, nama_item: (it.namaItem || '').toString(), qty: qty, satuan: (it.satuan || '').toString(), harga_beli_satuan: hb, total: qty * hb, catatan: (it.catatan || '').toString(), qty_diterima: 0, id_produk: (it.produkId || '') || null }; });
      }
      window.gsRoute('simpanPenawaranKeSheet', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, tc = p.termConditions || {};
          var base = { rev: 0, tanggal: _isoDate(p.tanggal) || _todayIso(), valid_hingga: _isoDate(p.validUntil),
            nama_project: (p.namaProject || '').toString(), klien_id: (p.klienId || '') || null, dibuat_oleh: (p.namaUser || 'Sales Executive').toString(),
            subtotal: Number(p.subtotal) || 0, diskon: Number(tc.diskonNominal) || 0, pajak: Number(tc.pajakNominal) || 0, grand_total: Number(p.grandTotal) || 0,
            total_hpp: Number(tc.hppTotalGabungan) || 0, estimasi_keuntungan: Number(tc.estimasiProfitBersih) || 0, margin_persen: parseFloat(tc.marginPersenInternal) || 0,
            term_conditions: _cleanTC(tc, p.catatan), items: Array.isArray(p.items) ? p.items : [], status: 'On-Progress', no_wo: '', tanggal_deal: null,
            channel_marketing: (p.channelMarketing || '').toString(), catatan_fail: '', reminder_expired: null, kode_win: '', catatan_win: '', kode_lost: '', tanggal_fail: null, lesson_learned: '', action: '' };
          // Coba insert; bila nomor bentrok (race / sisa data lama), naikkan seq & ulang.
          var seq = (await _maxQuotationSeq()) + 1, noPen = '', ins = null;
          for (var att = 0; att < 25; att++) {
            noPen = _fmtQuotationNo(seq);
            var row = { no_penawaran: noPen }; for (var k in base) row[k] = base[k];
            ins = await supa.from('penawaran').insert(row);
            if (!ins.error) break;
            if (!/duplicate key|penawaran_pkey/i.test(ins.error.message || '')) break;
            seq++;   // nomor sudah dipakai → coba nomor berikutnya
          }
          if (ins && ins.error) return { success: false, message: 'Gagal menyimpan: ' + ins.error.message };
          return { success: true, message: 'Penawaran ' + noPen + ' berhasil disimpan!', nextNo: _fmtQuotationNo(seq + 1) };
        }
      });
      window.gsRoute('editPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, noPen = (p.noPenawaran || '').toString();
          if (!noPen) return { success: false, message: 'No Penawaran wajib.' };
          var rows = await _all('penawaran', '*', function (q) { return q.eq('no_penawaran', noPen); });
          var list = rows.data || []; if (!list.length) return { success: false, message: 'Penawaran tidak ditemukan.' };
          list.sort(function (x, y) { return (Number(y.rev) || 0) - (Number(x.rev) || 0); });
          var latest = list[0], maxRev = Number(latest.rev) || 0, currentStatus = (latest.status || '').toString();
          if (currentStatus === 'Deal') {
            if (!_isSameJkMonth(latest.tanggal_deal)) return { success: false, message: 'Penawaran Deal bulan sebelumnya tidak dapat direvisi lagi, agar laporan deal bulan lalu tidak berubah.' };
            if ((await _hoStatus(latest.no_wo)) === 'Selesai') return { success: false, message: 'Penawaran Deal tidak dapat direvisi karena Hand Over WO ' + (latest.no_wo || '') + ' sudah Selesai (project sudah diserahterimakan ke tim project).' };
          }
          var newRev = maxRev + 1, tc = p.termConditions || {}, statusBaru = currentStatus === 'Deal' ? 'Deal' : (p.status || 'On-Progress'), isDeal = statusBaru === 'Deal';
          var ins = await supa.from('penawaran').insert({
            no_penawaran: noPen, rev: newRev, tanggal: _isoDate(p.tanggal) || _todayIso(), valid_hingga: _isoDate(p.validUntil),
            nama_project: (p.namaProject || '').toString(), klien_id: (p.klienId || '') || null, dibuat_oleh: (p.namaUser || 'Sales Executive').toString(),
            subtotal: Number(p.subtotal) || 0, diskon: Number(tc.diskonNominal) || 0, pajak: Number(tc.pajakNominal) || 0, grand_total: Number(p.grandTotal) || 0,
            total_hpp: Number(tc.hppTotalGabungan) || 0, estimasi_keuntungan: Number(tc.estimasiProfitBersih) || 0, margin_persen: parseFloat(tc.marginPersenInternal) || 0,
            term_conditions: _cleanTC(tc, p.catatan), items: Array.isArray(p.items) ? p.items : [], status: statusBaru,
            no_wo: isDeal ? (latest.no_wo || '') : '', tanggal_deal: isDeal ? (latest.tanggal_deal || null) : null, channel_marketing: (p.channelMarketing || '').toString(),
            catatan_fail: '', reminder_expired: null, kode_win: isDeal ? (latest.kode_win || '') : '', catatan_win: '', kode_lost: '', tanggal_fail: null,
            lesson_learned: isDeal ? (latest.lesson_learned || '') : '', action: isDeal ? (latest.action || '') : ''
          });
          if (ins.error) return { success: false, message: 'Gagal: ' + ins.error.message };
          return { success: true, message: noPen + ' berhasil direvisi → Rev' + newRev + '!', nextNo: await _nextQuotationNumber() };
        }
      });
      window.gsRoute('simpanPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var idSupplier = (p.idSupplier || '').toString().trim();
          if (!idSupplier) return { success: false, message: 'ID Supplier tidak boleh kosong.' };
          var items = Array.isArray(p.items) ? p.items : [];
          if (!items.length) return { success: false, message: 'PO harus memiliki minimal 1 item.' };
          var noWO = (p.noWO || '').toString().trim();
          if (noWO) { var st = await _hoStatus(noWO); if (st !== 'Selesai') { var msg = st === 'Dijadwalkan' ? 'Hand Over WO ini masih Dijadwalkan — selesaikan HO dulu.' : st === 'Diminta' ? 'Hand Over WO ini baru Diminta — jadwalkan & selesaikan HO dulu.' : 'WO ini belum melewati Hand Over. Selesaikan Hand Over dulu sebelum lanjut.'; return { success: false, message: 'PO untuk WO ini belum bisa dibuat. ' + msg }; } }
          var noPO = await _nextRomanSeq('purchase_order', 'no_po', 'RGI/PO', true), calc = _hitungPO(items, p.diskonPersen, p.diskonNominal, p.ppnPersen);
          var ins = await supa.from('purchase_order').insert({
            no_po: noPO, tanggal: _isoDate(p.tanggal) || _todayIso(), id_supplier: idSupplier, nama_supplier: (p.namaSupplier || '').toString(), peruntukan: (p.peruntukan || '').toString(), no_wo: noWO,
            status_po: 'Aktif', subtotal: calc.subtotal, ppn_persen: calc.ppnPersen, ppn_nominal: calc.ppnNominal, grand_total: calc.grandTotal, catatan: (p.catatan || '').toString(), status_bayar: 'Belum Dibayar', total_dibayar: 0,
            dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString(), diubah_oleh: '', diubah_pada: null, diskon_persen: calc.diskonPersen, diskon_nominal: calc.diskonNominal,
            no_quotation: (p.quotNo || '').toString(), tanggal_quotation: _isoDate(p.quotTanggal), term_conditions: _poTC(p.termConditions), quot_file_id: (p.quotFileId || '').toString(), quot_file_url: (p.quotFileUrl || '').toString(), quot_file_nama: (p.quotFileName || '').toString()
          });
          if (ins.error) return { success: false, message: ins.error.message };
          var insI = await supa.from('po_item').insert(_poItemRows(items, noPO));
          if (insI.error) return { success: false, message: insI.error.message };
          // Tautkan PO ke request stok asal (bila dibuat via "Buat PO" dari request) → status Diproses.
          var reqId = (p.stokRequestId || '').toString().trim();
          if (reqId) {
            try { await supa.from('stok_request').update({ no_po: noPO, status: 'Diproses', diproses_oleh: (p.dibuatOleh || '').toString() || null, diproses_pada: new Date().toISOString() }).eq('id', reqId).in('status', ['Menunggu', 'Diproses']); } catch (e) {}
          }
          return { success: true, message: 'Purchase Order ' + noPO + ' berhasil dibuat.', noPO: noPO };
        }
      });
      window.gsRoute('editPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, noPO = (p.noPO || '').toString().trim();
          if (!noPO) return { success: false, message: 'No PO tidak boleh kosong.' };
          var items = Array.isArray(p.items) ? p.items : [];
          if (!items.length) return { success: false, message: 'PO harus memiliki minimal 1 item.' };
          var po = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'No PO tidak ditemukan.' };
          if ((po.data.status_po || '') !== 'Aktif') return { success: false, message: 'Hanya PO berstatus Aktif yang dapat diedit.' };
          var ex = po.data, calc = _hitungPO(items, p.diskonPersen, p.diskonNominal, p.ppnPersen);
          var upd = {
            tanggal: _isoDate(p.tanggal) || _todayIso(), id_supplier: p.idSupplier ? p.idSupplier.toString() : ex.id_supplier, nama_supplier: p.namaSupplier ? p.namaSupplier.toString() : ex.nama_supplier,
            peruntukan: p.peruntukan ? p.peruntukan.toString() : ex.peruntukan, no_wo: (p.noWO !== undefined) ? (p.noWO || '').toString() : ex.no_wo,
            subtotal: calc.subtotal, ppn_persen: calc.ppnPersen, ppn_nominal: calc.ppnNominal, grand_total: calc.grandTotal, catatan: (p.catatan !== undefined) ? (p.catatan || '').toString() : ex.catatan,
            diubah_oleh: p.diubahOleh ? p.diubahOleh.toString() : '', diubah_pada: new Date().toISOString(), diskon_persen: calc.diskonPersen, diskon_nominal: calc.diskonNominal,
            no_quotation: (p.quotNo !== undefined) ? (p.quotNo || '').toString() : (ex.no_quotation || ''), tanggal_quotation: (p.quotTanggal !== undefined) ? _isoDate(p.quotTanggal) : ex.tanggal_quotation,
            term_conditions: (p.termConditions !== undefined) ? _poTC(p.termConditions) : ex.term_conditions,
            quot_file_id: (p.quotFileId !== undefined) ? (p.quotFileId || '').toString() : (ex.quot_file_id || ''), quot_file_url: (p.quotFileUrl !== undefined) ? (p.quotFileUrl || '').toString() : (ex.quot_file_url || ''), quot_file_nama: (p.quotFileName !== undefined) ? (p.quotFileName || '').toString() : (ex.quot_file_nama || '')
          };
          var up = await supa.from('purchase_order').update(upd).eq('no_po', noPO);
          if (up.error) return { success: false, message: up.error.message };
          var delI = await supa.from('po_item').delete().eq('no_po', noPO);
          if (delI.error) return { success: false, message: delI.error.message };
          var insI = await supa.from('po_item').insert(_poItemRows(items, noPO));
          if (insI.error) return { success: false, message: insI.error.message };
          return { success: true, message: 'Purchase Order ' + noPO + ' berhasil diperbarui.' };
        }
      });

      // ── Group #2a: PO request pembayaran + ubah status ────────────────────
      window.gsRoute('requestPembayaranPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var noPO = (p.noPO || '').toString().trim(), jumlah = parseFloat(p.jumlah) || 0, invUrl = (p.invoiceFileUrl || '').toString().trim();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          if (!invUrl) return { success: false, message: 'Invoice supplier wajib diunggah.' };
          var po = await supa.from('purchase_order').select('status_po,grand_total,no_wo,nama_supplier').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'No PO tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (statusPO === 'Selesai' || statusPO === 'Batal') return { success: false, message: 'Request pembayaran tidak bisa dibuat untuk PO berstatus "' + statusPO + '".' };
          var grandTotal = Number(po.data.grand_total) || 0;
          var idReq = await _nextSeqId('po_payment_request', 'id_request', 'PR-' + _ym() + '-');
          var persentase = grandTotal > 0 ? Math.round(jumlah / grandTotal * 10000) / 100 : 0;
          var ins = await supa.from('po_payment_request').insert({
            id_request: idReq, no_po: noPO, no_wo: (po.data.no_wo || '').toString(), nama_supplier: (po.data.nama_supplier || '').toString(), grand_total_po: grandTotal,
            tanggal_request: _isoDate(p.tanggalRequest) || _todayIso(), jumlah: jumlah, persentase: persentase, catatan: (p.catatan || '').toString(), status: 'Menunggu',
            dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString(), nama_akun: '', diapprove_oleh: '', tanggal_approve: null,
            invoice_file_id: (p.invoiceFileId || '').toString(), invoice_file_url: invUrl, invoice_file_nama: (p.invoiceFileName || '').toString()
          });
          if (ins.error) return { success: false, message: ins.error.message };
          var _projPO = (po.data.no_wo && typeof _waProjName === 'function') ? await _waProjName(po.data.no_wo) : '';
          if (typeof _notifRequestPembayaran === 'function') _notifRequestPembayaran(idReq, { noPO: noPO, project: (po.data.no_wo ? 'WO: ' + po.data.no_wo + (_projPO ? ' — ' + _projPO : '') : ''), supplier: (po.data.nama_supplier || '') }, jumlah, (p.dibuatOleh || ''), (p.catatan || ''));
          return { success: true, message: 'Request ' + idReq + ' berhasil dikirim ke Finance.', idReq: idReq };
        }
      });
      window.gsRoute('requestPembayaranNonPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var keterangan = (p.keterangan || '').toString().trim(), jumlah = parseFloat(p.jumlah) || 0, noWO = (p.noWO || '').toString().trim(), kategori = (p.kategori || '').toString().trim();
          if (!keterangan) return { success: false, message: 'Keterangan wajib diisi.' };
          if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          if (!noWO && !kategori) return { success: false, message: 'Pilih kategori untuk pengeluaran non-project.' };
          var idReq = await _nextSeqId('po_payment_request', 'id_request', 'PR-' + _ym() + '-');
          var ins = await supa.from('po_payment_request').insert({
            id_request: idReq, no_po: '', no_wo: noWO, nama_supplier: keterangan, grand_total_po: 0,
            tanggal_request: _isoDate(p.tanggalRequest) || _todayIso(), jumlah: jumlah, persentase: 0, catatan: (p.catatan || '').toString(), status: 'Menunggu',
            dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString(), nama_akun: '', diapprove_oleh: '', tanggal_approve: null,
            invoice_file_id: (p.invoiceFileId || '').toString(), invoice_file_url: (p.invoiceFileUrl || '').toString(), invoice_file_nama: (p.invoiceFileName || '').toString(), kategori_non_po: kategori
          });
          if (ins.error) return { success: false, message: ins.error.message };
          var _projNP = (noWO && typeof _waProjName === 'function') ? await _waProjName(noWO) : '';
          if (typeof _notifRequestPembayaran === 'function') _notifRequestPembayaran(idReq, { noPO: 'Tanpa PO', project: (noWO ? 'WO: ' + noWO + (_projNP ? ' — ' + _projNP : '') : (kategori || '')), keterangan: keterangan }, jumlah, (p.dibuatOleh || ''), (p.catatan || ''));
          return { success: true, message: 'Request pembayaran (Tanpa PO) ' + idReq + ' dikirim ke Finance.', idReq: idReq };
        }
      });
      window.gsRoute('submitPOKeGudang', {
        mode: 'fn',
        handler: async function (a) {
          var noPO = (a[0] || '').toString().trim(), namaUser = (a[1] || '').toString();
          var po = await supa.from('purchase_order').select('status_po,no_wo,nama_supplier').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'PO tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (statusPO !== 'Aktif' && statusPO !== 'Diterima Sebagian') return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa dikirim ke gudang.' };
          var up = await supa.from('purchase_order').update({ status_po: 'Menunggu Gudang', diubah_oleh: namaUser, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _notifPOKeGudang === 'function') _notifPOKeGudang(noPO, (po.data.no_wo || ''), (po.data.nama_supplier || ''), namaUser);
          return { success: true, message: 'PO ' + noPO + ' berhasil dikirim ke gudang.' };
        }
      });
      window.gsRoute('ubahStatusPO', {
        mode: 'fn',
        handler: async function (a) {
          var noPO = (a[0] || '').toString().trim(), statusBaru = (a[1] || '').toString(), namaUser = (a[2] || '').toString();
          var po = await supa.from('purchase_order').select('status_po,status_bayar,total_dibayar').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'No PO tidak ditemukan.' };
          var statusLama = (po.data.status_po || '').toString(), statusBayar = (po.data.status_bayar || '').toString(), totalDibayar = Number(po.data.total_dibayar) || 0;
          if (statusLama === 'Selesai' || statusLama === 'Batal') return { success: false, message: 'PO berstatus "' + statusLama + '" tidak bisa diubah lagi.' };
          if (statusBaru === 'Selesai') {
            if (statusLama !== 'Diterima') return { success: false, message: 'PO harus berstatus "Diterima" untuk diselesaikan (saat ini: "' + statusLama + '").' };
            if (statusBayar !== 'Lunas') return { success: false, message: 'PO tidak bisa diselesaikan — status pembayaran belum Lunas (saat ini: "' + statusBayar + '").' };
          } else if (statusBaru === 'Batal') {
            if (statusLama !== 'Aktif') return { success: false, message: 'PO berstatus "' + statusLama + '" tidak bisa dibatalkan — barang sudah dalam proses penerimaan.' };
            if (totalDibayar > 0) return { success: false, message: 'PO tidak bisa dibatalkan — sudah ada pembayaran sebesar Rp ' + totalDibayar.toLocaleString('id-ID') + '.' };
          } else {
            return { success: false, message: 'Status yang bisa diubah secara manual hanya "Selesai" atau "Batal".' };
          }
          var up = await supa.from('purchase_order').update({ status_po: statusBaru, diubah_oleh: namaUser, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Status PO ' + noPO + ' berhasil diubah ke "' + statusBaru + '".' };
        }
      });

      // ── Group #2b: request Pengiriman / Hand Over + linkBeliLangsung ──────
      window.gsRoute('requestPengiriman', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString(), reqItems = Array.isArray(a[2]) ? a[2] : null;
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var guard = await _bomEditGuard(noWO); if (!guard.ok) return { success: false, message: guard.message };
          var bq = await _all('bom_item', 'id,status,qty_reserved,qty_dikirim', function (q) { return q.eq('no_wo', noWO); });
          var bom = bq.data || []; if (!bom.length) return { success: false, message: 'Gagal membaca BOM.' };
          var sisaMap = {}, adaApproved = false;
          bom.forEach(function (b) { if ((b.status || '') !== 'Approved') return; adaApproved = true; var reserved = Number(b.qty_reserved) || 0, dikirim = Number(b.qty_dikirim) || 0, sisa = reserved - dikirim; if (sisa > 0) sisaMap[(b.id || '').toString()] = { sisa: sisa, dikirim: dikirim, reserved: reserved }; });
          if (!adaApproved) return { success: false, message: 'Belum ada material Approved.' };
          if (!Object.keys(sisaMap).length) return { success: false, message: 'Belum ada material Reserved dari gudang untuk dikirim.' };
          var chosen = [];
          if (reqItems) { reqItems.forEach(function (r) { var m = sisaMap[(r.bomItemId || '').toString()]; if (!m) return; var qty = Number(r.qty) || 0; if (qty <= 0 || qty > m.sisa) qty = m.sisa; chosen.push({ bomItemId: (r.bomItemId || '').toString(), qty: qty, dikirim: m.dikirim, reserved: m.reserved }); }); }
          else { Object.keys(sisaMap).forEach(function (id) { var m = sisaMap[id]; chosen.push({ bomItemId: id, qty: m.sisa, dikirim: m.dikirim, reserved: m.reserved }); }); }
          if (!chosen.length) return { success: false, message: 'Pilih minimal 1 material Reserved untuk dikirim.' };
          var alamat = await _kirimAlamatByWO(noWO);
          var freshJson = chosen.map(function (c) { return { bomItemId: c.bomItemId, qty: c.qty, target: c.dikirim + c.qty }; });
          var existing = await supa.from('pengiriman_request').select('*').eq('no_wo', noWO).maybeSingle();
          if (existing.data && (existing.data.status || '') === 'Diminta') {
            var arr = _arr(existing.data.items), idx = {}; arr.forEach(function (e) { idx[(e.bomItemId || '').toString()] = e; });
            var ditambah = 0;
            chosen.forEach(function (c) { var e = idx[c.bomItemId]; if (e) { e.target = Math.min(c.reserved, (Number(e.target) || 0) + c.qty); e.qty = e.target - c.dikirim; } else { var ne = { bomItemId: c.bomItemId, qty: c.qty, target: c.dikirim + c.qty }; arr.push(ne); idx[c.bomItemId] = ne; ditambah++; } });
            var up = await supa.from('pengiriman_request').update({ items: arr }).eq('no_wo', noWO);
            if (up.error) return { success: false, message: up.error.message };
            return { success: true, message: ditambah ? (ditambah + ' material ditambahkan ke request pengiriman WO ' + noWO + '.') : ('Request pengiriman WO ' + noWO + ' diperbarui.') };
          }
          var payload = { no_wo: noWO, status: 'Diminta', diminta_oleh: oleh, diminta_pada: new Date().toISOString(), alamat: alamat, items: freshJson };
          var res = existing.data ? await supa.from('pengiriman_request').update(payload).eq('no_wo', noWO) : await supa.from('pengiriman_request').insert(payload);
          if (res.error) return { success: false, message: res.error.message };
          return { success: true, message: 'Request pengiriman WO ' + noWO + ' (' + chosen.length + ' material) dikirim ke warehouse.' };
        }
      });
      window.gsRoute('requestHandOver', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), oleh = (a[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          // Guard: WO harus sudah ada pembayaran lunas (cegah hand over tanpa
          // pembayaran sama sekali).
          var bayar = await _woPembayaranLunas(noWO);
          if (!bayar.count) return { success: false, message: 'Tidak bisa Request Hand Over: WO ini belum ada pembayaran lunas.' };
          var ho = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
          var init = { no_wo: noWO, status: 'Diminta', diminta_oleh: oleh, diminta_pada: new Date().toISOString(), tgl_jadwal: null, waktu: null, mode: '', link_meet: '', lokasi: '', peserta: '', catatan_undangan: '', dijadwalkan_oleh: '', dijadwalkan_pada: null, mom: '', selesai_oleh: '', selesai_pada: null, meet_event_id: '' };
          if (ho.data) {
            var st = (ho.data.status || '');
            if (st && st !== 'Batal') return { success: false, message: 'Hand Over WO ini sudah ada (status ' + st + ').' };
            var up = await supa.from('hand_over').update(init).eq('no_wo', noWO);
            if (up.error) return { success: false, message: up.error.message };
          } else {
            var ins = await supa.from('hand_over').insert(init);
            if (ins.error) return { success: false, message: ins.error.message };
          }
          return { success: true, message: 'Request Hand Over WO ' + noWO + ' dikirim ke Project Coordinator.' };
        }
      });
      window.gsRoute('completeHandOver', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim(), mom = (a[1] || '').toString().trim(), oleh = (a[2] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          if (!mom) return { success: false, message: 'Catatan hasil meeting (MoM) wajib diisi.' };
          var ho = await supa.from('hand_over').select('status').eq('no_wo', noWO).maybeSingle();
          if (!ho.data) return { success: false, message: 'Hand Over belum ada untuk WO ini.' };
          if ((ho.data.status || '') !== 'Dijadwalkan') return { success: false, message: 'Hand Over harus berstatus Dijadwalkan dulu.' };
          var up = await supa.from('hand_over').update({ status: 'Selesai', mom: mom, selesai_oleh: oleh, selesai_pada: new Date().toISOString() }).eq('no_wo', noWO);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Hand Over WO ' + noWO + ' selesai. WO siap dieksekusi.' };
        }
      });
      // Set status Hand Over manual (admin/PC) — override alur normal HO.
      // Berguna untuk WO lama/manual yang tak melewati alur request→jadwal→selesai.
      // 'Belum HO' (status kosong) → hapus baris HO.
      window.gsRoute('setStatusHOManual', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var noWO = (p.noWO || '').toString().trim();
          var status = (p.status || '').toString().trim();
          var oleh = (p.oleh || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var valid = ['', 'Diminta', 'Dijadwalkan', 'Selesai', 'Batal'];
          if (valid.indexOf(status) === -1) return { success: false, message: 'Status HO tidak valid.' };
          var nowIso = new Date().toISOString();
          if (status === '') {
            var del = await supa.from('hand_over').delete().eq('no_wo', noWO);
            if (del.error) return { success: false, message: del.error.message };
            return { success: true, message: 'Status Hand Over WO ' + noWO + ' di-reset (Belum HO).' };
          }
          var cur = await supa.from('hand_over').select('*').eq('no_wo', noWO).maybeSingle();
          var upd = { status: status };
          if (status === 'Diminta' && !(cur.data && cur.data.diminta_oleh)) { upd.diminta_oleh = oleh; upd.diminta_pada = nowIso; }
          if (status === 'Dijadwalkan' && !(cur.data && cur.data.dijadwalkan_oleh)) { upd.dijadwalkan_oleh = oleh; upd.dijadwalkan_pada = nowIso; }
          if (status === 'Selesai') { upd.selesai_oleh = oleh; upd.selesai_pada = nowIso; }
          if (cur.data) {
            var up = await supa.from('hand_over').update(upd).eq('no_wo', noWO);
            if (up.error) return { success: false, message: up.error.message };
          } else {
            var row = { no_wo: noWO, status: status, diminta_oleh: '', diminta_pada: null, tgl_jadwal: null, waktu: null, mode: '', link_meet: '', lokasi: '', peserta: '', catatan_undangan: '', dijadwalkan_oleh: '', dijadwalkan_pada: null, mom: '', selesai_oleh: '', selesai_pada: null, meet_event_id: '' };
            for (var k in upd) row[k] = upd[k];
            var ins = await supa.from('hand_over').insert(row);
            if (ins.error) return { success: false, message: ins.error.message };
          }
          return { success: true, message: 'Status Hand Over WO ' + noWO + ' diset: ' + status + '.' };
        }
      });
      window.gsRoute('linkBeliLangsung', {
        mode: 'fn',
        handler: async function (a) {
          var links = Array.isArray(a[0]) ? a[0] : [], noPO = (a[1] || '').toString(), oleh = (a[2] || '').toString();
          var ts = Date.now(), hasil = [];
          for (var k = 0; k < links.length; k++) {
            var lk = links[k] || {}, bid = (lk.bomItemId || '').toString().trim(), qty = Number(lk.qty) || 0;
            if (!bid || qty <= 0) continue;
            var br = await supa.from('bom_item').select('*').eq('id', bid).maybeSingle();
            if (!br.data) { hasil.push({ bomItemId: bid, success: false, message: 'Material tidak ditemukan.' }); continue; }
            var it = br.data, qMen = Number(it.qty_menunggu_bl) || 0;
            if (qMen <= 0) { hasil.push({ bomItemId: bid, success: false, message: 'Material tidak berstatus Tunggu Beli.' }); continue; }
            if (qty > qMen) qty = qMen;
            var harga = Number(lk.hargaSatuan) || 0, total = qty * harga, idRef = 'BL-' + bid + '-' + ts + '-' + k;
            var exp = await _buatPengeluaran({ noWO: (it.no_wo || ''), tanggal: _todayIso(), sumber: 'Pembelian Langsung', noPO: noPO, idReferensi: idRef, idAkun: 'AP001', namaAkun: 'Stok', deskripsi: 'Beli langsung ' + (it.nama_material || '') + (noPO ? ' (PO ' + noPO + ')' : ''), qty: qty, satuan: (it.satuan || ''), hargaSatuan: harga, total: total, dibuatOleh: oleh, kategori: (it.kategori || '') });
            if (!exp.ok) { hasil.push({ bomItemId: bid, success: false, message: 'Gagal catat pengeluaran: ' + exp.message }); continue; }
            var qR = Number(it.qty_reserved) || 0, qBLnew = (Number(it.qty_beli_langsung) || 0) + qty, qMenNew = qMen - qty, qtyBeli = Number(it.qty_beli) || 0;
            var refOld = (it.ref_beli_langsung || '').toString(), refNew = refOld ? (refOld + ';' + idRef) : idRef;
            var st = _bomDeriveProcStatus(qR, qtyBeli, qMenNew, qBLnew);
            var up = await supa.from('bom_item').update({ proc_status: st, qty_menunggu_bl: qMenNew, qty_beli_langsung: qBLnew, ref_beli_langsung: refNew, diproses_oleh: oleh, diproses_pada: new Date().toISOString() }).eq('id', bid);
            if (up.error) { hasil.push({ bomItemId: bid, success: false, message: up.error.message }); continue; }
            hasil.push({ bomItemId: bid, success: true, qty: qty, idReferensi: idRef, sisaMenunggu: qMenNew });
          }
          return { success: true, hasil: hasil };
        }
      });
