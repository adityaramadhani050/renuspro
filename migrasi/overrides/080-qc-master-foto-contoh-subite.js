      // ── QC master: foto contoh subitem checklist (qc_checklist.contoh_foto) ─
      //  Kolom contoh_foto bertipe TEXT (JSON string) → tulis via JSON.stringify.
      window.gsRoute('uploadQCContohFoto', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var kode = (p.kode || '').toString().trim();
          if (!kode) return { success: false, message: 'Kode subitem wajib.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
          var f = await supa.from('qc_checklist').select('kode,contoh_foto').eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Subitem tidak ditemukan.' };
          var existing = _arr(f.data.contoh_foto);
          var r = await _putStorage('qc-contoh/' + kode.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), kode + '-contoh-' + (existing.length + 1) + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          existing.push({ fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName });
          var up = await supa.from('qc_checklist').update({ contoh_foto: JSON.stringify(existing) }).eq('kode', kode);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Foto contoh tersimpan.', contohFoto: existing };
        }
      });
      window.gsRoute('hapusQCContohFoto', {
        mode: 'fn',
        handler: async function (a) {
          var kode = (a[0] || '').toString().trim(), fileId = (a[1] || '').toString().trim();
          var f = await supa.from('qc_checklist').select('kode,contoh_foto').eq('kode', kode).maybeSingle();
          if (!f.data) return { success: false, message: 'Subitem tidak ditemukan.' };
          var arr = _arr(f.data.contoh_foto).filter(function (x) { return x.fileId !== fileId; });
          var up = await supa.from('qc_checklist').update({ contoh_foto: JSON.stringify(arr) }).eq('kode', kode);
          if (up.error) return { success: false, message: up.error.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true, message: 'Foto contoh dihapus.', contohFoto: arr };
        }
      });

      // Site Survey: hapus 1 foto terunggah (retake sebelum submit). fileId =
      //  path objek Storage (dari uploadSiteSurveyFoto). Data lama = id Drive →
      //  remove() gagal diam-diam (try/catch), sesuai perilaku lama.
      window.gsRoute('hapusSiteSurveyFoto', {
        mode: 'fn',
        handler: async function (a) {
          var fileId = (a[0] || '').toString().trim();
          if (!fileId) return { success: false, message: 'fileId wajib.' };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true };
        }
      });

      // ── Invoice/Kwitansi: hapus & edit sederhana (aman client) ────────────
      //  simpanInvoice / updateStatusBayarInvoice → Edge Function (finansial).
      window.gsRoute('hapusInvoice', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          var del = await supa.from('invoice').delete().eq('no_invoice', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Invoice tidak ditemukan.' };
          return { success: true, message: 'Invoice ' + id + ' dihapus.' };
        }
      });
      window.gsRoute('hapusKwitansi', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          var del = await supa.from('kwitansi').delete().eq('no_kwitansi', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Kwitansi tidak ditemukan.' };
          return { success: true, message: 'Kwitansi ' + id + ' dihapus.' };
        }
      });
      window.gsRoute('editKwitansi', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString();
          if (!id) return { success: false, message: 'ID kwitansi wajib.' };
          var jumlah = parseFloat(p.jumlah) || 0;
          if (jumlah <= 0) return { success: false, message: 'Jumlah kwitansi harus lebih dari 0.' };
          var upd = { terima_dari: (p.terimaDari || '').toString(), jumlah: jumlah, untuk_pembayaran: (p.untuk || '').toString(), metode: (p.metode || 'Transfer').toString(), catatan: (p.catatan || '').toString() };
          var t = _isoDate(p.tanggal); if (t) upd.tanggal = t;
          var up = await supa.from('kwitansi').update(upd).eq('no_kwitansi', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Kwitansi tidak ditemukan.' };
          return { success: true, message: 'Kwitansi ' + id + ' berhasil diperbarui!' };
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

      // ═══════════════════════════════════════════════════════════════════════
      //  M8 — TULIS transaksi: Penawaran, Stok, PO, BOM procurement, Pengiriman,
      //  Hand Over. Meniru logika Apps Script (efek samping stok/HPP/pengeluaran).
      //  CATATAN: setelah aktif, data tak lagi tersinkron ke Google Sheets lama.
      // ═══════════════════════════════════════════════════════════════════════
      var _ROMAN_MO = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      function _ym() { return _todayIso().slice(0, 7).replace('-', ''); }         // 'YYYYMM' (Asia/Jakarta)
      function _jkMonthYear() {
        var now = new Date(), mo = now.getMonth(), yr = now.getFullYear();
        try {
          var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' }).formatToParts(now);
          mo = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10) - 1;
          yr = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
        } catch (e) {}
        return { mo: mo, yr: yr };
      }
      // ID NNN/<mid>/<Roman>/<Year> per-bulan (mis. pembayaran PO, surat jalan).
      async function _nextRomanSeq(table, idField, mid) {
        var t = _jkMonthYear(), roman = _ROMAN_MO[t.mo], yr = t.yr;
        var q = await _all(table, idField), maxSeq = 0;
        var re = new RegExp('^(\\d+)/' + mid + '/' + roman + '/' + yr + '$');
        (q.data || []).forEach(function (r) { var m = (r[idField] || '').toString().match(re); if (m) { var n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; } });
        return ('00' + (maxSeq + 1)).slice(-3) + '/' + mid + '/' + roman + '/' + yr;
      }
      // Status WO (dari penawaran; '' bila WO tak ada).
      async function _woStatus(noWO) {
        if (!noWO) return '';
        var q = await supa.from('penawaran').select('status').eq('no_wo', noWO).limit(1);
        return (q.data && q.data[0]) ? (q.data[0].status || '') : '';
      }
      // Update/insert baris stok. hargaBeli=null → pertahankan harga lama.
      async function _updateStokEntry(idProduk, nama, satuan, qtyDelta, hargaBeli, nilaiDelta) {
        var g = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
        var nowIso = new Date().toISOString();
        if (g.data) {
          var newQty = (Number(g.data.qty_tersedia) || 0) + qtyDelta;
          var newHarga = (hargaBeli !== null && hargaBeli !== undefined) ? hargaBeli : (Number(g.data.harga_beli_terakhir) || 0);
          var nilai = Math.max(0, (Number(g.data.nilai_stok) || 0) + nilaiDelta);
          await supa.from('stok').update({ qty_tersedia: newQty, harga_beli_terakhir: newHarga, nilai_stok: nilai, terakhir_diubah_pada: nowIso }).eq('id_produk', idProduk);
          return newQty;
        }
        await supa.from('stok').insert({ id_produk: idProduk, nama_produk: nama, satuan: satuan, qty_tersedia: qtyDelta, harga_beli_terakhir: (hargaBeli || 0), nilai_stok: Math.max(0, nilaiDelta), terakhir_diubah_pada: nowIso });
        return qtyDelta;
      }
      async function _syncProdukQty(stokId, qtyBaru) { await supa.from('produk').update({ qty_tersedia: qtyBaru }).eq('stok_id', stokId); }
      async function _syncProdukHPP(idProduk, harga) { await supa.from('produk').update({ hpp: harga }).or('id.eq.' + idProduk + ',stok_id.eq.' + idProduk); }
      async function _ensureProdukStokLink(idProduk, stokId) { await supa.from('produk').update({ stok_id: stokId }).eq('id', idProduk).or('stok_id.is.null,stok_id.eq.'); }
      async function _getProdukStokId(idProduk) { var q = await supa.from('produk').select('stok_id').eq('id', idProduk).maybeSingle(); return q.data ? (q.data.stok_id || '') : ''; }
      // FIFO: bangun lot dari mutasi_stok (urut id_mutasi).
      async function _deriveLots(idProduk) {
        var q = await supa.from('mutasi_stok').select('qty_masuk,qty_keluar,harga_satuan').eq('id_produk', idProduk).order('id_mutasi');
        var lots = [];
        (q.data || []).forEach(function (r) {
          var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, h = Number(r.harga_satuan) || 0;
          if (masuk > 0) lots.push({ qty: masuk, harga: h });
          else if (keluar > 0) { var sisa = keluar; while (sisa > 0 && lots.length) { if (lots[0].qty <= sisa) { sisa -= lots[0].qty; lots.shift(); } else { lots[0].qty -= sisa; sisa = 0; } } }
        });
        return lots;
      }
      function _fifoCost(lots, qtyButuh) {
        var avail = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        if (avail < qtyButuh) return null;
        var sisa = qtyButuh, cost = 0;
        for (var i = 0; i < lots.length && sisa > 0; i++) { var ambil = Math.min(lots[i].qty, sisa); cost += ambil * lots[i].harga; sisa -= ambil; }
        return { totalQty: qtyButuh, totalCost: cost, hargaRataRata: qtyButuh > 0 ? cost / qtyButuh : 0 };
      }
      // Buat 1 baris pengeluaran → {ok, message, id}.
      async function _buatPengeluaran(o) {
        var id = await _nextSeqId('pengeluaran', 'id_pengeluaran', 'EXP-' + _ym() + '-');
        var qty = Number(o.qty) || 1, hs = Number(o.hargaSatuan) || 0;
        var total = (o.total != null) ? Number(o.total) : qty * hs;
        var ins = await supa.from('pengeluaran').insert({ id_pengeluaran: id, no_wo: (o.noWO || ''), tanggal: o.tanggal || _todayIso(), sumber: o.sumber || 'Langsung', no_po: (o.noPO || ''), id_referensi: (o.idReferensi || ''), id_akun: (o.idAkun || ''), nama_akun: (o.namaAkun || ''), deskripsi: (o.deskripsi || ''), qty: qty, satuan: (o.satuan || ''), harga_satuan: hs, total: total, catatan: (o.catatan || ''), dibuat_oleh: (o.dibuatOleh || ''), dibuat_pada: new Date().toISOString(), diubah_oleh: '', diubah_pada: null, kategori: (o.kategori || '') });
        return { ok: !ins.error, message: ins.error ? ins.error.message : '', id: id };
      }
      // Keluarkan stok (FIFO) → mutasi 'Penggunaan[ WO]' + (bila WO) pengeluaran otomatis akun Stok.
      async function _gunakanStokCore(noWO, idProduk, qty, tanggalIso, keterangan, namaUser) {
        qty = Number(qty) || 0;
        if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
        var g = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
        if (!g.data) return { success: false, message: 'Item stok "' + idProduk + '" tidak ditemukan.' };
        var saldoSaat = Number(g.data.qty_tersedia) || 0, namaProduk = g.data.nama_produk || idProduk;
        if (qty > saldoSaat) return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup. Tersedia: ' + saldoSaat };
        if (noWO && (await _woStatus(noWO)) === 'Closed') return { success: false, message: 'Work Order sudah Closed — stok tidak bisa digunakan.' };
        var lots = await _deriveLots(idProduk), biaya = _fifoCost(lots, qty);
        if (!biaya) return { success: false, message: 'Stok "' + namaProduk + '" tidak cukup untuk penggunaan.' };
        var hargaPakai = Math.round(biaya.hargaRataRata);
        var saldoBaru = await _updateStokEntry(idProduk, namaProduk, g.data.satuan || '', -qty, null, -biaya.totalCost);
        var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
        await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: tanggalIso, id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: (noWO ? 'Penggunaan WO' : 'Penggunaan'), referensi: (noWO || ''), qty_masuk: 0, qty_keluar: qty, harga_satuan: hargaPakai, saldo_setelah: saldoBaru, keterangan: (keterangan || ''), dibuat_oleh: (namaUser || ''), dibuat_pada: new Date().toISOString() });
        await _syncProdukQty(idProduk, saldoBaru);
        if (noWO) { try { await _buatPengeluaran({ noWO: noWO, tanggal: tanggalIso, sumber: 'Penggunaan Stok', noPO: '', idReferensi: idMutasi, idAkun: 'AP001', namaAkun: 'Stok', deskripsi: 'Penggunaan stok: ' + namaProduk, qty: qty, satuan: (g.data.satuan || ''), hargaSatuan: hargaPakai, total: biaya.totalCost, catatan: (keterangan || ''), dibuatOleh: namaUser }); } catch (e) {} }
        return { success: true, idMutasi: idMutasi, hargaSatuan: hargaPakai, total: biaya.totalCost, message: 'Stok keluar.' };
      }
      // Rebuild seluruh stok dari mutasi (FIFO). Aman-FK: baris tanpa mutasi di-nol-kan, bukan dihapus.
      async function _rekalkulasiStokDariMutasi() {
        var mq = await _all('mutasi_stok', 'id_mutasi,id_produk,nama_produk,qty_masuk,qty_keluar,harga_satuan', function (q) { return q.order('id_mutasi'); });
        var sq = await _all('stok', 'id_produk,satuan'); var satuanMap = {}; (sq.data || []).forEach(function (r) { satuanMap[(r.id_produk || '').toString()] = r.satuan || ''; });
        var pq = await _all('produk', 'stok_id,unit'); (pq.data || []).forEach(function (r) { var sid = (r.stok_id || '').toString(); if (sid && !satuanMap[sid]) satuanMap[sid] = r.unit || ''; });
        var map = {};
        (mq.data || []).forEach(function (r) {
          var id = (r.id_produk || '').toString(); if (!id) return;
          if (!map[id]) map[id] = { lots: [], hargaTerakhir: 0, nama: '' };
          var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, h = Number(r.harga_satuan) || 0;
          if (r.nama_produk) map[id].nama = r.nama_produk;
          if (masuk > 0) { map[id].lots.push({ qty: masuk, harga: h }); if (h > 0) map[id].hargaTerakhir = h; }
          else if (keluar > 0) { var sisa = keluar; while (sisa > 0 && map[id].lots.length) { if (map[id].lots[0].qty <= sisa) { sisa -= map[id].lots[0].qty; map[id].lots.shift(); } else { map[id].lots[0].qty -= sisa; sisa = 0; } } }
        });
        var nowIso = new Date().toISOString(), ids = Object.keys(map).sort();
        var upserts = ids.map(function (id) { var info = map[id], qtyTotal = 0, nilaiTotal = 0; info.lots.forEach(function (l) { qtyTotal += l.qty; nilaiTotal += l.qty * l.harga; }); return { id_produk: id, nama_produk: info.nama || id, satuan: satuanMap[id] || '', qty_tersedia: qtyTotal, harga_beli_terakhir: info.hargaTerakhir, nilai_stok: nilaiTotal, terakhir_diubah_pada: nowIso }; });
        if (upserts.length) { var u = await supa.from('stok').upsert(upserts, { onConflict: 'id_produk' }); if (u.error) return { success: false, message: u.error.message }; }
        var allStok = await _all('stok', 'id_produk');
        var toZero = (allStok.data || []).map(function (r) { return (r.id_produk || '').toString(); }).filter(function (id) { return id && !map[id]; });
        if (toZero.length) await supa.from('stok').update({ qty_tersedia: 0, nilai_stok: 0, terakhir_diubah_pada: nowIso }).in('id_produk', toZero);
        return { success: true, message: 'Rekalkulasi selesai. ' + ids.length + ' produk diproses.' };
      }
      // Ketersediaan stok = qty − Σ(reserved − dikirim) atas semua bom_item.
      async function _stokAvailable(stokId) {
        var s = await supa.from('stok').select('qty_tersedia').eq('id_produk', stokId).maybeSingle();
        var qty = s.data ? (Number(s.data.qty_tersedia) || 0) : 0;
        var b = await _all('bom_item', 'qty_reserved,qty_dikirim', function (q) { return q.eq('stok_id', stokId); });
        var hold = 0; (b.data || []).forEach(function (r) { hold += Math.max(0, (Number(r.qty_reserved) || 0) - (Number(r.qty_dikirim) || 0)); });
        return { qty: qty, hold: hold, available: Math.max(0, qty - hold) };
      }
      function _bomDeriveProcStatus(qR, qBeli, qMenunggu, qBL) {
        var active = (qR > 0 ? 1 : 0) + (qBeli > 0 ? 1 : 0) + (qMenunggu > 0 ? 1 : 0) + (qBL > 0 ? 1 : 0);
        if (active === 0) return '';
        if (active > 1) return 'Sebagian';
        if (qR > 0) return 'Reserved';
        if (qBeli > 0) return 'Need Purchase';
        if (qMenunggu > 0) return 'Tunggu Beli';
        return 'Beli Langsung';
      }
      async function _bomEditGuard(noWO) {
        if (!noWO) return { ok: false, message: 'No WO wajib.' };
        var st = await _woStatus(noWO);
        if (!st) return { ok: false, message: 'Work Order tidak ditemukan.' };
        if (st === 'Closed') return { ok: false, message: 'Work Order sudah Closed — BOM terkunci.' };
        return { ok: true };
      }
      async function _kirimAlamatByWO(noWO) {
        try { var w = await supa.from('penawaran').select('klien_id').eq('no_wo', noWO).limit(1); var kid = (w.data && w.data[0]) ? w.data[0].klien_id : ''; if (!kid) return ''; var k = await supa.from('klien').select('alamat').eq('id', kid).maybeSingle(); return k.data ? (k.data.alamat || '') : ''; } catch (e) { return ''; }
      }
      async function _kirimCekRequestSelesai(noWO) {
        try {
          var rq = await supa.from('pengiriman_request').select('*').eq('no_wo', noWO).maybeSingle();
          if (!rq.data || (rq.data.status || '') !== 'Diminta') return;
          var reqItems = _arr(rq.data.items);
          var bq = await _all('bom_item', 'id,qty_reserved,qty_dikirim', function (q) { return q.eq('no_wo', noWO); });
          var bmap = {}; (bq.data || []).forEach(function (b) { bmap[(b.id || '').toString()] = { reserved: Number(b.qty_reserved) || 0, dikirim: Number(b.qty_dikirim) || 0 }; });
          var allDone = true;
          if (reqItems.length) reqItems.forEach(function (li) { var b = bmap[(li.bomItemId || '').toString()] || { reserved: 0, dikirim: 0 }; var target = Number(li.target) || 0; if (Math.min(target - b.dikirim, b.reserved - b.dikirim) > 0) allDone = false; });
          else (bq.data || []).forEach(function (b) { if (((Number(b.qty_reserved) || 0) - (Number(b.qty_dikirim) || 0)) > 0) allDone = false; });
          if (allDone) await supa.from('pengiriman_request').update({ status: 'Selesai' }).eq('no_wo', noWO);
        } catch (e) {}
      }
      async function _simpanPembayaranPO(pp) {
        var noPO = (pp.noPO || '').toString();
        var po = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
        if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
        var grandTotal = Number(po.data.grand_total) || 0, ppnNominal = Number(po.data.ppn_nominal) || 0;
        var noWOPO = (po.data.no_wo || '').toString(), namaSupplier = (po.data.nama_supplier || '').toString();
        if (noWOPO && (await _woStatus(noWOPO)) === 'Closed') return { success: false, message: 'Work Order sudah Closed — tidak bisa mencatat pembayaran.' };
        var idBayar = await _nextRomanSeq('pembayaran_po', 'id_bayar', 'RGI/POP');
        var jumlah = parseFloat(pp.jumlah) || 0, tglIso = _isoDate(pp.tanggalBayar) || _todayIso();
        var insB = await supa.from('pembayaran_po').insert({ id_bayar: idBayar, no_po: noPO, tanggal_bayar: tglIso, id_akun: (pp.idAkun || ''), nama_akun: (pp.namaAkun || ''), jumlah: jumlah, catatan: (pp.catatan || ''), dibuat_oleh: (pp.dibuatOleh || ''), dibuat_pada: new Date().toISOString() });
        if (insB.error) return { success: false, message: insB.error.message };
        var allB = await _all('pembayaran_po', 'jumlah', function (q) { return q.eq('no_po', noPO); });
        var totalDibayar = 0; (allB.data || []).forEach(function (r) { totalDibayar += Number(r.jumlah) || 0; });
        var statusBayar = totalDibayar <= 0 ? 'Belum Dibayar' : (totalDibayar >= grandTotal ? 'Lunas' : 'Dibayar Sebagian');
        await supa.from('purchase_order').update({ status_bayar: statusBayar, total_dibayar: totalDibayar }).eq('no_po', noPO);
        if (noWOPO) {
          var ppnRatio = grandTotal > 0 ? ppnNominal / grandTotal : 0;
          var ppnPortion = Math.round(jumlah * ppnRatio), dppPortion = jumlah - ppnPortion;
          try {
            await _buatPengeluaran({ noWO: noWOPO, tanggal: tglIso, sumber: 'Pembayaran PO', noPO: noPO, idReferensi: idBayar, idAkun: (pp.idAkun || ''), namaAkun: (pp.namaAkun || ''), deskripsi: 'Pembayaran PO ' + noPO + ' — ' + namaSupplier + ' (DPP)', qty: 1, satuan: '', hargaSatuan: dppPortion, total: dppPortion, catatan: (pp.catatan || ''), dibuatOleh: (pp.dibuatOleh || ''), kategori: '' });
            if (ppnPortion > 0) await _buatPengeluaran({ noWO: '', tanggal: tglIso, sumber: 'Pembayaran PO', noPO: noPO, idReferensi: idBayar, idAkun: (pp.idAkun || ''), namaAkun: (pp.namaAkun || ''), deskripsi: 'PPN Pembayaran PO ' + noPO + ' — ' + namaSupplier, kategori: 'Pajak', qty: 1, satuan: '', hargaSatuan: ppnPortion, total: ppnPortion, catatan: (pp.catatan || ''), dibuatOleh: (pp.dibuatOleh || '') });
          } catch (e) {}
        }
        return { success: true, message: 'Pembayaran PO ' + idBayar + ' berhasil disimpan.', idBayar: idBayar };
      }

      // ── Group E: Penawaran ────────────────────────────────────────────────
      async function _nextWONumber() {
        var t = _jkMonthYear(), yy = String(t.yr).slice(-2);
        var q = await _all('penawaran', 'no_wo'); var maxSeq = 0;
        (q.data || []).forEach(function (r) { var val = (r.no_wo == null ? '' : r.no_wo).toString().trim(); if (val.length >= 4 && val.slice(0, 2) === yy) { var seq = parseInt(val.slice(2), 10); if (!isNaN(seq) && seq > maxSeq) maxSeq = seq; } });
        return yy + String(maxSeq + 1).padStart(3, '0');
      }
      window.gsRoute('hapusPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var noPen = (a[0] || '').toString();
          var del = await supa.from('penawaran').delete().eq('no_penawaran', noPen).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Penawaran tidak ditemukan.' };
          return { success: true, message: 'Penawaran ' + noPen + ' beserta ' + del.data.length + ' revisi berhasil dihapus.' };
        }
      });
      window.gsRoute('updateStatusPenawaran', {
        mode: 'fn',
        handler: async function (a) {
          var noPen = (a[0] || '').toString(); var rev = parseInt(a[1], 10); if (isNaN(rev)) rev = 0;
          var statusBaru = (a[2] || '').toString(); var extra = a[4] || {};
          var cur = await supa.from('penawaran').select('*').eq('no_penawaran', noPen).eq('rev', rev).maybeSingle();
          if (!cur.data) return { success: false, message: 'Penawaran tidak ditemukan.' };
          var row = cur.data, statusLama = (row.status || '').toString(), isWinLoss = (statusBaru === 'Deal' || statusBaru === 'Fail');
          var upd = { status: statusBaru, kode_lost: statusBaru === 'Fail' ? (extra.kodeLost || '') : '', kode_win: statusBaru === 'Deal' ? (extra.kodeWin || '') : '', lesson_learned: isWinLoss ? (extra.lessonLearned || '') : '', action: isWinLoss ? (extra.action || '') : '', catatan_fail: '', catatan_win: '' };
          var noWO = (row.no_wo || '').toString();
          if (statusBaru === 'Deal') {
            if (statusLama !== 'Deal') {
              if (!noWO) { noWO = await _nextWONumber(); upd.no_wo = noWO; }
              if (!row.tanggal_deal) upd.tanggal_deal = _todayIso();
              var invs = await _all('invoice', 'no_invoice,no_wo,no_penawaran', function (q) { return q.eq('no_penawaran', noPen); });
              var predeal = (invs.data || []).filter(function (x) { return !(x.no_wo || '').toString(); }).map(function (x) { return x.no_invoice; });
              if (predeal.length) await supa.from('invoice').update({ no_wo: noWO }).in('no_invoice', predeal);
            }
          } else {
            if (noWO) { upd.no_wo = ''; noWO = ''; }
            upd.tanggal_deal = null;
          }
          if (statusBaru === 'Fail') { if (statusLama !== 'Fail' && !row.tanggal_fail) upd.tanggal_fail = _todayIso(); }
          else upd.tanggal_fail = null;
          var up = await supa.from('penawaran').update(upd).eq('no_penawaran', noPen).eq('rev', rev);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Status diperbarui menjadi: ' + statusBaru, noWO: noWO };
        }
      });

      // ── Group B: Stok langsung ────────────────────────────────────────────
      window.gsRoute('editItemStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idStok = (p.idStok || '').toString().trim(), nama = (p.nama || '').toString().trim(), satuan = (p.satuan || '').toString().trim();
          if (!idStok) return { success: false, message: 'ID Stok wajib diisi.' };
          if (!nama) return { success: false, message: 'Nama item wajib diisi.' };
          if (!satuan) return { success: false, message: 'Satuan wajib diisi.' };
          var up = await supa.from('stok').update({ nama_produk: nama, satuan: satuan }).eq('id_produk', idStok).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID Stok tidak ditemukan.' };
          return { success: true, message: 'Item stok ' + idStok + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('editMutasiStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idMutasi = (p.idMutasi || '').toString().trim(), ket = (p.keterangan == null ? '' : p.keterangan).toString();
          if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
          var up = await supa.from('mutasi_stok').update({ keterangan: ket }).eq('id_mutasi', idMutasi).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
          return { success: true, message: 'Keterangan mutasi ' + idMutasi + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusMutasiStok', {
        mode: 'fn',
        handler: async function (a) {
          var idMutasi = (a[0] || '').toString().trim();
          if (!idMutasi) return { success: false, message: 'ID Mutasi wajib diisi.' };
          var f = await supa.from('mutasi_stok').select('id_produk').eq('id_mutasi', idMutasi).maybeSingle();
          if (!f.data) return { success: false, message: 'ID Mutasi tidak ditemukan.' };
          var idProduk = (f.data.id_produk || '').toString();
          var del = await supa.from('mutasi_stok').delete().eq('id_mutasi', idMutasi);
          if (del.error) return { success: false, message: del.error.message };
          var rk = await _rekalkulasiStokDariMutasi();
          if (!rk.success) return rk;
          if (idProduk) { var s = await supa.from('stok').select('qty_tersedia').eq('id_produk', idProduk).maybeSingle(); await _syncProdukQty(idProduk, s.data ? (Number(s.data.qty_tersedia) || 0) : 0); }
          return { success: true, message: 'Riwayat mutasi ' + idMutasi + ' berhasil dihapus & saldo stok disesuaikan.' };
        }
      });
      window.gsRoute('hapusStok', {
        mode: 'fn',
        handler: async function (a) {
          var idStok = (a[0] || '').toString().trim();
          if (!idStok) return { success: false, message: 'ID Stok wajib diisi.' };
          var s = await supa.from('stok').select('id_produk,nama_produk,qty_tersedia').eq('id_produk', idStok).maybeSingle();
          if (!s.data) return { success: false, message: 'Item stok tidak ditemukan.' };
          // Guard 1: stok masih ada → tolak (cegah kehilangan nilai stok).
          var qty = Number(s.data.qty_tersedia) || 0;
          if (qty > 0) return { success: false, message: 'Tidak bisa menghapus: stok masih ' + qty + '. Kosongkan dulu via penyesuaian/penggunaan.' };
          // Guard 2: masih direserve BOM aktif → tolak (cegah putus reserve/pengiriman).
          var bq = await supa.from('bom_item').select('no_wo,qty_reserved,qty_dikirim').eq('stok_id', idStok);
          if (bq.error) return { success: false, message: bq.error.message };
          var reservedWO = (bq.data || []).filter(function (b) { return ((Number(b.qty_reserved) || 0) - (Number(b.qty_dikirim) || 0)) > 0; });
          if (reservedWO.length) {
            var woList = reservedWO.map(function (b) { return (b.no_wo || '?'); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(', ');
            return { success: false, message: 'Tidak bisa menghapus: masih direserve BOM WO ' + woList + '.' };
          }
          // Hapus riwayat mutasi (kartu stok) item ini.
          var delM = await supa.from('mutasi_stok').delete().eq('id_produk', idStok);
          if (delM.error) return { success: false, message: delM.error.message };
          // Hapus baris stok.
          var del = await supa.from('stok').delete().eq('id_produk', idStok);
          if (del.error) return { success: false, message: del.error.message };
          // Lepas link produk yang menunjuk stok ini (hindari referensi menggantung).
          await supa.from('produk').update({ stok_id: null }).eq('stok_id', idStok);
          return { success: true, message: 'Item stok "' + (s.data.nama_produk || idStok) + '" berhasil dihapus.' };
        }
      });
      // ── Request Penambahan Stok (Warehouse → Procurement) ────────────────
      window.gsRoute('buatRequestStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var nama = (p.namaItem || '').toString().trim();
          var qty = Number(p.qty) || 0;
          var idProduk = (p.idProduk || '').toString().trim();
          var satuan = (p.satuan || '').toString().trim();
          var catatan = (p.catatan || '').toString().trim();
          var namaUser = (p.namaUser || '').toString().trim();
          if (!nama) return { success: false, message: 'Nama item wajib diisi.' };
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          var id = await _nextSeqId('stok_request', 'id', 'REQ-STK-' + _ym() + '-');
          var ins = await supa.from('stok_request').insert({
            id: id, tanggal: _todayIso(), id_produk: idProduk || null, nama_item: nama,
            satuan: satuan || null, qty: qty, catatan: catatan || null, status: 'Menunggu',
            diminta_oleh: namaUser || null, dibuat_pada: new Date().toISOString()
          });
          if (ins.error) return { success: false, message: ins.error.message };
          if (typeof _notifRequestStok === 'function') _notifRequestStok(id, nama, qty, satuan, namaUser, catatan);
          return { success: true, message: 'Request stok "' + nama + '" berhasil dikirim ke Procurement.', id: id };
        }
      });
      window.gsRoute('getStokRequestList', {
        mode: 'fn',
        handler: async function (a) {
          var status = ((a && a[0]) || '').toString().trim();
          var q = supa.from('stok_request').select('*').order('dibuat_pada', { ascending: false });
          if (status) q = q.eq('status', status);
          var r = await q;
          if (r.error) return [];
          return (r.data || []).map(function (o) {
            return {
              id: o.id, tanggal: o.tanggal, idProduk: o.id_produk || '', namaItem: o.nama_item || '',
              satuan: o.satuan || '', qty: Number(o.qty) || 0, catatan: o.catatan || '',
              status: o.status || 'Menunggu', noPO: o.no_po || '', catatanProc: o.catatan_proc || '',
              dimintaOleh: o.diminta_oleh || '', diprosesOleh: o.diproses_oleh || '',
              dibuatPada: o.dibuat_pada, diprosesPada: o.diproses_pada
            };
          });
        }
      });
      window.gsRoute('prosesRequestStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          var statusBaru = (p.status || '').toString().trim();   // Diproses | Selesai | Ditolak
          var namaUser = (p.namaUser || '').toString().trim();
          var catatanProc = (p.catatanProc || '').toString().trim();
          var noPO = (p.noPO || '').toString().trim();
          if (!id) return { success: false, message: 'ID request wajib.' };
          if (['Diproses', 'Selesai', 'Ditolak', 'Menunggu'].indexOf(statusBaru) === -1) return { success: false, message: 'Status tidak valid.' };
          var f = await supa.from('stok_request').select('status').eq('id', id).maybeSingle();
          if (!f.data) return { success: false, message: 'Request tidak ditemukan.' };
          var statusLama = (f.data.status || '').toString();
          if (statusLama === 'Selesai' || statusLama === 'Ditolak') return { success: false, message: 'Request berstatus "' + statusLama + '" sudah final.' };
          var upd = { status: statusBaru, diproses_oleh: namaUser || null, diproses_pada: new Date().toISOString() };
          if (catatanProc) upd.catatan_proc = catatanProc;
          if (noPO) upd.no_po = noPO;
          var up = await supa.from('stok_request').update(upd).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Request ' + id + ' diperbarui menjadi "' + statusBaru + '".' };
        }
      });
      window.gsRoute('simpanPenerimaanTanpaPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var qty = Number(p.qty) || 0, harga = Number(p.hargaSatuan) || 0, tgl = _isoDate(p.tanggal), namaUser = (p.namaUser || '').toString();
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (!tgl) return { success: false, message: 'Tanggal wajib diisi.' };
          var idProduk = (p.idStok || p.idProduk || '').toString().trim();
          if (!idProduk && (p.namaBaru || '').toString().trim()) {
            idProduk = await _nextSeqId('stok', 'id_produk', 'STK-');
            await supa.from('stok').insert({ id_produk: idProduk, nama_produk: (p.namaBaru || '').toString().trim(), satuan: ((p.satuanBaru || '').toString().trim() || 'unit'), qty_tersedia: 0, harga_beli_terakhir: 0, nilai_stok: 0, terakhir_diubah_pada: new Date().toISOString() });
          }
          if (!idProduk) return { success: false, message: 'Item stok wajib dipilih atau nama item baru wajib diisi.' };
          var s = await supa.from('stok').select('nama_produk,satuan').eq('id_produk', idProduk).maybeSingle();
          if (!s.data) return { success: false, message: 'Item stok tidak ditemukan.' };
          var namaProduk = s.data.nama_produk || idProduk, satuanProduk = s.data.satuan || '';
          var updateHarga = !p.janganhUpdateHarga, hargaUntukStok = updateHarga ? harga : null;
          var saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, qty, hargaUntukStok, qty * harga);
          var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
          await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: tgl, id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: 'Penerimaan Non-PO', referensi: (p.referensi || '').toString(), qty_masuk: qty, qty_keluar: 0, harga_satuan: harga, saldo_setelah: saldoBaru, keterangan: (p.keterangan || '').toString(), dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          var idPT = await _nextSeqId('penerimaan_tanpa_po', 'id', 'PTNPO-' + _ym() + '-');
          await supa.from('penerimaan_tanpa_po').insert({ id: idPT, tanggal: tgl, id_produk: idProduk, nama_produk: namaProduk, qty: qty, harga_satuan: harga, id_akun: (p.idAkun || '').toString(), nama_akun: (p.namaAkun || '').toString(), keterangan: (p.keterangan || '').toString(), update_harga: updateHarga, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          await _syncProdukQty(idProduk, saldoBaru);
          return { success: true, message: 'Penerimaan berhasil. Saldo: ' + saldoBaru + ' ' + satuanProduk };
        }
      });
      window.gsRoute('simpanPenyesuaianStok', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var idProduk = (p.idStok || p.idProduk || '').toString().trim(), jenis = (p.jenis || '').toString(), qty = Number(p.qty) || 0, keterangan = (p.keterangan || '').toString().trim(), namaUser = (p.namaUser || '').toString();
          if (!idProduk) return { success: false, message: 'Produk wajib dipilih.' };
          if (qty <= 0) return { success: false, message: 'Qty harus lebih dari 0.' };
          if (!keterangan) return { success: false, message: 'Keterangan wajib diisi untuk penyesuaian stok.' };
          if (jenis !== '+' && jenis !== '-') return { success: false, message: 'Jenis tidak valid.' };
          var s = await supa.from('stok').select('*').eq('id_produk', idProduk).maybeSingle();
          var saldoSaat = s.data ? (Number(s.data.qty_tersedia) || 0) : 0, hargaTerakhir = s.data ? (Number(s.data.harga_beli_terakhir) || 0) : 0;
          var namaProduk = s.data ? (s.data.nama_produk || idProduk) : idProduk, satuanProduk = s.data ? (s.data.satuan || '') : '';
          if (jenis === '-' && qty > saldoSaat) return { success: false, message: 'Stok tidak cukup. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk };
          var saldoBaru, hargaMutasi = hargaTerakhir;
          if (jenis === '+') saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, qty, null, qty * hargaTerakhir);
          else { var lots = await _deriveLots(idProduk), biaya = _fifoCost(lots, qty); if (!biaya) return { success: false, message: 'Stok tidak cukup untuk penyesuaian. Saldo saat ini: ' + saldoSaat + ' ' + satuanProduk }; hargaMutasi = Math.round(biaya.hargaRataRata); saldoBaru = await _updateStokEntry(idProduk, namaProduk, satuanProduk, -qty, null, -biaya.totalCost); }
          var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
          await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: _todayIso(), id_produk: idProduk, nama_produk: namaProduk, jenis_mutasi: (jenis === '+' ? 'Penyesuaian +' : 'Penyesuaian -'), referensi: '', qty_masuk: (jenis === '+' ? qty : 0), qty_keluar: (jenis === '-' ? qty : 0), harga_satuan: hargaMutasi, saldo_setelah: saldoBaru, keterangan: keterangan, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
          await _syncProdukQty(idProduk, saldoBaru);
          return { success: true, message: 'Penyesuaian berhasil. Saldo baru: ' + saldoBaru + ' ' + satuanProduk };
        }
      });
      window.gsRoute('gunakanStok', {
        mode: 'fn',
        handler: async function (a) {
          return await _gunakanStokCore((a[0] || '').toString().trim(), (a[1] || '').toString().trim(), Number(a[2]) || 0, _isoDate(a[3]) || _todayIso(), (a[4] || '').toString(), (a[5] || '').toString());
        }
      });

      // ── Group A: Purchase Order (penerimaan + pembayaran) ─────────────────
      window.gsRoute('terimaPOItems', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noPO = (p.noPO || '').toString().trim(), items = Array.isArray(p.items) ? p.items : [], namaUser = (p.namaUser || '').toString();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var po = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (['Aktif', 'Diterima Sebagian', 'Menunggu Gudang', 'Menunggu Penerimaan Gudang'].indexOf(statusPO) < 0) return { success: false, message: 'Status PO (' + statusPO + ') tidak menerima penerimaan gudang.' };
          if (!items.length) return { success: false, message: 'Tidak ada item yang diterima.' };
          var poItemsQ = await _all('po_item', '*', function (q) { return q.eq('no_po', noPO); });
          var byId = {}; (poItemsQ.data || []).forEach(function (it) { byId[(it.id_item || '').toString()] = it; });
          for (var i = 0; i < items.length; i++) {
            var it = items[i], q = Number(it.qty) || 0; if (q <= 0) continue;
            var poi = byId[(it.idItem || '').toString()]; if (!poi) return { success: false, message: 'Item PO tidak ditemukan: ' + (it.idItem || '') };
            if (q > ((Number(poi.qty) || 0) - (Number(poi.qty_diterima) || 0))) return { success: false, message: 'Qty terima melebihi sisa untuk ' + (it.namaItem || poi.nama_item || '') };
          }
          var diterimaMap = {}, detailLog = [];
          for (var j = 0; j < items.length; j++) {
            var itm = items[j], qt = Number(itm.qty) || 0; if (qt <= 0) continue;
            var harga2 = Math.round(Number(itm.hargaBeli) || 0), idProduk2 = (itm.idProduk || '').toString();
            var idStokItem = (itm.idStok || '').toString(), namaProduk = (itm.namaItem || '').toString(), satuanProduk = (itm.satuan || '').toString();
            if (idProduk2) { var pr = await supa.from('produk').select('nama,unit').eq('id', idProduk2).maybeSingle(); if (pr.data) { namaProduk = pr.data.nama || namaProduk; satuanProduk = pr.data.unit || satuanProduk; } }
            if (!idStokItem) {
              if (idProduk2) { idStokItem = (await _getProdukStokId(idProduk2)) || ''; }
              if (!idStokItem) { idStokItem = await _nextSeqId('stok', 'id_produk', 'STK-'); await supa.from('stok').insert({ id_produk: idStokItem, nama_produk: (namaProduk || ('Item PO ' + (itm.idItem || ''))), satuan: (satuanProduk || 'unit'), qty_tersedia: 0, harga_beli_terakhir: 0, nilai_stok: 0, terakhir_diubah_pada: new Date().toISOString() }); }
            }
            var saldoBaru = await _updateStokEntry(idStokItem, namaProduk || idStokItem, satuanProduk, qt, harga2, qt * harga2);
            var idMutasi = await _nextSeqId('mutasi_stok', 'id_mutasi', 'MUT-' + _ym() + '-');
            await supa.from('mutasi_stok').insert({ id_mutasi: idMutasi, tanggal: _todayIso(), id_produk: idStokItem, nama_produk: (namaProduk || idStokItem), jenis_mutasi: 'Penerimaan PO', referensi: noPO, qty_masuk: qt, qty_keluar: 0, harga_satuan: harga2, saldo_setelah: saldoBaru, keterangan: 'Penerimaan dari PO ' + noPO + ' (harga DPP excl. PPN)', dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString() });
            if (idProduk2) { await _ensureProdukStokLink(idProduk2, idStokItem); await _syncProdukHPP(idProduk2, harga2); }
            await _syncProdukQty(idStokItem, saldoBaru);
            var old = byId[(itm.idItem || '').toString()];
            diterimaMap[(itm.idItem || '').toString()] = (Number((old && old.qty_diterima) || 0)) + qt;
            detailLog.push({ namaItem: (itm.namaItem || (old && old.nama_item) || ''), qty: qt, satuan: satuanProduk, catatan: (itm.catatan || '') });
          }
          for (var idItem in diterimaMap) { if (!diterimaMap.hasOwnProperty(idItem)) continue; await supa.from('po_item').update({ qty_diterima: diterimaMap[idItem] }).eq('id_item', idItem); }
          var refreshed = await _all('po_item', 'qty,qty_diterima', function (q) { return q.eq('no_po', noPO); });
          var rows = refreshed.data || [];
          var allDiterima = rows.length > 0 && rows.every(function (r) { return (Number(r.qty_diterima) || 0) >= (Number(r.qty) || 0); });
          var adaDiterima = rows.some(function (r) { return (Number(r.qty_diterima) || 0) > 0; });
          var newStatus = allDiterima ? 'Diterima' : (adaDiterima ? 'Diterima Sebagian' : statusPO);
          await supa.from('purchase_order').update({ status_po: newStatus, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (detailLog.length) { var idLog = 'RCV-' + Date.now() + '-' + Math.floor(Math.random() * 1000); await supa.from('penerimaan_po_log').insert({ id_log: idLog, no_po: noPO, tanggal: _todayIso(), mode: 'Gudang', jumlah_item: detailLog.length, detail_item: detailLog, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString(), bukti_file_id: (p.buktiFileId || ''), bukti_file_url: (p.buktiFileUrl || ''), bukti_file_nama: (p.buktiFileName || '') }); }
          if (typeof _notifBarangDiterima === 'function') _notifBarangDiterima(noPO, (po.data.no_wo || ''), newStatus, namaUser, detailLog.filter(function (d) { return d.catatan; }).map(function (d) { return d.namaItem + ': ' + d.catatan; }));
          return { success: true, message: 'Penerimaan berhasil. Status PO: ' + newStatus };
        }
      });
      window.gsRoute('terimaPOKirimLangsung', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}; var noPO = (p.noPO || '').toString().trim(), items = Array.isArray(p.items) ? p.items : [], namaUser = (p.namaUser || '').toString();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var po = await supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          var statusPO = (po.data.status_po || '').toString();
          if (['Aktif', 'Diterima Sebagian'].indexOf(statusPO) < 0) return { success: false, message: 'Status PO (' + statusPO + ') tidak bisa terima kirim langsung.' };
          var poItemsQ = await _all('po_item', '*', function (q) { return q.eq('no_po', noPO); });
          var byId = {}; (poItemsQ.data || []).forEach(function (it) { byId[(it.id_item || '').toString()] = it; });
          for (var i = 0; i < items.length; i++) { var it = items[i], q = Number(it.qty) || 0; if (q <= 0) continue; var poi = byId[(it.idItem || '').toString()]; if (!poi) return { success: false, message: 'Item PO tidak ditemukan: ' + (it.idItem || '') }; if (q > ((Number(poi.qty) || 0) - (Number(poi.qty_diterima) || 0))) return { success: false, message: 'Qty terima melebihi sisa untuk ' + (it.namaItem || poi.nama_item || '') }; }
          var detailLog = [];
          for (var j = 0; j < items.length; j++) {
            var itm = items[j], qt = Number(itm.qty) || 0;
            if (qt <= 0) { if ((itm.catatan || '')) detailLog.push({ namaItem: (itm.namaItem || ''), qty: 0, satuan: '', catatan: (itm.catatan || '') }); continue; }
            var poi2 = byId[(itm.idItem || '').toString()], baru = (Number(poi2.qty_diterima) || 0) + qt;
            await supa.from('po_item').update({ qty_diterima: baru }).eq('id_item', (itm.idItem || '').toString());
            byId[(itm.idItem || '').toString()].qty_diterima = baru;
            detailLog.push({ namaItem: (itm.namaItem || poi2.nama_item || ''), qty: qt, satuan: (itm.satuan || ''), catatan: (itm.catatan || '') });
          }
          var refreshed = await _all('po_item', 'qty,qty_diterima', function (q) { return q.eq('no_po', noPO); });
          var rows = refreshed.data || [];
          var statusBaru = (rows.length > 0 && rows.every(function (r) { return (Number(r.qty_diterima) || 0) >= (Number(r.qty) || 0); })) ? 'Diterima' : 'Diterima Sebagian';
          await supa.from('purchase_order').update({ status_po: statusBaru, diubah_oleh: namaUser, diubah_pada: new Date().toISOString() }).eq('no_po', noPO);
          if (detailLog.length) { var idLog = 'RCV-' + Date.now() + '-' + Math.floor(Math.random() * 1000); await supa.from('penerimaan_po_log').insert({ id_log: idLog, no_po: noPO, tanggal: _todayIso(), mode: 'Langsung', jumlah_item: detailLog.length, detail_item: detailLog, dibuat_oleh: namaUser, dibuat_pada: new Date().toISOString(), bukti_file_id: (p.buktiFileId || ''), bukti_file_url: (p.buktiFileUrl || ''), bukti_file_nama: (p.buktiFileName || '') }); }
          return { success: true, message: 'Penerimaan langsung berhasil. Status PO: ' + statusBaru + '.' };
        }
      });
      window.gsRoute('approvePembayaranPO', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var idReq = (p.idReq || '').toString().trim(), namaAkun = (p.namaAkun || '').toString(), idAkun = (p.idAkun || '').toString(), buktiUrl = (p.buktiFileUrl || '').toString();
          if (!idReq) return { success: false, message: 'ID request wajib.' };
          if (!namaAkun) return { success: false, message: 'Akun pembayaran wajib dipilih.' };
          if (!buktiUrl) return { success: false, message: 'Bukti pembayaran wajib diunggah.' };
          var rq = await supa.from('po_payment_request').select('*').eq('id_request', idReq).maybeSingle();
          if (!rq.data) return { success: false, message: 'Request tidak ditemukan.' };
          if ((rq.data.status || '') !== 'Menunggu') return { success: false, message: 'Request sudah diproses (status: ' + (rq.data.status || '') + ').' };
          var noPO = (rq.data.no_po || '').toString(), reqNoWO = (rq.data.no_wo || '').toString(), reqKeterangan = (rq.data.nama_supplier || '').toString(), jumlah = Number(rq.data.jumlah) || 0, reqKategori = (rq.data.kategori_non_po || '').toString();
          var approvedBy = (p.approvedBy || '').toString(), tglIso = _isoDate(p.tanggalBayar) || _todayIso(), catatanExtra = (p.catatan || '').toString();
          var up = await supa.from('po_payment_request').update({ status: 'Disetujui', nama_akun: namaAkun, diapprove_oleh: approvedBy, tanggal_approve: tglIso, bukti_file_id: (p.buktiFileId || ''), bukti_file_url: buktiUrl, bukti_file_nama: (p.buktiFileName || '') }).eq('id_request', idReq);
          if (up.error) return { success: false, message: up.error.message };
          var catatanPay = 'Approved dari request ' + idReq + (catatanExtra ? (' — ' + catatanExtra) : '');
          var rollback = async function () { await supa.from('po_payment_request').update({ status: 'Menunggu', nama_akun: '', diapprove_oleh: '', tanggal_approve: null, bukti_file_id: '', bukti_file_url: '', bukti_file_nama: '' }).eq('id_request', idReq); };
          var res;
          if (!noPO) {
            if (!idAkun || idAkun === 'AP001') { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Akun pembayaran tidak valid.' }; }
            if (jumlah <= 0) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Jumlah harus lebih dari 0.' }; }
            if (reqNoWO) { var st = await _woStatus(reqNoWO); if (!st) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Work Order tidak ditemukan.' }; } if (st === 'Closed') { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: Work Order sudah Closed.' }; } }
            var exp = await _buatPengeluaran({ noWO: reqNoWO, tanggal: tglIso, sumber: 'Langsung', noPO: '', idReferensi: '', idAkun: idAkun, namaAkun: namaAkun, deskripsi: reqKeterangan || ('Pembayaran tanpa PO ' + idReq), qty: 1, satuan: 'paket', hargaSatuan: jumlah, total: jumlah, catatan: catatanPay, dibuatOleh: approvedBy, kategori: (reqNoWO ? '' : reqKategori) });
            res = exp.ok ? { success: true } : { success: false, message: exp.message };
          } else {
            res = await _simpanPembayaranPO({ noPO: noPO, tanggalBayar: tglIso, idAkun: idAkun, namaAkun: namaAkun, jumlah: jumlah, catatan: catatanPay, dibuatOleh: approvedBy });
          }
          if (!res.success) { await rollback(); return { success: false, message: 'Gagal mencatat pembayaran: ' + (res.message || '') }; }
          if (typeof _notifHasilPembayaran === 'function') _notifHasilPembayaran(idReq, (noPO ? ('PO: ' + noPO) : ('Tanpa PO' + (reqKeterangan ? ' · ' + reqKeterangan : ''))), jumlah, true, approvedBy, '');
          return { success: true, message: (noPO ? ('Pembayaran PO ' + noPO) : 'Pembayaran (tanpa PO)') + ' sebesar Rp ' + jumlah.toLocaleString('id-ID') + ' berhasil disetujui dan dicatat.' };
        }
      });
      window.gsRoute('tolakRequestPembayaranPO', {
        mode: 'fn',
        handler: async function (a) {
          var idReq = (a[0] || '').toString().trim(), namaUser = (a[1] || '').toString(), catatanTolak = (a[2] || '').toString().trim();
          if (!catatanTolak) return { success: false, message: 'Catatan penolakan wajib diisi.' };
          var rq = await supa.from('po_payment_request').select('status,no_po,nama_supplier,jumlah').eq('id_request', idReq).maybeSingle();
          if (!rq.data) return { success: false, message: 'Request tidak ditemukan.' };
          if ((rq.data.status || '') !== 'Menunggu') return { success: false, message: 'Request sudah diproses (status: ' + (rq.data.status || '') + ').' };
          var up = await supa.from('po_payment_request').update({ status: 'Ditolak', diapprove_oleh: namaUser, tanggal_approve: _todayIso(), catatan_tolak: catatanTolak }).eq('id_request', idReq);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _notifHasilPembayaran === 'function') _notifHasilPembayaran(idReq, (rq.data.no_po ? ('PO: ' + rq.data.no_po) : ('Tanpa PO' + (rq.data.nama_supplier ? ' · ' + rq.data.nama_supplier : ''))), Number(rq.data.jumlah) || 0, false, namaUser, catatanTolak);
          return { success: true, message: 'Request ' + idReq + ' ditolak.' };
        }
      });
      window.gsRoute('hapusPO', {
        mode: 'fn',
        handler: async function (a) {
          var noPO = (a[0] || '').toString().trim();
          var po = await supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle();
          if (!po.data) return { success: false, message: 'Purchase Order tidak ditemukan.' };
          if ((po.data.status_po || '') !== 'Aktif') return { success: false, message: 'Hanya PO berstatus Aktif yang dapat dihapus.' };
          var pay = await supa.from('pembayaran_po').select('id_bayar').eq('no_po', noPO).limit(1);
          if (pay.data && pay.data.length) return { success: false, message: 'PO tidak dapat dihapus karena sudah memiliki data pembayaran.' };
          var delI = await supa.from('po_item').delete().eq('no_po', noPO);
          if (delI.error) return { success: false, message: delI.error.message };
          var delP = await supa.from('purchase_order').delete().eq('no_po', noPO);
          if (delP.error) return { success: false, message: delP.error.message };
          return { success: true, message: 'Purchase Order ' + noPO + ' berhasil dihapus.' };
        }
      });
